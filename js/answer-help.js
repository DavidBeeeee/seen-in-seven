(function(global) {
  'use strict';

  const ASSIGNMENTS = {
    1: [
      'Develop why sharing now matters, who the speaker hopes will see it, and the specific human reason they delayed. This is the declaration and emotional starting point, not the whole backstory or a transformation that has already happened.',
      'Develop the recognizable ordinary life the speaker was living, plus an unexpected detail, interest, contradiction, or obsession that makes them interesting rather than impressive. Stay inside that earlier life without explaining what the detail eventually became or taught them.',
      'Develop the first personal Epiphany: one idea the speaker genuinely thought was true, the lived evidence that stopped fitting it, the emerging new lens, and the human cost of the old one. Keep this first realization bounded rather than turning it into the larger truth reserved for Video 6.',
      'Develop the Road of Trials after the first realization: what the speaker changed, one recoverable pressure that tested it, the temptation to return to the old way, a limited sign of progress, and what remained difficult. This is not the catastrophic fall or a final victory.',
      'Develop one genuine ordeal: what was destroyed, ended, lost, or believed impossible to restore; how the speaker\'s choices contributed; what it concretely cost; and what attempted repair also failed. Remain at the lowest point without recovery, meaning, or comeback.',
      'Develop the larger truth earned through the Video 5 ordeal, the aftermath evidence that made it undeniable, one visible change in how the speaker now lives, and the person they recognize in their former position. It may connect to Video 3, but it must not merely repeat it.',
      'Develop the Return: who the speaker was before the two realizations, who they are now, what changed observably, what remains unresolved, what telling the story clarified, and what they are carrying forward. Keep the transformation human and unfinished rather than turning it into a pitch.'
    ],
    2: [
      'Develop what knowledge, experience, or perspective the speaker feels compelled to make visible, who needs it, and the exact reason they have stayed quiet. Create curiosity about a knowledgeable but still-human person without turning the answer into credentials, positioning, or a pitch.',
      'Develop the unpolished origin of the speaker\'s work, the ordinary life surrounding it, and why treating the recurring ability or path as legitimate expertise felt unreasonable. Preserve the earlier perspective and practical refusal without explaining its present-day value, method, or business meaning.',
      'Develop the first professional Epiphany: one accepted idea the speaker once believed, one concrete collision with evidence, the new lens that became impossible to ignore, and the real cost of the old idea. A person or influence may appear naturally, but no mentor is required.',
      'Develop one Road of Trials story about acting on the first Epiphany before proof existed. Gather the old way that still appeared more rewarding, the recoverable pressure, the choice made under uncertainty, and one meaningful but limited result that created hope rather than professional proof.',
      'Develop one apparently irreversible collapse related to the speaker\'s larger work or life: what seemed permanently lost, how their choices contributed, the concrete cost, the attempted repair that also failed, and the lowest-point belief. Do not add recovery, diagnosis, or the Video 6 truth.',
      'Develop the speaker\'s more significant counterintuitive way of living or working, the lived evidence that made it undeniable, what they visibly do differently, and who they recognize as still following the common-sense path. It may arise from any experience and is not required to connect to Videos 3 or 5.',
      'Develop the Return: how the speaker once related to their expertise, who they are now, what changed observably, what remains unfinished, what telling the story clarified, and why the right person would remain connected. Build earned relationship rather than a polished authority claim or offer.'
    ]
  };

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function formatQuestions(questions) {
    const values = Array.isArray(questions) ? questions : [];
    return values.map((item, index) => {
      const parts = [
        `QUESTION ${index + 1}: ${clean(item.label)}`,
        clean(item.hint) ? `GUIDANCE: ${clean(item.hint)}` : '',
        `CURRENT ANSWER: ${clean(item.value) || '(blank)'}`
      ].filter(Boolean);
      return parts.join('\n');
    }).join('\n\n');
  }

  function formatPreviousScripts(scripts) {
    const values = Array.isArray(scripts) ? scripts : [];
    if (!values.length) return '(No earlier scripts exist yet.)';
    return values.map(item => [
      `VIDEO ${item.video} ${item.locked ? '(LOCKED)' : '(LATEST SAVED VERSION)'}`,
      clean(item.script)
    ].join('\n')).join('\n\n');
  }

  function finalFormat(mode, questions) {
    const count = Array.isArray(questions) ? questions.length : 0;
    if (mode === 'simple' && count === 1) {
      return `After the user chooses a direction, return only one first-person journal answer of roughly 150 to 250 words. It must answer the current question directly, sound raw and conversational, and be ready to paste into the single Simple answer box. Do not add a heading, explanation, disclaimer, or alternatives.`;
    }
    return `After the user chooses a direction, repeat each current question exactly as written and place one separate first-person answer beneath it. Each answer must be specific, conversational, and ready to paste into its matching box. Give each question a different job, scene, or piece of evidence. Do not repeat the same event or conclusion across the answers. Do not add a preamble, disclaimer, critique, or script.`;
  }

  function buildPrompt(config) {
    const level = Number(config && config.level) === 2 ? 2 : 1;
    const videoIndex = Math.max(0, Math.min(6, Number(config && config.videoIndex) || 0));
    const videoNumber = videoIndex + 1;
    const mode = config && config.mode === 'extended' ? 'extended' : 'simple';
    const questions = Array.isArray(config && config.questions) ? config.questions : [];
    const assignment = ASSIGNMENTS[level][videoIndex];
    const onboarding = clean(config && config.onboardingContext) || '(No onboarding details were provided.)';
    const background = clean(config && config.overview) || '(No additional long-form background was provided.)';
    const direction = clean(config && config.journeyDirection) || '(No Current Story Direction was saved.)';
    const prior = formatPreviousScripts(config && config.previousScripts);

    return `I am completing Level ${level}, Video ${videoNumber} in SeenInSeven. Help me produce better raw journal answers for the current app questions.

CURRENT VIDEO JOB

${assignment}

STORY RULE

The Current Story Direction selects the story being developed. Use the Current Video Job to decide which parts of that story need deeper answers. Preserve the central period, events, relationships, conflict, and explicit meaning already present in the direction.

Use Onboarding Context to resolve references and recover relevant facts. Use Earlier Scripts to preserve continuity and avoid repeating discoveries that have already been made. These sources may deepen the selected story, but they may not replace it with a different memory merely because that memory is more dramatic or easier to explain.

Stay inside what the speaker could know during this chapter. Do not import a later revelation, failure, recovery, mature interpretation, or another video's emotional job.

When information is thin, infer plausible motives, scenes, reactions, consequences, and connective details inside the selected story. Offer possibilities the user can correct instead of retreating into vague language. Preserve specific, strange, harsh, funny, embarrassing, or uncomfortable material when it makes the answer human.

This is journal-answer development, not scriptwriting. Do not write a hook, open loop, conclusion, CTA, finished video, content strategy, or sales message. Do not mention SeenInSeven story architecture, stage names, or the Current Video Job in the options or final answers.

INTERACTIVE PROCESS

Your first reply must contain exactly three concise answer approaches labeled OPTION 1, OPTION 2, and OPTION 3.

Each option must:
- Develop the same Current Story Direction according to the Current Video Job.
- Emphasize a different scene, detail, relationship, piece of evidence, or emotional tension inside that story.
- Explain what the approach would help uncover.
- Preserve the speaker's perspective at this chapter of the journey.
- Use no more than two short sentences.
- Be meaningfully different from the other two.
- Avoid drafting the final answer.

After the three options, write one short line telling me I can reply with 1, 2, 3, mix parts, say "choose for me," or ask for "three more."

If I ask for three more, find three new approaches inside the same Current Story Direction. Do not move to a different life chapter.

If I choose an option, mix options, or say "choose for me," stop offering choices and write the final paste-ready answer.

FINAL OUTPUT CONTRACT

${finalFormat(mode, questions)}

The final answer must use "I," "me," and "my" as appropriate. Do not explain which details were inferred or invented. Do not append notes, warnings, verification requests, or alternate versions.

SOURCE MATERIAL

1. ONBOARDING CONTEXT

${onboarding}

LONG-FORM BACKGROUND PROVIDED DURING ONBOARDING

${background}

2. EARLIER SCRIPTS

${prior}

3. CURRENT STORY DIRECTION

${direction}

4. CURRENT ${mode.toUpperCase()} QUESTIONS AND ANSWERS

${formatQuestions(questions)}

FINAL INSTRUCTION

Using the Source Material above, produce exactly three concise approaches that develop the Current Story Direction according to the Current Video Job.`.trim();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  global.SISAnswerHelp = {
    ASSIGNMENTS,
    buildPrompt,
    copyText
  };
})(window);
