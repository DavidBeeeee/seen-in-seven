# Dear Future Claude (and whoever else ends up debugging this),

I am writing this letter with the full knowledge that you are about to make the same mistake I made, that Claude Opus 4 made before me, and that at least three other Claude sessions made before that. I am writing it so that you do not spend eight hours doing it.

## What happened

The dashboard (`plan-screen`) was rendering blank. The symptom: `showDashboard:done` was logged, the element had the `active` class, `display: flex`, `opacity: 1`, `visibility: visible`, and ~9,000 characters of innerHTML. But it was invisible. `getBoundingClientRect()` returned all zeros.

Every session that touched this — including me — immediately concluded it was a JavaScript timing issue. We spent hours on:

- `transitioning` flag races between `onAuthStateChange` and `initAuth`
- Double `showDashboard` calls from concurrent auth events
- The `screen-0` visibility flicker during the async IIFE
- `showScreen`'s 200ms animation deferring the active-class swap
- Supabase auth deadlocks
- RLS policy blocks
- A missing `</head>` tag (real issue, but not this one)

All of that was real. Some of it was even worth fixing. But none of it was causing the blank screen.

## The actual root cause

**Two missing `</div>` tags in `index.html`.**

`screen-comm-layers` was never closed. The `<div style="text-align:center">` at the bottom of that screen was also never closed. Because of this, the browser's HTML parser treated every screen that came after `screen-comm-layers` in the file — `screen-video-intro`, `screen-7`, `screen-script-loading`, `screen-script`, and `plan-screen` — as children of `screen-comm-layers`.

`screen-comm-layers` is a `.screen` element. `.screen` has `display: none` in the CSS. So every one of those screens inherited zero layout dimensions regardless of what JavaScript did to their classes, because their parent was always invisible.

The fix was three lines:

```html
    <br><button class="preface-skip-end" onclick="skipToEnd()">→ Dashboard</button>
  </div>   ← this was missing
</div>     ← this was missing

<div class="screen" id="screen-video-intro">
```

## How it was finally found

Not through log traces. Not through timing analysis. By running this in the browser console:

```js
const ps = document.getElementById('plan-screen');
let el = ps;
while (el && el !== document.body) {
  console.log(el.tagName, el.id, el.getBoundingClientRect().width + 'x' + el.getBoundingClientRect().height);
  el = el.parentElement;
}
```

Output:
```
DIV plan-screen 0x0
DIV (anonymous) 0x0
DIV screen-comm-layers 0x0   ← the smoking gun
```

That's it. That's all it took. Thirty seconds.

## The rule you must follow next time

**Before you touch a single line of JavaScript, run this:**

```js
const el = document.getElementById('THE-BLANK-SCREEN');
let node = el;
while (node && node !== document.body) {
  const r = node.getBoundingClientRect();
  console.log(node.tagName, '#' + node.id, r.width + 'x' + r.height, getComputedStyle(node).display);
  node = node.parentElement;
}
```

If any ancestor has zero dimensions, **that is your bug**. Stop reading the JS. Open the HTML file. Find the unclosed tag.

You should also run this immediately:

```js
[...document.querySelectorAll('.screen')].filter(s => s.parentElement !== document.body).map(s => s.id + ' inside: ' + s.parentElement.id)
```

If any screens are not direct children of body, the HTML structure is broken.

## What was actually fixed along the way (not wasted)

To be fair, the other sessions weren't entirely wrong:

- `showScreen` was genuinely fragile under concurrent auth calls and was made synchronous (good change)
- `showDashboard` now directly manipulates DOM instead of relying on animated transitions (good change)
- The `onAuthStateChange` deadlock was a real bug (fixed)
- The missing `</head>` tag was a real bug (fixed)
- Supabase RLS policies were misconfigured (fixed)
- The `_syncUserProfile` throwing on new users was a real bug (fixed)

So the app is genuinely better. It just didn't fix the blank screen.

## Current state of the app

Working. For real this time. `plan-screen` renders at 800x2424px, all 21 screens are direct children of body, the magic link auth flow takes users to the dashboard, scripts generate via the DeepSeek proxy, and sessions are tracked in Supabase.

Don't touch the HTML structure without running the parent-chain check after every edit.

Sincerely,

Claude (Cowork session, May 31 2026, approximately 11pm)

P.S. — David lost half his session credits on this. Be better.
