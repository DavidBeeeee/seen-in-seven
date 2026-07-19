const SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const REPOSITORY = 'DavidBeeeee/seen-in-seven';
const BRANCH = 'main';
const BLUEPRINT_PATH = 'prompts/blueprints.js';
const PUBLISH_PREFIX = 'Update SeenInSeven blueprint via Prompt Tester';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'SeenInSeven-Prompt-Tester'
  };
  if (process.env.GITHUB_PROMPT_TOKEN) {
    headers.Authorization = 'Bearer ' + process.env.GITHUB_PROMPT_TOKEN;
  }
  return headers;
}

async function github(path, options) {
  const response = await fetch('https://api.github.com/repos/' + REPOSITORY + path, {
    ...options,
    headers: { ...githubHeaders(), ...((options && options.headers) || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'GitHub request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function currentBlueprint(ref) {
  const file = await github('/contents/' + BLUEPRINT_PATH + '?ref=' + encodeURIComponent(ref || BRANCH));
  return {
    source: Buffer.from(String(file.content || '').replace(/\n/g, ''), 'base64').toString('utf8'),
    sha: file.sha
  };
}

async function recentBlueprintCommits() {
  return github('/commits?sha=' + BRANCH + '&path=' + encodeURIComponent(BLUEPRINT_PATH) + '&per_page=2');
}

function validateBlueprintSource(source) {
  const errors = [];
  if (typeof source !== 'string') return ['Blueprint source is missing.'];
  if (source.length < 10000 || source.length > 200000) errors.push('Blueprint length is outside the expected range.');
  if (!/^const SYSTEM_PROMPT = `[^]*`;\s*$/.test(source)) errors.push('The file must contain only the SYSTEM_PROMPT template.');
  if ((source.match(/`/g) || []).length !== 2) errors.push('Backticks are not allowed inside the prompt text.');
  if (source.includes('${')) errors.push('JavaScript interpolation syntax is not allowed inside the prompt text.');
  const required = ['<global_rules>', '</global_rules>', '[HOOK]', '[OPEN LOOP]', '[MEAT]', '[CTA]'];
  [1, 2].forEach(level => {
    for (let video = 1; video <= 7; video++) {
      required.push('<l' + level + '_v' + video + '_rules>', '</l' + level + '_v' + video + '_rules>');
    }
  });
  required.forEach(marker => {
    const count = source.split(marker).length - 1;
    if (marker.startsWith('<') && count !== 1) errors.push('Required marker must appear exactly once: ' + marker);
    else if (!count) errors.push('Missing required marker: ' + marker);
  });
  return errors;
}

async function verifyAdmin(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  const authHeaders = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token };
  const userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: authHeaders });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const adminResponse = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_admin', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!adminResponse.ok || (await adminResponse.json()) !== true) return null;
  return user;
}

async function updateBlueprint(source, currentSha, message) {
  return github('/contents/' + BLUEPRINT_PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(source, 'utf8').toString('base64'),
      sha: currentSha,
      branch: BRANCH
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      const [current, commits] = await Promise.all([currentBlueprint(BRANCH), recentBlueprintCommits()]);
      const latest = commits[0] || null;
      return json(res, 200, {
        source: current.source,
        sha: current.sha,
        publishConfigured: !!process.env.GITHUB_PROMPT_TOKEN,
        latestCommit: latest ? {
          sha: latest.sha,
          message: latest.commit && latest.commit.message,
          date: latest.commit && latest.commit.author && latest.commit.author.date
        } : null,
        canUndo: !!(latest && latest.commit && String(latest.commit.message || '').startsWith(PUBLISH_PREFIX) && commits[1])
      });
    }

    const admin = await verifyAdmin(req);
    if (!admin) return json(res, 403, { error: 'Administrator access required.' });
    if (!process.env.GITHUB_PROMPT_TOKEN) return json(res, 503, { error: 'GitHub publishing is not configured yet.' });

    const body = req.body || {};
    const current = await currentBlueprint(BRANCH);
    if (!body.expectedSha || body.expectedSha !== current.sha) {
      return json(res, 409, { error: 'The published blueprint changed after this draft was loaded. Reload it before continuing.' });
    }

    if (body.action === 'publish') {
      if (body.reviewConfirmed !== true || body.confirmation !== 'APPLY BLUEPRINT') {
        return json(res, 400, { error: 'Both publish confirmations are required.' });
      }
      const errors = validateBlueprintSource(body.source);
      if (errors.length) return json(res, 400, { error: errors.join(' ') });
      if (body.source === current.source) return json(res, 400, { error: 'The draft matches the published blueprint.' });
      const result = await updateBlueprint(
        body.source,
        current.sha,
        PUBLISH_PREFIX + '\n\nApplied by ' + (admin.email || admin.id)
      );
      return json(res, 200, {
        ok: true,
        action: 'publish',
        commitSha: result.commit && result.commit.sha,
        message: 'Blueprint committed. Vercel deployment has started.'
      });
    }

    if (body.action === 'undo') {
      if (body.confirmation !== 'UNDO BLUEPRINT') return json(res, 400, { error: 'Undo confirmation is required.' });
      const commits = await recentBlueprintCommits();
      const latest = commits[0];
      const previous = commits[1];
      if (!latest || !previous || !String(latest.commit && latest.commit.message || '').startsWith(PUBLISH_PREFIX)) {
        return json(res, 409, { error: 'The latest blueprint change was not made by this tester, so automatic undo is unavailable.' });
      }
      const previousFile = await currentBlueprint(previous.sha);
      const errors = validateBlueprintSource(previousFile.source);
      if (errors.length) return json(res, 409, { error: 'The previous blueprint did not pass validation.' });
      const result = await updateBlueprint(
        previousFile.source,
        current.sha,
        'Undo SeenInSeven blueprint Prompt Tester publish\n\nReverts ' + latest.sha
      );
      return json(res, 200, {
        ok: true,
        action: 'undo',
        commitSha: result.commit && result.commit.sha,
        message: 'Previous blueprint restored. Vercel deployment has started.'
      });
    }

    return json(res, 400, { error: 'Unknown action.' });
  } catch (error) {
    const status = error.status === 401 || error.status === 403 ? 502 : (error.status || 500);
    return json(res, status, { error: error.message || 'Prompt blueprint request failed.' });
  }
}
