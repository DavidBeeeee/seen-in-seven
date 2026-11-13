# WBR-462: short broad openings, November 13

## Artifact and release

Baseline main b3ada0ffa7b30c33a2a7a84c93f405c28ded60db had no new
latemorning Stranger43 implementation. Afternoon therefore implemented the
assigned general short-scope heuristic in js/storysculpt-member-states.js.
Product implementation4e9d2200c4d2822962c70a3927c70672c53a4f3a is on
origin/main. Production dpl_E11gRkSzmtVPMS6EfSY9rCH7iPkT was READY at
https://studio.coloradomastermind.com . Served member-states JS and local
main both SHA256 ba55f300e249b945880ae5dfd3b34f0d180ba9c089e01c7adc05bfbb61adaa0e.

No external dependency or migration is needed. No auth, permissions, frozen
prompt/blueprint, membership or customer-account change. Cache key updated
with the member-state asset. General scope cues replace six complete phrases;
concrete scene/time/person cues take precedence. This remains a deterministic
English-language heuristic, not universal semantic understanding.

## Tests and actual member walk

Focused state check passes ten new broad examples and three concrete short
scenes, plus prior recovery cases. Full npm test completed exit0. The walk
uses existing entitled non-admin test member momentum-hub-test@ancientcosmic.com,
Chromium1280x900, actual Send, served production assets and real generation
and database paths. No JS route override, model fixture or fabricated UI.
Only synthetic chats created; retained without deletion or account changes.

Baseline20:06:03Z: both withheld broad phrasings incorrectly advanced to R2
with one generation each. The concrete scene correctly advanced.

Final20:11Z follow-up independently reads each exact saved row using the
same ordinary member authorization, not an admin/service-role bypass:

| Phrase (not the broad regression examples) | Visible / stored result | Generation | Verdict |
| --- | --- | --- | --- |
| Showing the world how to enjoy every part of living | One narrowing question, Raw story retained; answer stored once, narrowing stored once; project1a4480ec-a24f-4176-8490-3b4390051fd1 | 0 | PASS |
| Advice for anybody who wants to improve everything | One narrowing question, Raw story retained; answer stored once, narrowing stored once; project2e89029c-614d-411e-99b2-63a7f317921f | 0 | PASS |
| the day my mom handed me her car keys | No narrowing, real next question at R2; answer stored once and no narrowing turn; project18ba7d06-8408-4d1b-b0cb-e04b3dbabc20 | 1 | PASS |

Broad visible question begins "That takes in everyone and everything at once"
and asks for one specific person or exact moment. Status says the screen
stayed on this step to ask one narrowing question. The focused case shows
"Choose the tension" and the generated response refers to handing over keys.

Initial post-release automation incorrectly demanded literal intake.current_step
R1. Fresh chats actually use the existing implicit start (null); both local and
stored position remain null during narrowing. Corrected the witness to compare
before/after position rather than manufacture a stored R1. That run's false
verdict is not hidden; the real observable narrowing already worked. Final
walk also checks durable answer/narrow counts and exact saved step.

## Boundaries and handoff

I built this change and ran its live checks; this is self-test evidence, not
independent receiving acceptance. Evening reviews the exact current artifact
and three cases, then records acceptance. WBR-462 and the capstone rows stay
open; no Morning rescore performed. UX95 real VoiceOver speech remains open.

The initial automatic post-commit sync refused absent prerequisite metadata;
the explicit native push then succeeded. There were genuinely no new external
dependencies, but that sequencing did not respect the declaration mechanism.
Subsequent publication uses the ordinary guarded helper with explicit
"none: no external production dependencies". No force push or rollback.
