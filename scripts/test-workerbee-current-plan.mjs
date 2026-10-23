import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../js/workerbee.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function todaysWalkthroughs'), source.indexOf('\nfunction walkthroughButton'));
const state = {updates: [
  {id:'old',kind:'outcome',status:'deferred',metadata:{source:'morning-work-order',date:'2026-09-26',lane:'afternoon',walkthrough:'old'}},
  {id:'one',kind:'outcome',status:'active',updated_at:'2026-09-27T10:00Z',metadata:{source:'morning-work-order',date:'2026-09-27',lane:'afternoon',walkthrough:'superseded'}},
  {id:'two',kind:'outcome',status:'active',updated_at:'2026-09-27T11:00Z',metadata:{source:'morning-work-order',date:'2026-09-27',lane:'afternoon',walkthrough:'current'}},
  {id:'yesterday',kind:'outcome',status:'completed',metadata:{source:'morning-work-order',date:'2026-09-26',lane:'afternoon',walkthrough:'yesterday'}}
]};
const select = new Function('state','dailyReportUpdates',code.replace('export ', '')+'; return todaysWalkthroughs;')(state,()=>[{metadata:{report_date:'2026-09-27'}}]);
assert.deepEqual(select().map(x=>x.markdown),['current']);
assert.deepEqual(select('2026-09-26').map(x=>x.markdown),['yesterday']);
assert.deepEqual(select('2026-09-28'),[]);
assert.match(source,/todaysWalkthroughs\(reportDate\)/);
console.log('Current plan selection: retired excluded, republications deduplicated, report date scoped, missing date empty.');

// Exercise the real report renderer with a tiny DOM, not a source-text assertion.
const renderCode = source.slice(source.indexOf('function renderDailyReport()'), source.indexOf('\nfunction renderHealth()'));
const node = () => ({ children: [], append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; } });
for (const kimi of [undefined, { status: 'built-awaiting-integration', summary: 'The build awaits its database step.' }]) {
  const elements = new Map();
  const lanes = [];
  const render = new Function('el','dailyReportUpdates','reportDayLabel','formatDate','document','renderReportPeriod', renderCode + '; return renderDailyReport;')(
    id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    () => [{ metadata: { report_date: '2026-10-23', morning: { status: 'completed', updatedAt: '2026-10-23T12:00Z' }, kimi } }],
    date => date, date => date, { createElement: node },
    (label, period) => { lanes.push({ label, period }); return node(); }
  );
  render();
  assert.equal(lanes.length, 6);
  assert.equal(lanes[2].label, 'Kimi build');
  assert.equal(lanes[2].period, kimi);
  assert.equal(lanes[3].label, 'Afternoon');
}
const statusCode = source.slice(source.indexOf('function statusLabel('), source.indexOf('\nfunction healthUpdate()'));
const label = new Function(statusCode + '; return statusLabel;')();
assert.equal(label('built-awaiting-integration'), 'Built, awaiting integration');
assert.equal(label('ready-for-review'), 'Built, awaiting review');
console.log('Six-lane report renderer passed with Kimi pending and legacy missing Kimi; handoff labels distinguish built from verified.');
