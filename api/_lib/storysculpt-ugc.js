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

// The creator's own notes, split into usable sentences, so angles reflect what
// they actually said when research has nothing to offer.
function creatorNoteBits(notes) {
  return String(notes || '').split(/(?<=[.!?])\s+|\n+/).map(t => t.trim().replace(/[.!?]+$/, '')).filter(t => t.length > 8);
}

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
  const noteBits = creatorNoteBits(creatorNotes);

  // Determine primary approach
  const approach = salesApproach === 'help-decide'
    ? (used === 'not-yet' ? 'useful' : 'direct')
    : salesApproach;

  const angles = [];

  // Angle 1: Problem / Friction solve
  const primaryProblem = customerReports[0] || noteBits[0] || claims[0] || features[0] || 'the everyday problem people buy this to solve';
  const problemLead = customerReports[0] ? 'Focuses on the exact friction buyers report: ' : noteBits[0] ? 'Built on what you noticed: ' : 'Focuses on the everyday problem: ';
  angles.push({
    id: 'angle-1',
    title: 'The Real Problem Solver',
    approach: approach === 'direct' ? 'Direct recommendation' : 'Useful problem breakdown',
    structure: approach === 'direct' ? 'direct-response' : 'tutorial',
    whyViewerCares: problemLead + primaryProblem.slice(0, 120),
    demonstrationIdea: used === 'not-yet'
      ? `Demonstrate unboxing and testing whether ${productName} actually addresses this.`
      : `Show the specific moment where ${productName} replaced the messy old way.`,
    evidenceRefs: sourceRefs.slice(0, 2)
  });

  // Angle 2: Honest Test / Demonstration
  const testFeature = noteBits[1] || features[1] || features[0] || '';
  angles.push({
    id: 'angle-2',
    title: used === 'not-yet' ? 'The First-Impression Test' : 'The Everyday Routine Fit',
    approach: 'Demonstration and observation',
    structure: used === 'not-yet' ? 'honest-test' : 'lifestyle-broll',
    whyViewerCares: 'Shows realistic use rather than high-pressure selling.' + (testFeature ? ' Shows: ' + testFeature.slice(0, 120) : ''),
    demonstrationIdea: `Camera captures natural action in real lighting, highlighting practical pros and one honest limitation.`,
    evidenceRefs: sourceRefs.slice(0, 2)
  });

  // Angle 3: Common Alternative / Contrast
  const contrastPoint = noteBits[2] || features[2] || customerReports[1] || 'what people usually waste money on instead';
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

    // A line in the creator's own voice ("my knees feel better", "I think") is
    // personal experience or opinion, not an expert claim. David, 2026-10-13.
    const personal = /\b(?:I|I'm|I've|my|me|for me)\b/i.test(cleanLine);
    if (MEDICAL_REGEX.test(cleanLine) && !personal) {
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

// Separates bracketed camera directions from the spoken lines. A direction
// belongs to the spoken paragraph that follows it, so the plan shows it as that
// scene's shot instead of asking the creator to say it out loud.
export function splitDirections(scriptText) {
  const blocks = String(scriptText || '').trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const paragraphs = [];
  const directions = [];
  let pending = [];
  for (const block of blocks) {
    const visuals = [...block.matchAll(/\[(?:visual|shot|b-roll|camera)\s*:\s*([^\]]+)\]/gi)].map(m => m[1].trim());
    const spoken = block.replace(/\[(?:visual|shot|b-roll|camera)\s*:[^\]]*\]/gi, '').trim();
    pending.push(...visuals);
    if (!spoken) continue;
    paragraphs.push(spoken);
    directions.push(pending.length ? pending.join(' Then: ') : '');
    pending = [];
  }
  if (pending.length && directions.length) directions[directions.length - 1] += (directions[directions.length - 1] ? ' Then: ' : '') + pending.join(' Then: ');
  return { paragraphs, directions };
}

// Strips everything a model says around a script so only filmable words are
// saved: a preamble addressed to the creator, separators, markdown emphasis and
// "Title:" / "Script:" labels. 2026-10-13 live test: a draft opened with "Here's
// the honest, first-test angle. I've kept it tight" and a refused revision was
// saved as the script itself.
export function cleanUgcScript(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n').trim();
  text = text.replace(/^(?:FINAL SCRIPT|NEXT QUESTION):\s*/i, '');
  // A preamble before a --- separator near the top is talk, not script.
  const sep = text.match(/^([\s\S]{0,600}?)\n\s*(?:-{3,}|\*{3,}|_{3,})\s*\n/);
  if (sep) text = text.slice(sep[0].length);
  text = text.split('\n').filter(line => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)).join('\n');
  // Label-only lines and label prefixes.
  text = text.replace(/^\s*\**\s*(?:title|script|video script|talking points|hook|cta|call to action|body)\s*:?\s*\**\s*:?\s*$/gim, '');
  text = text.replace(/^\s*\*\*\s*(?:title)\s*:?\s*\*\*\s*:?.*$/gim, '');
  text = text.replace(/^\s*\*\*\s*(?:script|hook|cta|body)\s*:?\s*\*\*\s*:?\s*/gim, '');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2');
  // A first paragraph that talks about the script rather than to the viewer.
  const paras = text.split(/\n\s*\n/);
  // Talk about the deliverable: "here's the script", "I've kept it tight", "I
  // can't add that line", "David Bee's core rules". A real opening line that
  // merely uses the word "angle" or "version" is left alone.
  const meta = /(?:\b(?:here(?:'|’)s|here is|below is|this is)\s+(?:the|your|a)\s+(?:\w+[ ,-]+){0,4}(?:script|draft|version|angle|take)\b|\bI(?:'|’)ve kept\b|\bkept it (?:tight|short|direct)|\bI (?:can(?:'|’)t|cannot|won(?:'|’)t) (?:add|include|write|say)\b|\bcore rules\b|\bas requested\b|\b(?:revised|updated|tightened) (?:script|draft|version)\b)/i;
  for (let i = 0; i < 2 && paras.length > 1; i += 1) {
    const first = paras[0].trim();
    if (first.length < 400 && meta.test(first)) paras.shift(); else break;
  }
  return paras.join('\n\n').replace(/\n{3,}/g, '\n\n').replace(/[\u2014\u2013]/g, ', ').trim();
}

// Generates a structured scene-by-scene filming plan for an approved script.
export function buildFilmingPlan(scriptText, {
  format = 'talking-head',
  durationSeconds = 60,
  constraints = ''
} = {}) {
  const { paragraphs, directions } = splitDirections(scriptText);
  if (!paragraphs.length) return [];

  const totalWords = paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
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
      visualAction: directions[index] || visualAction,
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
    'These rules apply at all times:',
    '1. NEVER use an em dash. Use commas or clean short sentences.',
    '2. NEVER invent testimonials from imaginary third parties ("my client Sarah said...").',
    '3. Do not make up numbers or testing durations the creator did not give you, and do not promise the viewer guaranteed results (cures, guaranteed income).',
    '3a. Personal experience and opinion are the creator\'s to say. Anything the creator tells you about how the product worked for them, including in a revision request, goes in as their own first-person experience ("for me", "I noticed", "I feel"). Never refuse it and never lecture about it. The script is a person talking, not an expert claiming authority.',
    '4. Creator fidelity: The creator declared their experience with this product as: ' + used + '.' + (obs ? ' Creator notes: ' + obs : ''),
    used === 'not-yet' ? 'Do NOT write as if the creator has owned or used this for months. Frame as an honest unboxing, first test, or feature examination.' : '',
    '5. Selling approach: ' + (salesApproach === 'useful' ? 'Useful/educational content featuring the product naturally (subtle recommendation). End on a soft sign-off or a question to the viewer, not a hard "buy it" or "link below" push.' : 'Direct recommendation (honest, clear benefits, direct CTA).'),
    '6. Selected Angle: ' + (selectedAngle.title || 'Product demonstration') + ' (' + (selectedAngle.structure || 'direct-response') + ').',
    '7. Output format: ' + (outputStyle === 'points' ? 'Ordered bulleted talking points for creator delivery.' : 'Full spoken video script with natural rhythm.'),
    '8. Target duration: ' + targetDurationSeconds + ' seconds. Hard limit: ' + Math.round(targetDurationSeconds * 2.3) + ' spoken words. Count them. Bracketed camera directions do not count.',
    filmingEnabled ? 'Include scene hints or visual cues in brackets [Visual: ...] where helpful.' : 'Do not include filming instructions or camera directions in the spoken script text.',
    'Return ONLY the words of the video, ready to film. No preamble, no note to the creator, no title, no headings, no labels like "Script:", no markdown, no --- separators.'
  ].filter(Boolean).join('\n\n');
}
