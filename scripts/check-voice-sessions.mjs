// Voice input sessions (David, 2026-10-17): "when I start, stop and then start
// again it replaces the previous text and deletes what was already there."
//
// Chrome keeps delivering the last words for a moment after stop(). The old
// code forgot the field's starting text on stop, so those late words were
// written over everything, and an old session's end could switch off a newer
// one. This runs js/voice-input.js (StorySculpt) against a stand-in for
// Chrome's recogniser in a small fake DOM, with the same start, stop, start
// and switch-field sequence, and checks that SeenInSeven's js/app.js carries
// the identical session code.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');

// ── a fake DOM just large enough for the voice script ──
class El {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.parentNode = null;
    this.dataset = {}; this.style = {}; this.value = ''; this.type = tag === 'input' ? 'text' : '';
    this.className = ''; this.innerHTML = ''; this.title = ''; this.listeners = {};
    const self = this;
    this.classList = {
      add: c => { const s = new Set(self.className.split(' ').filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
      remove: c => { self.className = self.className.split(' ').filter(x => x && x !== c).join(' '); },
      contains: c => self.className.split(' ').includes(c),
    };
  }
  appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
  setAttribute() {}
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  dispatchEvent(e) { (this.listeners[e.type] || []).forEach(fn => fn(e)); return true; }
  click() { this.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} }); }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  matches(sel) { return sel.split(',').some(s => { s = s.trim(); if (s === 'textarea') return this.tagName === 'TEXTAREA'; if (s.startsWith('input')) return this.tagName === 'INPUT' && this.type === 'text'; if (s.startsWith('.')) return this.classList.contains(s.slice(1)); const attr = s.match(/^\[data-([a-z-]+)\]$/); if (attr) return attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()) in this.dataset; return false; }); }
  querySelectorAll(sel) { return this.all().filter(e => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const body = new El('body');
const answer = body.appendChild(new El('textarea', 'story-answer'));
const other = body.appendChild(new El('textarea', 'other'));
const editor = body.appendChild(new El('textarea', 'story-output-copy'));

// Like Chrome: one result list per session; stop() turns the words still being
// recognised into a final result a moment later, then ends.
const sessions = [];
class FakeRecognition {
  constructor() { this.results = []; this.stopped = false; sessions.push(this); }
  start() {}
  fire(i) { this.onresult && this.onresult({ resultIndex: i, results: this.results.map(r => Object.assign([{ transcript: r.t }], { isFinal: r.f })) }); }
  say(t, f) { const last = this.results.at(-1); if (last && !last.f) { last.t = t; last.f = f; } else this.results.push({ t, f }); this.fire(this.results.length - 1); }
  stop() { if (this.stopped) return; this.stopped = true; setTimeout(() => { const last = this.results.at(-1); if (last && !last.f) { last.f = true; this.fire(this.results.length - 1); } this.onend && this.onend(); }, 20); }
  abort() { this.stopped = true; setTimeout(() => this.onend && this.onend(), 5); }
}

const context = {
  window: { SpeechRecognition: FakeRecognition },
  document: { body, readyState: 'complete', createElement: t => new El(t), querySelectorAll: s => body.querySelectorAll(s), querySelector: s => body.querySelector(s), addEventListener() {} },
  MutationObserver: class { observe() {} },
  Event: class { constructor(type) { this.type = type; } },
  WeakMap, Set, setTimeout, clearTimeout, console,
};
vm.runInNewContext(read('js/voice-input.js'), context);

const wait = ms => new Promise(r => setTimeout(r, ms));
const mic = el => el.parentNode.querySelector('.voice-btn');
let passed = 0;

assert.ok(mic(answer), 'the answer box has a mic');
assert.equal(editor.parentNode, body, 'the finished-script editor has no mic');
passed++;

answer.value = 'I typed this first.';
mic(answer).click(); let s = sessions.at(-1);
s.say('hello there', true); s.say('this is', false);
mic(answer).click(); await wait(60);
assert.equal(answer.value, 'I typed this first. hello there this is ', 'stop keeps typed text and the words still being recognised');
passed++;

mic(answer).click(); s = sessions.at(-1);
s.say('second take', false);
mic(answer).click(); await wait(60);
assert.equal(answer.value, 'I typed this first. hello there this is second take ', 'a second start adds to the first instead of replacing it');
passed++;

mic(answer).click(); s = sessions.at(-1);
s.say('third', true); s.say('half a', false);
mic(other).click(); const s4 = sessions.at(-1);
await wait(60);
assert.ok(mic(other).classList.contains('listening'), 'the old session ending does not switch off the new one');
s4.say('other field words', true);
mic(other).click(); await wait(60);
assert.equal(answer.value, 'I typed this first. hello there this is second take third half a ', 'switching fields keeps the first field whole');
assert.equal(other.value, 'other field words ');
assert.ok(!mic(answer).classList.contains('listening') && !mic(other).classList.contains('listening'), 'both mics back to idle');
passed++;

// SeenInSeven carries the identical session code.
const block = src => src.slice(src.indexOf('  // Each listening session owns its field'), src.indexOf('  function stopListening()'));
const story = block(read('js/voice-input.js'));
assert.ok(story.length > 500, 'session block found in voice-input.js');
assert.equal(block(read('js/app.js')), story, 'SeenInSeven js/app.js has the same session code as StorySculpt');
assert.ok(!/voiceBase|activeRecognition|activeBtn/.test(read('js/app.js') + read('js/voice-input.js')), 'no shared field snapshot left behind');
passed++;

console.log(`PASS voice sessions: ${passed} checks (typed text kept, second start appends, field switch safe, SeenInSeven identical)`);
