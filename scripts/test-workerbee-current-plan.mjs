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
