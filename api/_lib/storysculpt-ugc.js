// StorySculpt UGC / Product Video script builder: structures, angles, review & filming.
// WBR-440 / STORYSCULPT_UGC_BUILD_PLAN.md Sections 4, 6 & 7.

export const UGC_STRUCTURES = {
  'direct-response': {
    id: 'direct-response',
    name: 'Direct Response',
    summary: 'Hook, specific problem, supported solution, clear call to action.',
    idealFor: 'direct'
  },
  'skit': {
    id: 'skit',
    name: 'Relatable Skit',
    summary: 'Daily friction, relatable situation, product intervention, practical resolution.',
    idealFor: 'useful'
  },
  'honest-test': {
    id: 'honest-test',
    name: 'Honest Test',
    summary: 'Specific question, real method, observations, caveat, and verdict.',
    idealFor: 'direct'
  },
  'transformation': {
    id: 'transformation',
    name: 'Grounded Transformation',
    summary: 'Clear before/after context with supported evidence and no fake causation.',
    idealFor: 'direct'
  },
  'story-loop': {
    id: 'story-loop',
    name: 'Story Loop',
    summary: 'Unresolved problem or open loop, turning point, and grounded reveal.',
    idealFor: 'useful'
  },
  'tutorial': {
    id: 'tutorial',
    name: 'Tutorial Demonstration',
    summary: 'Practical actionable steps where the product naturally serves one step.',
    idealFor: 'useful'
  },
  'reaction': {
    id: 'reaction',
    name: 'Claim Reaction',
    summary: 'Identified claim, creator\'s genuine position, and proof.',
    idealFor: 'direct'
  },
  'regret': {
    id: 'regret',
    name: 'Prior Choice / Regret',
    summary: 'Real prior habit or mistake, what changed with this product.',
    idealFor: 'useful'
  },
  'list': {
    id: 'list',
    name: 'Practical List',
    summary: '3 to 5 useful observations leading naturally to the product.',
    idealFor: 'useful'
  },
  'lifestyle-broll': {
    id: 'lifestyle-broll',
    name: 'Lifestyle B-roll',
    summary: 'Visual daily use, concrete practical benefit, relaxed everyday context.',
    idealFor: 'useful'
  }
};

// Generate 3 distinct angles grounded in research and creator context.
export function generateAngleCards({
  research = {},
  creatorExperience = {},
  salesApproach = 'help-decide'
} = {}) {
  const product = research.product || {};
  const productName = product.name || 'this product';
  const findings = research.findings || {};
  const features = findings.features || [];
  const claims = findings.brandClaims || [];
  const customerReports = findings.customerReports || [];
  const used = creatorExperience.used || 'used'; // 'used' | 'not-yet' | 'my-own'
  const creatorNotes = creatorExperience.observations || '';
  const sourceRefs = (research.sources || []).map(s => s.id);

  // Determine primary approach
  const approach = salesApproach === 'help-decide'
    ? (used === 'not-yet' ? 'useful' : 'direct')
    : salesApproach;

  const angles = [];

  // Angle 1: Problem / Friction solve
  const primaryProblem = customerReports[0] || claims[0] || features[0] || 'the everyday problem people buy this to solve';
  angles.push({
    id: 'angle-1',
    title: 'The Real Problem Solver',
    approach: approach === 'direct' ? 'Direct recommendation' : 'Useful problem breakdown',
    structure: approach === 'direct' ? 'direct-response' : 'tutorial',
    whyViewerCares: `Focuses on the exact friction buyers report: ${primaryProblem.slice(0, 120)}`,
    demonstrationIdea: used === 'not-yet'
      ? `Demonstrate unboxing and testing whether ${productName} actually addresses this.`
      : `Show the specific moment where ${productName} replaced the messy old way.`,
    evidenceRefs: sourceRefs.slice(0, 2)
  });

  // Angle 2: Honest Test / Demonstration
  const testFeature = features[1] || features[0] || 'the main claimed benefit';
  angles.push({
    id: 'angle-2',
    title: used === 'not-yet' ? 'The First-Impression Test' : 'The Everyday Routine Fit',
    approach: 'Demonstration and observation',
    structure: used === 'not-yet' ? 'honest-test' : 'lifestyle-broll',
    whyViewerCares: `Shows realistic use rather than high-pressure selling. Tests: ${testFeature.slice(0, 120)}`,
    demonstrationIdea: `Camera captures natural action in real lighting, highlighting practical pros and one honest limitation.`,
    evidenceRefs: sourceRefs.slice(0, 2)
  });

  // Angle 3: Common Alternative / Contrast
  const contrastPoint = features[2] || customerReports[1] || 'what people usually waste money on instead';
  angles.push({
    id: 'angle-3',
    title: 'Stop Doing It The Hard Way',
    approach: 'Contrast and advice',
    structure: 'regret',
    whyViewerCares: `Highlights the wasteful alternative or common mistake: ${contrastPoint.slice(0, 120)}`,
    demonstrationIdea: `Side-by-side or quick before/after showing the old habit versus the simpler result with ${productName}.`,
    evidenceRefs: sourceRefs.slice(0, 2)
  });

  return angles;
}

// Scans draft content for unsupported claims, medical/financial guarantees,
// and invented testing claims that violate creator fidelity.
export function reviewScriptClaims(scriptText, { creatorExperience = {}, research = {} } = {}) {
  const issues = [];
  const text = String(scriptText || '');
  const lines = text.split('\n');

  // Check 1: Medical / Health cure promises
  const MEDICAL_REGEX = /\b(?:cures?|heals?|treats?|prevent(?:s)?\s+disease|permanent(?:ly)?\s+removes?|medical(?:ly)?\s+proven)\b/i;
  // Check 2: Financial guarantees
  const FINANCIAL_REGEX = /\b(?:guaranteed\s+(?:income|money|sales|revenue)|make\s+\$\d+|10x\s+your\s+money)\b/i;
  // Check 3: Superlatives with no proof
  const SUPERLATIVE_REGEX = /\b(?:#1\s+in\s+the\s+world|best\s+on\s+earth|proven\s+by\s+everyone|100%\s+effective)\b/i;
  // Check 4: Invented test duration when creator hasn't used it
  const DURATION_REGEX = /\b(?:I(?:'ve|\s+have)\s+been\s+using\s+this\s+for\s+(?:\d+|months|years|weeks))\b/i;

  lines.forEach((line, index) => {
    const cleanLine = line.trim();
    if (!cleanLine) return;

    if (MEDICAL_REGEX.test(cleanLine)) {
      issues.push({
        line: cleanLine,
        lineIndex: index,
        issue: 'Medical or disease cure claim',
        suggestion: 'Rephrase as a personal comfort or cosmetic benefit, not a medical cure.'
      });
    }

    if (FINANCIAL_REGEX.test(cleanLine)) {
      issues.push({
        line: cleanLine,
        lineIndex: index,
        issue: 'Guaranteed financial outcome',
        suggestion: 'State the specific task this helps with rather than promising money or sales.'
      });
    }

    if (SUPERLATIVE_REGEX.test(cleanLine)) {
      issues.push({
        line: cleanLine,
        lineIndex: index,
        issue: 'Unearned superlative claim',
        suggestion: 'State what you specifically liked about it rather than claiming it is #1 everywhere.'
      });
    }

    if (creatorExperience.used === 'not-yet' && DURATION_REGEX.test(cleanLine)) {
      issues.push({
        line: cleanLine,
        lineIndex: index,
        issue: 'Claiming extended personal use when testing has not started',
        suggestion: 'Frame as what you are testing today or your first impressions unboxing it.'
      });
    }
  });

  return issues;
}

// Generates a structured scene-by-scene filming plan for an approved script.
export function buildFilmingPlan(scriptText, {
  format = 'talking-head',
  durationSeconds = 60,
  constraints = ''
} = {}) {
  const text = String(scriptText || '').trim();
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (!paragraphs.length) return [];

  const totalWords = text.split(/\s+/).filter(Boolean).length;
  const wordPacing = Math.max(1, Math.round(totalWords / paragraphs.length));
  const secondsPerWord = durationSeconds / Math.max(1, totalWords);

  let elapsed = 0;

  return paragraphs.map((para, index) => {
    const pWords = para.split(/\s+/).filter(Boolean).length;
    const pSeconds = Math.round(pWords * secondsPerWord);
    const startSec = elapsed;
    const endSec = Math.min(durationSeconds, elapsed + pSeconds);
    elapsed = endSec;

    const formatTime = (s) => `0:${s < 10 ? '0' : ''}${s}`;
    const timing = `${formatTime(startSec)} - ${formatTime(endSec)}`;

    let visualAction = '';
    let filmingNotes = '';

    if (index === 0) {
      // Hook scene
      visualAction = format === 'voiceover'
        ? 'Close-up B-roll of the product in action or the problem in progress.'
        : 'Direct to camera: eye-level, engaging expression, holding or pointing to the product.';
      filmingNotes = 'Hook pacing: deliver clearly in the first 3 seconds with no long pause.';
    } else if (index === paragraphs.length - 1) {
      // CTA / Verdict scene
      visualAction = format === 'text-on-screen'
        ? 'Clean final shot with clear text callout and website/link pointer.'
        : 'Eye contact with camera, showing final result or resting product shot.';
      filmingNotes = 'Hold the end frame for one extra second so the viewer can read or tap.';
    } else {
      // Body demonstration scene
      visualAction = format === 'voiceover'
        ? `Hands-on demonstration showing the specific feature mentioned in this line.`
        : `Cut between speaking to camera and a cutaway of the product being used.`;
      filmingNotes = constraints ? `Work around creator constraint: ${constraints.slice(0, 60)}` : 'Keep lighting even and show the real texture/operation.';
    }

    return {
      sceneNumber: index + 1,
      timing,
      spokenSegment: para.trim(),
      visualAction,
      filmingNotes
    };
  });
}

// Generates 3 hooks based on the approved script body.
export function buildUgcHookOptions(productName, angleTitle, scriptBody) {
  const body = String(scriptBody || '').trim();
  const firstSentence = (body.match(/^[^.!?]+[.!?]/) || [''])[0].trim();

  return [
    {
      id: 'hook-1',
      kind: 'Problem callout',
      text: `If you have been struggling with ${productName || 'this'}, watch this before buying anything else.`
    },
    {
      id: 'hook-2',
      kind: 'Counter-intuitive test',
      text: `I honestly didn't think ${productName || 'this'} would make any difference, but here is what actually happened.`
    },
    {
      id: 'hook-3',
      kind: 'Direct demonstration',
      text: firstSentence ? firstSentence.replace(/[\u2014\u2013]/g, ', ') : `Here is the one reason ${productName || 'this'} is worth testing today.`
    }
  ];
}

// System prompt for UGC Script Generation
export function ugcSystemPrompt({
  product = {},
  selectedAngle = {},
  creatorExperience = {},
  salesApproach = 'direct',
  outputStyle = 'script',
  targetDurationSeconds = 60,
  filmingEnabled = false
} = {}) {
  const pName = product.name || 'the product';
  const used = creatorExperience.used || 'used';
  const obs = creatorExperience.observations || '';

  return [
    'You are StorySculpt writing an authentic, creator-led product video script.',
    'David Bee\'s core rules apply at all times:',
    '1. NEVER use an em dash. Use commas or clean short sentences.',
    '2. NEVER invent testimonials from imaginary third parties ("my client Sarah said...").',
    '3. NEVER invent numbers, testing durations, or fake medical/financial guarantees.',
    '4. Creator fidelity: The creator declared their experience with this product as: ' + used + '.' + (obs ? ' Creator notes: ' + obs : ''),
    used === 'not-yet' ? 'Do NOT write as if the creator has owned or used this for months. Frame as an honest unboxing, first test, or feature examination.' : '',
    '5. Selling approach: ' + (salesApproach === 'useful' ? 'Useful/educational content featuring the product naturally (subtle recommendation).' : 'Direct recommendation (honest, clear benefits, direct CTA).'),
    '6. Selected Angle: ' + (selectedAngle.title || 'Product demonstration') + ' (' + (selectedAngle.structure || 'direct-response') + ').',
    '7. Output format: ' + (outputStyle === 'points' ? 'Ordered bulleted talking points for creator delivery.' : 'Full spoken video script with natural rhythm.'),
    '8. Target duration: ' + targetDurationSeconds + ' seconds (roughly ' + Math.round(targetDurationSeconds * 2.3) + ' words).',
    filmingEnabled ? 'Include scene hints or visual cues in brackets [Visual: ...] where helpful.' : 'Do not include filming instructions or camera directions in the spoken script text.',
    'Deliver clean, compelling, authentic text ready to film.'
  ].filter(Boolean).join('\n\n');
}
