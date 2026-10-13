// StorySculpt UGC product research endpoint.
// WBR-440 / STORYSCULPT_UGC_BUILD_PLAN.md Section 5.
//
// Authenticated server-side route that retrieves accessible product details,
// extracts manufacturer claims and customer reports, protects against SSRF,
// and saves the research snapshot to the member's project intake.

import { authenticatedUser, consumeQuota, json } from './_lib/security.js';
import { performBoundedResearch } from './_lib/storysculpt-research.js';

export const config = { maxDuration: 45 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const token = bearerToken(req);
  const user = await authenticatedUser(req);
  if (!user) return json(res, 401, { error: 'Sign in to research products.' });

  const body = req.body || {};
  const projectId = String(body.projectId || '').trim();
  if (!PROJECT_ID.test(projectId)) {
    return json(res, 400, { error: 'A valid project ID is required.' });
  }

  const project = await loadOwnedProject(token, projectId);
  if (!project) {
    return json(res, 404, { error: 'Project not found or not owned by you.' });
  }

  const allowed = await consumeQuota({
    subject: 'user:' + user.id,
    endpoint: 'storysculpt-research',
    limit: 30,
    req,
    userId: user.id
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

    await updateProjectUgcResearch(token, projectId, project.intake, research);

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
