import { authenticatedUser, ensureGuest, json } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const user = await authenticatedUser(req);
    if (user) return json(res, 200, { authenticated: true, verified: true });
    const guest = ensureGuest(req, res);
    return json(res, 200, {
      authenticated: false,
      verified: !!guest.verifiedAt,
      siteKey: process.env.TURNSTILE_SITE_KEY || ''
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Guest access could not be prepared.' });
  }
}
