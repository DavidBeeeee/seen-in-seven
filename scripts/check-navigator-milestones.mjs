// WBR-373 / WO-20261014-latemorning: Navigator milestones and finished roadmap proof.
//
// Tests:
// 1. One phase done shows the milestone line naming the phase, and no complete state.
// 2. All done shows the complete state with what finishing means and the two next steps.
// 3. Nothing done shows neither.
// 4. Zero em dashes in member copy.
// WO-20261018-evening, the page's own phase assembly against the page's TASK_DATA:
// 7. One finished level of a multi-level phase is NOT a milestone.
// 8. Every level finished IS, and it is announced once, not on every render.
// 9. Roadmap complete only when every roadmap phase is finished.
// 10. Show all expands on one click (DOM-free toggle test).
// 11. The page uses the assembly, the onboarding lines render before a first move,
//     and new member copy has no em dashes or banned words.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BEE_FORMULA_PHASES,
  formatMilestoneLine,
  buildRoadmapCompleteState,
  evaluateMilestones,
  assembleRoadmapPhases,
  evaluateRoadmap,
  buildTextRoadmap,
  ROADMAP_COMPLETE_ID
} from '../js/navigator-milestones.mjs';
import { historyView, bindToggleOnce, HISTORY_COLLAPSED_COUNT } from '../js/navigator-history.mjs';

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


// Extract the page's own TASK_DATA so the gate tests what members get.
const pageHtml = readFileSync(new URL('../api/_hub/navigator.html', import.meta.url), 'utf8');
function extractLiteral(src, marker, open, close) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const i = src.indexOf(open, at);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) return src.slice(i, j + 1);
  }
  return null;
}
const TASK_DATA = (0, eval)('(' + extractLiteral(pageHtml, 'const TASK_DATA = {', '{', '}') + ')');
const done = n => Array(n).fill(true);
const allDoneProgress = () => {
  const progress = {};
  for (const [id, levels] of Object.entries(TASK_DATA)) for (const t of levels) progress[`${id}_${t.level}`] = done(t.steps.length);
  return progress;
};

console.log('7. One finished level of a multi-level phase is not a milestone...');
{
  check(TASK_DATA.storefront.length >= 2, 'storefront must be a multi-level phase in TASK_DATA');
  const first = TASK_DATA.storefront[0];
  const progress = { [`storefront_${first.level}`]: done(first.steps.length) };
  const res = evaluateRoadmap({ taskData: TASK_DATA, answers: {}, progress });
  check(res.completedPhases.length === 0, 'One finished storefront level must not complete the phase');
  check(res.milestoneLines.length === 0, 'One finished level must print no milestone line');
  check(res.isComplete === false && res.completeState === null, 'One finished level must not show Roadmap complete');
  const sf = res.phases.find(p => p.id === 'storefront');
  check(sf && sf.levels.length === TASK_DATA.storefront.length, 'A phase is built from every TASK_DATA level, not only opened ones');
  check(sf && sf.next && sf.next.level === TASK_DATA.storefront[1].level, 'The next level is the first unfinished one');
  // The old bug: only opened tasks counted. Opening level 2 untouched still is not a milestone.
  const opened = { ...progress, [`storefront_${TASK_DATA.storefront[1].level}`]: [false, false, false] };
  check(evaluateRoadmap({ taskData: TASK_DATA, progress: opened }).completedPhases.length === 0, 'An opened, unticked level keeps the phase open');
}

console.log('8. Every level finished is a milestone, announced once...');
{
  const progress = {};
  for (const t of TASK_DATA.storefront) progress[`storefront_${t.level}`] = done(t.steps.length);
  const first = evaluateRoadmap({ taskData: TASK_DATA, progress, announced: [] });
  check(first.completedPhases.length === 1 && first.completedPhases[0].id === 'storefront', 'Every storefront level finished completes storefront');
  check(first.milestoneLines[0] === formatMilestoneLine('Online Presence'), 'The milestone names the phase');
  check(first.newlyEarned.length === 1, 'First render announces the milestone');
  check(first.isComplete === false, 'One phase finished is not Roadmap complete');
  const second = evaluateRoadmap({ taskData: TASK_DATA, progress, announced: first.announced });
  check(second.completedPhases.length === 1 && second.newlyEarned.length === 0, 'Second render keeps the record and does not announce again');
  // Audit depth already covering a phase is in place but not a milestone the member earned here.
  const audited = evaluateRoadmap({ taskData: TASK_DATA, answers: { storefront: { depth: 3 } }, progress: {} });
  check(audited.phases.find(p => p.id === 'storefront').isComplete === true, 'Audit depth 3 puts every storefront level in place');
  check(audited.completedPhases.length === 0, 'A phase covered by the audit alone is not announced as a milestone');
  // Unticking a step after the announcement drops the record so it can be earned again.
  const undone = { ...progress, [`storefront_${TASK_DATA.storefront[0].level}`]: [true, false, true] };
  const reopened = evaluateRoadmap({ taskData: TASK_DATA, progress: undone, announced: first.announced });
  check(reopened.completedPhases.length === 0 && !reopened.announced.includes('storefront'), 'A reopened phase leaves the announced record');
}

console.log('9. Roadmap complete needs every roadmap phase...');
{
  const ids = Object.keys(TASK_DATA);
  check(ids.length === 11 && assembleRoadmapPhases({ taskData: TASK_DATA }).length === 11, 'The roadmap has the 11 phases TASK_DATA defines');
  const all = allDoneProgress();
  const missingOne = { ...all };
  const lastId = ids[ids.length - 1];
  const lastLevel = TASK_DATA[lastId][TASK_DATA[lastId].length - 1];
  missingOne[`${lastId}_${lastLevel.level}`] = done(lastLevel.steps.length).map((v, i) => i !== 0);
  const ten = evaluateRoadmap({ taskData: TASK_DATA, progress: missingOne });
  check(ten.completedPhases.length === 10, 'Ten of eleven phases finished shows ten milestones');
  check(ten.isComplete === false && ten.completeState === null, 'Ten of eleven phases is not Roadmap complete');
  const eleven = evaluateRoadmap({ taskData: TASK_DATA, progress: all });
  check(eleven.isComplete === true && eleven.completeState !== null, 'Every phase finished is Roadmap complete');
  check(eleven.announceComplete === true && eleven.announced.includes(ROADMAP_COMPLETE_ID), 'Roadmap complete is announced the first time');
  const again = evaluateRoadmap({ taskData: TASK_DATA, progress: all, announced: eleven.announced });
  check(again.isComplete === true && again.announceComplete === false, 'Roadmap complete is not re-announced on every render');
  // Audit covering everything with nothing finished here does not celebrate.
  const maxAnswers = Object.fromEntries(ids.map(id => [id, { depth: 3 }]));
  check(evaluateRoadmap({ taskData: TASK_DATA, answers: maxAnswers }).isComplete === false, 'An audit alone never shows Roadmap complete');
  const text = buildTextRoadmap(ten.phases);
  check(text.length === 11 && text.every(p => p.levels.length > 0), 'The text-only roadmap lists every phase and level');
  check(/Not started|Started|Finished/.test(text[0].heading), 'Each text-only phase states where it stands');
  const focused = buildTextRoadmap(assembleRoadmapPhases({ taskData: TASK_DATA }), { id: 'storefront', level: 2 });
  check(/Level 2, [^:]+: your Priority One$/.test(focused[0].levels[1]) && /: to do$/.test(focused[0].levels[0]),
    'The text-only view marks the Priority One level the visual roadmap opens on');
}

console.log('10. Show all expands on one click...');
{
  const prior = Array.from({ length: 23 }, (_, i) => ({ id: i, next_action: `Move ${i}`, status: 'completed' }));
  let expanded = false;
  const collapsed = historyView(prior, expanded);
  check(collapsed.hasMore && collapsed.hiddenCount === prior.length - HISTORY_COLLAPSED_COUNT, 'Collapsed list hides moves past the first ten');
  // A fake button that, like a browser, runs onclick plus every added listener.
  const listeners = [];
  const button = { onclick: null, addEventListener: (t, fn) => listeners.push(fn), click() { if (this.onclick) this.onclick(); listeners.forEach(fn => fn()); } };
  bindToggleOnce(button, () => { expanded = !expanded; });
  bindToggleOnce(button, () => { expanded = !expanded; }); // a re-render binds again
  button.click();
  check(expanded === true, 'One click on Show all leaves the list expanded');
  check(historyView(prior, expanded).hiddenCount === 0, 'Expanded list shows every loaded move');
  const note = historyView(prior, false).note;
  check(/newest 50/.test(note) && /kept/i.test(note) && /not shown/i.test(note), 'The note says moves past the newest 50 are kept and not shown');
  const navJs = readFileSync(new URL('../js/navigator.js', import.meta.url), 'utf8');
  const renderHistory = navJs.slice(navJs.indexOf('function renderHistory'), navJs.indexOf('function render()'));
  check(!/addEventListener\(\s*'click'/.test(renderHistory), 'renderHistory must not add a second click listener');
  check(/bindToggleOnce/.test(renderHistory), 'renderHistory binds through bindToggleOnce');
}

console.log('11. Page wiring and onboarding copy...');
{
  const renderMilestones = pageHtml.slice(pageHtml.indexOf('function renderMilestones'), pageHtml.indexOf('function renderTextRoadmap'));
  check(/evaluateRoadmap/.test(pageHtml) && !/viewedTasks/.test(renderMilestones), 'renderMilestones uses the TASK_DATA assembly, not opened tasks');
  check(/navigator-history\.mjs/.test(pageHtml), 'The page loads the history module');
  const wizard = pageHtml.slice(pageHtml.indexOf('id="screen-wizard"'), pageHtml.indexOf('id="screen-questions"'));
  const formulaAt = wizard.indexOf('The Bee Formula is');
  check(formulaAt >= 0, 'The first screen explains the Bee Formula in one plain line');
  check(formulaAt >= 0 && wizard.indexOf('Bee Formula') === formulaAt + 4, 'Bee Formula is explained before the word is used anywhere else on the first screen');
  check(/openNavigatorOverTime\(\)/.test(wizard), 'The over-time link is on the first screen, before a first move');
  check(/chatbot/i.test(wizard) && /remembers your audit/i.test(wizard), 'The first screen says why this beats asking a chatbot');
  check(/class="audit-handoff"/.test(pageHtml), 'The finished audit hands off into ongoing use');
  check(/id="roadmap-text-toggle"/.test(pageHtml) && /id="roadmap-text-view"/.test(pageHtml), 'The roadmap has a text-only view toggle');

  const focused0Copy = () => buildTextRoadmap(assembleRoadmapPhases({ taskData: TASK_DATA }), { id: 'storefront', level: 2 })[0].levels.map(l => l.replace(/^Level \d+, [^:]+: /, ''));
  const stripTags = h => h.replace(/<[^>]+>/g, ' ');
  const newCopy = [
    stripTags(wizard.slice(wizard.indexOf('nav-bee-formula-line'), wizard.indexOf('id="resume-container"'))),
    stripTags(pageHtml.slice(pageHtml.indexOf('class="audit-handoff"'), pageHtml.indexOf('CHOOSE MY FOCUS'))),
    'Text-only view Show the visual roadmap',
    JSON.stringify(focused0Copy()),
    // Phase names and level titles are existing catalogue copy; only the new status words are checked.
    JSON.stringify(buildTextRoadmap(assembleRoadmapPhases({ taskData: TASK_DATA })).map(p => [p.heading.replace(/^\d+\. [^:]+: /, ''), p.levels.map(l => l.replace(/^Level \d+, [^:]+: /, ''))])),
    historyView([], false).note
  ].join(' ');
  check(!newCopy.includes('\u2014'), 'No em dashes in new member copy');
  const blueprints = readFileSync(new URL('../api/_lib/blueprints.txt', import.meta.url), 'utf8');
  const bannedBlock = (blueprints.match(/<banned_script_terms>([\s\S]*?)<\/banned_script_terms>/) || [])[1] || '';
  const banned = bannedBlock.split(/\r?\n/).map(t => t.trim().toLowerCase()).filter(Boolean);
  check(banned.length > 20, 'The banned term list was read from blueprints.txt');
  const lower = newCopy.toLowerCase();
  const hits = banned.filter(t => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(lower));
  check(hits.length === 0, `New member copy uses banned words: ${hits.join(', ')}`);
}

if (failures.length) {
  console.error('check-navigator-milestones FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('PASS: check-navigator-milestones passed all tests (page phase assembly, earned milestones announced once, Roadmap complete needs every phase, Show all on one click, onboarding copy).');
