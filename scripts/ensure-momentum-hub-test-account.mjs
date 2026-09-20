#!/usr/bin/env node

const supabaseUrl = String(process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const email = String(process.env.MOMENTUM_HUB_TEST_EMAIL || '').trim().toLowerCase();
const password = String(process.env.MOMENTUM_HUB_TEST_PASSWORD || '');

function required(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function request(path, { method = 'GET', token = serviceKey, body, headers = {} } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function findAuthUser() {
  for (let page = 1; page <= 10; page += 1) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (match) return match;
    if (users.length < 100) break;
  }
  return null;
}

async function ensureAuthUser() {
  const existing = await findAuthUser();
  if (existing) {
    return request(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: { password, email_confirm: true, user_metadata: { name: 'Momentum Hub Test Member', internal_test: true } },
    });
  }
  return request('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true, user_metadata: { name: 'Momentum Hub Test Member', internal_test: true } },
  });
}

async function ensureProfile(authUser) {
  const rows = await request('/rest/v1/users?on_conflict=email', {
    method: 'POST',
    body: [{
      auth_id: authUser.id,
      email,
      name: 'Momentum Hub Test Member',
      is_admin: false,
      is_paid: false,
    }],
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
  if (!Array.isArray(rows) || !rows[0]?.id) throw new Error('The test profile was not returned after upsert.');
  return rows[0];
}

async function ensureEntitlement(profile) {
  await request('/rest/v1/studio_access_grants?on_conflict=user_id,app_key,source_kind,source_ref', {
    method: 'POST',
    body: [{
      user_id: profile.id,
      app_key: 'eee',
      source_kind: 'admin',
      source_ref: 'test:momentum-hub',
      status: 'active',
      revoked_at: null,
    }],
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  await request('/rest/v1/rpc/refresh_studio_entitlement', {
    method: 'POST',
    body: { target_user_id: profile.id, target_app_key: 'eee' },
  });
}

async function verifyMemberSession() {
  const session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    token: publishableKey,
    body: { email, password },
  });
  if (!session?.access_token) throw new Error('The test member could not sign in.');
  const allowed = await request('/rest/v1/rpc/has_studio_app_access', {
    method: 'POST',
    token: publishableKey,
    body: { target_app_key: 'eee' },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (allowed !== true) throw new Error('The test member signed in but does not have EEE access.');
  return session.user?.id || null;
}

required(serviceKey, 'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
required(publishableKey, 'SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY');
required(email, 'MOMENTUM_HUB_TEST_EMAIL');
required(password, 'MOMENTUM_HUB_TEST_PASSWORD');

const authUser = await ensureAuthUser();
const profile = await ensureProfile(authUser);
await ensureEntitlement(profile);
const verifiedUserId = await verifyMemberSession();

process.stdout.write(`${JSON.stringify({
  status: 'verified',
  email,
  authUserId: verifiedUserId,
  profileId: profile.id,
  app: 'eee',
  access: 'active',
}, null, 2)}\n`);
