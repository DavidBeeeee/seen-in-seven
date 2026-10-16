import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const config = { maxDuration: 15 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

// Candidate file locations for The 5E Framework PDF
const LOCAL_BOOK_PATHS = {
  '5e-framework': [
    join(process.cwd(), 'assets', 'vault', 'books', '5e-framework.pdf'),
    join(process.cwd(), 'assets', 'vault', 'books', 'The-5E-Framework.pdf'),
    '/Users/flutemusik/Library/CloudStorage/GoogleDrive-davidkamau.t@gmail.com/My Drive/GPT\'s/Social Media GPT/5E Framework Ebook v.2026.03.06.pdf'
  ]
};

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function verifyBookAccess(token, slug) {
  if (!token) return { ok: false, status: 401, error: 'Authentication required.' };

  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid or expired session.' };

  const accessRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/has_book_access', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ target_book_slug: slug })
  });

  if (!accessRes.ok) {
    return { ok: false, status: 500, error: 'Access check failed.' };
  }

  const hasAccess = await accessRes.json().catch(() => false);
  if (hasAccess !== true) {
    return { ok: false, status: 403, error: 'This book is not included in your personal library.' };
  }

  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const slug = String((req.query && req.query.slug) || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Valid book slug is required.' });
  }

  const token = bearer(req);
  const access = await verifyBookAccess(token, slug);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const wantsContent = String((req.query && req.query.content) || '') === '1';
  const wantsDownload = String((req.query && req.query.download) || '') === '1';

  // Handle PDF streaming/download
  if (slug === '5e-framework') {
    const candidatePaths = LOCAL_BOOK_PATHS['5e-framework'] || [];
    let foundPath = null;
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (wantsContent || wantsDownload) {
      if (!foundPath) {
        return res.status(404).json({ error: 'Book file is currently unavailable.' });
      }

      try {
        const fileBuffer = readFileSync(foundPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', fileBuffer.length);
        if (wantsDownload) {
          res.setHeader('Content-Disposition', 'attachment; filename="The-5E-Framework.pdf"');
        } else {
          res.setHeader('Content-Disposition', 'inline; filename="The-5E-Framework.pdf"');
        }
        return res.status(200).send(fileBuffer);
      } catch (err) {
        console.error('Error reading book file:', err);
        return res.status(500).json({ error: 'Could not load book file.' });
      }
    }

    return res.status(200).json({
      ok: true,
      slug: '5e-framework',
      title: 'The 5E Framework',
      subtitle: 'Building Trust Through Human-Centered Content',
      description: 'A guide to building trust, authority, and connection through human-centered content that speaks directly to the client who needs your help.',
      format: 'pdf',
      cover_url: '/assets/vault/the-5e-framework-cover.png',
      sha256: '7392961c0f492eaa4fe8eab517870efc19a7548cf2ec74619dc82772adf3e386',
      file_size_bytes: 505492,
      download_enabled: true,
      download_path: '/api/vault-book?slug=5e-framework&download=1'
    });
  }

  // Handle web fixture
  if (slug === 'sample-web-book') {
    const chapters = [
      { id: 'ch1', title: 'Chapter 1: The First Step', content: 'Welcome to the web book reader. This chapter demonstrates clean in-Studio typography, chapter navigation, and automatic position saving without requiring third-party plugins.' },
      { id: 'ch2', title: 'Chapter 2: Resuming Where You Left', content: 'When you return on any authenticated device, the reader automatically resumes to the chapter you last visited.' },
      { id: 'ch3', title: 'Chapter 3: Safe Sanitized Content', content: 'All content rendered here uses safe DOM text construction to eliminate script injection risks while keeping reading effortless.' }
    ];

    return res.status(200).json({
      ok: true,
      slug: 'sample-web-book',
      title: 'Sample Web Book (Admin Test Fixture)',
      subtitle: 'Testing the web chapter renderer',
      description: 'Internal testing fixture for the in-Studio web reader. Never published as a real gift.',
      format: 'web',
      cover_url: '/assets/eee/vault.png',
      download_enabled: false,
      chapters
    });
  }

  return res.status(404).json({ error: 'Book not found.' });
}
