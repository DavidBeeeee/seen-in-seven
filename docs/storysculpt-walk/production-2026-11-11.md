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

## Deployed correction and final re-walk

The final candidate-only save-refusal check passed with no database overwrite
or generation request. The correction was pushed in f6251e85e3885885ae54bb19947a1598ef2b9ed0.
Vercel independently reports production deployment
`dpl_F3xDmMh6EXpUPXK9NFuzB9xqL1Ud` READY for that exact main commit, alias
studio.coloradomastermind.com. The served JS SHA256 is now
`bc5e940854fc52198ac7ae647b571def358f39f54ffa0d4cefd95fea92237c5b`,
matching the local corrected JS exactly.

At 20:16:28.349Z the real deployed client passed the controlled PATCH409
regression without a client override. It displayed the full corrected line
above; the answer stayed visible, the independently read database had only
the earlier greeting, and no generation or Resume control appeared.

A second complete live fault walk after that client change passed all three
assigned cases between 20:16 and 20:17 UTC. Both real Resume calls kept their
original generation keys and a single saved answer; empty and whitespace
Send made zero generation requests. No page exceptions. These repeats have
a specific reason: a new client recovery branch was deployed, so its neighboring
connection/503 behavior was rechecked rather than assumed unchanged.

Release sequencing correction: the first client commit was pushed before a
full-suite failure was resolved. The remaining failure was the progress check
still pinning the earlier script cache name. This was my sequencing error;
the two product Git hooks being green did not establish a green `npm test`.
The existing progress assertion now names the actual new client cache key,
without dropping any check. `npm test` then exited zero across the complete
suite, including pretest, state, release, progress and member checks. An earlier
VM-isolated save-status fixture also exposed a new helper dependency; the
recovery predicate is now self-contained so that fixture remains executable.
No frozen prompt, blueprint, database, entitlement or safety rule changed.

Evening receiving review: inspect this exact committed receipt and narrow JS
diff, replay the scoped save-conflict case if needed, and record independent
acceptance on WO-20261111-afternoon. The original rapid title-save conflict's
root cause remains unknown. Do not call this wording correction a repair of
that race, and do not infer feature-wide acceptance or a new 300 grade.

## Evening receiving review (2026-11-12 ~04:00Z): ACCEPTED

Reviewed by the 11-11 evening, not rebuilt. Independently checked:
the served `/js/storysculpt.js?v=wbr462-save-conflict-20261111-v1` SHA256 is
`bc5e940854fc52198ac7ae647b571def358f39f54ffa0d4cefd95fea92237c5b`, identical
to `js/storysculpt.js` on origin/main 2381b06 (f6251e8..2381b06 touches only
this receipt and one progress check, no client code); `npm test` exits 0 on
that tree plus the evening's Developer 65 check. The receipt's limits are
stated honestly (tab-scoped client faults, not a provider outage). Accepted
within that scope. One open item carried, not a defect in this artifact: the
20:05:13Z `STALE_VERSION` save refusal's race cause is still unknown; the
afternoon fixed the line the member reads, not the race.
