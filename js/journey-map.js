(function(global) {
  'use strict';

  const QUESTIONS = {
    1: [
      'What am I finally ready to be seen for, who am I doing this for, and what has kept me quiet until now?',
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
      'What did I used to believe about this work that I no longer believe, and what moment or pattern showed me it was wrong?',
      'When I first acted on that new view before I had proof, what did I actually do, what made going back to the old way tempting, and what happened?',
      'What is the absolute biggest failure I have experienced in my business or life that relates to this subject, how did my choices contribute, and what did it cost?',
      'What do I do now that most people would call wrong or backwards, what showed me it works, and where can someone see me doing it?',
      'What makes me different, what human struggle am I still working through, and what am I working toward in the future?'
    ]
  };

  const PURPOSE = {
    1: 'Each set should reveal an unusually compelling human journey through my ordinary life, changing beliefs, struggles, failure, contradictions, growth, and unresolved flaws.',
    2: 'Each set should reveal an unusually compelling human journey through my expertise, unconventional beliefs, struggles, failure, contradictions, growth, and unresolved flaws.'
  };

  const EXPLANATIONS = {
    1: [
      'Say what you are ready to stop hiding and what has been holding you back. Save the rest of the story for later parts. A rough answer is enough.',
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
      'Name something you once believed yourself, then the moment that stopped making sense. This is your realization, not a complaint about other people.',
      'Pick one real situation where you tried something new before you knew it would work. A small result is enough.',
      'Share the failure that hit hardest. Stop before what it taught you. You control how personal you want to be.',
      'Name something you do that most people would disagree with, and the real experience behind it. This should be new, not Part 3 again.',
      'Bring the story to today. Share what makes your view different and what you are still working toward.'
    ]
  };

  // What each map part must carry so its video's chapter has its own story to
  // tell. Mirrors the chapter jobs in api/generate.js EPISODE_STAGE_SCHEMAS.
  const PART_JOBS = {
    1: [
      'The decision: what I am finally ready to be seen for, who it is for, and the specific thing that has kept me quiet. It is happening now. Leave out my history, my realizations, my failure, and how this turns out.',
      'The ordinary life: a period, place, or routine from before things changed, what made it feel normal, and one thing I did or avoided that kept it that way. Answer from who I was then, with no wisdom from later.',
      'The first realization: one thing I personally believed and acted on, then one specific moment or pattern that it could not explain. It must be my own old belief, not a complaint about other people.',
      'The test: one situation where I first lived by that new understanding, the moment the old way looked easier, what I chose, and the partial win or confidence it gave me. Things can still be recovered here. Stop before the fall.',
      'The fall: one failure, loss, or collapse. What I had that mattered, the part that was my fault even if other people played a part, what it cost, and what I believed was over. Leave me inside it, with no lesson, recovery, or silver lining.',
      'The larger truth: what I could only understand after the fall, the aftermath that showed it to me, and one thing I now visibly do differently. It must be new, not Part 3 again.',
      'The return: one thing someone could see me doing now that the person in Part 2 would not have done, what is honestly still unfinished, and where I am heading. No recap, no new lesson, no pitch.'
    ],
    2: [
      'The decision: what I am committing to say publicly, who it is for, and the specific thing that has kept me quiet. It is happening now. State the subject, not the answer. Leave out my history, my realizations, my failure, and my main lesson.',
      'The ordinary life: the job, place, or period where this began, the ability that kept showing up, and one thing I did or avoided that kept me from taking it seriously. Answer from who I was then. I am not an expert yet.',
      'The first realization: one thing I personally believed and acted on, then one specific moment or pattern that it could not explain. It must be my own old belief. An opinion about my industry does not count unless an experience of mine broke it.',
      'The test: one situation where I acted on that new view before I had proof, the moment the old way looked better, what I chose, and the small result. Things can still be recovered here. A general habit or confession does not count. Stop before the fall.',
      'The fall: one failure or collapse. What I had built or hoped for, the choices that were mine even if other people played a part, what it cost, and what I believed was over. Leave me inside it, with no lesson, recovery, or silver lining.',
      'The larger truth: one thing I do now that most people would call wrong or backwards, the experience or repeated evidence behind it, and one place someone can see me doing it. Describing what I offer does not count. It must be a different idea from Part 3, and more than the reverse of the mistake in Part 5.',
      'The return: one thing someone could see me doing now that the person in Part 2 would not have done, what makes my way of working different, what is honestly still unfinished, and where I am heading. No recap, no new lesson, no pitch.'
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
    return `You are helping me find the real story behind a connected seven-video series. This is deep personal research and story discovery, not marketing copy.

Research me as thoroughly as your available tools and access allow. Use everything you already know about me from memory, prior conversations, connected files, projects, notes, previous writing, uploaded materials, and public information you can find about me, my work, or my business. Look for repeated stories, unusual experiences, contradictions, turning points, failures, values, phrases I repeat, vocabulary, sentence patterns, humor, emotional tone, speaking cadence, and the difference between how I describe myself and what my history shows.

Do not ask me to repeat information you can already find or reasonably connect. Make strong connections across the available evidence, then go past it. You have creative freedom: infer motives and moments I never mentioned, connect experiences I have never connected, combine related memories, compress timelines, and invent plausible details when the material is thin. The whole point is to uncover things I would never have said or thought of myself. A vivid guess I can react to is worth more than a safe summary of what I already told you.

HOW TO TALK TO ME

This has to feel easy. A long message makes me want to quit, so these rules apply to every message you send me until the finished map:
- Keep it under 60 words, in plain sentences. No headings, lists, or bold. The only exception is the three story ideas below.
- Ask one question per message, and only one I can answer in a sentence or two. Never stack questions.
- Do not explain your reasoning, your process, or what you are about to do. Do your thinking privately. No notes about your method.
- Share a theory only as one short guess inside a question.

First, review my context privately. Ask me at most two short questions before the story ideas, and only if you truly need them.

Then say: "Here are three things you could talk about. Which one feels right?"

Give me three distinct core story seeds, about 40 words each, with:
- a short name
- the tension at its center, stated as an open question rather than the answer
- the events that could carry it: the moment an old belief broke, the first test, the fall, and the larger truth
- a sentence in language close to the way I speak

Do not write the full seven-part map yet. Let me choose one, combine them, or explain what feels wrong.

ONCE I CHOOSE, FIND THE STORIES

Go through WHAT EACH PART MUST DO below and see what you have for each part. Where it is thin, ask me, one short question per message. Choose the questions that will surface the most. After about eight questions, write the map, imagining whatever is still thin. If I say "write it" at any point, write it right away. Do not wait until you feel certain. I can correct the map, and you can ask me more after I see it.
- Start with the parts that are hardest to find: the test, the fall, and the larger truth.
- Ask what happened, not what I learned: where I was, who was there, what I did, what I said, what happened next, and what it cost.
- Use plain everyday words, like a curious friend. Do not use story terms or the part names.
- Short, messy answers are fine. I talk, and you do the organizing. When an answer is thin, ask about that one moment before moving on.
- Do not only ask. Turn a suspicion into one short guess I can answer with yes, no, or not quite, including things I have never said. Being wrong in an interesting way often gets me to the true thing.
- If I do not remember something or do not want to share it, do not stop and do not go generic. Imagine the most compelling plausible version and keep going.

THE MOST IMPORTANT RULE

The map is seven different stories, not one idea explained seven ways. Each part is the private story base for its own short video, and a stranger may see that video first. So:
- Each part has its own subject: a different event, period, person, or decision. One thread connects them, but every part takes the story somewhere new.
- Start from what happened. Apart from Part 1, which is a decision being made now, each part needs something that happens or something I visibly do, whether you found it or imagined it. A present-tense opinion or reflection about myself cannot carry a part.
- Do not state the main lesson early and then repeat it. Each part knows only what I knew at that point in the story. The biggest truth does not appear until Part 6.
- Each part must make sense on its own. Name the job, person, project, or period instead of saying "that job" or "what happened."
- No part describes a product, program, service, or resume. If I built something, tell what happened while I was building it.

WHAT EACH PART MUST DO

${PART_JOBS[number].map((job, index) => `${index + 1}. ${job}`).join('\n\n')}

Before you show me the map, check every part privately. Do not show me this check.
- Name its subject in one short sentence. If two parts have the same subject or the same point, rebuild one of them using a different event.
- It holds one event. If it lists several, keep the one that fits its job best and leave the others out.
- A stranger could picture it: a place or period, a person or project, and what happened in order. If it reads like a summary or a description of my work, it is not finished.
- It contains every piece its job asks for. If a piece is missing, ask me or imagine it.

Never leave a part thin. Do not explain which details you inferred or invented. I will read the map and change anything that does not feel right.

After I answer, give me the finished map inside one plain-text code block so I can copy it with the copy button and paste it straight into SeenInSeven. These are private story notes for a later writer, not narration, so say plainly what happened, in the order it happened, with the names and details that make it real. Write each part as one full paragraph. Use as much space as each part needs to hold everything its job asks for, usually 100 to 200 words. Never compress a story into a summary to make it shorter. The block must contain exactly seven lines and nothing else:

\`\`\`
1. [the full story of this part, in first person, as one paragraph]
2. [the full story of this part, in first person, as one paragraph]
3. [the full story of this part, in first person, as one paragraph]
4. [the full story of this part, in first person, as one paragraph]
5. [the full story of this part, in first person, as one paragraph]
6. [the full story of this part, in first person, as one paragraph]
7. [the full story of this part, in first person, as one paragraph]
\`\`\`

Format rules for that block, because the SeenInSeven box reads it by its numbers:
- Each line starts with its number and a period (1. through 7.), then the whole paragraph on the same line.
- No titles, part names, headings, bold, italics, bullets or emoji, and no extra line breaks inside a part.
- No other line inside the block starts with a number.
- Nothing before 1. or after 7. inside the block. Put any note to me outside the block.

Keep my language patterns, vocabulary, rhythm, bluntness, humor, and emotional temperature, but let the events carry each part rather than the phrasing. Do not turn this into generic coaching, a sales pitch, a polished script, or a motivational speech.

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
    return `Help me answer one question about my own story. Research and use everything you already know about me from memory, prior conversations, connected files, projects, notes, previous writing, uploaded materials, and public information available to you. Do not make me repeat information you can already find.

Match my actual language patterns, favorite words, sentence length, speaking cadence, rhythm, bluntness, humor, emotional tone, and the way I naturally tell stories. The answer should sound spoken by me, not polished by a copywriter. Do not turn it into marketing copy.

Ask me what you need to know, one short question per message and at most three in all, about what happened: where I was, who was there, what I did, and what it led to. Then give me one first-person paragraph that I can paste into SeenInSeven. Use as much space as it takes to hold everything this part must do, usually 100 to 200 words, and never compress it into a summary. Keep it natural and specific. Go past what I tell you: infer, connect, and invent plausible details when the material is thin, and do not explain what you invented. Make sure it stands on its own for a stranger.

This part is the story base for one separate video in a seven-part series. It needs its own subject. Do not repeat the point of an earlier part, and do not give away a later part.

CURRENT QUESTION
Part ${index + 1}: ${QUESTIONS[number][index]}

WHAT THIS PART MUST DO
${PART_JOBS[number][index]}

WHAT I HAVE ALREADY SHARED
${String(onboardingContext || '').trim() || 'I have not shared much yet.'}
${prior ? `\nEARLIER PARTS OF MY STORY\n${prior}` : ''}`.trim();
  }

  // A pasted map is read in order, 1 through 7. A heading line can be plain
  // ("1. ..."), bold ("**1. Title**", "**Part 1: Title**"), a markdown heading
  // or list item, or start with Part, Step, Answer, Chapter, Video, Stage or Act,
  // with any of . ) : - and the en or em dash. Only the next expected number
  // starts a part, so "3: that year" inside Part 5 stays in Part 5. A bare
  // "1 Text" with no punctuation is tried only if nothing else finds seven.
  const IMPORT_HEADING = /^[ \t]*(?:[#>]+[ \t]*|[-*+][ \t]+)*(?:\*\*|__)?[ \t]*(?:(?:part|step|answer|chapter|video|stage|act)[ \t]+)?([1-7])[ \t]*(?:\*\*|__)?[ \t]*(?:[.):\-\u2013\u2014](?!\d)[ \t]*(?:\*\*|__)?|(?=\n|$))/gim;
  const IMPORT_HEADING_LOOSE = /^[ \t]*(?:[#>]+[ \t]*|[-*+][ \t]+)*(?:\*\*|__)?[ \t]*(?:(?:part|step|answer|chapter|video|stage|act)[ \t]+)?([1-7])[ \t]*(?:\*\*|__)?[ \t]*(?:[.):\-\u2013\u2014](?!\d)[ \t]*(?:\*\*|__)?|[ \t]+(?=\S)|(?=\n|$))/gim;

  function readImportedParts(text, heading) {
    const marks = Array.from(text.matchAll(heading));
    const picked = [];
    let next = 1;
    for (const mark of marks) {
      if (Number(mark[1]) !== next) continue;
      picked.push(mark);
      next += 1;
      if (next > 7) break;
    }
    return picked.map((mark, index) => {
      const from = mark.index + mark[0].length;
      const to = index + 1 < picked.length ? picked[index + 1].index : text.length;
      const answer = text.slice(from, to)
        .replace(/\*\*|__/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000);
      return { number: Number(mark[1]), answer };
    });
  }

  function parseImportedMapDetail(value) {
    // Copying from a chat app can escape markdown, so "1." arrives as "1\.".
    const text = String(value || '')
      .replace(/\r/g, '')
      .replace(/\\([.)\-:*_#>~`])/g, '$1')
      .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, '')
      .trim();
    if (!text) return { answers: null, found: [], empty: [], blank: true };
    let parts = readImportedParts(text, IMPORT_HEADING);
    if (parts.length < 7) {
      const loose = readImportedParts(text, IMPORT_HEADING_LOOSE);
      if (loose.length > parts.length) parts = loose;
    }
    const found = parts.map(part => part.number);
    const empty = parts.filter(part => !part.answer).map(part => part.number);
    const answers = parts.length === 7 && !empty.length ? parts.map(part => part.answer) : null;
    return { answers, found, empty, blank: false };
  }

  function parseImportedMap(value) {
    return parseImportedMapDetail(value).answers;
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
    parseImportedMapDetail,
    formatJourney,
    copyText
  };
})(window);
