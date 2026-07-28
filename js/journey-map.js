(function(global) {
  'use strict';

  const QUESTIONS = {
    1: [
      'Why do I want to start sharing my story now, who do I hope sees it, and what has kept me from starting sooner?',
      'What did my everyday life look like before this, and what unexpected detail from that time would help someone understand me?',
      'What is one thing I used to think was true that is not, and what happened that made me finally question it?',
      'After that realization, what did I try, what small sign showed I might be changing, and what still felt difficult?',
      'What is the absolute worst thing that has happened to me that connects to this story, how was it my fault, and what did it cost me?',
      'After everything that failure forced me to face, what bigger truth did I discover that changed how I live or what I do?',
      'Looking back at who I was before all this, who am I now, what am I still struggling with, and what do I hope someone like me recognizes in themselves?'
    ],
    2: [
      'What knowledge, experience, or perspective do I feel compelled to make visible now, who needs it, and what has kept me from speaking openly about it?',
      'How did I actually get into this work, what relatively boring and ordinary life was I living before, and why did treating this path as real expertise seem unreasonable?',
      'What is one thing I believe that most other people in my industry do not, and what experience made that belief impossible for me to ignore?',
      'Because I believe something others do not, what story shows how acting on that belief created struggle, resistance, doubt, or personal consequences?',
      'What is the absolute biggest failure I have experienced in my business or life that relates to this subject, how did my choices contribute, and what did it cost?',
      'I have already identified one belief that separates me from others, but what even more significant way of living or working do I follow that nearly everyone considers counterintuitive or contrary to common sense?',
      'After considering the previous six answers, what genuinely makes who I am now different from who I used to be and from others in my industry, and what unresolved flaws make me relatable to the people I want to help or support?'
    ]
  };

  const PURPOSE = {
    1: 'Each set should reveal an unusually compelling human journey through my ordinary life, changing beliefs, struggles, failure, contradictions, growth, and unresolved flaws.',
    2: 'Each set should reveal an unusually compelling human journey through my expertise, unconventional beliefs, struggles, failure, contradictions, growth, and unresolved flaws.'
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
    return `Using everything you already know about me, create three possible seven-part Hero's Journeys from my life.

Review all available context first, including our chat history, connected files, notes, previous writing, personal experiences, business history, failures, relationships, contradictions, and unusual memories. Do not ask me to repeat information you can already access.

PURPOSE

I need three short sets of answers that I can use as direction when completing a sequence of seven videos in a story-development app.

${PURPOSE[number]}

This is not a marketing exercise. Do not turn the journey into business advice, professional positioning, guru-porn, or a disguised sales pitch.

CREATIVE FREEDOM

You may make strong inferences, connect experiences I have never connected, combine related memories, compress timelines, and heighten the dramatic phrasing. Base events on information available about me, but be imaginative about what those events reveal and how they connect.

Create three genuinely different complete answer sets, not three alternatives for each individual question.

THE SEVEN QUESTIONS

${questions.map((question, index) => `${index + 1}. ${question}`).join('\n\n')}

ANSWER REQUIREMENTS

Every answer must:
- Be written in first person using I, me, and my.
- Be one direct sentence.
- Contain no more than 25 words.
- Answer the question rather than suggest a topic.
- Use specific beliefs, experiences, choices, consequences, and flaws.
- Connect with the other six answers as one recognizable journey.
- Sound like a private planning answer rather than polished content.

Do not:
- Write "I could tell the story of" or suggest what I might discuss.
- Write hooks, scripts, scenes, metaphors, CTAs, or presentation ideas.
- Turn every answer into a lesson.
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

If a set fails these checks, rebuild it before showing it.

OUTPUT FORMAT

ANSWER SET 1: [Short descriptive name]

1. [Direct first-person answer.]
2. [Direct first-person answer.]
3. [Direct first-person answer.]
4. [Direct first-person answer.]
5. [Direct first-person answer.]
6. [Direct first-person answer.]
7. [Direct first-person answer.]

Repeat the same format for Answer Sets 2 and 3.

FINAL CHECK

Ranking: [Strongest to weakest.]
Strongest: [One short sentence explaining why.]
Weakest connection:
- Set 1: [One short sentence.]
- Set 2: [One short sentence.]
- Set 3: [One short sentence.]
Sales-pitch warning: [Identify any set that feels promotional, or write "None."]

${sourceContext ? `CONTEXT I HAVE ALREADY PROVIDED TO SEENINSEVEN\n\n${sourceContext}` : ''}`.trim();
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
    normalizeMap,
    isUsableAnswer,
    buildHelperPrompt,
    formatJourney,
    copyText
  };
})(window);
