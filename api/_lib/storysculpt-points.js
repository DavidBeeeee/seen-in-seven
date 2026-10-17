// StorySculpt "Bullet points" (David, 2026-10-17).
//
// A finished script, in any format, can be turned into ordered talking points
// the member delivers from, without losing the script: the client saves the
// points as a new version, so the full script stays one tap away in Versions.
// UGC keeps its own up-front "Ordered talking points" choice as well.
//
// This is a conversion, not a rewrite. The points carry the script's own beats
// in the script's own order and words; nothing new is added. The check below
// refuses a reply that is not actually a list, so a failed conversion never
// replaces a good script with prose.

export const POINTS_SYSTEM = [
  'You turn a finished short-form video script into ordered bullet-point talking points the creator speaks from on camera.',
  'Rules:',
  '1. Keep every beat of the script, in the same order: the hook first, the call to action last.',
  '2. Each bullet is a cue the creator glances at, not a sentence to read out: compress each beat to the few words that bring it back to mind, usually 3 to 12 words. Merge sentences that make the same point, so there is roughly one bullet per two to four sentences of script.',
  '3. Keep the creator\'s own key phrases, numbers, names and examples exactly as written. The first bullet is the hook and the last is the call to action, both in the script\'s exact words.',
  '4. Add nothing that is not in the script: no new claims, facts, stories, results, offers or calls to action.',
  '5. Plain text only. Every line is a bullet starting with "- ". No headings, no bold, no numbering, no notes to the creator, no line before or after the list.',
  '6. Never use em dashes.',
].join('\n');

export function pointsMessages(script) {
  return [
    { role: 'system', content: POINTS_SYSTEM },
    { role: 'user', content: 'SCRIPT:\n' + String(script || '').trim() },
  ];
}

// Normalise the model's list: any bullet or number marker becomes "- ",
// markdown emphasis and stray headings go, em dashes become commas.
export function cleanPoints(raw) {
  const lines = String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^#{1,6}\s/.test(line))
    .filter(line => !/^(here are|talking points|bullet points)\b.*:$/i.test(line));
  const bullets = lines.map(line => {
    const text = line
      .replace(/^(?:[-*•‣▪◦]|\d{1,2}[.)])\s+/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\s*[—–]\s*/g, ', ')
      .trim();
    return text ? '- ' + text : '';
  }).filter(Boolean);
  return bullets.join('\n');
}

// A usable conversion is a real list: at least three bullets, carrying a
// meaningful share of the script. Points are far shorter than the script, but
// a reply under 10% of its words (or under six words) has dropped the content.
export function checkPoints(points, script) {
  const bullets = String(points || '').split('\n').filter(line => line.startsWith('- '));
  if (bullets.length < 3) return { ok: false, reason: 'too_few_points' };
  const words = s => String(s || '').replace(/^- /gm, '').split(/\s+/).filter(Boolean).length;
  if (words(points) < Math.max(6, Math.ceil(words(script) * 0.10))) return { ok: false, reason: 'content_dropped' };
  return { ok: true, count: bullets.length };
}
