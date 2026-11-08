# StorySculpt readiness: promises, proof, and open work

**Evidence date:** 2026-11-07  
**Work item:** WBR-462 / WO-20261107-kiminight  
**Integration baseline:** current product main `0456efd` plus reviewed recovery `2836942`, merged locally as `31f25f7`.

This is the map between what StorySculpt tells a member and the evidence that earns that statement. It is not a new score, a thousand-member load certification, or a reason to close a row whose own acceptance test is still open.

The integrated tree passed `npm test`, including `check-storysculpt-state`, `check-storysculpt-steps`, 31 StorySculpt eval cases, and 36 fidelity checks. Browser-walk evidence below is useful only within its stated limit: the recorded Chromium and WebKit walk stubbed the network, while the afternoon production checks used the signed-in test member. Fixtures prove behavior under controlled conditions; they do not prove a live path that was not exercised.

## 1. Every member-facing promise and its proof

The promises below come from the first-run screen, the interview and finished-script controls, Settings & story profile, and Help & privacy in `api/_hub/storysculpt.html`.

| Promise a member can read or act on | What proves it | Limit or open evidence |
| --- | --- | --- |
| StorySculpt turns rough spoken thoughts into a video script through David's conversational method. | `check-storysculpt-steps` parses all 27 steps, walks Rant, Bold and Mini through the real handler, and checks STOP/WAIT boundaries. `check-storysculpt-trust` checks the served orientation. | Prompt and blueprint files are deliberately outside this review's edits. Output quality still has the fidelity limits below. |
| The 5E interview preserves natural phrasing, cadence, opinions, and emotional direction rather than flattening them into generic copy. | `check-storysculpt-steps` checks 5E references and real-handler paths. `check-storysculpt-fidelity` measures voice share and separates member material from generated phrasing. | The 2026-10-29 report covered the latest 20 eligible scripts, not a random sample or semantic ground truth. |
| A typical interview is about 5 to 10 minutes across 4 to 6 focused conversational turns; no polished outline is required. | `check-storysculpt-steps` verifies the question sequence and answer-dependent revisions. `check-storysculpt-trust` verifies the expectation is visible. | This is an expectation, not a guaranteed turn count or elapsed time. Long and interrupted journeys remain UX 97 work. |
| A member can choose 5E Talking Head, Controversial Take, or Mini-Webinar, with meaningfully different behavior. | `check-storysculpt-steps` walks all three formats and their deterministic final steps. `check-storysculpt-ugc` separately covers Product Video. | Format behavior passes fixtures; each format has not had a fresh signed-in production walk in this run. |
| Product Video can research a product, show verified findings and gaps, choose an angle, review claims, and create hooks and a filming plan. | `check-storysculpt-ugc` covers entry, SSRF/private-IP barriers, bounded extraction, angles, claims, filming plans, and hooks. `check-storysculpt-ugc-honesty` covers visible progress and honest unread-page states. | Amazon and other unreadable or blocked pages must not be represented as researched. The member must supply real details when asked. |
| Work saves as the member goes; Saving, Saved, and Not saved mean different things. | `check-storysculpt-save-status` exercises real transport, debounce, acknowledged save, failed write, bounded retry, local recovery, latest-only writes, and stale-version refusal. | A change kept only on this device is not available on another device until the server acknowledges it. |
| A member can leave and reopen the same chat without starting over. | `check-storysculpt-state` executes failed-retry and lapse recovery in the browser code. `check-sculpt-member-states` checks 5-day, 10-day, and 22-day returns. | The exact new recovery lines still need their signed-in production acceptance before the receiving review is complete. |
| An interrupted generation keeps the member's answer and resumes the attempted step with the same generation key. | `check-storysculpt-state` proves the attempted step, retained answer, non-advancing save, and retry key in server and browser paths. `check-storysculpt-release` covers interrupted deploy replay. | No live provider outage was injected into production. |
| An empty answer does not advance the interview or spend a model call. | `check-storysculpt-state` covers both server and browser empty sends. `check-storysculpt-steps` covers the interview-answer gate. | Integrated recovery awaits production receiving review. |
| An opening answer covering several topics is preserved and narrowed to one moment. | `check-storysculpt-state` executes the broad-answer browser path and verifies no generation, no step advance, and a narrowing question. | Integrated recovery awaits production receiving review. |
| A finished interview locks; the member uses Refine, Regenerate, or a new chat instead of adding another interview turn. | `check-storysculpt-state` refuses finished and archived generation before the model. `check-storysculpt-completion` refuses premature final/refine paths. `check-storysculpt-ugc-honesty` checks empty revise notes. | The member-written hook and open-loop paths are covered in `check-storysculpt-steps` and await live receiving review. |
| The finished script supports line-by-line editing, note refinement, regeneration, copy/download, versions, and restore as active draft. | `check-storysculpt-save-status` covers editing and saves; `check-storysculpt-state` covers version events; the 2026-10-31 Chromium/WebKit walk covers finished and refine screens; `check-storysculpt-release` covers readable stored versions. | No live delete-all or destructive version action was run in this review. |
| The format is locked after creation; a new chat is required for a different format. | `check-storysculpt-save-status` checks the format-lock hint and Help. | Existing work stays in the chat list; changing format does not transform an existing script. |
| Filmed and posted progress, month comparison, sincere effort, and one next step are visible. | `check-storysculpt-progress` passes 88 checks for the strip, weighting, comparisons, effort, maintaining/gap, dismissal, and next step. | **Known live defect:** afternoon acceptance found no member control that assigns posted or graded feedback. Helper tests do not prove that integration. Do not close it on the 88 checks alone. |
| Settings & story profile carries standing facts and voice notes into new chats. | `check-storysculpt-memory` covers confirmed fact/voice persistence, provenance, standing fields, and profile edits. `check-storysculpt-context` checks newest-context selection and race handling. | Only explicitly confirmed finished-project memories enter the standing profile. |
| A new chat previews remembered material and lets the member leave an item out without deleting it. | `check-storysculpt-memory` covers preview, origin/category display, leave-out, restoration, and the real browser toggle. `check-storysculpt-context` proves exclusions win on the server. | Per-chat exclusion is not deletion from the standing profile. |
| Confirmed memory stops resurfacing after 90 days; crisis text and unfinished, excluded, malformed, or assistant material do not persist as memory. | `check-storysculpt-memory` covers aging and refusal classes; direct profile injection is screened again. | Automated safety coverage is not a promise that every possible phrasing will be classified correctly. |
| New hooks do not repeat openings from up to 20 recent finished scripts. | `check-storysculpt-repetition` covers exact/near matches, bounded refusal, current-project exclusion, member-token history, and fail-closed reads. | Afternoon production evidence caught and refused a deliberate repeat, then recovered through Try Again. Morning row Stranger 81 still needs its owning review/re-grade. |
| Returning after more than a week names saved work and explains what carried forward. | `check-sculpt-member-states` checks quiet, current, and lapsed returns. `check-storysculpt-state` checks the integrated lapse line with the member excerpt and current step. | The new exact-step line awaits live receiving review. |
| Long chats collapse earlier turns, preserve reading position when expanded, and announce only the newest reply. | `check-storysculpt-long-thread` renders 200 turns, checks expansion scroll position, and checks the live region. `check-sculpt-member-states` covers a 40-turn chat. | Long-duration and interrupted journeys are not yet the full lifecycle matrix requested by UX 97. |
| Archive hides a chat without deleting it; Restore brings it back. | `check-storysculpt-state` refuses archived generation; the rendered walk covers archive/restore controls; lifecycle event checks cover restore. | The full start-finish-refine-export-archive-restore-delete-undo browser journey remains UX 97. |
| Single-chat delete permanently removes the chat, versions, and script after confirmation, with a ten-second Undo window. | `check-storysculpt-safety` and the rendered walk cover delete and Undo behavior and Help. | No production delete-all was performed. Undo after the server delete is not promised. |
| Delete all StorySculpt data clears the standing profile and all StorySculpt projects while preserving Studio login/membership and count-only operational telemetry. | `check-storysculpt-safety` exercises fixture-only self-serve deletion and account boundaries. | Afternoon found Help understated append-only profile history. This run corrects Help to disclose that earlier non-empty profile versions remain stored even though the latest empty marker prevents their reuse. Production retention behavior is unchanged. |
| Leaving or cancelling access does not automatically delete saved work; a lapsed membership pauses new generation and revisions. | `check-storysculpt-save-status` checks membership Help and retained-work language. `check-studio-per-app-access` checks per-app entitlement enforcement. | Keeping records does not guarantee continued access or permanent storage. Members are told to export scripts they want to keep. |
| StorySculpt is an AI writing tool, not a counselor; crisis and high-risk inputs pause before quota or model calls. | `check-storysculpt-safety` verifies real-handler crisis/high-risk holds and zero model/quota calls. `check-storysculpt-steps` passes 19 crisis/frustration cases. Afternoon production events verify medical and financial holds. | Crisis detection and support lines are a boundary, not monitoring, diagnosis, or emergency response. |
| Support, billing, cancellation, privacy, and full Studio account deletion routes are named. | `check-storysculpt-trust`, `check-storysculpt-save-status`, `check-storysculpt-safety`, and the rendered walk check the Help/support surfaces. | Full Studio account deletion is by email to David, not the StorySculpt self-serve button. |
| The interface works across mobile/desktop, dark/light, zoom, keyboard, voice input, and assistive technology. | The recorded 2026-10-31 walk passed 94/94 Chromium/WebKit checks with zero findings; `check-storysculpt-long-thread`, `check-sculpt-member-states`, and `check-voice-sessions` cover focused behavior. | **UX 95 remains open:** the accessibility tree is not real VoiceOver. The real VoiceOver transcript is still not recorded. |

## 2. State inventory and the proof for each state

| State | Expected behavior | Proof |
| --- | --- | --- |
| No chats / clean start | Orientation, format choices, and no fabricated prior work. | Rendered walk `first`; `check-storysculpt-trust`. |
| New chat / format selected | A persisted project with a locked format and the correct first step. | `check-storysculpt-steps`, `check-storysculpt-save-status`. |
| Drafting / awaiting answer | Current step stays visible and accepts a substantive member answer. | `check-storysculpt-state`, `check-storysculpt-steps`. |
| Empty answer | No turn, no advance, no model call; exact-step instruction. | `check-storysculpt-state`. |
| Broad opening | Preserve the answer and ask one narrowing question. | `check-storysculpt-state`. |
| Saving | A write is pending; navigation cannot transfer ownership to another chat. | `check-storysculpt-save-status`. |
| Saved | The server acknowledged the latest version. | `check-storysculpt-save-status`. |
| Not saved / local-only | Keep the latest work on device and retry once; do not claim cross-device recovery. | `check-storysculpt-save-status`. |
| Stale version | Refuse overwrite distinctly; never retry it as a transient failure. | `check-storysculpt-save-status`. |
| Generating | Show progress and prevent duplicate submissions. | `check-storysculpt-state`, `check-storysculpt-ugc-honesty`. |
| Interrupted generation | Keep the answer, attempted step, and idempotency key; offer Resume/Try Again. | `check-storysculpt-state`, `check-storysculpt-release`. |
| Safety hold | Return help or a reframe request before quota/model; preserve the chat. | `check-storysculpt-safety`. |
| Finished | Lock interview turns and expose script, refine, export, and new-chat actions. | `check-storysculpt-completion`, `check-storysculpt-state`. |
| Refining / regenerating | Keep the finished object stable until a revised version is accepted and saved. | Rendered `refine` walk; `check-storysculpt-save-status`. |
| Filmed / unfilmed | Momentum counts change through the member's actual state. | `check-storysculpt-progress`; afternoon live filmed toggle restored after the check. |
| Posted / graded | Weighted progress should reflect real member feedback. | Helper logic only; **member control is still missing in live acceptance**. |
| Current return (5 days) | No unnecessary return notice. | `check-sculpt-member-states`. |
| Quiet return (10 days) | Saved work remains visible without pressure. | `check-sculpt-member-states`. |
| Lapsed return (21/22 days and later) | Name the chat, carried material, exact step, and next action. | `check-sculpt-member-states`, `check-storysculpt-state`. |
| Long thread collapsed / expanded | Latest turns stay usable; expansion preserves position and announces only new replies. | `check-storysculpt-long-thread`. |
| Archived / restored | Generation refused while archived; restore returns the chat. | `check-storysculpt-state`; rendered lifecycle walk. |
| Delete confirmation / Undo / deleted | Focused confirmation, bounded Undo, then permanent server deletion. | `check-storysculpt-safety`; screen-reader dry walk and rendered lifecycle checks. |
| No access / lapsed membership | Pause generation without deleting work or crossing app entitlements. | `check-studio-per-app-access`, membership Help checks. |
| UGC research / blocked extraction / angle / claims / final | Honest research states, bounded alternatives, no script from nothing. | `check-storysculpt-ugc`, `check-storysculpt-ugc-honesty`. |

## 3. Failure paths and safety boundaries

| Failure or boundary | Required result | Proof |
| --- | --- | --- |
| Empty or missing trailing member answer | Refuse before generation and keep the saved position. | `check-storysculpt-state`, `check-storysculpt-steps`. |
| Oversized input | Return a clear 400 input error. | `check-storysculpt-eval` broad/oversize case. |
| Premature final or refine | Refuse before quota/model; require the story, hook, and open loop. | `check-storysculpt-completion`, `check-storysculpt-steps`. |
| Finished/archived project receives interview input | Return 409 and route to the valid action. | `check-storysculpt-state`. |
| Temporary provider rate limit, 5xx, dropped connection, or empty reply | Retry automatically once within the bounded window. | `check-storysculpt-provider-retry`. |
| Permanent provider request/auth/billing/configuration failure | Do not retry; return a plain error and classify it. | `check-storysculpt-provider-retry`. |
| Provider timeout | Stop at 60 seconds, do not automatically wait a second minute, and keep the answer for member retry. | `check-storysculpt-provider-retry`, `check-storysculpt-state`. |
| Database read failure | Fail closed with a database-layer error rather than using unsafe posted context or disabling repetition history. | `check-storysculpt-eval`, `check-storysculpt-context`, `check-storysculpt-repetition`. |
| Save conflict or offline write | Preserve newer work, distinguish stale version, and retain unsaved work locally. | `check-storysculpt-save-status`. |
| Missing contract prefix, empty body, oversize output, invented credential/testimonial, wrong-step output | Reject before showing or saving as a valid answer. | `check-storysculpt-eval`, `check-storysculpt-fidelity`. |
| Reused member imagery or repeated earlier opening | Retry with the reason named; refuse a persistent duplicate without losing the answer. | `check-storysculpt-steps`, `check-storysculpt-repetition`; afternoon production event evidence. |
| Supported but still flagged inference/intensity after retry | Deliver only with the plain note required by the fidelity policy and count the rejection signal. | `check-storysculpt-fidelity` cases 32-36. |
| Crisis/self-harm/harm to others | No next script step or model call; show localized free help and emergency guidance; preserve the chat. | `check-storysculpt-safety`, `check-storysculpt-steps`. |
| Unsubstantiated medical cure or guaranteed-income claim | Hold before quota/model and ask for a truthful reframe. | `check-storysculpt-safety`; afternoon production safety event IDs `b4dbb6bd-37e8-4173-a936-3a8cd9f3ff8c` and `2c8e2c2f-ec53-46f1-b103-facd27029179`. |
| Identifiable private disclosure about another person | Pause before generation for de-identification or own-side reframing. | `check-storysculpt-safety` UX 91 cases. |
| Prompt injection / request for hidden instructions | Treat it as member material, preserve the output contract, and reject a contract-breaking model response. | `check-storysculpt-eval` adversarial cases. |
| UGC URL targeting a private/internal host or unreadable retailer | Block SSRF/private IP access and state what could not be read. | `check-storysculpt-ugc`. |
| Deploy interruption or mixed old/new client and API | Replay keyed work, reject stale overwrites, keep stored fields readable, and bump the client cache key with client changes. | `check-storysculpt-release`. |
| Operational incident | Separate provider, app, rejected-output, walkaway, and poor-output signals; tell the operator what to do. | `check-storysculpt-incident-signal`. |

## 4. What a thousand members would stress

| Pressure | Guard already present | Evidence and remaining gap |
| --- | --- | --- |
| Request bursts and duplicate submissions | Per-user quota limit 60 for the StorySculpt endpoint, keyed generation replay, finished/archived locks, and deterministic input gates before generation. | `check-storysculpt-state`, `check-storysculpt-completion`, and `check-storysculpt-release`. No thousand-concurrent-member load test has been run, so capacity is not certified. |
| Provider failure and latency | One bounded retry for transient failures, no retry for permanent failures/timeouts, 60-second timeout, classified outcomes, and member-controlled exact-step recovery. | `check-storysculpt-provider-retry` and `check-storysculpt-state`. Provider quota and actual saturation under production load remain unknown here. |
| Serverless concurrency | Immutable Vercel deployments and atomic cutover; the API uses stored keyed state rather than process-local chat state. | `docs/storysculpt-release.md` and `check-storysculpt-release`. This is an architecture guard, not observed thousand-member throughput. |
| Supabase free-plan egress | Shared-project egress ledger and 60/80/95 warning paths exist; client-reported reads are capped and sampled. | `check-certainty-egress` passes 9/9. There is no StorySculpt-specific thousand-member egress model or reconciliation with actual Supabase usage in this run. |
| Database growth and member isolation | Member-token access, RLS-oriented checks, owner-scoped context/repetition reads, lifecycle events without member text, and explicit deletion boundaries. | `check-storysculpt-context`, `check-storysculpt-memory`, `check-storysculpt-repetition`, and `check-security-boundaries`. Growth/vacuum/archival behavior at scale was not measured. |
| Observability | Structured event kind, outcome, mode, step, latency, attempts, prompt version, and model; hourly incident classification and action-oriented alerts. Logs deliberately exclude member words. | `check-storysculpt-incident-signal`, `check-storysculpt-state`, and response construction in `api/storysculpt.js`. No external uptime SLO or thousand-member alert-storm test was observed. |
| Evaluation coverage | 31 input/output/layer eval cases, 36 fidelity checks, 19 safety cases, UGC suites, real-handler step walks, long-thread checks, and a rendered two-browser walk. | All passed on the integrated tree. UX 97 lifecycle journeys and UX 99 rendered-surface gate remain open; fixtures do not replace live acceptance. |
| Prompt and model version tracking | `PROMPT_VERSION` is derived from the actual prompt sources with a template tag; responses and events carry `promptVersion` and `model`, currently `deepseek-v4-pro` in the provider call. | `check-storysculpt-release` checks mixed-version tracing. No historical prompt/model comparison dashboard or automatic rollback decision is claimed. |
| Output quality at scale | Deterministic output checks, bounded regeneration, fidelity categories, voice-share measurement, repetition history, and rejected-output incident signals. | `check-storysculpt-eval`, `check-storysculpt-fidelity`, and `check-storysculpt-repetition`. The fidelity sample is small and most recent, not random; false positives and novel evasions remain possible. |
| Accessibility and lifecycle completeness | Keyboard, zoom, responsive, ARIA tree, long-thread, and voice-input coverage already exists. | Real VoiceOver (UX 95), full lifecycle journeys (UX 97), and a rendered-surface placeholder/error gate (UX 99) are still missing. |

**Capacity conclusion:** the code has meaningful guards, but the honest thousand-member verdict is **not yet proven**. A load model must include provider concurrency/quota, actual Supabase egress and growth, event volume, and alert behavior before this becomes a capacity claim.

## 5. Morning-open rows and their exact disposition

Morning's 2026-11-07 canonical score is 267 PASS / 22 FAIL / 11 N/A. This run does not re-grade any row. The integrated recovery is merge commit `31f25f7`; the final commit and live deployment evidence belong in the structured handoff.

| Row | Current disposition after this run |
| --- | --- |
| Stranger 39 | Integrated empty-answer browser and server gates pass `check-storysculpt-state`; awaiting production receiving review and Morning re-grade. |
| Stranger 40 | Integrated failed-generation exact-step retry passes `check-storysculpt-state`; awaiting production receiving review and Morning re-grade. |
| Stranger 43 | Broad-answer narrowing executes in `check-storysculpt-state`; awaiting production receiving review and Morning re-grade. |
| Stranger 44 | **Still open:** no member intake/profile control yet states who the script is for and what the viewer should do next. |
| Stranger 51 | Failed generation now records the attempted step and same-key resume in `check-storysculpt-state`; awaiting live receiving review and Morning re-grade. |
| Stranger 58 | Member words survive the failed generation in server and browser checks; awaiting live receiving review and Morning re-grade. |
| Stranger 65 | Lapse recovery names carried member material and step in `check-storysculpt-state`; awaiting live receiving review and Morning re-grade. |
| Stranger 67 | Lapse recovery gives a concrete next action in `check-storysculpt-state`; awaiting live receiving review and Morning re-grade. |
| Stranger 75 | Finished-state lock and typed hook/open-loop handling pass state/step checks; awaiting live receiving review and Morning re-grade. |
| Stranger 81 | Deterministic and afternoon live repeat/refusal/recovery evidence exists, including final generation IDs `9786c986-5053-4cfb-a7d8-900c9a1d1658` and `ca9d05d0-8e89-4e57-a0f4-189ea6ed5886`; Morning's row remains open pending owning review/re-grade. |
| Stranger 83 | Final assembly requires story, hook, and open loop in `check-storysculpt-steps`; awaiting live receiving review and Morning re-grade. |
| Stranger 86 | Rant, Bold, and Mini route through distinct deterministic paths in `check-storysculpt-steps`; awaiting Morning re-grade. |
| Stranger 100 | This page maps support, money, privacy, and safety promises to checks. Live gaps remain explicit: posted/graded control, lifecycle coverage, and real VoiceOver. Row stays open for Morning judgment. |
| UX 95 | **Still open:** no real VoiceOver transcript. Accessibility-tree and dry WebKit evidence do not close it. |
| UX 97 | **Still open:** full 40-turn interrupted, 30-day return, adversarial-every-step, mid-save network failure, and complete lifecycle journeys are not built in this run. |
| UX 99 | **Still open:** `scripts/check-storysculpt-surface.mjs` and its rendered placeholder/raw-error/duplicate-action gate are not built in this run. |
| UX 100 | This page inventories states and their checks, but the unbuilt UX 97/99 coverage and known live defects remain open. Morning owns the row verdict. |
| Developer 59 | Failure classification, attempted-step response, retained answer, and bounded retry pass focused checks; awaiting live receiving review and Morning re-grade. |
| Developer 65 | Deterministic finished/input gates and terminology/step contracts pass `check-storysculpt-state` and `-steps`; long-thread terminology remains separately bounded by `check-storysculpt-long-thread` and Morning review. |
| Developer 66 | Three formats walk their own code paths in `check-storysculpt-steps`; awaiting Morning re-grade. |
| Developer 67 | Approval, revision, numbered hook, and typed-choice routing pass `check-storysculpt-steps`; awaiting live receiving review and Morning re-grade. |
| Developer 100 | This page names the scale guards and the missing load proof. No thousand-member claim is made; Morning owns the row verdict. |

## 6. Exact next actions

1. Deploy the integrated commit only after the final suite passes, confirm Vercel production READY, hash-match live `js/storysculpt.js` to that commit, and record the receiving verdict on WO-20261107-kimi.
2. Walk empty answer, failed-generation resume, broad-answer narrowing, UGC, and member-written hook/open loop as the signed-in test member. A fixture pass is not a substitute for this.
3. Keep WBR-462 open for the missing posted/graded member control and the UX 95/97/99 evidence gaps. The retention Help correction in this run discloses existing storage; it does not erase historical profile rows.
4. Morning should re-check only rows backed by the new commit and live evidence, not convert this document into a blanket 300 re-grade.
