import { authenticatedAdmin, authenticatedUser, json } from './security.js';
import { readJsonWithBytes, recordResponseBytes } from './egress-budget.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const DEFAULT_CMO_EMAILS = ['davidkamau.t+cmo@gmail.com'];
const EGRESS_MIN_RECORDED_BYTES = 1024;

export function parseCmoEmails(raw = process.env.CMO_EMAILS) {
  const source = raw === undefined ? DEFAULT_CMO_EMAILS : String(raw).split(',');
  return new Set(
    source
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isCmoEmail(email, allowlist = parseCmoEmails()) {
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized && allowlist.has(normalized));
}

function bearerToken(req) {
  const value = String(req.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function projectRow(row) {
  return {
    list: row?.list ?? null,
    number: row?.number ?? null,
    section: row?.section ?? null,
    question: String(row?.question || ''),
    score: String(row?.score ?? row?.verdict ?? 'UNSCORED'),
    check: String(row?.check ?? row?.note ?? ''),
  };
}

export function projectCmoQuestions(artifact) {
  const source = artifact && typeof artifact === 'object' ? artifact : {};
  const metaApps = Array.isArray(source.apps) ? source.apps : [];
  const scoredMap = source.scored && typeof source.scored === 'object' ? source.scored : {};
  const metaByKey = new Map(metaApps.filter((app) => app && app.key).map((app) => [app.key, app]));

  const keys = [];
  for (const app of metaApps) {
    if (app?.key && !keys.includes(app.key)) keys.push(app.key);
  }
  for (const key of Object.keys(scoredMap)) {
    if (!keys.includes(key)) keys.push(key);
  }
  // Ward first, then the remaining Momentum Hub apps in their existing order.
  keys.sort((left, right) => (left === 'ward' ? -1 : right === 'ward' ? 1 : 0));

  const apps = keys.map((key) => {
    const meta = metaByKey.get(key) || {};
    const entry = scoredMap[key] || {};
    const rows = Array.isArray(entry.rows) ? entry.rows.map(projectRow) : [];
    return {
      key,
      name: meta.name || key,
      questionSet: meta.questionSet || null,
      questionCount: meta.questionCount ?? rows.length,
      scoredOn: meta.scoredOn || null,
      status: meta.status || null,
      tally: entry.tally && typeof entry.tally === 'object' ? entry.tally : {},
      rows,
    };
  });

  const lists = Array.isArray(source.lists)
    ? source.lists.map((item) => ({
      id: item?.id ?? null,
      label: item?.label ?? null,
      asks: item?.asks ?? null,
    }))
    : [];

  return {
    generatedAt: source.generatedAt ?? null,
    updatedAt: source.updatedAt ?? null,
    cadence: source.cadence ?? null,
    scoredAgainst: source.scoredAgainst ?? null,
    lists,
    apps,
  };
}

async function readCmoQuestions(token, serverSecret) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/workerbee_read`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_profile: 'cmo-questions', p_server_secret: serverSecret }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`CMO question read failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  const { data, bytes } = await readJsonWithBytes(response);
  if (bytes >= EGRESS_MIN_RECORDED_BYTES && token !== SUPABASE_ANON_KEY) {
    await recordResponseBytes({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      userToken: token,
      route: 'cmo-questions-api',
      reader: 'workerbee_read:cmo-questions',
      bytes,
    });
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });

  // CMO_EMAILS accounts, plus Studio admins so David can see exactly what
  // Muse sees (David, 2026-11-17: "GIVE ME ACCESS TO HER CMO PAGEEEE!").
  const user = await authenticatedUser(req);
  const allowed = Boolean(user && (isCmoEmail(user.email) || await authenticatedAdmin(req)));
  if (!allowed) {
    return json(res, 403, { error: 'CMO access requires a signed-in CMO account.' });
  }

  const serverSecret = process.env.WORKERBEE_STUDIO_SECRET;
  if (!serverSecret || serverSecret.length < 32) {
    return json(res, 500, { error: 'CMO question feed is not configured.' });
  }

  try {
    const artifact = await readCmoQuestions(bearerToken(req), serverSecret);
    return json(res, 200, projectCmoQuestions(artifact));
  } catch (error) {
    console.error('CMO questions API error:', error);
    return json(res, 500, { error: 'Could not load the Momentum 300 questions.' });
  }
}
