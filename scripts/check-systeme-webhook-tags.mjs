import assert from 'node:assert/strict';
import { applySystemeTag, describeSystemeTagWrite } from '../api/systeme-webhook.js';

const action = {
  configured: true,
  contact_id: null,
  contact_email: 'contact@davidbee.me',
  tag_id: 2122029,
  event: 'SALE_NEW',
  product_key: 'momentum_hub'
};

assert.deepEqual(describeSystemeTagWrite({ configured: false, reason: 'tag_not_configured' }), {
  status: 'skipped',
  reason: 'tag_not_configured'
});

const dryRun = await applySystemeTag(action, { dryRun: true });
assert.equal(dryRun.status, 'dry_run');
assert.equal(dryRun.contactId, null);
assert.equal(dryRun.contactEmail, 'contact@davidbee.me');
assert.equal(dryRun.tagId, 2122029);

let request;
const applied = await applySystemeTag(action, {
  apiKey: 'test-only',
  fetchImpl: async (url, options) => {
    if (url.includes('/api/contacts?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 418873901, email: 'contact@davidbee.me' }] })
      };
    }
    request = { url, options };
    return { ok: true, status: 204, text: async () => '' };
  }
});

assert.equal(applied.status, 'applied');
assert.equal(request.url, 'https://api.systeme.io/api/contacts/418873901/tags');
assert.equal(request.options.headers['X-API-Key'], 'test-only');
assert.deepEqual(JSON.parse(request.options.body), { tagId: 2122029 });

await assert.rejects(
  () => applySystemeTag(action, { apiKey: '' }),
  /SYSTEME_API_KEY is not configured/
);

console.log('Systeme webhook tag checks passed.');
