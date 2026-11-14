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
      'The ordinary life: the actual period, place, or routine I was living before things changed, told from who I was then, with no wisdom from later. What made it feel normal, one thing about me people would not expect, what I kept noticing or caring about even then, and one thing I did or avoided that kept my life the way it was.',
      'The first realization: one thing I personally believed and acted on, then one specific moment or pattern that it could not explain. It must be my own old belief, not a complaint about other people.',
      'The test: one specific day or conversation, not how things usually went, where I first lived by that new understanding, the moment the old way looked easier, what I chose, and the partial win or confidence it gave me. Things can still be recovered here. Stop before the fall.',
      'The fall: one failure, loss, or collapse. What I had that mattered, the part that was my fault even if other people played a part, what it cost in plain terms that cannot be taken back, the moment it hit me hardest, and what I believed was over. Leave me inside it, with no lesson, recovery, way back, or silver lining.',
      'The larger truth: what I could only understand after the fall, the aftermath that showed it to me, and one thing I now visibly do differently. It must be new, not Part 3 again.',
      'The return: the elixir I come back with, something I can now give a person who is where I started, and one thing someone could see me doing now that the person in Part 2 would not have done, what is honestly still unfinished, and where I am heading. No recap, no new lesson, no pitch.'
    ],
    2: [
      'The decision: what I am committing to say publicly, who it is for, and the specific thing that has kept me quiet. It is happening now. State the subject, not the answer. Leave out my history, my realizations, my failure, and my main lesson.',
      'The ordinary life: the actual job, routine, or period I was living before any of this, told from who I was then. I am not an expert yet, and there is no wisdom from later. Cover how I ended up knowing what I know, one concrete detail from that life a resume would never show, the ability that kept showing up without me taking it seriously, and what made me dismiss it or assume it could never be real work, shown through something I did or avoided. A viewer should recognize their own life in it before they admire mine.',
      'The first realization: one thing I personally believed and acted on, then one specific moment or pattern that it could not explain. It must be my own old belief. An opinion about my industry does not count unless an experience of mine broke it.',
      'The test: one specific day or conversation, not how things usually went, where I acted on that new view before I had proof, the moment the old way looked better, what I chose, and the small result. Things can still be recovered here. A general habit or confession does not count. Stop before the fall.',
      'The fall: one failure or collapse. What I had built or hoped for, the choices that were mine even if other people played a part, what it cost in plain terms that cannot be taken back, the moment it hit me hardest, and what I believed was over. Leave me inside it, with no lesson, recovery, way back, or silver lining.',
      'The larger truth: it must answer the fall in Part 5. One thing the fall made me see or do, that I do now and most people would call wrong or backwards, the experience or repeated evidence behind it, and one place someone can see me doing it. Describing what I offer does not count, a realization about myself does not count, and a second failure does not count. A sensible person should be able to argue with it. Open the part with what I do, in the present tense, not with the moment I realized it, and say plainly what most people would tell me I am doing wrong. Then tell one specific time it happened: who was there, what I did, and what came of it, so a viewer can picture it. It must be a different idea from Part 3, and more than the reverse of the mistake in Part 5.',
      'The return: the elixir I come back with, something I can now give a person who is where I started, and one thing someone could see me doing now that the person in Part 2 would not have done, what makes my way of working different, what is honestly still unfinished, and where I am heading. No recap, no new lesson, no pitch.'
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

  // WBR-472, 2026-11-13. The member's AI researches them and designs one journey, then
  // answers the app's own per-video questions as scenes. It does not write the videos.
  // partQuestions is the app's question list for Parts 2 through 7 (label and hint), so
  // the AI answers exactly what the blueprint routes. Finished paragraphs were being
  // retyped into scripts; scene notes let the blueprint do the writing.
  const PART_NAMES = ['The decision', 'The ordinary life', 'The first realization', 'The test', 'The fall', 'The larger truth', 'The return'];

  function helperQuestionBlock(number, partQuestions) {
    const supplied = Array.isArray(partQuestions) && partQuestions.length === 6 ? partQuestions : null;
    return PART_NAMES.slice(1).map((name, offset) => {
      const part = offset + 2;
      const list = supplied && supplied[offset] && supplied[offset].length
        ? supplied[offset]
        : [{ label: QUESTIONS[number][offset + 1], hint: '' }];
      return 'PART ' + part + ': ' + name.toUpperCase() + '\n' + list.map((question, index) =>
        (index + 1) + '. ' + String(question.label || '').replace(/\s*___\s*$/, '').trim() +
        (question.hint ? '\n   (' + String(question.hint).trim() + ')' : '')
      ).join('\n');
    }).join('\n\n');
  }

  function buildHelperPrompt(level, overview, onboardingContext, partQuestions) {
    const number = Number(level) === 2 ? 2 : 1;
    const sourceContext = [
      String(overview || '').trim(),
      String(onboardingContext || '').trim()
    ].filter(Boolean).join('\n\n');
    return `You are helping me find the real story behind a connected seven-video series. This is deep personal research and story discovery, not marketing copy.

Research me as thoroughly as your available tools and access allow. Use everything you already know about me from memory, prior conversations, connected files, projects, notes, previous writing, uploaded materials, and public information you can find about me, my work, or my business. Look for repeated stories, unusual experiences, contradictions, turning points, failures, values, phrases I repeat, vocabulary, sentence patterns, humor, emotional tone, speaking cadence, and the difference between how I describe myself and what my history shows.

Before you offer me anything, privately list at least 20 specific moments from across my whole life: single conversations, named people, odd side projects, small embarrassments, losses, things that happened once, and things I mentioned in passing. Reach back years, not weeks. If most of your list comes from our last few months of conversation, you have found what is recent, not what matters, so keep looking. The milestones I have already told everyone are the least interesting material on the list.

You are a storyteller here, not a fact-checker. What you know about me is the skeleton. The story is what you build on it. From how I talk, what I care about, and what I have done, work out what must have happened in the moments nobody recorded: who was in the room, what they said, what I did with my hands, what I almost said and did not. Nobody types those things into a chat, and they are exactly what I need from you. Infer them, imagine them, and write them as if you had been there. Connect experiences I have never connected, combine related memories, and compress timelines. You have creative freedom, and I am asking you to use it. A vivid scene I can correct is worth far more than a safe summary of what I already told you.

HOW TO TALK TO ME

Do the work yourself. Do not interview me, and do not explain your reasoning or your process. Keep your messages short and plain until the final notes. You may ask me a question only when the answer would change the story and you cannot work it out or imagine it well: one short question at a time, never more than two in all. If you have almost nothing about me beyond this message, ask me once for a short paragraph about my life and work, then continue.

FIRST, DESIGN ONE JOURNEY

Seven videos feel connected when they are seven steps of one struggle. Before choosing any event, work out:
- What I was after: the thing I wanted or was trying to become, underneath everything else.
- The belief that kept it out of reach: what I believed about myself or how things work.
- The fall: the one loss, inside that same pursuit, that the belief led me into. Something I had begun to build, trust, or hope for ended, and I could not put it back the way it was.
- The truth I carry now: what I could only have understood after that loss, and what I visibly do differently because of it.
- What I bring back: something I can now give a person who is where I started.

Every part is a step in that one pursuit. Part 2 shows the life the belief kept me in. Part 3 is the first crack in it. Part 4 is me acting on the crack before I had proof. Part 5 is the fall. Part 6 is the truth. Part 7 is who I am now, unfinished. A stranger watching all seven should always know what I was after and feel what was at stake. An interesting moment that does not belong to this pursuit stays out.

Then say: "Here are three things you could talk about. Which one feels right?" Give me three different journeys, about 50 words each: a short name, what I was after, and the events that would carry the first crack, the test, the fall, and the truth. Use different events in each. Let me choose one, combine them, or tell you what feels wrong.

THEN WRITE NOTES, NOT A STORY

Once I choose, you do not write the videos. A later writer does that. You give that writer my answers to the questions below, part by part. Answer the way a good witness would:
- Every answer that asks what happened is a scene, not a summary: something a camera could have filmed. One day, one place. Who was there. At least one thing another person said out loud, in quotation marks. My own thoughts do not count as that. One small physical detail: an object, a screen, a room, what I did with my hands. What I did next.
- A summary sounds like "I always felt out of place at those family dinners." A scene sounds like "My uncle slid the check across the table and said, 'You're the one with the business, right?'" Give me the second kind every time. (That example is not about me. Do not use it.)
- You will not know most of these details, and that is expected. Do not look for permission in what I have told you. Invent them. Build each scene the way a novelist who knows me well would: start from what you know, then speculate. What would a person like me have said in that room? Who would have pushed back, and with what words? What was on the table? Choose the most believable and most interesting version and state it as plain fact, with no "probably" or "I imagine." I can fix what is inaccurate. I cannot add a story later.
- Watch for the shortcut. "I remember thinking," "I realized," "I noticed," and "I started wondering" are what gets written when the scene was skipped. When you catch one, stop and put something in the room instead: a person, a sentence said out loud, an action. The only place my private thoughts belong is where a question asks what I believed.
- Answer from inside that moment: what I knew, wanted, and believed then. Leave out what it meant, what I learned, and what I understand now, unless the question asks for exactly that. The writer saves the meaning for the end of each video, and cannot do that if your answer has already said it.
- Give every question its own facts. Do not repeat one fact under two questions.
- Each answer is usually 40 to 120 words, in first person. Keep my language patterns, vocabulary, rhythm, bluntness, humor, and emotional temperature. The writer takes my voice from these notes.
- Never leave an answer empty.

THE QUESTIONS

These questions are written to me. Answer them as me, in first person.

PART 1: THE DECISION
Write one short paragraph, in first person: ${number === 2 ? 'what I am committing to say publicly, who it is for' : 'what I am finally ready to be seen for, who it is for'}, and the specific thing that has kept me quiet. It is happening now. Leave out my history and everything I have learned.

${helperQuestionBlock(number, partQuestions)}

DRAFT FIRST, THEN ONE REVISION

Your first full message after I choose is a draft. Show it as plain paragraphs, not in a code block, and label each part "Draft of part 2" and so on, never "PART 2", so the draft cannot be pasted into SeenInSeven by mistake. Under it, add this short review:

What I was after: [one line]
The belief that kept it out of reach: [one line]
The first crack (Part 3): [the moment, without what it meant]
The fall (Part 5): [what ended, the moment it could not be undone, and what I tried afterward that failed]
The truth (Part 6): [what I do now, and why a sensible person would argue with it]
What I bring back (Part 7): [what I can now give someone who is where I started, and what someone could see me doing]

End that message with exactly: "That's the draft. Reply revise and I'll do one revision pass to make it stronger."

When I reply, read the draft as a strict editor and fix what you find:
- An answer that should be a scene is a summary: no single day, no place, nothing another person said out loud. "I remember thinking" is a summary. Rewrite it as a scene, speculating from what you know about me and inventing what you need.
- An answer stays close to what I already told you when a bolder, more specific version would tell the story better. Take the bolder version.
- Part 3 has no single moment where something happened that the old belief could not explain.
- An answer explains what something meant or taught me when the question did not ask.
- Part 5 is a hard period or a mood. It needs one loss with a moment I could not undo, and an attempt to fix it that failed.
- Part 5 has nothing to do with what I was after in Parts 2 through 4.
- Part 6 says the same thing as Part 3.
- Two answers use the same fact, or two parts tell the same event.
- Names, dates, or details contradict each other.

Then give me the finished notes inside one plain-text code block, in exactly this layout, so I can paste them into SeenInSeven:

\`\`\`
PART 1
[the paragraph]

PART 2
About: [one line naming the situation and the event only, with no realization or outcome]
1. [answer]
2. [answer]
3. [answer]

PART 3
About: [one line]
1. [answer]
...
\`\`\`

Continue the same way through PART 7. Every part has the same number of answers as it has questions. Each answer is one line that starts with its number. No headings, bold, bullets, or anything else inside the block.

${sourceContext ? `MY CURRENT CONTEXT\n\n${sourceContext}` : 'MY CURRENT CONTEXT\n\nI have not added much here. Use what you already know about me.'}`.trim();
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

Do not ask me questions unless you genuinely need clarification, and then ask only one. Work out where I was, who was there, what I did, and what it led to from what you know about me, and imagine the rest. Give me one first-person paragraph that I can paste into SeenInSeven. Build it on one event: who was there, what was said or done, and what changed afterward. An opinion, a habit, or "I sometimes" is not an event. Use as much space as it takes to hold everything this part must do, usually 100 to 200 words, and never compress it into a summary. Keep it natural and specific. Go past what I tell you: infer, connect, and invent plausible details when the material is thin, and do not explain what you invented. Make sure it stands on its own for a stranger.

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

  // Story notes: "PART 1" then a paragraph; "PART 2".."PART 7" each with an "About:" line
  // and numbered answers. counts is how many answers each of Parts 2 through 7 needs.
  // Returns null when the text is not in the notes layout, so the older seven-line map
  // still reads through parseImportedMapDetail.
  function parseStoryNotes(value, counts) {
    const text = String(value || '')
      .replace(/\r/g, '')
      .replace(/\\([.)\-:*_#>~`])/g, '$1')
      .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, '')
      .replace(/\*\*|__/g, '');
    const heads = Array.from(text.matchAll(/^[ \t#>]*PART[ \t]+([1-7])\b[^\n]*$/gim));
    if (!heads.length || !/^[ \t]*About[ \t]*:/im.test(text)) return null;
    const parts = [];
    const problems = [];
    let expected = 1;
    const picked = heads.filter(head => { if (Number(head[1]) !== expected) return false; expected += 1; return true; });
    picked.forEach((head, order) => {
      const number = Number(head[1]);
      const from = head.index + head[0].length;
      const to = order + 1 < picked.length ? picked[order + 1].index : text.length;
      const body = text.slice(from, to).trim();
      if (number === 1) {
        parts[0] = { about: body.replace(/\s+/g, ' ').trim().slice(0, 4000), answers: [] };
        if (!parts[0].about) problems.push('Part 1 has no paragraph.');
        return;
      }
      const aboutMatch = body.match(/^[ \t]*About[ \t]*:[ \t]*(.+)$/im);
      const answers = [];
      const marks = Array.from(body.matchAll(/^[ \t]*(\d{1,2})[.)][ \t]+/gm));
      let next = 1;
      const kept = marks.filter(mark => { if (Number(mark[1]) !== next) return false; next += 1; return true; });
      kept.forEach((mark, index) => {
        const start = mark.index + mark[0].length;
        const end = index + 1 < kept.length ? kept[index + 1].index : body.length;
        answers.push(body.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 4000));
      });
      const need = Array.isArray(counts) ? Number(counts[number - 2]) || 0 : 0;
      if (!aboutMatch) problems.push('Part ' + number + ' has no "About:" line.');
      if (need && answers.filter(Boolean).length < need) problems.push('Part ' + number + ' has ' + answers.filter(Boolean).length + ' of its ' + need + ' answers.');
      parts[number - 1] = { about: aboutMatch ? aboutMatch[1].replace(/\s+/g, ' ').trim().slice(0, 600) : '', answers };
    });
    for (let number = 1; number <= 7; number++) {
      if (!parts[number - 1]) problems.push('Part ' + number + ' is missing.');
    }
    return { parts, problems, ok: !problems.length };
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
    parseStoryNotes,
    formatJourney,
    copyText
  };
})(window);
