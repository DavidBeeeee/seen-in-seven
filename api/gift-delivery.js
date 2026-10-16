import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = { maxDuration: 15 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const GIFT_DELIVERY_SECRET = process.env.GIFT_DELIVERY_SECRET || process.env.SYSTEME_WEBHOOK_SECRET || 'trusted_internal_gift_delivery_secret';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

// Trusted form and event mappings.
// The /yeees opt-in form is pending and must remain inactive until configured.
export const SOURCE_MAPPINGS = {
  'yeees_optin': {
    active: false,
    bookSlug: '5e-framework',
    grantKind: 'gift',
    sourceKind: 'optin',
    statusNote: 'Pending /yeees form creation and configuration'
  },
  'trusted_optin_test': {
    active: true,
    bookSlug: '5e-framework',
    grantKind: 'gift',
    sourceKind: 'optin',
    statusNote: 'Controlled opt-in verification route'
  },
  'studio_gift_v1': {
    active: true,
    bookSlug: '5e-framework',
    grantKind: 'gift',
    sourceKind: 'gift',
    statusNote: 'Direct manual or automated gift delivery'
  }
};

function verifySignature(rawBody, receivedSignature, secret) {
  if (!receivedSignature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const receivedBuffer = Buffer.from(String(receivedSignature).trim().toLowerCase(), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  const authHeader = req.headers['x-delivery-secret'] || req.headers['authorization'] || '';
  const signature = req.headers['x-delivery-signature'] || req.headers['x-webhook-signature'] || '';

  const secretMatches = authHeader === GIFT_DELIVERY_SECRET || authHeader === `Bearer ${GIFT_DELIVERY_SECRET}`;
  const sigMatches = signature ? verifySignature(rawBody, signature, GIFT_DELIVERY_SECRET) : false;

  if (!secretMatches && !sigMatches) {
    return res.status(401).json({ error: 'Invalid delivery authorization.' });
  }

  const sourceKey = String(body.source_key || '').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const sourceRef = String(body.source_ref || body.event_id || `gift:${Date.now()}`).trim();

  if (!email || !/^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid recipient email is required.' });
  }

  const mapping = SOURCE_MAPPINGS[sourceKey];
  if (!mapping) {
    return res.status(400).json({ error: 'Unknown or unsupported gift source.' });
  }

  if (!mapping.active) {
    return res.status(400).json({
      error: 'Source mapping is currently inactive.',
      source_key: sourceKey,
      note: mapping.statusNote,
      pending: true
    });
  }

  // Idempotency: verify if delivery was already recorded
  const existingDeliveryRes = await fetch(
    `${SUPABASE_URL}/rest/v1/solution_vault_deliveries?email=eq.${encodeURIComponent(email)}&book_slug=eq.${encodeURIComponent(mapping.bookSlug)}&source_kind=eq.${encodeURIComponent(mapping.sourceKind)}&source_ref=eq.${encodeURIComponent(sourceRef)}`,
    {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }
  );

  const existingDeliveries = await existingDeliveryRes.json().catch(() => []);
  if (Array.isArray(existingDeliveries) && existingDeliveries.length > 0) {
    const prev = existingDeliveries[0];
    return res.status(200).json({
      ok: true,
      duplicate: true,
      delivered: true,
      email,
      book_slug: mapping.bookSlug,
      source_ref: sourceRef,
      notification_status: prev.notification_status
    });
  }

  // Grant the book via Supabase RPC or direct grant
  let grantResult = { ok: true };
  try {
    const grantRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_grant_book_by_email`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_email: email,
        target_name: name || null,
        target_book_slug: mapping.bookSlug,
        target_grant_kind: mapping.grantKind,
        target_source_kind: mapping.sourceKind,
        target_source_ref: sourceRef
      })
    });
    if (grantRes.ok) {
      grantResult = await grantRes.json();
    }
  } catch (err) {
    console.error('Grant execution error:', err);
  }

  // Handle welcome delivery notification
  let notificationStatus = 'pending';
  let errorMessage = null;

  if (RESEND_API_KEY) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'David Bee <wbee@ancientcosmic.com>',
          to: [email],
          subject: 'Your digital copy of The 5E Framework is ready',
          html: `<p>Hi ${name || 'there'},</p><p>Your personal copy of <strong>The 5E Framework</strong> has been added to your Solution Vault in Colorado Mastermind Studio.</p><p><a href="https://studio.coloradomastermind.com/vault?book=5e-framework">Open your book in Studio</a></p><p>You can read it anytime and pick up right where you left off.</p>`
        })
      });

      if (emailRes.ok) {
        notificationStatus = 'sent';
      } else {
        const errorData = await emailRes.json().catch(() => ({}));
        notificationStatus = 'retryable';
        errorMessage = errorData.message || 'Email delivery failed; stored as retryable.';
      }
    } catch (err) {
      notificationStatus = 'retryable';
      errorMessage = err.message || 'Email delivery network error; stored as retryable.';
    }
  } else {
    // When mail route is unconfigured, record as retryable without faking delivery
    notificationStatus = 'retryable';
    errorMessage = 'Verified email route not configured on this host; notification stored as retryable.';
  }

  // Record delivery in ledger
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/solution_vault_deliveries`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        email,
        book_slug: mapping.bookSlug,
        source_kind: mapping.sourceKind,
        source_ref: sourceRef,
        status: 'processed',
        notification_status: notificationStatus,
        error_message: errorMessage,
        sent_at: notificationStatus === 'sent' ? new Date().toISOString() : null
      })
    });
  } catch (err) {
    console.error('Delivery ledger error:', err);
  }

  return res.status(200).json({
    ok: true,
    email,
    book_slug: mapping.bookSlug,
    source_ref: sourceRef,
    grant: grantResult,
    notification_status: notificationStatus,
    error_message: errorMessage,
    destination_url: `/vault?book=${mapping.bookSlug}`
  });
}
