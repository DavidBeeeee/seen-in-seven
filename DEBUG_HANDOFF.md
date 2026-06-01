# SeenInSeven — Blank Dashboard Debug Handoff

## Current status
Auth is FIXED. The Supabase `onAuthStateChange` deadlock is resolved (DB calls
deferred with `setTimeout(0)`). The diagnostics trace now completes fully:

```
sync:found → auth:synced → restore:start → auth:after-restore → showDashboard:start → showDashboard:done
```

**Remaining bug:** after `showDashboard:done`, the page shows ONLY the top
progress-bar header ("SEENINSEVEN — YOUR JOURNEY"). The `plan-screen` is blank.
Screen-0 flashes for a split second first, then routes to the blank plan-screen.

## What we KNOW for certain
1. `buildPlan()` runs without throwing (trace reaches `showDashboard:done`).
2. Earlier testing showed `plan-output.innerHTML.length === 9108` — the dashboard
   HTML content IS being generated and inserted into the DOM.
3. Earlier testing showed `document.getElementById('plan-screen').getBoundingClientRect()`
   returned ALL ZEROS (width:0, height:0). The element is in the DOM, has content,
   but renders at zero size.
4. We found and fixed a missing `</head>` tag (was causing the whole body to render
   with zero dimensions). HTML structure is now valid:
   - line 113: `</script>`
   - line 114: `</head>`
   - line 115: `<body>`
5. Despite the `</head>` fix, the blank persists. So either the fix didn't fully
   resolve the zero-dimension issue, OR there's a separate CSS/layout cause.

## THE KEY DIAGNOSTIC TO RUN (in browser with DevTools)
Open https://seen-in-seven.vercel.app/?debug=1 while logged in, then in console:

```js
// Is plan-screen active and sized?
const ps = document.getElementById('plan-screen');
console.log('classes:', ps.className);
console.log('rect:', ps.getBoundingClientRect());
console.log('computed display:', getComputedStyle(ps).display);
console.log('computed height:', getComputedStyle(ps).height);
console.log('parent:', ps.parentElement.tagName, ps.parentElement.id);
console.log('parent rect:', ps.parentElement.getBoundingClientRect());
console.log('body rect:', document.body.getBoundingClientRect());
console.log('plan-output length:', document.getElementById('plan-output').innerHTML.length);

// Is another element covering it? Check what's actually at center screen:
console.log('element at center:', document.elementFromPoint(window.innerWidth/2, window.innerHeight/2));

// Are there multiple active screens?
console.log('active screens:', document.querySelectorAll('.screen.active').length,
  [...document.querySelectorAll('.screen.active')].map(s=>s.id));
```

Paste ALL output. This tells us definitively:
- If rect is zero → CSS layout/structure issue (element collapsed)
- If rect is normal but elementFromPoint shows something else → overlay covering it
- If multiple active screens → showScreen left screen-0 active too

## Architecture summary
Static site on Vercel. Three JS files load in order at bottom of index.html:
1. `prompts/blueprints.js` — the AI system prompt + Hero's Journey blueprints (CORE IP, DO NOT TOUCH)
2. `js/supabase.js` — auth + DB layer (Supabase)
3. `js/app.js` — ~3450 lines, all app logic + global mutable state

`api/generate.js` — Vercel serverless function proxying DeepSeek API for scripts.

## Screen system (the likely culprit)
- All `.screen` divs are direct children of `<body>` (no wrapper).
- `.screen { display:none }`, `.screen.active { display:flex; flex-direction:column }`
- `screen-0` has `class="screen active"` hardcoded in HTML.
- `showScreen(id)` (app.js ~line 55) animates: adds `anim-out` to current active,
  waits 200ms, removes active from old + adds active to new, waits 350ms, removes anim-in.
- `showDashboard()` (app.js ~line 2805) calls `buildPlan()` then `showScreen('plan-screen')`.

## Suspects for the blank (in priority order)
1. **CSS collapse** — plan-screen `display:flex; flex-direction:column` but if a parent
   or the body has a height constraint, or if plan-screen's children are all
   `position:absolute` or zero-height, it collapses. CHECK getBoundingClientRect.
2. **Two active screens** — if showScreen's setTimeout left screen-0 active AND
   added plan-screen active, CSS might show neither correctly.
3. **The progress-bar-wrap is position:fixed** at top. If plan-screen content renders
   UNDER it with no padding-top, it could be hidden behind the fixed header. But that
   wouldn't explain zero height.
4. **anim-in animation** — if `@keyframes fadeIn` ends at opacity:0 or the animation
   doesn't complete, content stays invisible. CHECK computed opacity.

## How to test locally (Cowork)
```bash
git clone https://github.com/DavidBeeeee/seen-in-seven
cd seen-in-seven
# Static files — serve with any local server:
npx serve .
# OR
python3 -m http.server 8000
# Then open localhost with ?debug=1
# NOTE: api/generate.js won't work locally without Vercel env (DEEPSEEK_API_KEY),
# but auth + dashboard rendering CAN be tested locally.
```

To test the dashboard render in isolation, you can manually set localStorage:
```js
localStorage.setItem('bwb_challenge_v1', JSON.stringify({
  name:'Test', level:1, posted:'no', goal:'comfortable',
  minigoal:'all7', minigoalText:'film all 7 videos',
  videos:{script_v0:'[HOOK]\ntest\n[CTA]\ntest'}, videoStatus:{},
  savedAt: Date.now()
}));
// then reload — loadProgress() should call showDashboard()
```

## Brand/voice constraints (do not break)
- No em dashes anywhere in copy.
- Colors: Teal Deep #0D2828, Teal Vivid #32B8B8, Gold #C8A84B.
- Fonts: Lora (headlines), Nunito (body), Oswald (labels), Permanent Marker, Space Mono.
- The challenge is the product; SeenInSeven is the bonus.
- `prompts/blueprints.js` is core IP — never modify the SYSTEM_PROMPT or blueprints.

## Diagnostics mode
Add `?debug=1` to any URL → live on-screen trace panel (right side, 340px).
Persists via localStorage. `?debug=0` turns it off. Real users never see it.
The panel has a Copy button to grab the full trace.
