# WBR-462: November 11 production fault walk

Production: https://studio.coloradomastermind.com/storysculpt.
Identity: momentum-hub-test@ancientcosmic.com, non-admin profile verified
through its own authenticated read. A new isolated Chromium context, no David
profile, no changed password or entitlement. Authentication remains in memory;
no storage state, token, password, trace or personal account data is committed.

Reviewed base: origin/main 83bac8bb99954ae8c22fa478e9a44d1fe39dcc83.
Ancestors 928dc43, d601775 and ab232a2 independently confirmed. The real
production JS SHA256 d5ce3bb419f9872d1c3550416331a26ee7e568b0de3b3dcd4e0dcd9ad396bf80
matched the checked-out integration exactly. `npm test` exited zero on that
tree. Read the origin's Chromium/WebKit receipt: its 132 checks are the
builder's locally stubbed run, not 132 production observations by Afternoon.

## Scope and reproduction

`node scripts/sim/storysculpt-production-fault-walk.mjs --out <private-local-receipt.json>`

The script signs into the existing test member using its protected Keychain
entry. It opens the real deployed page, uses native format/title/Send/Resume
controls and saves real synthetic projects. Only this fresh page's POST to
`/api/storysculpt` is intercepted. A captured request is held 350ms and either
aborted with `internetdisconnected` or fulfilled with a controlled JSON503.
These are client-path fault simulations, not a real provider outage, global
offline mode, server-crash test or proof of a provider-completed/lost response.
Resume goes to the real production API. Independent member REST reads check
the exact project's stored conversation before and after Resume.

Initialization waits for existing projects to load before opening New chat,
and for the title save to finish before injecting generation faults. Account
chrome appearing alone is not a ready-project signal. Synthetic chats
were created across the initial probes and three successful walk scenarios;
later save-conflict regression chats are separately retained. Nothing deleted,
archived, filmed or posted. Earlier synthetic fixtures remain unchanged.

## 1. Dropped connection and Resume: PASS

Project a3fdb2a0-b457-4306-a277-a6702202ecb7. Before Send:
2026-11-11T20:07:43.542Z; fault message: 20:07:44.422Z; recovery: 20:07:49.035Z.

Exact on-screen line:

> Connection lost. Your saved chat is safe. Reconnect, then choose Resume this step; you do not need to retype your answer. Step paused on Raw story before StorySculpt finished replying. Your last answer (“I teach pottery workshops. Yesterday a beginner…”) is kept. Press Resume this step to continue from Raw story.

The complete synthetic pottery answer existed in the real saved conversation
before Resume, once, at row revision3. Resume reused the same project and
generation key `gen:2cbdad68-097f-48de-9085-a09fafd18cd9`. Exactly two
generation requests: one injected abort, one real resumed request. The real
reply advanced Raw story to R2 and asked which emotion the audience should feel
and what pressure beginners face. Final saved revision6 retained the original
answer exactly once, with the follow-up. No retyping or duplicate user turn.

## 2. Generation503 and saved project: PASS

Project 2bd88202-d95f-4236-af6a-1c8f7a1e4e8b. Before Send:
2026-11-11T20:07:50.915Z; fault message: 20:07:51.808Z; recovery: 20:07:56.080Z.

Exact on-screen line:

> StorySculpt could not complete this step. Your saved chat is safe. Choose Resume this step to continue from the same answer. Step paused on Raw story before StorySculpt finished replying. Your last answer (“I teach pottery workshops. A student wanted to…”) is kept. Press Resume this step to continue from Raw story.

Independent readback found the entire synthetic first-bowl answer saved once
before retry (revision3). Resume reused project and key
`gen:7fe55c50-ed02-4a2d-b563-88a469c6702d`; one controlled503, one real
successful request. The response advanced to R2 and asked about relief,
defiance and the source of the student's belief. Saved revision6 retained the
answer once plus its real follow-up. No project or prior answer lost.

## 3. Empty Send on integrated served form: PASS

Project e48b1719-e813-4959-a631-6fa02ca1f184. Before: 20:07:58.056Z;
empty click: 20:07:58.096Z; spaces-only click: 20:07:58.137Z.
The real served textarea has no native `required` constraint. Both clicks:

> Nothing was sent, so Raw story is still waiting. Your earlier answers are unchanged. Type an answer to continue this exact step.

No conversation mutation, no new user turn or generation. This accepts the
specific empty-Send correction on production rather than merely invoking its
handler. Zero page exceptions in the completed three-scenario run.

## Receiving review and additional defect

The three earlier integration changes are accepted within their stated scope:
ancestor checks, production asset identity, green full suite and real empty
submission behavior agree. The two-browser receipt clearly identifies its
stubbed environment; it is not silently promoted into production proof.
No 300 scoring or re-grading was performed; the broad opening and Annie UGC
continuations were not taken as replacement work.

An earlier probe at 20:05:13.829Z hit a real save refusal before generation:
project 5c8c18f7-8c6a-47a7-9295-7b97ab2ddabf displayed raw `STALE_VERSION`
and offered Resume, while SQL/member readback showed only the earlier greeting
saved. Its exact race cause is unknown. A later initialization/title-wait
change in the test harness is not a demonstrated repair of that underlying
race. Another probe stopped waiting for a hidden Saved status element; fixed
the harness to wait for its text, not its visibility. Neither probe is counted
as a generation-fault pass.

The wrong recovery line was independently reproduced at 20:13:29.204Z by a
tab-scoped PATCH409 refusal, zero generation calls, unchanged saved record:

> STALE_VERSION Step paused on Raw story before StorySculpt finished replying. Your last answer (“Synthetic save-conflict check: I kept making an…”) is kept. Press Resume this step to continue from Raw story.

Narrow correction in `js/storysculpt.js`: explain that the latest answer is
visible in this tab but unsaved, tell the member to copy it before reloading,
and do not offer a generation retry for a refused save. The database's conflict
guard remains unchanged; no stale overwrite, automatic merge, schema or
authorization change. The script cache key is moved with this client change.

The candidate client passed the same controlled refusal at 20:12:14.439Z:

> A newer copy of this chat was saved. Your latest answer is still visible in this tab, but has not been saved. Copy your answer before reloading to see the newer saved chat. Nothing newer was overwritten.

That candidate-only run replaced the JS in its own tab. It is not a deployed
fix claim. The real saved record had no new answer, the page retained the
answer visibly, zero generation calls and no Resume button. Final candidate,
full suite and deployed verification receipts are recorded below after the
release. Independent acceptance of this new Afternoon artifact belongs to the
named Evening lane; the full WBR-462 card remains open.
