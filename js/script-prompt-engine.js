(function(global) {
  'use strict';

  const SECTION_KEYS = [];
  [1, 2].forEach(level => {
    for (let video = 1; video <= 7; video++) SECTION_KEYS.push('l' + level + '_v' + video + '_rules');
  });

  function extractTaggedSection(source, tag) {
    const open = '<' + tag + '>';
    const close = '</' + tag + '>';
    const start = String(source || '').indexOf(open);
    const end = String(source || '').indexOf(close, start + open.length);
    if (start === -1 || end === -1) return '';
    return String(source).slice(start + open.length, end).trim();
  }

  function buildSystemPrompt(source, level, video) {
    const fullSource = String(source || '');
    const globalRules = extractTaggedSection(fullSource, 'global_rules');
    const sectionKey = 'l' + Number(level) + '_v' + Number(video) + '_rules';
    const videoRules = extractTaggedSection(fullSource, sectionKey);
    if (!globalRules || !videoRules) return fullSource;
    return globalRules + '\n\n' + videoRules;
  }

  function normalizeAnswer(answer) {
    if (!answer) return null;
    return {
      label: String(answer.label || '').trim(),
      value: String(answer.value || '').trim() || '(no answer provided)'
    };
  }

  function appendAnswers(lines, heading, answers) {
    const clean = (answers || []).map(normalizeAnswer).filter(Boolean);
    lines.push('', heading);
    clean.forEach((answer, index) => {
      lines.push((index + 1) + '. ' + answer.label + ': ' + answer.value);
    });
  }

  function buildOnboardingLines(context) {
    const values = context || {};
    const fields = [
      ['Name', values.name],
      ['Posting experience', values.postingExperience],
      ['Posting history', values.postingHistory],
      ['Blocker', values.blocker],
      ['Blocker in their own words', values.customBlocker],
      ['Business stage', values.businessStage],
      ['Content intent', values.contentIntent],
      ['Context mode', values.contextMode],
      ['Audience context', values.audienceContext],
      ['Desired audience reaction', values.messageContext],
      ['Extra first-script notes', values.firstScriptNotes],
      ['Pain content should help resolve', values.commitmentPain],
      ['Vision they want content to create', values.commitmentDesire],
      ['Commitment declaration', values.commitment],
      ['Dashboard mission statement', values.missionStatement],
      ['Topic / what they want to talk about', values.topic],
      ['Pasted context / knowledge base', values.knowledgeContext]
    ];
    return fields
      .filter(field => field[1] != null && String(field[1]).trim() !== '')
      .map(field => '- ' + field[0] + ': ' + String(field[1]).trim());
  }

  function buildUserMessage(config) {
    const level = Number(config.level || 1);
    const video = Number(config.video || 1);
    const lines = [
      'Generate Video ' + video + ' script.',
      '',
      'LEVEL: ' + level,
      'VIDEO: ' + video,
      '',
      'ONBOARDING DATA:'
    ];
    (config.onboardingLines || []).forEach(line => lines.push(String(line)));

    (config.previousVideos || []).forEach(previous => {
      const number = Number(previous.video);
      if (previous.mode === 'easy') {
        lines.push('', 'VIDEO ' + number + ' JOURNAL ENTRY (easy mode):', String(previous.easyAnswer || '').trim() || '(no answer provided)');
      } else {
        appendAnswers(lines, 'VIDEO ' + number + ' PROMPTS:', previous.answers);
      }
      if (previous.script) {
        lines.push(
          '',
          'VIDEO ' + number + ' FINAL SCRIPT (voice and continuity reference; use once, do not repeat it):',
          String(previous.script).trim()
        );
      }
    });

    if (video === 1) {
      appendAnswers(lines, 'VIDEO 1 PREFILLED PROMPTS (user may have edited these):', config.currentAnswers);
    } else if (config.currentMode === 'easy') {
      lines.push('', 'CURRENT VIDEO ' + video + ' JOURNAL ENTRY (easy mode; use this to infer all story beats):', String(config.currentEasyAnswer || '').trim() || '(no answer provided)');
    } else {
      appendAnswers(lines, 'CURRENT VIDEO ' + video + ' PROMPTS:', config.currentAnswers);
      if (config.currentEasyAnswer) {
        lines.push('', 'Additional free-write context from user:', String(config.currentEasyAnswer).trim());
      }
    }
    return lines.join('\n');
  }

  function parseSections(text) {
    const sections = { HOOK: '', 'OPEN LOOP': '', MEAT: '', CONCLUSION: '', CTA: '' };
    const pattern = /\[(HOOK|OPEN LOOP|MEAT|CONCLUSION|CTA)\]\s*([\s\S]*?)(?=\n\s*\[(?:HOOK|OPEN LOOP|MEAT|CONCLUSION|CTA)\]|$)/g;
    let match;
    while ((match = pattern.exec(String(text || '')))) sections[match[1]] = match[2].trim();
    return Object.values(sections).some(Boolean) ? sections : null;
  }

  const BANNED_LANGUAGE = [
    'version of me', 'if that landed', 'this landed', 'most people', 'everybody',
    'nobody ever talks about', 'nobody talks about', 'the part nobody tells you',
    'let that sink in', 'read that again', 'this is your sign',
    'you owe it to yourself', 'in a world where', 'at the end of the day',
    'game changer', 'secret sauce', 'deep dive', 'dive into', 'delve',
    'tapestry', 'realm', 'multifaceted', 'ultimately', 'webinar', 'ebook',
    'sell', 'buy', 'pay', 'guru', 'cohort'
  ];

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findVoiceIssues(text) {
    const source = String(text || '');
    const issues = [];
    const normalized = source.replace(/[’‘]/g, "'");
    if (/[—]/.test(source)) issues.push('Do not use em dashes. Restructure the sentence with natural story logic instead.');
    BANNED_LANGUAGE.forEach(phrase => {
      const pattern = new RegExp('\\b' + escapeRegExp(phrase).replace(/ /g, '\\s+') + '\\b', 'i');
      if (pattern.test(normalized)) issues.push('Remove the banned language: "' + phrase + '."');
    });
    if (/\b(?:it|this|that)\s*(?:isn't|is not|wasn't|was not)\s+[^.!?]{1,80}?,\s*(?:it|this|that)(?:'s| is| was)\b/i.test(normalized)) {
      issues.push('Remove the false-balance construction "it is not X, it is Y" and state the actual point directly.');
    }
    if (/\byou(?:'re| are)\s+not\s+[^.!?]{1,80}?,\s*you(?:'re| are)\b/i.test(normalized)) {
      issues.push('Remove the fake-reassurance construction "you are not X, you are Y" and return to the speaker\'s lived story.');
    }
    return issues;
  }

  function validateOutput(text, video) {
    const source = String(text || '');
    const sections = parseSections(text);
    if (!sections) return { valid: false, sections: null, missing: ['HOOK', 'OPEN LOOP', 'MEAT', 'CONCLUSION', 'CTA'], issues: [] };
    const missing = Object.keys(sections).filter(key => !sections[key] || (source.match(new RegExp('\\[' + key.replace(' ', '\\s+') + '\\]', 'g')) || []).length !== 1);
    const issues = [];
    const openLoop = sections['OPEN LOOP'] || '';
    const openLoopWords = (openLoop.match(/\b[\w’'-]+\b/g) || []).length;
    if (openLoopWords > 60) issues.push('OPEN LOOP has ' + openLoopWords + ' words; replace it with 35-45 words and never exceed 50.');
    if (/\b(?:I\s+(?:realized|learned|discovered|understood)|it\s+(?:showed|taught|proved)\s+me|the\s+(?:truth|point|lesson)\s+is)\b/i.test(openLoop)) {
      issues.push('OPEN LOOP announces the realization or lesson before the MEAT earns it.');
    }
    if (/\b(?:what happened next|something (?:changed|stopped me|was different))\b/i.test(openLoop)) {
      issues.push('OPEN LOOP uses vague suspense instead of one named unanswered question.');
    }
    const cta = String(sections.CTA || '').trim();
    const firstCtaSentence = (cta.match(/^\s*[\s\S]*?[.!?](?:\s|$)/) || [cta])[0];
    if (/\b(?:video|part|series|challenge)\b/i.test(firstCtaSentence)) {
      issues.push('CTA puts series context in its bridge sentence. Keep the first sentence connected only to the CONCLUSION; put the 7 Video Challenge orientation with the action and reason in the next sentence.');
    }
    if (/^(?:this|that(?:'s| is)|video|part)\s+(?:is\s+)?(?:video\s+)?(?:\w+|\d+)\s+(?:of|in)\s+(?:seven|7)\b/i.test(cta)) {
      issues.push('CTA begins with a series label instead of bridging from the CONCLUSION.');
    }
    const directActionPattern = /\b(?:follow(?:\s+me|\s+along|\s+for)?|comment|(?:share|save)\s+(?:this|it|the\s+(?:video|story|post|series))|send\s+(?:this|it)\s+to|send\s+me\s+(?:a\s+)?dm|dm\s+me|message\s+me|reach\s+out|reply|subscribe|click|visit|book|download|tag\s+someone|watch|go\s+back|tell\s+me|ask\s+me|join\s+me|come\s+talk\s+to\s+me)\b/i;
    if (!directActionPattern.test(cta)) {
      issues.push('CTA does not give the viewer one explicit action such as follow, comment, share, save, DM, watch, or go back.');
    }
    if (!/\bbecause\b/i.test(cta)) {
      issues.push('CTA does not use "because" to connect the action to its specific reason.');
    }
    const seriesMatch = cta.match(/\b(?:video|part)\s+(one|two|three|four|five|six|seven|[1-7])\s+of\s+(?:seven|7)\b/i);
    if (seriesMatch && Number(video)) {
      const numberWords = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7 };
      const statedVideo = numberWords[seriesMatch[1].toLowerCase()] || Number(seriesMatch[1]);
      if (statedVideo !== Number(video)) {
        issues.push('CTA identifies this as Video ' + statedVideo + ', but the current script is Video ' + Number(video) + '. If series context appears, identify the current installment as Video ' + Number(video) + ' and refer to the next video separately.');
      }
    }
    const numberedVideoReference = /\b(?:next\s+)?(?:video|part)\s+(?:one|two|three|four|five|six|seven|[1-7])\b/i.test(cta);
    const numberedSeriesContext = /\b(?:video|part)\s+(?:one|two|three|four|five|six|seven|[1-7])\s+of\s+(?:seven|7)\b/i.test(cta);
    const challengeContext = /\b(?:7|seven)[-\s]?(?:(?:video|part)\s+)?(?:challenge|series)\b/i.test(cta);
    if (numberedVideoReference && !numberedSeriesContext && !challengeContext) {
      issues.push('CTA names a future video without explaining that it is part of the speaker\'s 7 Video Challenge. Give cold viewers the challenge context before directing them to that next installment.');
    }
    issues.push(...findVoiceIssues(source));
    return { valid: missing.length === 0 && issues.length === 0, sections, missing, issues, metrics: { openLoopWords } };
  }

  function validationFeedback(validation) {
    const parts = [];
    if (validation && validation.missing && validation.missing.length) {
      parts.push('Missing or repeated sections: ' + validation.missing.join(', ') + '.');
    }
    (validation && validation.issues || []).forEach(issue => parts.push(issue));
    return parts.join(' ') || 'The response did not follow the required five-section architecture.';
  }

  function buildRepairMessage(userMessage, script, validation, video, precisionPass) {
    const corrections = validationFeedback(validation);
    const lines = [
      String(userMessage || '').trim(),
      '',
      precisionPass ? 'YOUR FIRST REPAIR ALSO FAILED VALIDATION:' : 'YOUR PREVIOUS RESPONSE FAILED VALIDATION:',
      String(script || '').trim(),
      '',
      'REQUIRED CORRECTIONS:',
      corrections
    ];
    const openLoopWords = validation && validation.metrics && validation.metrics.openLoopWords;
    if (openLoopWords > 60) {
      lines.push(
        '',
        'OPEN LOOP PRECISION REQUIREMENT:',
        'The current OPEN LOOP contains ' + openLoopWords + ' words. Replace it with an OPEN LOOP of 35-45 words. Count the words before responding. It must never exceed 50 words. Preserve one concrete unanswered question and do not reveal the conclusion.'
      );
    }
    lines.push(
      '',
      'Rewrite the complete Video ' + Number(video || 1) + ' script now. Preserve the supplied facts, voice, and story beats. Include all five required sections exactly once: [HOOK], [OPEN LOOP], [MEAT], [CONCLUSION], and [CTA]. Do not add commentary outside those sections.'
    );
    if (precisionPass) lines.push('This is the final validation pass. Follow every correction literally and verify the section lengths before returning the script.');
    return lines.join('\n');
  }

  function stripSectionLabels(text) {
    return String(text || '').replace(/\[(HOOK|OPEN LOOP|MEAT|CONCLUSION|CTA)\]\s*/g, '').trim();
  }

  function canonicalScript(text, video, declaration) {
    const raw = String(text || '').trim();
    const parsed = parseSections(raw);
    if (Number(video) !== 1 || !String(declaration || '').trim()) return stripSectionLabels(raw);
    if (!parsed || !parsed['OPEN LOOP'] || !parsed.MEAT) return stripSectionLabels(raw);
    return [parsed.HOOK, parsed['OPEN LOOP'], String(declaration).trim(), parsed.MEAT, parsed.CONCLUSION, parsed.CTA]
      .filter(Boolean).join('\n\n');
  }

  global.SISPromptEngine = {
    SECTION_KEYS,
    extractTaggedSection,
    buildSystemPrompt,
    buildOnboardingLines,
    buildUserMessage,
    parseSections,
    findVoiceIssues,
    validateOutput,
    validationFeedback,
    buildRepairMessage,
    stripSectionLabels,
    canonicalScript
  };
})(window);
