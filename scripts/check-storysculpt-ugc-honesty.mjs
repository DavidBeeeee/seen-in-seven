// StorySculpt UGC says what it actually knows. WBR-441.
//
// On 2026-10-14 David gave it two Amazon short links. Research read nothing,
// the status said "Product findings ready: Product video" under a spinner that
// never stopped, the final script was his coaching pitch written from his
// story profile, and a third chat refused every request because its title was
// a 222-character Amazon page title. Each of those is pinned here.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { synthesizeResearch, cleanProductName, isAmazonUrl } from '../api/_lib/storysculpt-research.js';
import { ugcKnowsProduct } from '../api/storysculpt.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

const AMAZON_TITLE = 'Amazon.com: Stainless Steel Egg Slicer for Salads and Sandwiches (white) | stainless steel egg slicer for boiled eggs, salads, sandwiches, breakfast prep, uniform slices, and kitchen garnish use : Home & Kitchen';

// 1. A page nobody read says so, with its reason, and invents no name.
const unread = synthesizeResearch({ url: 'https://a.co/d/09WHjuTz', fetchResult: { ok: false, blocked: false, reason: 'Product page took longer than 10 seconds to respond.' } });
assert.equal(unread.coverage, 'unavailable');
assert.equal(unread.knowsProduct, false);
assert.equal(unread.product.name, '', 'no "Product video" placeholder');
assert.ok(unread.gaps.some(g => g.includes('took longer than 10 seconds')), 'the reason is kept');
assert.equal(unread.retailer, 'amazon');

// 2. A page that only gave its title is not findings.
const titleOnly = synthesizeResearch({
  url: 'https://a.co/d/09WHjuTz',
  fetchResult: { ok: true, url: 'https://www.amazon.com/dp/B0HG7DGRXN', html: `<title>${AMAZON_TITLE}</title><meta name="description" content="${AMAZON_TITLE}">` }
});
assert.equal(titleOnly.coverage, 'name-only');
assert.equal(titleOnly.knowsProduct, false);
assert.equal(titleOnly.findings.features.length + titleOnly.findings.brandClaims.length, 0);
assert.ok(titleOnly.gaps.some(g => /Amazon only showed the product name/.test(g)));

// 3. Product names are what a person would say, short enough to title a chat.
assert.equal(cleanProductName(AMAZON_TITLE), 'Stainless Steel Egg Slicer for Salads and Sandwiches (white)');
assert.ok((cleanProductName(AMAZON_TITLE) + ' UGC script').length <= 160);
assert.equal(cleanProductName("Men's Tree Runner - Jet Black (White Sole)"), "Men's Tree Runner - Jet Black (White Sole)");
assert.equal(isAmazonUrl('https://a.co/d/09WHjuTz'), true);
assert.equal(isAmazonUrl('https://www.amazon.co.uk/dp/x'), true);
assert.equal(isAmazonUrl('https://www.allbirds.com/products/mens-tree-runners'), false);

// 4. No final script without something about the product.
assert.equal(ugcKnowsProduct({ product: { name: 'Product video' }, research: unread }), false);
assert.equal(ugcKnowsProduct({ research: { findings: { features: ['TENCEL upper'] } } }), true);
assert.equal(ugcKnowsProduct({ product: { userDetails: 'Egg slicer, 10 stainless wires' } }), true);
assert.equal(ugcKnowsProduct({ creatorExperience: { observations: 'Cuts a whole egg in one press' } }), true);

const handler = read('api', 'storysculpt.js');
assert.ok(handler.includes('if (!ugcKnowsProduct(ugcState))'), 'the UGC turn refuses with nothing to go on');
assert.ok(/ABOUT THE CREATOR[^\n]*not the product/.test(handler), 'the story profile is labelled as the speaker, not the product');
assert.ok(handler.includes("Never pitch, mention or promote the creator\\'s own business"));
assert.ok(!/projectTitle: cleanText\(/.test(handler), 'a long title is shortened, not refused');

// 5. The page: a status with real states, a paste box, an Amazon note, and
// research bound to the chat that asked.
const html = read('api', '_hub', 'storysculpt.html');
const script = read('js', 'storysculpt.js');
assert.ok(html.includes('id="ugc-research-status-icon"'));
assert.ok(html.includes('id="ugc-missing-details"'));
assert.ok(html.includes('id="ugc-amazon-note"'));
assert.ok(!script.includes("'Product findings ready: '"), 'no false success line');
assert.ok(script.includes("'circle-check'") && script.includes("'triangle-alert'"), 'the spinner resolves to done or warning');
assert.ok(script.includes('const project = activeStory;') && script.includes('if (activeStory !== project)'), 'research lands in the chat that asked');
assert.ok(script.includes("seeAngles.disabled = state === 'pending'"), 'angles wait for research');

console.log('PASS check-storysculpt-ugc-honesty: unread pages say why, title-only pages are not findings, names are short, no script from nothing, status resolves');

// 6. Writing and revising show progress where the member is looking, not in
// the interview thread the product-video screens hide (David, 2026-10-14).
assert.ok(html.includes('id="ugc-generate-status"') && html.includes('id="ugc-revise-status"'), 'status lines sit under the buttons');
const genFn = script.slice(script.indexOf('async function runUgcGeneration()'), script.indexOf('async function runUgcRevision('));
assert.ok(genFn.includes("startUgcWorking({ statusId: 'ugc-generate-status'"), 'Write my script shows its own progress');
assert.ok(!genFn.includes('showThinkingIndicator('), 'not the hidden interview indicator');
assert.ok(!/alert\(/.test(genFn), 'a failure is shown on the page, not only in a popup');
console.log('PASS check-storysculpt-ugc-honesty: Write my script and quick revisions show visible progress');

// 7. Several chats can be deleted at once (David, 2026-10-14): a Select mode
// with checkboxes, Select all for the current filter, one confirmation, one
// request limited by row security, and a report of what was really deleted.
assert.ok(html.includes('id="story-bulk-toggle"') && html.includes('id="story-bulk-delete"') && html.includes('id="story-bulk-all"'));
assert.ok(script.includes("data-select-project="), 'select mode renders a checkbox per chat');
assert.ok(script.includes(".delete().in('id', ids).select('id')"), 'one request, and the deleted rows come back');
assert.ok(/window\.confirm\('Delete ' \+ label/.test(script), 'one confirmation names how many');
assert.ok(script.includes("'Deleted ' + gone.size + ' of ' + ids.length"), 'a partial delete is said out loud');
console.log('PASS check-storysculpt-ugc-honesty: several chats can be selected and deleted at once');

// 8. Revise is never a silent no-op, and its note box is not squeezed
// (David, 2026-10-16: Revise "didn't actually work"; the box was 156px wide and
// an empty note returned without a word).
{
  const refine = script.slice(script.indexOf('async function refineStory()'), script.indexOf('// Inline edits to the finished script'));
  assert.ok(/if \(!note\) \{[\s\S]*story-refine-status[\s\S]*focus\(\)/.test(refine), 'an empty note says what to do and focuses the box');
  const css = read('css', 'storysculpt.css');
  assert.ok(/@media \(min-width: 821px\) \{\s*\.story-refine-inner \{ flex-wrap: wrap;[\s\S]*flex: 1 1 100%/.test(css), 'the note gets its own row on desktop');
  console.log('PASS check-storysculpt-ugc-honesty: Revise explains an empty note and its box has room');
}
