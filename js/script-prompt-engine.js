(function(global) {
  'use strict';

  const SECTION_KEYS = [];
  [1, 2].forEach(level => {
    for (let video = 1; video <= 7; video++) SECTION_KEYS.push('l' + level + '_v' + video + '_rules');
  });

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
        lines.push('', 'VIDEO ' + number + ' FINAL SCRIPT (voice and continuity reference; use once, do not repeat it):', String(previous.script).trim());
      }
    });
    if (video === 1) {
      appendAnswers(lines, 'VIDEO 1 PREFILLED PROMPTS (user may have edited these):', config.currentAnswers);
    } else if (config.currentMode === 'easy') {
      lines.push('', 'CURRENT VIDEO ' + video + ' JOURNAL ENTRY (easy mode; use this to infer all story beats):', String(config.currentEasyAnswer || '').trim() || '(no answer provided)');
    } else {
      appendAnswers(lines, 'CURRENT VIDEO ' + video + ' PROMPTS:', config.currentAnswers);
      if (config.currentEasyAnswer) lines.push('', 'Additional free-write context from user:', String(config.currentEasyAnswer).trim());
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
    buildOnboardingLines,
    buildUserMessage,
    parseSections,
    stripSectionLabels,
    canonicalScript
  };
})(window);
