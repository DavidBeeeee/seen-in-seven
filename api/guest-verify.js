import { authenticatedUser, ensureGuest, json, verifyTurnstile, writeGuest } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const user = await authenticatedUser(req);
    if (user) return json(res, 200, { verified: true });
    const guest = ensureGuest(req, res);
    if (guest.verifiedAt) return json(res, 200, { verified: true });
    if (!req.body || typeof req.body.token !== 'string' || req.body.token.length > 2048) {
      return json(res, 400, { error: 'Please complete the human check.' });
    }
    if (!(await verifyTurnstile(req.body.token, req))) {
      return json(res, 403, { error: 'That check did not complete. Please try it once more.' });
    }
    writeGuest(res, { ...guest, verifiedAt: Date.now() });
    return json(res, 200, { verified: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'The human check could not be completed.' });
  }
}
