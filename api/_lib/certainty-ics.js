// Certainty session calendar invites (.ics generation and delivery via Resend).
// WO-20261025-latemorning / WBR-458 (UX 98, 99; feeds UX 100, Stranger 100).
//
// When a member books, edits (time, mode or topic) or cancels:
// 1. A standards-correct iCalendar (.ics) invite is generated.
// 2. Both member and David (email@davidbee.me) receive an email via Resend
//    carrying the invite as an attachment (METHOD:REQUEST on book/edit, METHOD:CANCEL on cancel).
// 3. Stable UID per session across book, edit and cancel.
// 4. SEQUENCE: 0 on initial book, incremented on every edit.
// 5. DTSTART/DTEND in America/New_York with a VTIMEZONE block.
// 6. Join location (Zoom link or 'David calls you at <phone>') in LOCATION and DESCRIPTION.
// 7. The member's topic is included in David's copy only, never in the member's copy.
// 8. If Resend send fails, the booking/edit/cancel is still saved and logged as certainty_invite_failed.

export const CERTAINTY_TZID = 'America/New_York';
export const CERTAINTY_SENDER_EMAIL = 'sessions@coloradomastermind.com';
export const CERTAINTY_OPERATOR_EMAIL = 'email@davidbee.me';

export function getCertaintyUid(sessionId) {
  return `certainty-${sessionId}@coloradomastermind.com`;
}

export function formatIcsLocalTime(dateInput, timeZone = CERTAINTY_TZID) {
  const d = new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}${map.month}${map.day}T${hour}${map.minute}${map.second}`;
}

export function formatIcsUtcTime(dateInput = new Date()) {
  const d = new Date(dateInput);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function extractEmail(addr) {
  if (!addr) return '';
  const match = String(addr).match(/<([^>]+)>/);
  return match ? match[1].trim() : String(addr).trim();
}

export const VTIMEZONE_AMERICA_NEW_YORK = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'X-LIC-LOCATION:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
].join('\r\n');

export function formatSessionWhen(session) {
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CERTAINTY_TZID,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CERTAINTY_TZID,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${dayFormatter.format(start)}, ${timeFormatter.format(start)} to ${timeFormatter.format(end)} Eastern`;
}

export function buildCertaintyIcs(session, options = {}) {
  const method = (options.method || (session.status === 'cancelled' ? 'CANCEL' : 'REQUEST')).toUpperCase();
  const sequence = options.sequence != null ? Number(options.sequence) : (session.sequence != null ? Number(session.sequence) : 0);
  const forDavid = Boolean(options.forDavid || options.recipient === 'david' || options.forOperator);
  const uid = options.uid || getCertaintyUid(session.id);
  const dtstamp = options.dtstamp ? formatIcsUtcTime(options.dtstamp) : formatIcsUtcTime(session.created_at || new Date());

  const dtstart = formatIcsLocalTime(session.starts_at, CERTAINTY_TZID);
  const dtend = formatIcsLocalTime(session.ends_at, CERTAINTY_TZID);

  const isZoom = session.mode === 'zoom';
  const zoomLink = options.zoomUrl || (typeof process !== 'undefined' && process.env && process.env.CERTAINTY_ZOOM_URL ? process.env.CERTAINTY_ZOOM_URL.trim() : null);

  let locationText = '';
  if (isZoom) {
    locationText = zoomLink || 'Zoom';
  } else {
    locationText = session.phone ? `David calls you at ${session.phone}` : 'David calls you at <phone on file>';
  }

  const descriptionLines = [];
  if (isZoom) {
    descriptionLines.push(zoomLink ? `Join on Zoom: ${zoomLink}` : 'David will send the Zoom link before the session.');
  } else {
    descriptionLines.push(session.phone ? `David calls you at ${session.phone}` : 'David calls you at <phone on file>');
  }

  if (forDavid) {
    const memberWho = session.member_name ? `${session.member_name} (${session.member_email})` : session.member_email;
    descriptionLines.push(`Member: ${memberWho}`);
    if (session.topic) {
      descriptionLines.push(`Bringing: ${session.topic}`);
    }
  }

  const descriptionText = descriptionLines.join('\n');

  let summary = '';
  if (method === 'CANCEL') {
    summary = forDavid
      ? `Cancelled: Certainty Session with ${session.member_name || session.member_email || 'Member'}`
      : 'Cancelled: Certainty Session with David Bee';
  } else {
    summary = forDavid
      ? `Certainty Session with ${session.member_name || session.member_email || 'Member'}`
      : 'Certainty Session with David Bee';
  }

  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  const recipientName = forDavid ? 'David Bee' : (session.member_name || 'Member');
  const recipientEmail = forDavid
    ? (typeof process !== 'undefined' && process.env && process.env.CERTAINTY_OPERATOR_EMAIL ? extractEmail(process.env.CERTAINTY_OPERATOR_EMAIL) : CERTAINTY_OPERATOR_EMAIL)
    : session.member_email;
  const organizerEmail = typeof process !== 'undefined' && process.env && process.env.CERTAINTY_REMINDER_FROM
    ? extractEmail(process.env.CERTAINTY_REMINDER_FROM)
    : CERTAINTY_SENDER_EMAIL;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Colorado Mastermind//Certainty Sessions//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    VTIMEZONE_AMERICA_NEW_YORK,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionText)}`,
    `LOCATION:${escapeIcsText(locationText)}`,
    `DTSTART;TZID=${CERTAINTY_TZID}:${dtstart}`,
    `DTEND;TZID=${CERTAINTY_TZID}:${dtend}`,
    `ORGANIZER;CN=Certainty Sessions:mailto:${organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${escapeIcsText(recipientName)}:mailto:${recipientEmail}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n') + '\r\n';
}

export function composeMemberInviteMessage(session, action, zoomUrl = null) {
  const firstName = session.member_name ? session.member_name.split(' ')[0] : 'there';
  const when = formatSessionWhen(session);
  const isZoom = session.mode === 'zoom';
  const how = isZoom
    ? (zoomUrl ? `Join on Zoom: ${zoomUrl}` : 'David will send the Zoom link before the session.')
    : (session.phone ? `David will call you at ${session.phone}.` : 'David will call you at the phone number on file.');

  if (action === 'cancel') {
    return {
      subject: 'Cancelled: Certainty Session with David Bee',
      text: [
        `Hi ${firstName},`,
        '',
        `Your Certainty session on ${when} has been cancelled.`,
        '',
        'A calendar cancellation is attached to clear this time from your calendar.',
        '',
        'You can book a new session anytime in Studio.',
        '',
        'David'
      ].join('\n')
    };
  }

  if (action === 'update') {
    return {
      subject: 'Updated: Certainty Session with David Bee',
      text: [
        `Hi ${firstName},`,
        '',
        'Your Certainty session has been updated to:',
        when,
        '',
        how,
        '',
        'An updated calendar invite is attached so this moves on your calendar.',
        '',
        'See you then,',
        'David'
      ].join('\n')
    };
  }

  return {
    subject: 'Your Certainty Session is booked',
    text: [
      `Hi ${firstName},`,
      '',
      'Your Certainty session with David is booked for:',
      when,
      '',
      how,
      '',
      'A calendar invite is attached so this session lands on your calendar.',
      '',
      'Bring whatever is most on your mind. See you then,',
      'David'
    ].join('\n')
  };
}

export function composeOperatorInviteMessage(session, action, zoomUrl = null) {
  const who = session.member_name ? `${session.member_name} (${session.member_email})` : session.member_email;
  const when = formatSessionWhen(session);
  const isZoom = session.mode === 'zoom';
  const how = isZoom
    ? (zoomUrl ? `Zoom: ${zoomUrl}` : 'Zoom (link pending)')
    : (session.phone ? `Phone: ${session.phone}` : 'Phone: number on file');
  const topicLine = session.topic ? `Topic: ${session.topic}` : null;

  if (action === 'cancel') {
    return {
      subject: `Certainty Session cancelled: ${who}`,
      text: [
        'A Certainty session was cancelled.',
        '',
        `Member: ${who}`,
        `Time: ${when}`,
        ...(topicLine ? [topicLine] : []),
        '',
        'Calendar cancellation attached.'
      ].join('\n')
    };
  }

  if (action === 'update') {
    return {
      subject: `Certainty Session updated: ${who}`,
      text: [
        'A Certainty session was updated.',
        '',
        `Member: ${who}`,
        `New Time: ${when}`,
        `Format: ${how}`,
        ...(topicLine ? [topicLine] : []),
        '',
        'Updated calendar invite attached.'
      ].join('\n')
    };
  }

  return {
    subject: `Certainty Session booked: ${who}`,
    text: [
      'A new Certainty session was booked.',
      '',
      `Member: ${who}`,
      `Time: ${when}`,
      `Format: ${how}`,
      ...(topicLine ? [topicLine] : []),
      '',
      'Calendar invite attached.'
    ].join('\n')
  };
}

export async function sendCertaintyInviteEmails({
  session,
  action = 'book',
  sequence = 0,
  method = (action === 'cancel' ? 'CANCEL' : 'REQUEST'),
  zoomUrl = null,
  fetchFn = fetch
}) {
  const apiKey = typeof process !== 'undefined' && process.env ? process.env.RESEND_API_KEY : '';
  if (!apiKey) {
    throw new Error('resend-api-key-missing');
  }
  const from = (typeof process !== 'undefined' && process.env && process.env.CERTAINTY_REMINDER_FROM) || CERTAINTY_SENDER_EMAIL;
  const operatorEmail = (typeof process !== 'undefined' && process.env && process.env.CERTAINTY_OPERATOR_EMAIL) || CERTAINTY_OPERATOR_EMAIL;
  const memberEmail = session && session.member_email;

  if (!memberEmail) {
    throw new Error('member-email-missing');
  }

  const memberIcs = buildCertaintyIcs(session, {
    method,
    sequence,
    forDavid: false,
    zoomUrl
  });

  const davidIcs = buildCertaintyIcs(session, {
    method,
    sequence,
    forDavid: true,
    zoomUrl
  });

  const memberMsg = composeMemberInviteMessage(session, action, zoomUrl);
  const davidMsg = composeOperatorInviteMessage(session, action, zoomUrl);

  const memberPayload = {
    from,
    to: [memberEmail],
    subject: memberMsg.subject,
    text: memberMsg.text,
    attachments: [
      {
        filename: 'invite.ics',
        content: Buffer.from(memberIcs, 'utf8').toString('base64'),
        contentType: `text/calendar; method=${method}`
      }
    ]
  };

  const davidPayload = {
    from,
    to: [operatorEmail],
    subject: davidMsg.subject,
    text: davidMsg.text,
    attachments: [
      {
        filename: 'invite.ics',
        content: Buffer.from(davidIcs, 'utf8').toString('base64'),
        contentType: `text/calendar; method=${method}`
      }
    ]
  };

  const memberRes = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(memberPayload)
  });

  if (!memberRes.ok) {
    const detail = await memberRes.text().catch(() => '');
    throw new Error(`resend member send ${memberRes.status}: ${detail.slice(0, 200)}`);
  }
  const memberData = await memberRes.json().catch(() => ({}));

  const davidRes = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(davidPayload)
  });

  if (!davidRes.ok) {
    const detail = await davidRes.text().catch(() => '');
    throw new Error(`resend david send ${davidRes.status}: ${detail.slice(0, 200)}`);
  }
  const davidData = await davidRes.json().catch(() => ({}));

  return {
    ok: true,
    memberMessageId: memberData.id || null,
    davidMessageId: davidData.id || null,
    memberIcs,
    davidIcs
  };
}
