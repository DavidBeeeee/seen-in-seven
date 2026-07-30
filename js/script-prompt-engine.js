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
    const sourceOwnership = video === 7
      ? [
          '- Videos 1 through 6 final scripts are the audience canon. Build the return from what the viewer actually heard.',
          '- The current Journey Direction describes the desired destination, differentiation, or unresolved flaw. It cannot replace the audience canon with a new scene, thesis, conflict, test, loss, revelation, or journey.',
          '- The current answers supply present-day evidence, the honest unfinished element, and an optional direction that continues.',
          '- Onboarding and background may clarify the audience or voice, but they cannot introduce another life chapter, lesson, offer, or reason the speaker should be followed.',
          '- If a previous final script exists, ignore its raw journal answers. If it does not exist, use that chapter\'s answers only as a fallback.',
          '- Organize the complete journey around one governing identity transformation. Select the earlier identity and refusal from Videos 1-2, the actual first realization and trial from Videos 3-4, the fall from Video 5, and the elixir and returned self from Video 6 plus current Video 7 evidence.',
          '- Keep those movements grounded in lived events, choices, consequences, and observable behavior. Do not replace them with distilled lessons, positioning claims, service descriptions, or superiority comparisons.',
          '- Omit additional events that perform a narrative job already completed. Several chapters may share one movement; no chapter needs its own sentence or equal space.',
          '- Make the full journey understandable to a cold viewer and recognizable to someone who watched the earlier videos.'
        ]
      : [
          '- The current Journey Direction and current-video answers are the authoritative brief for this video.',
          '- The Journey Direction controls this chapter and place in the seven-part arc. The current answers control the facts, causes, emotional conflict, and meaning inside that chapter.',
          '- The Journey Direction is also the private Viewer Premise Source. Translate it once into natural spoken context near the beginning of MEAT so a cold viewer understands this episode without seeing the Overview.',
          '- Previous scripts provide continuity only. Onboarding and background are a supporting archive only.',
          '- Supporting material may clarify or deepen the same causal thread, but it must never replace it with an older, more dramatic, or more familiar story.',
          '- If the current answers are sparse, infer within their assigned direction instead of switching to another subject from the archive.'
        ];
    const lines = [
      'Generate Video ' + video + ' script.',
      '',
      'LEVEL: ' + level,
      'VIDEO: ' + video,
      '',
      'SOURCE OWNERSHIP:',
      ...sourceOwnership,
      '',
      'ONBOARDING DATA:'
    ];
    (config.onboardingLines || []).forEach(line => lines.push(String(line)));
    (config.previousVideos || []).forEach(previous => {
      const number = Number(previous.video);
      if (video !== 7) {
        if (previous.mode === 'easy') {
          lines.push('', 'VIDEO ' + number + ' JOURNAL ENTRY (easy mode):', String(previous.easyAnswer || '').trim() || '(no answer provided)');
        } else {
          appendAnswers(lines, 'VIDEO ' + number + ' PROMPTS:', previous.answers);
        }
      }
      if (previous.script) {
        lines.push(
          '',
          'VIDEO ' + number + (video === 7
            ? ' FINAL SCRIPT (audience canon; select only what supports the return):'
            : ' FINAL SCRIPT (voice and continuity reference; use once, do not repeat it):'),
          String(previous.script).trim()
        );
      }
      if (video !== 7 || previous.script) return;
      if (previous.mode === 'easy') {
        lines.push('', 'VIDEO ' + number + ' JOURNAL ENTRY (easy mode):', String(previous.easyAnswer || '').trim() || '(no answer provided)');
      } else {
        appendAnswers(lines, 'VIDEO ' + number + ' PROMPTS:', previous.answers);
      }
    });
    const journeyDirection = String(config.currentJourneyDirection || '').trim();
    if (journeyDirection) {
      lines.push(
        '',
        'CURRENT VIDEO ' + video + ' JOURNEY DIRECTION (private planning context only):',
        journeyDirection,
        video === 7
          ? 'Use this to clarify the desired return destination, differentiation, unfinished flaw, or horizon. Do not translate it as a new local premise or let it replace the six final scripts. Do not pull in future journey directions.'
          : 'Use this as the intended subject and place in the seven-part journey. Translate its essential premise once near the beginning of MEAT without quoting it, recapping prior videos, or revealing the reserved Conclusion. Do not pull in future journey directions.'
      );
    }
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
