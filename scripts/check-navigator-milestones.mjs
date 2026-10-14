// WBR-373 / WO-20261014-latemorning: Navigator milestones and finished roadmap proof.
//
// Tests:
// 1. One phase done shows the milestone line naming the phase, and no complete state.
// 2. All done shows the complete state with what finishing means and the two next steps.
// 3. Nothing done shows neither.
// 4. Zero em dashes in member copy.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BEE_FORMULA_PHASES,
  formatMilestoneLine,
  buildRoadmapCompleteState,
  evaluateMilestones
} from '../js/navigator-milestones.mjs';

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

console.log('1. Testing pure function: Nothing done shows neither...');
{
  const phases = [
    { id: 'storefront', name: 'Online Presence', tasks: [{ id: 't1', completed: false }] },
    { id: 'mvo', name: 'Paid Experience', tasks: [{ id: 't2', completed: false }] }
  ];
  const res = evaluateMilestones({ phases });
  check(res.completedPhases.length === 0, 'Nothing done: completedPhases must be empty');
  check(res.milestoneLines.length === 0, 'Nothing done: milestoneLines must be empty');
  check(res.isComplete === false, 'Nothing done: isComplete must be false');
  check(res.completeState === null, 'Nothing done: completeState must be null');
}

console.log('2. Testing pure function: One phase done shows the phase line...');
{
  const phases = [
    { id: 'storefront', name: 'Online Presence', tasks: [{ id: 't1', completed: true }] },
    { id: 'mvo', name: 'Paid Experience', tasks: [{ id: 't2', completed: false }] }
  ];
  const res = evaluateMilestones({ phases });
  check(res.completedPhases.length === 1, 'One phase done: completedPhases must have 1 phase');
  check(res.completedPhases[0].id === 'storefront', 'One phase done: must name the completed phase id');
  check(res.milestoneLines.length === 1, 'One phase done: milestoneLines must have 1 line');
  check(res.milestoneLines[0].includes('Online Presence'), 'One phase done: milestone line must name "Online Presence"');
  check(res.isComplete === false, 'One phase done: isComplete must be false');
  check(res.completeState === null, 'One phase done: completeState must be null (neither all done nor complete state)');
}

console.log('3. Testing pure function: All done shows the complete state...');
{
  const phases = [
    { id: 'storefront', name: 'Online Presence', tasks: [{ id: 't1', completed: true }] },
    { id: 'mvo', name: 'Paid Experience', tasks: [{ id: 't2', completed: true }] }
  ];
  const res = evaluateMilestones({ phases });
  check(res.completedPhases.length === 2, 'All done: all phases must be completed');
  check(res.milestoneLines.length === 2, 'All done: milestone lines for both phases');
  check(res.isComplete === true, 'All done: isComplete must be true');
  check(res.completeState !== null, 'All done: completeState must be non-null');
  
  const cs = res.completeState;
  check(cs && /finishing.*means/i.test(cs.whatFinishingMeans), 'Complete state must explain what finishing means');
  check(cs && Array.isArray(cs.nextSteps) && cs.nextSteps.length >= 2, 'Complete state must offer two next steps');
  
  const stepActions = cs.nextSteps.map(s => s.action);
  const stepTexts = cs.nextSteps.map(s => s.text + ' ' + s.title).join(' ');
  check(stepActions.includes('nextmove') || /keep making moves/i.test(stepTexts), 'Next step 1: must offer to keep making moves');
  check(stepActions.includes('audit') || /new audit|past version/i.test(stepTexts), 'Next step 2: must offer to run a new audit with roadmap kept as past version');
}

console.log('4. Testing progress dictionary with task keys...');
{
  const phases = [
    { id: 'storefront', name: 'Online Presence', taskKeys: ['storefront_1', 'storefront_2'] },
    { id: 'mvo', name: 'Paid Experience', taskKeys: ['mvo_1'] }
  ];
  const progress1 = {
    storefront_1: [true, true],
    storefront_2: [true],
    mvo_1: [false]
  };
  const res1 = evaluateMilestones({ phases, progress: progress1 });
  check(res1.completedPhases.length === 1 && res1.milestoneLines[0].includes('Online Presence'),
    'Task keys progress: storefront phase complete');
  check(res1.isComplete === false, 'Task keys progress: not all complete');

  const progressAll = {
    storefront_1: [true, true],
    storefront_2: [true],
    mvo_1: [true, true]
  };
  const resAll = evaluateMilestones({ phases, progress: progressAll });
  check(resAll.isComplete === true && resAll.completeState !== null,
    'Task keys progress: all complete');
}

console.log('5. Verifying zero em dashes in copy...');
{
  const state = buildRoadmapCompleteState();
  const allText = JSON.stringify(state) + ' ' + formatMilestoneLine('Online Presence');
  check(!allText.includes('—'), 'No em dashes in milestone lines or complete state');
}

console.log('6. Verifying canonical Bee Formula phases catalogue...');
{
  check(Array.isArray(BEE_FORMULA_PHASES) && BEE_FORMULA_PHASES.length === 11,
    'BEE_FORMULA_PHASES catalogue must contain the 11 stages');
  const ids = BEE_FORMULA_PHASES.map(p => p.id);
  check(ids.includes('storefront') && ids.includes('mvo') && ids.includes('signature') && ids.includes('traffic'),
    'Catalogue contains key components');
}

if (failures.length) {
  console.error('check-navigator-milestones FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('PASS: check-navigator-milestones passed all tests (one phase shows line, all done shows complete state, none shows neither).');
