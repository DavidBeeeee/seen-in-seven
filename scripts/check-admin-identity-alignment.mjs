import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const surfaces = [
  'js/admin-studio.js',
  'js/admin-boardroom.js',
  'admin-seeninseven.html'
];
const approved = [
  'contact@davidbee.me',
  'email@davidbee.me',
  'davidkamau.t@gmail.com',
  'davidkamau@live.com'
];

const missing = [];
for (const surface of surfaces) {
  const source = readFileSync(join(root, surface), 'utf8');
  for (const email of approved) {
    if (!source.includes(`'${email}'`)) missing.push(`${surface}: ${email}`);
  }
}

if (missing.length) {
  console.error(`Admin identity alignment failed: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Admin identity alignment passed across ${surfaces.length} admin surfaces.`);
