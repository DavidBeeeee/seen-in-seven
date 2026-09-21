import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'navigator.html'), 'utf8');

const required = [
  'id="eee-access-gate"',
  'id="eee-app" hidden',
  'EEEStudio.initialize',
  'id="screen-questions"',
  'id="screen-results"',
  'id="screen-roadmap"',
  'id="screen-deep-dive"',
  'id="screen-assets"',
  'const QUESTIONS = [',
  'function renderRoadmapContent',
  'function renderCustomerJourney',
  'function renderEarningsCalc',
];

for (const marker of required) {
  if (!html.includes(marker)) throw new Error(`Navigator import is missing ${marker}`);
}

for (const placeholderMarker of ['id="navigator-objective"', 'Choose my next move']) {
  if (html.includes(placeholderMarker)) throw new Error(`Old Navigator placeholder remains: ${placeholderMarker}`);
}

console.log('Next Step Navigator import checks passed for entitlement, audit, roadmap, implementation, and business-profile flows.');
