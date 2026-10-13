// Automated acceptance test suite for StorySculpt UGC / Product Video Script Builder
// WBR-440 / STORYSCULPT_UGC_BUILD_PLAN.md Section 9

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  isPrivateIp,
  validateResearchUrl,
  isRetailBlock,
  extractProductFromHtml,
  synthesizeResearch,
  handleResearchRequest
} from '../api/_lib/storysculpt-research.js';

import {
  generateAngleCards,
  reviewScriptClaims,
  buildFilmingPlan,
  buildUgcHookOptions,
  ugcSystemPrompt
} from '../api/_lib/storysculpt-ugc.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

console.log('--- Checking StorySculpt UGC / Product Video (WBR-440) ---');

// 1. Entry & HTML / Mode contract
console.log('1. Checking Entry & HTML Mode contract...');
const html = readFileSync(join(root, 'api', '_hub', 'storysculpt.html'), 'utf8');
const script = readFileSync(join(root, 'js', 'storysculpt.js'), 'utf8');
const handler = readFileSync(join(root, 'api', 'storysculpt.js'), 'utf8');

assert(html.includes('data-mode="ugc"'), 'HTML must include data-mode="ugc" card');
assert(html.includes('UGC / Product Video'), 'HTML must display "UGC / Product Video"');
assert(html.includes('<option value="ugc">'), 'HTML select must have <option value="ugc">');
assert(html.includes('id="story-ugc-flow"'), 'HTML must include story-ugc-flow container');
assert(html.includes('id="ugc-filming-plan-panel"'), 'HTML must include ugc-filming-plan-panel');
assert(html.includes('id="ugc-filming-toggle"'), 'HTML must include ugc-filming-toggle');

assert(script.includes("ugc: 'UGC / Product Video'"), 'js/storysculpt.js must include UGC mode label');
assert(script.includes("ugc: 'New UGC script'"), 'js/storysculpt.js must include UGC title');
assert(handler.includes("'ugc'"), 'api/storysculpt.js MODES must include ugc');

console.log('PASS: Entry and HTML mode contract verified.');

// 2. SSRF & Private IP Protection
console.log('2. Checking SSRF & Private IP Protection...');
assert.strictEqual(isPrivateIp('127.0.0.1'), true, '127.0.0.1 must be private');
assert.strictEqual(isPrivateIp('localhost'), true, 'localhost must be private');
assert.strictEqual(isPrivateIp('10.0.0.1'), true, '10.0.0.1 must be private');
assert.strictEqual(isPrivateIp('192.168.1.50'), true, '192.168.1.50 must be private');
assert.strictEqual(isPrivateIp('172.16.0.1'), true, '172.16.0.1 must be private');
assert.strictEqual(isPrivateIp('169.254.169.254'), true, 'Cloud metadata IP must be private');
assert.strictEqual(isPrivateIp('::1'), true, 'IPv6 loopback must be private');
assert.strictEqual(isPrivateIp('::ffff:127.0.0.1'), true, 'IPv4-mapped loopback must be private');
assert.strictEqual(isPrivateIp('8.8.8.8'), false, 'Public IP 8.8.8.8 must not be private');
assert.strictEqual(isPrivateIp('93.184.216.34'), false, 'Public IP example.com must not be private');

assert.strictEqual(validateResearchUrl('http://127.0.0.1/admin').ok, false, 'Private IP URL must be rejected');
assert.strictEqual(validateResearchUrl('http://localhost:3000').ok, false, 'Localhost URL must be rejected');
assert.strictEqual(validateResearchUrl('ftp://example.com/file').ok, false, 'Non-HTTP URL must be rejected');
assert.strictEqual(validateResearchUrl('https://admin:secret@example.com').ok, false, 'URL with credentials must be rejected');
assert.strictEqual(validateResearchUrl('https://example.com/product/123').ok, true, 'Valid HTTPS URL must pass');

console.log('PASS: SSRF and network security barriers verified.');

// 3. Retail block detection & Bounded research extraction
console.log('3. Checking Retail Block detection and bounded extraction...');
assert.strictEqual(isRetailBlock(403, 'Access Denied'), true, '403 with Access Denied must be detected as block');
assert.strictEqual(isRetailBlock(200, 'Robot Check: Enter the characters you see'), true, 'Robot challenge must be detected');
assert.strictEqual(isRetailBlock(200, 'Normal product page text'), false, 'Normal page must not be flagged');

const mockHtml = `
<html>
  <head>
    <title>GlowSkin Daily Hydrating Serum - 50ml</title>
    <meta name="description" content="A lightweight hyaluronic acid serum that delivers 24-hour hydration without feeling greasy.">
  </head>
  <body>
    <h1>GlowSkin Daily Hydrating Serum</h1>
    <ul>
      <li>Fast-absorbing water-gel formula</li>
      <li>Contains pure hyaluronic acid and vitamin B5</li>
      <li>Non-comedogenic and fragrance-free</li>
    </ul>
    <div class="customer-reviews">
      <p>I noticed my dry patches smoothed out within 3 days. Doesn't pill under makeup.</p>
      <p>Super lightweight, though the pump bottle can dispense a bit too much if pressed hard.</p>
    </div>
  </body>
</html>
`;

const extracted = extractProductFromHtml(mockHtml, 'https://example.com/serum');
assert.strictEqual(extracted.title, 'GlowSkin Daily Hydrating Serum - 50ml', 'Extracted title must match');
assert(extracted.description.includes('hyaluronic acid'), 'Description must match');
assert.strictEqual(extracted.features.length >= 3, true, 'At least 3 features must be extracted');
assert.strictEqual(extracted.customerReports.length >= 2, true, 'Customer reports must be extracted');

// Bounded synthesis: verified research
const synthSuccess = synthesizeResearch({
  url: 'https://example.com/serum',
  fetchResult: { ok: true, status: 200, html: mockHtml, url: 'https://example.com/serum' }
});
assert.strictEqual(synthSuccess.product.name, 'GlowSkin Daily Hydrating Serum - 50ml');
assert.strictEqual(synthSuccess.sources.length, 1);
assert.strictEqual(synthSuccess.sources[0].kind, 'retrieved');
assert.strictEqual(synthSuccess.findings.features.length >= 3, true);

// Bounded synthesis: blocked retail site with fallback to user details
const synthBlocked = synthesizeResearch({
  url: 'https://amazon.com/dp/B00EXAMPLE',
  fetchResult: { ok: false, blocked: true, reason: 'Retail site anti-bot check' },
  userDetails: 'Portable Espresso Maker that works with Nespresso pods or ground coffee. 18 bar pressure.'
});
assert.strictEqual(synthBlocked.coverage, 'partial', 'Blocked page with user details must provide partial coverage');
assert(synthBlocked.gaps.some(g => g.includes('blocked')), 'Must explicitly record access gap');
assert(synthBlocked.findings.features.length > 0, 'Features must be extracted from user details');

console.log('PASS: Extraction and honest blocked-retail fallback verified.');

// 4. Grounded Angle Generation
console.log('4. Checking Angle Generation...');
const anglesUsed = generateAngleCards({
  research: synthSuccess,
  creatorExperience: { used: 'used', observations: 'Love how quickly it absorbs before morning makeup.' },
  salesApproach: 'direct'
});
assert.strictEqual(anglesUsed.length, 3, 'Must return 3 distinct angles');
assert.notStrictEqual(anglesUsed[0].title, anglesUsed[1].title, 'Angle 1 and 2 titles must be distinct');
assert.notStrictEqual(anglesUsed[1].title, anglesUsed[2].title, 'Angle 2 and 3 titles must be distinct');
assert.notStrictEqual(anglesUsed[0].structure, anglesUsed[2].structure, 'Structures must be distinct');

const anglesNotYet = generateAngleCards({
  research: synthSuccess,
  creatorExperience: { used: 'not-yet', observations: 'Just got it in the mail today.' },
  salesApproach: 'useful'
});
assert(anglesNotYet[1].title.includes('First-Impression') || anglesNotYet[0].demonstrationIdea.includes('unboxing'), 'Never-used creator angle must frame as honest test/unboxing');

console.log('PASS: Angle generation fidelity verified.');

// 5. Script Claims Review
console.log('5. Checking Claims Review...');
const cleanScript = 'This hydrating serum made a big difference for my morning routine.\nIt absorbs in under 30 seconds and keeps my skin feeling smooth all day.\nTap the link below to check out the current bundle.';
const issuesClean = reviewScriptClaims(cleanScript, { creatorExperience: { used: 'used' } });
assert.strictEqual(issuesClean.length, 0, 'Clean honest script must have zero claims issues');

const medicalScript = 'This serum medically cures eczema and permanently removes all wrinkles.';
const issuesMedical = reviewScriptClaims(medicalScript, { creatorExperience: { used: 'used' } });
assert(issuesMedical.some(i => i.issue.includes('Medical')), 'Must flag medical cure claims');

const financialScript = 'Using this tool gives you guaranteed revenue and will make $10,000 next month.';
const issuesFinancial = reviewScriptClaims(financialScript, { creatorExperience: { used: 'used' } });
assert(issuesFinancial.some(i => i.issue.includes('financial')), 'Must flag guaranteed financial claims');

const fakeDurationScript = "I've been using this for months and it changed everything.";
const issuesFakeDuration = reviewScriptClaims(fakeDurationScript, { creatorExperience: { used: 'not-yet' } });
assert(issuesFakeDuration.some(i => i.issue.includes('extended personal use')), 'Must flag invented test duration when creator has not used product');

console.log('PASS: Claims and fidelity review barriers verified.');

// 6. Filming Plan Breakdown
console.log('6. Checking Filming Plan Generator...');
const sampleScript = `If your skin feels tight 20 minutes after washing it, you are probably stripping your moisture barrier.

I switched to this water-gel serum right after cleansing. It has hyaluronic acid and B5 without any fragrance.

Here is the difference on camera. You can see it sinks in immediately with zero sticky residue.

If you want to try it, the link is in my bio.`;

const filmingPlan = buildFilmingPlan(sampleScript, {
  format: 'talking-head',
  durationSeconds: 60,
  constraints: 'Shooting in bathroom mirror'
});
assert.strictEqual(filmingPlan.length, 4, 'Must produce a scene for each script paragraph');
assert.strictEqual(filmingPlan[0].sceneNumber, 1);
assert(filmingPlan[0].timing.startsWith('0:00'), 'First scene must start at 0:00');
assert(filmingPlan[0].filmingNotes.includes('Hook pacing'), 'First scene must have hook guidance');
assert(filmingPlan[3].filmingNotes.includes('Hold the end frame'), 'Last scene must have CTA guidance');

console.log('PASS: Filming plan scene timing and action breakdown verified.');

// 7. Hook Options
console.log('7. Checking Hook Options...');
const hooks = buildUgcHookOptions('GlowSkin Serum', 'The Real Problem Solver', sampleScript);
assert.strictEqual(hooks.length, 3, 'Must generate 3 hooks');
hooks.forEach(h => {
  assert(!h.text.includes('—'), 'Hook text must not contain em dashes');
  assert(h.text.length > 20, 'Hook text must be substantial');
});

console.log('PASS: Hook options generated without em dashes.');

// 8. System Prompt Contract
console.log('8. Checking System Prompt Contract...');
const sysPrompt = ugcSystemPrompt({
  product: { name: 'GlowSkin Serum' },
  selectedAngle: { title: 'The Real Problem Solver', structure: 'direct-response' },
  creatorExperience: { used: 'not-yet', observations: 'Unboxing today' },
  salesApproach: 'useful',
  outputStyle: 'script',
  targetDurationSeconds: 60,
  filmingEnabled: true
});
assert(!sysPrompt.includes('—'), 'System prompt must not contain em dashes');
assert(sysPrompt.includes('NEVER use an em dash'), 'System prompt must enforce no em dash rule');
assert(sysPrompt.includes('NEVER invent testimonials'), 'System prompt must ban invented testimonials');
assert(sysPrompt.includes('Creator fidelity'), 'System prompt must enforce creator fidelity');
assert(sysPrompt.includes('Unboxing today'), 'System prompt must ground in creator observations');

console.log('PASS: UGC system prompt contract verified.');

// 9. Zero em dash scan across all UGC files
console.log('9. Checking Zero Em Dash across new files...');
const filesToCheck = [
  'api/_lib/storysculpt-research.js',
  'api/_lib/storysculpt-ugc.js'
];
for (const rel of filesToCheck) {
  const content = readFileSync(join(root, rel), 'utf8');
  assert(!content.includes('—'), `${rel} must contain zero em dashes`);
}

console.log('PASS: Zero em dashes confirmed across all UGC modules.');

console.log('\nALL STORYSCULPT UGC TESTS PASSED (9/9 areas verified)!');
