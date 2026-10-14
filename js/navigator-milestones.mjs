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

if (typeof window !== 'undefined') {
  window.NavigatorMilestones = {
    BEE_FORMULA_PHASES,
    formatMilestoneLine,
    buildRoadmapCompleteState,
    evaluateMilestones
  };
  window.dispatchEvent(new Event('navigator-milestones-ready'));
}
