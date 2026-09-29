import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const config = { maxDuration: 15 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

// The Momentum Hub member tool pages. Their real page (member markup, member JS,
// embedded copy) now lives under api/_hub, which Vercel bundles into this
// function but never serves as a static route, so /storysculpt.html no longer
// leaks either. WBR-385.
//
// Why a shell and not a plain server gate: a cold browser navigation to
// /storysculpt carries no Supabase token. The member session lives in
// localStorage, not a cookie, so the server cannot know the visitor at the
// moment it must return HTML. It therefore returns a neutral shell to everyone
// (no member markup, no member JS, no prompts) and hands the real <body> to the
// authenticated fragment request only after it checks the same eee entitlement
// the client gate checks. The client gate then runs a second time inside the
// injected body, exactly as before, so it stays as the second layer the order
// asked to keep.
const TOOLS = new Set(['storysculpt', 'navigator', 'vault', 'eee', 'certainty']);

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function readTool(tool) {
  return readFileSync(join(process.cwd(), 'api', '_hub', tool + '.html'), 'utf8');
}

function splitDoc(html) {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return { head: head ? head[1] : '', body: body ? body[1] : '' };
}

// Server-side entitlement check, the same target_app_key the member app uses.
// The token must resolve to a real user AND that user must hold eee access.
async function hasEeeAccess(token) {
  if (!token) return false;
  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!userRes.ok) return false;
  const accRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/has_studio_app_access', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_app_key: 'eee' })
  });
  return accRes.ok && (await accRes.json().catch(() => false)) === true;
}

// The neutral shell. It reuses the tool's own <head> so fonts, CSS, the theme
// bootstrap, Supabase, and Lucide are all present and the gate looks native.
// The body carries no member markup: only a boot gate and a loader that pulls
// the real body once entitlement is proven server-side.
function shellHtml(head, tool) {
  return `<!DOCTYPE html>
<html lang="en">
<head>${head}</head>
<body>
  <main class="eee-gate" id="hub-boot-gate"><section class="eee-gate-box"><span class="studio-mark">MH</span><h1 id="hub-boot-title">Checking your membership.</h1><p id="hub-boot-copy">Your Studio access will be ready in a moment.</p><a class="primary-button" id="hub-boot-button" href="/"><span>Return to Studio</span></a></section></main>
  <script>
  (function () {
    var SB_URL = ${JSON.stringify(SUPABASE_URL)};
    var SB_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};
    var TOOL = ${JSON.stringify(tool)};
    function gate(kind) {
      var t = document.getElementById('hub-boot-title');
      var c = document.getElementById('hub-boot-copy');
      var b = document.getElementById('hub-boot-button');
      if (kind === 'sign-in') {
        if (t) t.textContent = 'Sign in to enter the Momentum Hub.';
        if (c) c.textContent = 'Use the Studio email connected to your membership.';
        if (b) { b.href = '/?access=eee'; var s = b.querySelector('span'); if (s) s.textContent = 'Go to Studio sign in'; }
      } else {
        if (t) t.textContent = 'This membership is not active on your account.';
        if (c) c.textContent = 'Your other Studio access remains unchanged.';
        if (b) { b.href = '/'; var s2 = b.querySelector('span'); if (s2) s2.textContent = 'Return to My Studio'; }
      }
      if (window.lucide) window.lucide.createIcons();
    }
    async function runScripts(root) {
      var scripts = Array.prototype.slice.call(root.querySelectorAll('script'));
      for (var i = 0; i < scripts.length; i++) {
        var old = scripts[i];
        var s = document.createElement('script');
        for (var j = 0; j < old.attributes.length; j++) s.setAttribute(old.attributes[j].name, old.attributes[j].value);
        if (old.src) {
          await new Promise(function (resolve) { s.onload = resolve; s.onerror = resolve; old.parentNode.replaceChild(s, old); });
        } else {
          s.textContent = old.textContent;
          old.parentNode.replaceChild(s, old);
        }
      }
    }
    async function boot() {
      try {
        if (!window.supabase) { gate('access'); return; }
        var sb = window.supabase.createClient(SB_URL, SB_KEY);
        var session = (await sb.auth.getSession()).data.session;
        if (!session) { gate('sign-in'); return; }
        var access = await sb.rpc('has_studio_app_access', { target_app_key: 'eee' });
        if (!access || access.error || access.data !== true) { gate('access'); return; }
        var res = await fetch('/api/hub-page?tool=' + encodeURIComponent(TOOL) + '&fragment=1', {
          headers: { Authorization: 'Bearer ' + session.access_token }
        });
        if (!res.ok) { gate('access'); return; }
        var body = await res.text();
        // Swap the whole document body for the real page, then re-run its
        // scripts in order and replay the load lifecycle the page expects
        // (storysculpt runs its init inline; navigator waits on window.onload).
        document.body.innerHTML = body;
        await runScripts(document.body);
        try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) {}
        try { window.dispatchEvent(new Event('load')); } catch (e) {}
      } catch (error) {
        gate('access');
      }
    }
    boot();
  })();
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Also used to stop the raw StorySculpt knowledge from being downloaded
  // directly. The server still reads those files over the filesystem; this only
  // blocks the public HTTP route. WBR-385.
  if (String((req.query && req.query.deny) || '') === '1') {
    res.status(403).send('Not available.');
    return;
  }

  const tool = String((req.query && req.query.tool) || '').toLowerCase();
  if (!TOOLS.has(tool)) {
    res.status(404).send('Not found.');
    return;
  }

  let doc;
  try {
    doc = splitDoc(readTool(tool));
  } catch (error) {
    res.status(500).send('This page is temporarily unavailable.');
    return;
  }

  const isFragment = String((req.query && req.query.fragment) || '') === '1';
  if (isFragment) {
    const ok = await hasEeeAccess(bearer(req));
    if (!ok) {
      res.status(403).json({ error: 'An active Momentum Hub membership is required.' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(doc.body);
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(shellHtml(doc.head, tool));
}
