// StorySculpt UGC / Product Video: safe bounded research helper.
// WBR-440 / STORYSCULPT_UGC_BUILD_PLAN.md Section 5.
//
// Extracts product facts, manufacturer claims, customer feedback, and evidence
// gaps from an accessible product page, user-pasted details, or brand brief.
// Protects against SSRF, DNS rebinding, private network access, credentials,
// and excessive payload size. Never stores raw whole web pages or credentials.

import dns from 'node:dns/promises';
import { URL } from 'node:url';
import { authenticatedUser, consumeQuota, json } from './security.js';

function bearerToken(req) {
  const value = String((req && req.headers && req.headers.authorization) || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export const RESEARCH_TIMEOUT_MS = 10000;
export const MAX_REDIRECTS = 3;
export const MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB cap

// Private and reserved IP ranges (IPv4 & IPv6).
const PRIVATE_IPV4_REGEX = /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.0\.|192\.0\.2\.|192\.168\.|198\.18\.|198\.19\.|198\.51\.100\.|203\.0\.113\.|224\.|240\.|255\.255\.255\.255)/;

export function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = String(ip).trim().toLowerCase();
  if (clean === 'localhost') return true;
  if (clean === '::1' || clean === '::' || clean === '0.0.0.0') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (clean.startsWith('::ffff:')) {
    const v4 = clean.slice(7);
    return isPrivateIp(v4);
  }

  // IPv6 unique local (fc00::/7) or link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/i.test(clean) || /^fe[89ab][0-9a-f]:/i.test(clean)) {
    return true;
  }

  return PRIVATE_IPV4_REGEX.test(clean);
}

export function validateResearchUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, reason: 'Please enter a valid web address starting with http:// or https://' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http:// and https:// web addresses can be researched.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Web addresses with embedded usernames or passwords are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost') {
    return { ok: false, reason: 'Local host addresses cannot be accessed.' };
  }

  if (isPrivateIp(hostname)) {
    return { ok: false, reason: 'Private or local IP addresses cannot be accessed.' };
  }

  return { ok: true, url: parsed.toString(), hostname };
}

export async function checkDnsSafety(hostname) {
  try {
    const results = await dns.lookup(hostname, { all: true });
    for (const record of results) {
      if (isPrivateIp(record.address)) {
        return { ok: false, reason: 'Destination address resolves to a restricted private network.' };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'Could not resolve domain: ' + (error.message || 'DNS lookup failed') };
  }
}

export function isRetailBlock(status, text) {
  if (status === 403 || status === 503) return true;
  const sample = String(text || '').slice(0, 5000).toLowerCase();
  return (
    sample.includes('robot check') ||
    sample.includes('type the characters you see in this image') ||
    sample.includes('captcha') ||
    sample.includes('access denied') ||
    sample.includes('cloudflare ray id') ||
    sample.includes('please enable javascript to view') ||
    sample.includes('checking your browser')
  );
}

export async function fetchSafeUrl(targetUrl, { timeoutMs = RESEARCH_TIMEOUT_MS, maxRedirects = MAX_REDIRECTS } = {}) {
  let currentUrl = targetUrl;
  let redirectsRemaining = maxRedirects;

  while (redirectsRemaining >= 0) {
    const valid = validateResearchUrl(currentUrl);
    if (!valid.ok) return { ok: false, blocked: true, reason: valid.reason };

    const dnsCheck = await checkDnsSafety(valid.hostname);
    if (!dnsCheck.ok) return { ok: false, blocked: true, reason: dnsCheck.reason };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        redirect: 'manual',
        signal: controller.signal
      });

      // Handle redirect manually to enforce SSRF validation at every hop
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, blocked: true, reason: 'Redirect had no destination.' };
        currentUrl = new URL(location, currentUrl).toString();
        redirectsRemaining--;
        continue;
      }

      if (!response.ok) {
        const bodySnippet = await response.text().catch(() => '');
        if (isRetailBlock(response.status, bodySnippet)) {
          return {
            ok: false,
            blocked: true,
            status: response.status,
            reason: 'Retail site blocked automated reading (anti-bot protection). You can paste product details below.'
          };
        }
        return {
          ok: false,
          blocked: false,
          status: response.status,
          reason: `Product page answered with status ${response.status}.`
        };
      }

      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        return {
          ok: true,
          status: response.status,
          html: text.slice(0, MAX_RESPONSE_BYTES),
          url: currentUrl
        };
      }

      if (isRetailBlock(response.status, text)) {
        return {
          ok: false,
          blocked: true,
          status: response.status,
          reason: 'Retail site returned a verification challenge. You can paste product details below.'
        };
      }

      return {
        ok: true,
        status: response.status,
        html: text,
        url: currentUrl
      };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { ok: false, blocked: false, reason: 'Product page took longer than 10 seconds to respond.' };
      }
      return { ok: false, blocked: false, reason: error.message || 'Network request failed.' };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, blocked: true, reason: 'Too many redirects.' };
}

function decodeHtml(html) {
  return String(html || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&mdash;/g, ', ')
    .replace(/&ndash;/g, ', ');
}

export function extractProductFromHtml(html, url) {
  const cleanHtml = String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 1. Title extraction
  let title = '';
  const ogTitleMatch = cleanHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    cleanHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch) title = decodeHtml(ogTitleMatch[1]);
  if (!title) {
    const titleTagMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch) title = decodeHtml(titleTagMatch[1]);
  }
  if (!title) {
    const h1Match = cleanHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) title = decodeHtml(h1Match[1]);
  }
  title = title.replace(/\s+/g, ' ').trim();

  // 2. Description extraction
  let description = '';
  const ogDescMatch = cleanHtml.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    cleanHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    cleanHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  if (ogDescMatch) description = decodeHtml(ogDescMatch[1]).replace(/\s+/g, ' ').trim();

  // 3. Bullets / features extraction
  const bullets = [];
  const liMatches = cleanHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  for (const m of liMatches) {
    const text = decodeHtml(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text.length > 20 && text.length < 350 && !text.includes('cookie') && !text.includes('privacy') && !text.includes('copyright')) {
      bullets.push(text);
      if (bullets.length >= 8) break;
    }
  }

  // 4. Customer feedback extraction
  const customerReports = [];
  const reviewBlocks = cleanHtml.matchAll(/<(?:div|section|ul)[^>]*(?:review|customer|testimonial|feedback)[^>]*>([\s\S]*?)<\/(?:div|section|ul)>/gi);
  for (const rb of reviewBlocks) {
    const pMatches = rb[1].matchAll(/<(?:p|div|li)[^>]*>([\s\S]*?)<\/(?:p|div|li)>/gi);
    for (const pm of pMatches) {
      const text = decodeHtml(pm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (text.length > 25 && text.length < 350 && !text.includes('cookie') && !text.includes('sign in')) {
        customerReports.push(text);
        if (customerReports.length >= 5) break;
      }
    }
  }
  if (customerReports.length < 2) {
    const reviewMatches = cleanHtml.matchAll(/<(?:p|div|span|li)[^>]*(?:review|customer|testimonial|feedback|comment)[^>]*>([\s\S]*?)<\/(?:p|div|span|li)>/gi);
    for (const rm of reviewMatches) {
      const text = decodeHtml(rm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (text.length > 25 && text.length < 350 && !text.includes('cookie') && !text.includes('sign in')) {
        if (!customerReports.includes(text)) {
          customerReports.push(text);
          if (customerReports.length >= 5) break;
        }
      }
    }
  }

  return {
    title: title || 'Product from ' + new URL(url).hostname,
    description,
    features: bullets.slice(0, 6),
    customerReports: customerReports.slice(0, 4)
  };
}

export function synthesizeResearch({
  url = '',
  fetchResult = null,
  userDetails = '',
  brandBrief = ''
} = {}) {
  const sources = [];
  let sourceCounter = 1;
  const brandClaims = [];
  const customerReports = [];
  const features = [];
  const gaps = [];

  let productName = '';
  let variant = '';
  let coverage = 'user-only';
  let blockedReason = null;

  if (fetchResult && fetchResult.ok && fetchResult.html) {
    const extracted = extractProductFromHtml(fetchResult.html, fetchResult.url || url);
    productName = extracted.title;
    if (extracted.description) brandClaims.push(extracted.description);
    extracted.features.forEach(f => features.push(f));
    extracted.customerReports.forEach(r => customerReports.push(r));

    const srcId = `src-${sourceCounter++}`;
    sources.push({
      id: srcId,
      url: fetchResult.url || url,
      title: extracted.title,
      accessedAt: new Date().toISOString(),
      kind: 'retrieved',
      excerpt: (extracted.description + ' ' + extracted.features.slice(0, 3).join('. ')).trim().slice(0, 400),
      supportedFacts: [extracted.title, ...extracted.features.slice(0, 3)]
    });
    coverage = customerReports.length ? 'full' : 'partial';
  } else if (fetchResult && fetchResult.blocked) {
    blockedReason = fetchResult.reason;
    coverage = userDetails || brandBrief ? 'partial' : 'blocked';
    gaps.push('Direct page access was blocked; relying on user-provided details.');
  } else if (url && !fetchResult) {
    gaps.push('No web fetch performed; relying on user-provided input.');
  }

  // Synthesize user-provided details / brief
  if (userDetails && userDetails.trim()) {
    const srcId = `src-${sourceCounter++}`;
    const cleanDetails = userDetails.trim();
    if (!productName) {
      const firstLine = cleanDetails.split('\n')[0].trim();
      productName = firstLine.slice(0, 80);
    }
    features.push(cleanDetails.slice(0, 300));
    sources.push({
      id: srcId,
      url: null,
      title: 'Creator provided product details',
      accessedAt: new Date().toISOString(),
      kind: 'user-supplied',
      excerpt: cleanDetails.slice(0, 350),
      supportedFacts: [cleanDetails.slice(0, 100)]
    });
  }

  if (brandBrief && brandBrief.trim()) {
    const srcId = `src-${sourceCounter++}`;
    const cleanBrief = brandBrief.trim();
    brandClaims.push('Brand brief requirements: ' + cleanBrief.slice(0, 250));
    sources.push({
      id: srcId,
      url: null,
      title: 'Brand brief requirements',
      accessedAt: new Date().toISOString(),
      kind: 'user-supplied',
      excerpt: cleanBrief.slice(0, 350),
      supportedFacts: [cleanBrief.slice(0, 100)]
    });
  }

  if (!customerReports.length) {
    gaps.push('No independent customer reviews retrieved. Creator testing or honest demonstration recommended.');
  }

  if (!productName) productName = 'Product video';

  return {
    status: blockedReason ? 'blocked' : (sources.length ? 'completed' : 'empty'),
    checkedAt: new Date().toISOString(),
    coverage,
    product: {
      name: productName,
      variant: variant || '',
      url: url || ''
    },
    sources,
    findings: {
      brandClaims: brandClaims.slice(0, 5),
      customerReports: customerReports.slice(0, 5),
      features: features.slice(0, 6),
      gaps
    },
    gaps,
    blockedReason
  };
}

export async function performBoundedResearch({
  url = '',
  userDetails = '',
  brandBrief = ''
} = {}) {
  let fetchResult = null;
  if (url && url.trim()) {
    fetchResult = await fetchSafeUrl(url.trim());
  }
  return synthesizeResearch({
    url: url ? url.trim() : '',
    fetchResult,
    userDetails,
    brandBrief
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOwnedProject(token, projectId) {
  const url = `${SUPABASE_URL}/rest/v1/storysculpt_projects?id=eq.${projectId}&select=id,user_id,intake&limit=1`;
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

async function updateProjectUgcResearch(token, projectId, currentIntake, research) {
  const updatedIntake = {
    ...(currentIntake || {}),
    ugc: {
      ...((currentIntake && currentIntake.ugc) || {}),
      research
    }
  };
  await fetch(`${SUPABASE_URL}/rest/v1/storysculpt_projects?id=eq.${projectId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ intake: updatedIntake, updated_at: new Date().toISOString() })
  });
}

export async function handleResearchRequest(req, res, { token, user } = {}) {
  const activeToken = token || bearerToken(req);
  const activeUser = user || (await authenticatedUser(req));
  if (!activeUser) return json(res, 401, { error: 'Sign in to research products.' });

  const body = req.body || {};
  const projectId = String(body.projectId || '').trim();
  if (!PROJECT_ID.test(projectId)) {
    return json(res, 400, { error: 'A valid project ID is required.' });
  }

  const project = await loadOwnedProject(activeToken, projectId);
  if (!project) {
    return json(res, 404, { error: 'Project not found or not owned by you.' });
  }

  const allowed = await consumeQuota({
    subject: 'user:' + activeUser.id,
    endpoint: 'storysculpt-research',
    limit: 30,
    req,
    userId: activeUser.id
  });
  if (!allowed) {
    return json(res, 429, { error: 'Research request limit reached. Please wait a moment.' });
  }

  const productUrl = String(body.productUrl || '').trim();
  const userDetails = String(body.userDetails || '').trim();
  const brandBrief = String(body.brandBrief || '').trim();

  if (!productUrl && !userDetails && !brandBrief) {
    return json(res, 400, { error: 'Please provide a product link or product details.' });
  }

  try {
    const research = await performBoundedResearch({
      url: productUrl,
      userDetails,
      brandBrief
    });

    await updateProjectUgcResearch(activeToken, projectId, project.intake, research);

    return json(res, 200, {
      ok: true,
      research
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || 'Product research could not be completed.'
    });
  }
}

