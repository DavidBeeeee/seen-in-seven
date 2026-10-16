// WBR-373: render the member's real held outcome, never infer one from time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync('api/_hub/certainty.html', 'utf8');
const fn = page.match(/function renderPostSession\(\) \{[\s\S]*?\n      \}/)?.[0];
assert(fn, 'post-session renderer exists');
assert.match(page, /id="cs-post-session"/);
assert.match(page, /renderPostSession\(\);\s*renderHistory\(\);/, 'state refresh renders the line');
const now = Date.parse('2026-10-16T19:00:00Z');
const ended = { outcome: 'held', ends_at: '2026-10-15T20:00:00Z', label_day: 'Thursday, October 15, 2026' };
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function render(history) {
  const classes = new Set();
  const host = { innerHTML: '', classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s) } };
  const context = { state: { history }, Date: class extends Date { static now() { return now; } },
    el: (id) => { assert.equal(id, 'cs-post-session'); return host; }, escapeHtml: escape };
  vm.createContext(context);
  vm.runInContext(fn + ';renderPostSession();', context);
  return { html: host.innerHTML, hidden: classes.has('cs-hide') };
}
let cases = 0;
for (const history of [[], [{ ...ended, outcome: null }], [{ ...ended, outcome: 'no_show' }],
  [{ ...ended, status: 'cancelled' }], [{ ...ended, ends_at: '2099-01-01T00:00:00Z' }], [{ ...ended, ends_at: 'invalid' }]]) {
  const r = render(history);
  assert.equal(r.hidden, true);
  assert.equal(r.html, '');
  cases++;
}
const held = render([ended]);
assert.equal(held.hidden, false);
assert.match(held.html, /Thursday, October 15, 2026/);
assert.match(held.html, /one thing you want to put into practice/);
cases++;
assert(!render([ended, { ...ended, ends_at: '2026-10-16T18:00:00Z', label_day: 'Newest held session' }]).html.includes('October 15'));
cases++;
assert.match(render([{ ...ended, label_day: '<img src=x onerror=alert(1)>', topic: '<script>private</script>' }]).html, /&lt;img/);
assert(!render([{ ...ended, topic: 'private topic' }]).html.includes('private topic'));
cases++;
assert(!/[—]/.test(held.html));
console.log(`PASS certainty post-session: ${cases} rendered cases; held-only, safe date, no private topic or invented result`);
