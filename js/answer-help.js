(function(global) {
  'use strict';

  const ASSIGNMENTS = {
    1: [
      'Help the user explain why sharing now matters, who they hope reaches it, and the precise human reason they delayed. Gather the emotional starting point without telling their whole backstory or resolving the journey.',
      'Help the user describe the ordinary life they were living, plus an unexpected detail, interest, contradiction, or obsession that makes them recognizable. Keep them human and inside that earlier life. Do not explain what the detail later became or what it taught them.',
      'Help the user identify one idea they genuinely thought was true and the lived experience that made it stop fitting. Gather the old assumption, the contradiction, and the first realization without jumping to a complete life philosophy.',
      'Help the user describe what they tried after the first realization, the friction they met, one small sign of change, and what still felt difficult. This is progress under pressure, not the worst failure and not a final victory.',
      'Help the user enter the worst connected failure, including what happened, what they did or refused to do, the concrete cost, and the repair attempt that also failed. Stay inside the loss. Do not find the lesson, recovery, or comeback.',
      'Help the user uncover the larger truth they could only recognize after the failure, the evidence that made it undeniable, and a visible change in how they now live or act. This truth should be deeper than the first realization rather than a restatement of it.',
      'Help the user compare who they were at the beginning with who they are now, name what remains unresolved, and identify what a similar person might recognize in them. Avoid a perfect transformation, a summary of seven videos, or a disguised offer.'
    ],
    2: [
      'Help the user explain what knowledge, experience, or perspective they feel compelled to make visible, who needs it, and the exact reason they have stayed quiet. Create curiosity about the person without turning the answer into credentials, positioning, or a pitch.',
      'Help the user tell the unpolished origin of their work, the ordinary life around it, and why treating the recurring ability or path as real expertise seemed unreasonable. Keep them inside their earlier perspective. Do not explain the present-day meaning, method, or business philosophy.',
      'Help the user identify one accepted idea in their field that they now reject and the lived evidence that made the contradiction impossible to ignore. Gather a clear old assumption, a concrete collision with reality, and the new belief. An influence or mentor may appear naturally, but is never required.',
      'Help the user find one story about acting on their unusual belief before they knew whether it would work. Gather the temptation to return to the familiar choice, the decision made without proof, and one meaningful but limited result. Do not turn this into a major collapse, polished success story, or final method.',
      'Help the user enter the largest related failure in their business or life, including the apparently irreversible loss, their own choices or avoidance, the concrete cost, and the attempted repair that also failed. Stay at the lowest point without adding meaning, recovery, or the truth they discovered later.',
      'Help the user uncover a significant counterintuitive way they now live or work, the experience or repeated evidence that made it undeniable, and what they visibly do differently. It may connect to an earlier chapter, the failure, or a completely separate experience. Do not require any connection or repeat the first unusual belief.',
      'Help the user name what genuinely distinguishes who they are now from who they were and from others in their field, while preserving the unresolved flaws that make them recognizable. Gather an honest continuing direction and relationship with the right people, not a polished authority claim or offer.'
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
    const overview = clean(config && config.overview) || '(No additional Overview notes were provided.)';
    const direction = clean(config && config.journeyDirection) || '(No one-sentence direction was saved. Select a story from the Overview that fits the current assignment and questions.)';
    const prior = formatPreviousScripts(config && config.previousScripts);

    return `I am completing Level ${level}, Video ${videoNumber} in SeenInSeven. Help me produce better raw journal answers for the current app questions.

NON-NEGOTIABLE SOURCE ORDER

1. CURRENT STORY DIRECTION selects the story being developed for this video.
2. OVERVIEW NOTES are the primary source used to expand that selected story.
3. CURRENT QUESTIONS determine which parts of the selected story need deeper answers.
4. CURRENT ANSWERS are evidence, corrections, and starting material.
5. EARLIER SCRIPTS preserve continuity and show which revelations or language have already been used.
6. ONBOARDING CONTEXT supports voice, audience, and motivation.

When a saved Current Story Direction appears below, it is a binding scope, not background context or an optional suggestion. Keep its central period, event, relationships, and conflict. Use the Overview to expand that story. Do not replace it with another event from my life, even if another event seems more dramatic.

If the Current Story Direction explicitly says that no direction was saved, use the Overview to offer three candidate stories that fit the current assignment and questions. Once I choose one, remain inside that story.

CURRENT STORY DIRECTION

${direction}

WHAT THIS ANSWER NEEDS TO DO

${assignment}

This is source-material development, not scriptwriting. Do not write a hook, open loop, conclusion, CTA, finished video, content strategy, lesson outline, or sales message. Do not mention story architecture, stage names, challenge architecture, or marketing frameworks.

CURRENT ${mode.toUpperCase()} QUESTIONS

${formatQuestions(questions)}

OVERVIEW NOTES: PRIMARY STORY SOURCE

${overview}

ESTABLISHED EARLIER SCRIPTS: CONTINUITY RECORD

${prior}

ONBOARDING CONTEXT

${onboarding}

CONTEXT RESET

Treat everything before this message as a research archive, not an active assignment. Previously suggested but rejected story ideas are unavailable unless I explicitly revive them after this message. Old conversation momentum cannot override the Current Story Direction.

You may recover facts, language, memories, and emotional context from earlier conversations only when they deepen the selected story. Do not use the archive to switch to a different story.

CREATIVE FREEDOM

Use the Overview and other available context to make the selected story richer. You may infer motives, combine related memories, compress details within the selected period, merge related people or moments, and invent plausible connective scenes or consequences when the source material is thin. Creative freedom fills gaps inside the selected story. It does not authorize changing the selected story.

Do not moralize, soften difficult material, sanitize offensive or uncomfortable details, or replace a rough human truth with therapy language, corporate language, or generic inspiration. Do not retreat into vague phrases when a concrete event, choice, object, place, consequence, or line of dialogue would make the answer stronger.

CONTINUITY AND VARIETY

- Reusing an established setting, job, relationship, event, or life fact is allowed when the seven-video story requires continuity.
- Repetition means copying an earlier video's narrative purpose, emotional revelation, conclusion, dominant scene construction, signature language, or primary metaphor.
- Deepen the current answers instead of merely rewriting them. Search deeper inside the assigned story for concrete detail, conflict, motive, and consequence.
- When a saved direction exists, all three options must stay inside that same story and time window. Vary the focal scene, evidence, emotional tension, relationship, or detail being emphasized.
- The options cannot replace the selected story with different events from my life.
- Do not make all three options point toward the same interpretation or use the same evidence.
- Never pull from future SeenInSeven questions or invent the later chapters of this seven-part sequence.

INTERACTIVE PROCESS

Your first reply must contain exactly three concise answer approaches labeled OPTION 1, OPTION 2, and OPTION 3.

Each option must:
- Develop the Current Story Direction rather than proposing a replacement story.
- Name the focal scene, detail, evidence, relationship, or tension it would emphasize.
- State the human tension that makes it useful for the current question.
- Use no more than two short sentences.
- Be meaningfully different from the other two.
- Avoid drafting the final answer.

After the three options, write one short line telling me I can reply with 1, 2, 3, mix parts, say "choose for me," or ask for "three more."

If I ask for three more, every approach shown so far becomes unavailable. Find three new focal scenes, details, tensions, or interpretations inside the same Current Story Direction. Do not move to a different life chapter unless no direction was saved.

If I choose an option, mix options, or say "choose for me," stop offering choices and write the final paste-ready answer.

FINAL OUTPUT CONTRACT

${finalFormat(mode, questions)}

The final answer must use "I," "me," and "my" as appropriate. Preserve specific, strange, harsh, funny, embarrassing, or unpolished details when they make the answer feel human. Do not explain which details were inferred or invented. Do not append notes, warnings, verification requests, or alternate versions.`.trim();
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
