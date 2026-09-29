# StorySculpt source material (verbatim)

David's own prompts, style guide, and reference documents for the StorySculpt
5E expansion, pulled from Google Drive on 2026-09-21 and committed here so the
build reads them from the repo and never depends on Drive being reachable at
run time. This is the "nothing gets lost" store.

These are **verbatim text exports**, not summaries. A compressed copy of
David's source drifts; the originals stay the source of truth and each file
below records its Drive id so it can be re-exported. Escaping artifacts from
the Drive text export (`\#`, `\!`, `\_`) are left in place rather than
"cleaned," because silently rewriting the source is the opposite of preserving
it. The build curates these into the wired prompt assets; it does not read this
folder at runtime.

## Files

| file | Drive id | what it is |
|---|---|---|
| `5e-strategy-guide.md` | `1hUBJ_tAIQKSHIQPew0UArNuThv_VZDFh` | David's custom 5E "book": the philosophy, the five E's (Epiphany, Empathy, Enragement, Entertainment, Education), and the Business/Webinar bridge |
| `5e-voices-and-example-scripts.md` | `1c6ATQuuzlD0-6y8ZSj1B5q1pI7maPjy12kk_DhQTgYY` | The five voices with full style descriptions and a complete example script each |
| `prompt-guide-current.md` | `1EBo8w9WHLZ0sFczGtAObwrwAHtRwFWuqASQ73D2WKSs` | The "newest" command spec: `/Mini` `/Rant` `/Bold` `/fix`, hook generated last and escalated |
| `prompt-guide-variant.md` | `17G18oXPgd-cb76mrjJwEzP9zAL9xb9l4AcDaCOXUbbM` | Near-identical variant; its extra is the five recurring rant topics and a title line |
| `hooks-and-ctas.md` | `16qdyq5hj4PCNO9qwAPAq7lopHs-QTKq2` | The tame-but-viral hook and CTA bank (Education, Myths, Step-by-Step, Common Mistakes, Authority; Engagement/Follow/Sales CTAs) |
| `mini-perfect-webinar-formula.md` | `17aSplsteGHD86ry4TPqgfbA27JbOVpcE` | The 60-Second Perfect Webinar formula (hook, story/context, 3 secrets, offer/CTA) |

## Reconciliation notes (for the build)

- **The two prompt guides are ~95% the same.** `prompt-guide-current.md` is the
  base (it carries the "pause and take a deep breath" step and is the one David
  called newest). `prompt-guide-variant.md` adds two things worth folding in:
  the five recurring rant topics, and an explicit `[Topic Title]` line in the
  rant output format. Use current as the spec, adopt those two additions.
- **Hook-last-then-escalate is already in the spec.** In all three commands the
  hook is generated *after* the finished script and then escalated:
  `/rant` R6 (generate 3 hooks, "evidence vs verdict", metaphorical bridge) then
  R7 (escalate to three intensity levels: common lie -> biological threat ->
  existential crisis); `/bold` B4; `/mini` M4 (Brunson frameworks: Big Promise,
  False Belief, Shock, Contrarian). The live app does **not** fully do this yet.
  Matching the deployed engine to this is core to the build.
- **Each type's hook framework is named** in the spec: rant = metaphorical
  bridge / visceral imagery; mini = Russell Brunson's four; bold/controversy =
  shock, surprise, contrast, contrarian.
- **Type mapping (David, 2026-09-21):** rant = Connection / 5E (already is;
  upgrade its framework to these sources, do not rebuild); mini = Sales / mini
  perfect webinar (stays); bold -> relabel **"Controversy"**, its own
  less-formulaic category; UGC = its own later buildout, placeholder only.

## Not yet captured

- The Mini Webinar **example** script (`/_mini Example Script`): its Drive link
  in David's brief 404'd (`1kwHCiHO1JfqC8_Aq4o7cWyh-OJLDhtT`). Re-share needed.
  Not blocking: the formula and the command spec are both here.
- Three UGC formula docs (`1RnP64...`, `1Jt3HP...`, `1hdi49...`): deliberately
  left for the UGC buildout, which David scoped as its own later day.
