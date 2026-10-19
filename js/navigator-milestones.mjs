// Next Step Navigator: Bee Formula milestones and roadmap completion. WBR-373.
// Pure functions for milestone detection per phase, milestone lines, and roadmap-complete state.
// Member copy carries zero em dashes and uses David's plain voice.

export const BEE_FORMULA_PHASES = [
  { id: 'storefront', name: 'Online Presence' },
  { id: 'mvo', name: 'Paid Experience' },
  { id: 'signature', name: 'Core Service' },
  { id: 'leadmagnet', name: 'Free Value' },
  { id: 'emails', name: 'Follow-Up' },
  { id: 'salescall', name: 'Sales Conversations' },
  { id: 'groupcall', name: 'Community' },
  { id: 'traffic', name: 'Social Media' },
  { id: 'highticket', name: 'VIP Support' },
  { id: 'aiaas', name: 'Systems & AI' },
  { id: 'paidtraffic', name: 'Paid Traffic' }
];

export function formatMilestoneLine(phaseName) {
  return `Milestone: ${phaseName} is complete.`;
}

export function buildRoadmapCompleteState() {
  return {
    isComplete: true,
    title: 'Roadmap complete',
    whatFinishingMeans: 'Finishing your roadmap means your core business pipeline is in place and your systems are set up. Nothing in Navigator escalates, deteriorates, or expires when you finish. You have built real infrastructure.',
    nextSteps: [
      {
        id: 'keep-making-moves',
        title: 'Keep making moves',
        action: 'nextmove',
        label: 'Go to Next Move',
        text: 'Keep using your Next Move tool to take one concrete action at a time and maintain momentum in your daily routine.'
      },
      {
        id: 'start-fresh-audit',
        title: 'Run a new audit',
        action: 'audit',
        label: 'Run a new audit',
        text: 'Run a new audit whenever your business needs a fresh check. Your finished roadmap is kept safely in your account as a past version you can bring back at any time.'
      }
    ]
  };
}

export function evaluateMilestones(input = {}) {
  let phases = [];
  let progress = {};

  if (Array.isArray(input)) {
    phases = input;
  } else if (input && Array.isArray(input.phases)) {
    phases = input.phases;
    progress = input.progress || {};
  } else if (input && input.progress) {
    progress = input.progress || {};
    phases = BEE_FORMULA_PHASES.map(p => {
      const taskKeys = Object.keys(progress).filter(k => k.startsWith(p.id + '_'));
      return {
        id: p.id,
        name: p.name,
        taskKeys
      };
    }).filter(p => p.taskKeys.length > 0);
  } else {
    phases = [];
  }

  if (!phases.length) {
    return {
      completedPhases: [],
      milestoneLines: [],
      isComplete: false,
      completeState: null
    };
  }

  const completedPhases = [];
  const milestoneLines = [];

  for (const phase of phases) {
    let phaseDone = false;

    if (typeof phase.isComplete === 'boolean') {
      phaseDone = phase.isComplete;
    } else if (typeof phase.completed === 'boolean') {
      phaseDone = phase.completed;
    } else if (Array.isArray(phase.tasks) && phase.tasks.length > 0) {
      phaseDone = phase.tasks.every(t => {
        if (typeof t === 'boolean') return t;
        if (typeof t.completed === 'boolean') return t.completed;
        if (Array.isArray(t.steps) && t.steps.length > 0) return t.steps.every(Boolean);
        if (t.id && progress[t.id]) return Array.isArray(progress[t.id]) && progress[t.id].length > 0 && progress[t.id].every(Boolean);
        return false;
      });
    } else if (Array.isArray(phase.taskKeys) && phase.taskKeys.length > 0) {
      phaseDone = phase.taskKeys.every(k => {
        const val = progress[k];
        return Array.isArray(val) && val.length > 0 && val.every(Boolean);
      });
    }

    if (phaseDone) {
      const name = phase.name || phase.title || phase.id;
      const line = formatMilestoneLine(name);
      completedPhases.push({
        id: phase.id,
        name,
        milestoneLine: line
      });
      milestoneLines.push(line);
    }
  }

  const isComplete = phases.length > 0 && completedPhases.length === phases.length;
  const completeState = isComplete ? buildRoadmapCompleteState() : null;

  return {
    completedPhases,
    milestoneLines,
    isComplete,
    completeState
  };
}

// The page's phase assembly, WO-20261018-evening. A phase is every level
// TASK_DATA defines for it, not only the levels a member has opened. A level is
// in place when its checklist is fully ticked or the member's audit depth already
// covers it. A phase counts as a milestone only when every level is in place and
// at least one of them was finished here, so a phase the audit already covered is
// never announced as something the member just did.
export const ROADMAP_COMPLETE_ID = '__roadmap_complete__';

export function levelDone(progressSteps) {
  return Array.isArray(progressSteps) && progressSteps.length > 0 && progressSteps.every(v => v === true);
}

export function assembleRoadmapPhases({ taskData = {}, answers = {}, progress = {} } = {}) {
  return BEE_FORMULA_PHASES
    .filter(p => Array.isArray(taskData[p.id]) && taskData[p.id].length > 0)
    .map(p => {
      const depth = Number((answers[p.id] && answers[p.id].depth) || 0);
      const levels = taskData[p.id]
        .map(t => {
          const key = `${p.id}_${t.level}`;
          const finishedHere = levelDone(progress[key]);
          const coveredByAudit = !finishedHere && t.level <= depth;
          return {
            key,
            level: t.level,
            title: t.title || '',
            finishedHere,
            coveredByAudit,
            done: finishedHere || coveredByAudit
          };
        })
        .sort((a, b) => a.level - b.level);
      const isComplete = levels.every(l => l.done);
      const earned = isComplete && levels.some(l => l.finishedHere);
      const next = levels.find(l => !l.done) || null;
      return { id: p.id, name: p.name, levels, isComplete, earned, next };
    });
}

export function evaluateRoadmap({ taskData = {}, answers = {}, progress = {}, announced = [] } = {}) {
  const phases = assembleRoadmapPhases({ taskData, answers, progress });
  const seen = new Set(Array.isArray(announced) ? announced : []);
  const completedPhases = phases
    .filter(p => p.earned)
    .map(p => ({ id: p.id, name: p.name, milestoneLine: formatMilestoneLine(p.name) }));
  const isComplete = phases.length > 0 && phases.every(p => p.isComplete) && phases.some(p => p.earned);
  const newlyEarned = completedPhases.filter(p => !seen.has(p.id));
  const announceComplete = isComplete && !seen.has(ROADMAP_COMPLETE_ID);
  const nextAnnounced = [...seen].filter(id => id === ROADMAP_COMPLETE_ID ? isComplete : completedPhases.some(p => p.id === id));
  newlyEarned.forEach(p => nextAnnounced.push(p.id));
  if (announceComplete) nextAnnounced.push(ROADMAP_COMPLETE_ID);
  return {
    phases,
    completedPhases,
    milestoneLines: completedPhases.map(p => p.milestoneLine),
    newlyEarned,
    announceComplete,
    announced: nextAnnounced,
    isComplete,
    completeState: isComplete ? buildRoadmapCompleteState() : null
  };
}


// A plain reading of the whole roadmap for the text-only view. focus is the
// page's Priority One ({ id, level }); in that phase it is the level marked next,
// matching what the visual roadmap opens on. Elsewhere next is the first level
// not yet in place, which is the level the All Stages list shows.
export function buildTextRoadmap(phases = [], focus = null) {
  return phases.map((p, i) => {
    const status = p.isComplete ? 'Finished' : (p.levels.some(l => l.done) ? 'Started' : 'Not started');
    const focusHere = focus && focus.id === p.id && p.levels.some(l => l.level === focus.level && !l.done);
    const nextKey = focusHere ? `${p.id}_${focus.level}` : (p.next ? p.next.key : null);
    return {
      id: p.id,
      heading: `${i + 1}. ${p.name}: ${status}`,
      levels: p.levels.map(l => {
        const state = l.finishedHere ? 'done here'
          : (l.coveredByAudit ? 'already in place'
            : (l.key === nextKey ? (focusHere ? 'your Priority One' : 'next up') : 'to do'));
        return `Level ${l.level}, ${l.title}: ${state}`;
      })
    };
  });
}

if (typeof window !== 'undefined') {
  window.NavigatorMilestones = {
    BEE_FORMULA_PHASES,
    formatMilestoneLine,
    buildRoadmapCompleteState,
    evaluateMilestones,
    levelDone,
    assembleRoadmapPhases,
    evaluateRoadmap,
    buildTextRoadmap,
    ROADMAP_COMPLETE_ID
  };
  window.dispatchEvent(new Event('navigator-milestones-ready'));
}
