(function(global) {
  'use strict';

  const QUESTIONS = {
    1: [
      'What have I overcome, who am I now, and what transformation led me here?',
      'Before those events, what did my life look like and what did I have in common with someone who has not had this transformation yet?',
      'Before the main event, what did I incorrectly believe, and what do people still believe that I now know is not true?',
      'Once that belief changed, what did I do differently and what new thing opened up in my life?',
      'What is the absolute worst thing that has happened to me that connects to this story, how was it my fault, and what did it cost me?',
      'After everything that failure forced me to face, what bigger truth did I discover that changed how I live or what I do?',
      'Looking back at who I was before all this, who am I now, what am I still struggling with, and what do I hope someone like me recognizes in themselves?'
    ],
    2: [
      'What needs to be said from my experience, and who needs to hear it?',
      'Where did this work or perspective actually start for me?',
      'What do I see differently from most people in my field, and what taught me that?',
      'What is the problem with people in my field who still believe this? What is it costing them, and what was it costing me?',
      'What is the absolute biggest failure I have experienced in my business or life that relates to this subject, how did my choices contribute, and what did it cost?',
      'What was the biggest lesson I learned from my biggest failure? What is the number one thing I would share to help others avoid that mistake?',
      'What makes me different, what human struggle am I still working through, and what am I working toward in the future?'
    ]
  };

  const PURPOSE = {
    1: 'Each set should reveal an unusually compelling human journey through my ordinary life, changing beliefs, struggles, failure, contradictions, growth, and unresolved flaws.',
    2: 'Each set should reveal an unusually compelling human journey through my expertise, unconventional beliefs, struggles, failure, contradictions, growth, and unresolved flaws.'
  };

  const EXPLANATIONS = {
    1: [
      'Start with the change at the center of your story. A rough answer is enough.',
      'Think about who you were before things changed. This helps another person see themselves in you.',
      'Name an old belief that no longer feels true. This gives your story a clear turning point.',
      'Describe what changed after that realization. Focus on one choice, action, or new possibility.',
      'Share the hard part honestly. You control how personal you want to be.',
      'Name the lesson the hard part gave you. This is the truth you can now share with someone else.',
      'Bring the story back to the present. You can be proud of your growth and still be unfinished.'
    ],
    2: [
      'Start with the idea or experience you feel called to share, and the person who may need it.',
      'Go back to where this work really started for you, before it looked like expertise.',
      'Name a belief in your field that your own experience taught you to question.',
      'Explain the real cost of that belief. A specific example is more useful than a perfect answer.',
      'Share the failure or hard lesson that changed how you work. You control how personal you want to be.',
      'Name the lesson you earned and what you wish another person knew sooner.',
      'Bring the story to today. Share what makes your view different and what you are still working toward.'
    ]
  };

  function normalizeMap(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      1: Array.from({ length: 7 }, (_, index) => String((source[1] || source['1'] || [])[index] || '')),
      2: Array.from({ length: 7 }, (_, index) => String((source[2] || source['2'] || [])[index] || ''))
    };
  }

  function isUsableAnswer(value) {
    const text = String(value || '').trim();
    return !!text && !/^i(?:'|’)m not sure yet[.!]?$/i.test(text);
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

  function buildHelperPrompt(level, overview, onboardingContext) {
    const number = Number(level) === 2 ? 2 : 1;
    const questions = QUESTIONS[number];
    const sourceContext = [
      String(overview || '').trim(),
      String(onboardingContext || '').trim()
    ].filter(Boolean).join('\n\n');
    return `You are helping me find the real story behind a connected seven-video series. This is private story discovery, not marketing copy.

Use only what I share in this conversation. Do not claim access to private accounts, files, notes, or chat history that I have not given you here.

First, review my context. Ask only the questions you genuinely need, with a maximum of five questions total.

Then say: "Here are three things you could talk about. Which one feels right?"

Give me three distinct core story seeds, each with:
- a short name
- the transformation or tension at its center
- why it could carry seven connected videos
- a sentence in language close to the way I speak

Do not write the full seven-part map yet. Let me choose one, combine them, or explain what feels wrong. Once I choose, ask up to three selection-specific questions only if necessary.

After I answer, create the finished map in exactly this format so I can paste it into SeenInSeven:

1. [one or two first-person sentences]
2. [one or two first-person sentences]
3. [one or two first-person sentences]
4. [one or two first-person sentences]
5. [one or two first-person sentences]
6. [one or two first-person sentences]
7. [one or two first-person sentences]

Keep my language patterns, vocabulary, rhythm, bluntness, humor, and emotional temperature. Make strong connections when warranted, but never invent concrete facts. Do not turn this into generic coaching, a sales pitch, a polished script, or a motivational speech.

LEVEL ${number} MAP QUESTIONS

${questions.map((question, index) => `${index + 1}. ${question}`).join('\n\n')}

${sourceContext ? `MY CURRENT CONTEXT\n\n${sourceContext}` : 'MY CURRENT CONTEXT\n\nI have not added much context yet. Start by asking what you need.'}`.trim();

    /* Legacy helper prompt retained below as historical reference.
    return `Using everything you already know about me, create three possible seven-part Hero's Journeys from my life.

Review all available context first, including our chat history, connected files, notes, previous writing, personal experiences, business history, failures, relationships, contradictions, and unusual memories. Do not ask me to repeat information you can already access.

PURPOSE

I need three short sets of answers that I can use as direction when completing a sequence of seven videos in a story-development app.

${PURPOSE[number]}

This is not a marketing exercise. Do not turn the journey into business advice, professional positioning, guru-porn, or a disguised sales pitch.

CREATIVE FREEDOM

You may make strong inferences, connect experiences I have never connected, combine related memories, compress timelines, and heighten the dramatic phrasing. Base events on information available about me, but be imaginative about what those events reveal and how they connect.

Create three genuinely different complete answer sets, not three alternatives for each individual question.

Each answer will later become the Current Story Direction for one video. The seven answers should create one coherent journey, but every individual answer must also make sense when copied into a separate conversation by itself.

Use the question to decide what belongs in each direction. Do not force every video into the same event-cause-lesson formula. Name important people, jobs, relationships, periods, choices, and events explicitly instead of relying on compressed references such as "that job," "what happened," or "it" when the reference carries the meaning.

Give each direction enough context to preserve the intended story without explaining a revelation, failure, recovery, or conclusion that belongs to a later video.

THE SEVEN QUESTIONS

${questions.map((question, index) => `${index + 1}. ${question}`).join('\n\n')}

ANSWER REQUIREMENTS

Every answer must:
- Be written in first person using I, me, and my.
- Use one or two direct sentences.
- Contain no more than 60 words.
- Answer the question rather than suggest a topic.
- Directly address every part of its question instead of answering one clause and ignoring the others.
- Use specific beliefs, experiences, choices, consequences, and flaws.
- Connect with the other six answers as one recognizable journey.
- Be understandable on its own without the other six answers.
- Make causal relationships explicit when they are necessary to understand why an event mattered.
- Sound like a private planning answer rather than polished content.

Do not:
- Write "I could tell the story of" or suggest what I might discuss.
- Write hooks, scripts, scenes, metaphors, CTAs, or presentation ideas.
- Turn every answer into a lesson.
- Preview the answer to a later question.
- Make me sound like an authority who always knew the answer.
- Force a product or service into the conclusion.
- Choose stories based on how effectively they could attract clients.
- End by explaining why people should work with me.

Before presenting each set, silently confirm:
- Answer 1 introduces what I am finally making visible.
- Answer 2 establishes my ordinary beginning and why I dismissed the path.
- Answer 3 contains a distinctive first belief earned through experience.
- Answer 4 shows the human struggle created by living according to that belief.
- Answer 5 contains a genuine fall rather than a minor inconvenience.
- Answer 6 introduces a second, more significant truth rather than repeating Answer 3.
- Answer 7 combines meaningful differentiation with unresolved humanity.
- The seven answers belong to the same journey rather than merely sharing a topic.
- Every answer identifies its own subject clearly enough to guide a later AI without requiring the other six answers.
- Every answer covers all parts of its question, including any requested person, reason, resistance, consequence, change, or unresolved flaw.

If a set fails these checks, rebuild it before showing it.

OUTPUT FORMAT

ANSWER SET 1: [Short descriptive name]

1. [Self-contained first-person direction.]
2. [Self-contained first-person direction.]
3. [Self-contained first-person direction.]
4. [Self-contained first-person direction.]
5. [Self-contained first-person direction.]
6. [Self-contained first-person direction.]
7. [Self-contained first-person direction.]

Repeat the same format for Answer Sets 2 and 3.

FINAL CHECK

Ranking: [Strongest to weakest.]
Strongest: [One short sentence explaining why.]
Weakest connection:
- Set 1: [One short sentence.]
- Set 2: [One short sentence.]
- Set 3: [One short sentence.]
Sales-pitch warning: [Identify any set that feels promotional, or write "None."]

${sourceContext ? `CONTEXT I HAVE ALREADY PROVIDED TO SEENINSEVEN\n\n${sourceContext}` : ''}`.trim(); */
  }

  function buildPartHelperPrompt(level, partIndex, onboardingContext, previousAnswers) {
    const number = Number(level) === 2 ? 2 : 1;
    const index = Math.max(0, Math.min(6, Number(partIndex) || 0));
    const prior = (previousAnswers || [])
      .map((answer, answerIndex) => String(answer || '').trim() ? `Part ${answerIndex + 1}: ${String(answer).trim()}` : '')
      .filter(Boolean)
      .join('\n');
    return `Help me answer one question about my own story. Use my language, vocabulary, rhythm, and emotional tone. Do not turn it into marketing copy or invent facts.

Ask no more than two short follow-up questions, and only if you truly need them. Then give me one first-person answer of one to three sentences that I can paste into SeenInSeven. Keep it natural, specific, and easy to say out loud.

CURRENT QUESTION
Part ${index + 1}: ${QUESTIONS[number][index]}

WHAT THIS QUESTION IS LOOKING FOR
${EXPLANATIONS[number][index]}

WHAT I HAVE ALREADY SHARED
${String(onboardingContext || '').trim() || 'I have not shared much yet.'}
${prior ? `\nEARLIER PARTS OF MY STORY\n${prior}` : ''}`.trim();
  }

  function parseImportedMap(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const matches = Array.from(text.matchAll(/(?:^|\n)\s*([1-7])\s*[.)\-:]\s*([\s\S]*?)(?=\n\s*[1-7]\s*[.)\-:]|$)/g));
    if (matches.length !== 7) return null;
    const answers = matches.map(match => String(match[2] || '').trim().replace(/\s+/g, ' ').slice(0, 600));
    return answers.every(Boolean) ? answers : null;
  }

  function formatJourney(level, answers) {
    const number = Number(level) === 2 ? 2 : 1;
    const values = Array.isArray(answers) ? answers : [];
    return `MY LEVEL ${number} SEVEN-PART JOURNEY\n\n` + QUESTIONS[number]
      .map((question, index) => `${index + 1}. ${question}\n${String(values[index] || "I'm not sure yet.").trim()}`)
      .join('\n\n');
  }

  global.SISJourneyMap = {
    QUESTIONS,
    EXPLANATIONS,
    normalizeMap,
    isUsableAnswer,
    buildHelperPrompt,
    buildPartHelperPrompt,
    parseImportedMap,
    formatJourney,
    copyText
  };
})(window);
