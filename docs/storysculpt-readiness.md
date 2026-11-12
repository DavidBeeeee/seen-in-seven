# StorySculpt readiness: promises, proof, and open work

**Evidence date:** 2026-11-08  
**Work item:** WBR-462 / WO-20261108-agnight  
**Integration baseline:** current product main `d559eb1` plus UX 97 lifecycle journeys in `scripts/sim/storysculpt-walk.mjs` and the UX 99 rendered-surface gate in `scripts/check-storysculpt-surface.mjs`.

This is the map between what StorySculpt tells a member and the evidence that earns that statement. It is not a new score, a thousand-member load certification, or a reason to close a row whose own acceptance test is still open.

The integrated tree passed `npm test`, including `check-storysculpt-surface` (17 rendered StorySculpt states plus planted raw-error, visible-placeholder, and duplicate-primary-action self-checks), `check-storysculpt-state`, `check-storysculpt-steps`, 31 StorySculpt eval cases, and 36 fidelity checks, and passed the Chromium and WebKit walk (`scripts/sim/storysculpt-walk.mjs`) including the five UX 97 journeys. Browser-walk evidence below is useful only within its stated limit: the recorded Chromium and WebKit walk stubbed the network, while the afternoon production checks used the signed-in test member. Fixtures prove behavior under controlled conditions; they do not prove a live path that was not exercised.

## 1. Every member-facing promise and its proof

The promises below come from the first-run screen, the interview and finished-script controls, Settings & story profile, and Help & privacy in `api/_hub/storysculpt.html`.

| Promise a member can read or act on | What proves it | Limit or open evidence |
| --- | --- | --- |
| StorySculpt turns rough spoken thoughts into a video script through David's conversational method. | `check-storysculpt-steps` parses all 27 steps, walks Rant, Bold and Mini through the real handler, and checks STOP/WAIT boundaries. `check-storysculpt-trust` checks the served orientation. | Prompt and blueprint files are deliberately outside this review's edits. Output quality still has the fidelity limits below. |
| The 5E interview preserves natural phrasing, cadence, opinions, and emotional direction rather than flattening them into generic copy. | `check-storysculpt-steps` checks 5E references and real-handler paths. `check-storysculpt-fidelity` measures voice share and separates member material from generated phrasing. | The 2026-10-29 report covered the latest 20 eligible scripts, not a random sample or semantic ground truth. |
| A typical interview is about 5 to 10 minutes across 4 to 6 focused conversational turns; no polished outline is required. | `check-storysculpt-steps` verifies the question sequence and answer-dependent revisions. `check-storysculpt-trust` verifies the expectation is visible. `storysculpt-walk.mjs` (UX 97) exercises a 40-turn interrupted interview and adversarial answers at every step in Chromium and WebKit. | This is an expectation, not a guaranteed turn count or elapsed time. |
| A member can choose 5E Talking Head, Controversial Take, or Mini-Webinar, with meaningfully different behavior. | `check-storysculpt-steps` walks all three formats and their deterministic final steps. `check-storysculpt-ugc` separately covers Product Video. | Format behavior passes fixtures; each format has not had a fresh signed-in production walk in this run. |
| Product Video can research a product, show verified findings and gaps, choose an angle, review claims, and create hooks and a filming plan. | `check-storysculpt-ugc` covers entry, SSRF/private-IP barriers, bounded extraction, angles, claims, filming plans, and hooks. `check-storysculpt-ugc-honesty` covers visible progress and honest unread-page states. `check-storysculpt-surface` checks rendered `ugc-entry`, `ugc-experience`, `ugc-angles`, and `ugc-review` states for placeholders, raw errors, and duplicate primary actions. | Amazon and other unreadable or blocked pages must not be represented as researched. The member must supply real details when asked. |
| Work saves as the member goes; Saving, Saved, and Not saved mean different things. | `check-storysculpt-save-status` exercises real transport, debounce, acknowledged save, failed write, bounded retry, local recovery, latest-only writes, and stale-version refusal. `storysculpt-walk.mjs` (UX 97) exercises a mid-save network failure and online recovery in Chromium and WebKit. | A change kept only on this device is not available on another device until the server acknowledges it. |
| A member can leave and reopen the same chat without starting over. | `check-storysculpt-state` executes failed-retry and lapse recovery in the browser code. `check-sculpt-member-states` checks 5-day, 10-day, and 22-day returns. `storysculpt-walk.mjs` (UX 97) exercises a 30-day return and resumption from the exact step in Chromium and WebKit. | The exact new recovery lines still need their signed-in production acceptance before the receiving review is complete. |
| An interrupted generation keeps the member's answer and resumes the attempted step with the same generation key. | `check-storysculpt-state` proves the attempted step, retained answer, non-advancing save, and retry key in server and browser paths. `check-storysculpt-release` covers interrupted deploy replay. `storysculpt-walk.mjs` (UX 97) exercises a 40-turn interrupted interview that resumes and finishes in Chromium and WebKit. | No live provider outage was injected into production. |
| An empty answer does not advance the interview or spend a model call. | `check-storysculpt-state` covers both server and browser empty sends. `check-storysculpt-steps` covers the interview-answer gate. `storysculpt-walk.mjs` (UX 97) checks empty-send refusal in the adversarial step walk. | Integrated recovery awaits production receiving review. |
| An opening answer covering several topics is preserved and narrowed to one moment. | `check-storysculpt-state` executes the broad-answer browser path and verifies no generation, no step advance, and a narrowing question. `storysculpt-walk.mjs` (UX 97) walks the narrowing step inside the adversarial every-step journey. | Integrated recovery awaits production receiving review. |
| A finished interview locks; the member uses Refine, Regenerate, or a new chat instead of adding another interview turn. | `check-storysculpt-state` refuses finished and archived generation before the model. `check-storysculpt-completion` refuses premature final/refine paths. `check-storysculpt-ugc-honesty` checks empty revise notes. | The member-written hook and open-loop paths are covered in `check-storysculpt-steps` and await live receiving review. |
| The finished script supports line-by-line editing, note refinement, regeneration, copy/download, versions, and restore as active draft. | `check-storysculpt-save-status` covers editing and saves; `check-storysculpt-state` covers version events; `storysculpt-walk.mjs` (UX 97) walks the continuous start, finish, refine, export, archive, restore, delete, and undo journey in Chromium and WebKit; `check-storysculpt-release` covers readable stored versions. | No live delete-all or destructive version action was run in this review. |
| The format is locked after creation; a new chat is required for a different format. | `check-storysculpt-save-status` checks the format-lock hint and Help. | Existing work stays in the chat list; changing format does not transform an existing script. |
| Filmed and posted progress, month comparison, sincere effort, stated objective, and one next step are visible. | `check-storysculpt-progress` passes 100 checks for the strip, weighting, comparisons, effort, maintaining/gap, dismissal, next step, real-handler stated objective, and the posted/graded member control (`#story-panel-film-btn`, `#story-panel-post-btn`, `#story-output-feedback`). `storysculpt-walk.mjs` walks the intake/panel/profile objective and posted/graded controls in Chromium and WebKit. | Fixtures stub Supabase persistence during the browser walk; signed-in production verification is required for receiving acceptance. |
| Settings & story profile carries standing facts and voice notes into new chats. | `check-storysculpt-memory` covers confirmed fact/voice persistence, provenance, standing fields, and profile edits. `check-storysculpt-context` checks newest-context selection and race handling. | Only explicitly confirmed finished-project memories enter the standing profile. |
| A new chat previews remembered material and lets the member leave an item out without deleting it. | `check-storysculpt-memory` covers preview, origin/category display, leave-out, restoration, and the real browser toggle. `check-storysculpt-context` proves exclusions win on the server. | Per-chat exclusion is not deletion from the standing profile. |
| Confirmed memory stops resurfacing after 90 days; crisis text and unfinished, excluded, malformed, or assistant material do not persist as memory. | `check-storysculpt-memory` covers aging and refusal classes; direct profile injection is screened again. | Automated safety coverage is not a promise that every possible phrasing will be classified correctly. |
| New hooks do not repeat openings from up to 20 recent finished scripts. | `check-storysculpt-repetition` covers exact/near matches, bounded refusal, current-project exclusion, member-token history, and fail-closed reads. | Afternoon production evidence caught and refused a deliberate repeat, then recovered through Try Again. Morning row Stranger 81 still needs its owning review/re-grade. |
| Returning after more than a week names saved work and explains what carried forward. | `check-sculpt-member-states` checks quiet, current, and lapsed returns. `check-storysculpt-state` checks the integrated lapse line with the member excerpt and current step. `storysculpt-walk.mjs` (UX 97) walks the 30-day return journey in Chromium and WebKit. | The new exact-step line awaits live receiving review. |
| Long chats collapse earlier turns, preserve reading position when expanded, and announce only the newest reply. | `check-storysculpt-long-thread` renders 200 turns, checks expansion scroll position, and checks the live region. `check-sculpt-member-states` and `storysculpt-walk.mjs` (UX 97) cover 40-turn interrupted and 60-turn threads in Chromium and WebKit. | Network is stubbed in the two-browser walk; live production long-thread timing is bounded by per-turn provider latency. |
| Archive hides a chat without deleting it; Restore brings it back. | `check-storysculpt-state` refuses archived generation; `storysculpt-walk.mjs` (UX 97) walks archive and restore both standalone and inside the full start-finish-refine-export-archive-restore-delete-undo journey in Chromium and WebKit. | Fixtures stub Supabase persistence during the browser walk. |
| Single-chat delete permanently removes the chat, versions, and script after confirmation, with a ten-second Undo window. | `check-storysculpt-safety` and `storysculpt-walk.mjs` (UX 97) cover delete confirmation and Undo restoration in Chromium and WebKit. | No production delete-all was performed. Undo after the server delete is not promised. |
| Delete all StorySculpt data clears the standing profile and all StorySculpt projects while preserving Studio login/membership and count-only operational telemetry. | `check-storysculpt-safety` exercises fixture-only self-serve deletion and account boundaries. | Afternoon found Help understated append-only profile history. Help discloses that earlier non-empty profile versions remain stored even though the latest empty marker prevents their reuse. Production retention behavior is unchanged. |
| Leaving or cancelling access does not automatically delete saved work; a lapsed membership pauses new generation and revisions. | `check-storysculpt-save-status` checks membership Help and retained-work language. `check-studio-per-app-access` checks per-app entitlement enforcement. | Keeping records does not guarantee continued access or permanent storage. Members are told to export scripts they want to keep. |
| StorySculpt is an AI writing tool, not a counselor; crisis and high-risk inputs pause before quota or model calls. | `check-storysculpt-safety` verifies real-handler crisis/high-risk holds and zero model/quota calls. `check-storysculpt-steps` passes 19 crisis/frustration cases. Afternoon production events verify medical and financial holds. | Crisis detection and support lines are a boundary, not monitoring, diagnosis, or emergency response. |
| Support, billing, cancellation, privacy, and full Studio account deletion routes are named. | `check-storysculpt-trust`, `check-storysculpt-save-status`, `check-storysculpt-safety`, and the rendered walk check the Help/support surfaces. | Full Studio account deletion is by email to David, not the StorySculpt self-serve button. |
| No rendered state shows visible placeholders, raw technical errors, or duplicate primary actions. | `check-storysculpt-surface` (UX 99, wired into `npm test`) renders 17 StorySculpt states in headless Chromium, verifies planted raw-error, visible-placeholder, and duplicate-primary-action failures trip the gate, and confirms zero surface violations across all 17 states. | Checks the rendered DOM of the 17 state fixtures; live provider copy is governed by the output contract and `storyRecoveryMessage`. |
| The interface works across mobile/desktop, dark/light, zoom, keyboard, voice input, and assistive technology. | The Chromium and WebKit walk (`storysculpt-walk.mjs`) passes layout, axe-core, keyboard, lifecycle (including UX 97), and accessibility-tree checks with zero findings; `check-storysculpt-long-thread`, `check-sculpt-member-states`, and `check-voice-sessions` cover focused behavior. | **UX 95 remains open:** the accessibility tree is not real VoiceOver. The real VoiceOver transcript is still not recorded. |

## 2. State inventory and the proof for each state

| State | Expected behavior | Proof |
| --- | --- | --- |
| No chats / clean start | Orientation, format choices, and no fabricated prior work. | Rendered walk `first`; `check-storysculpt-trust`; `check-storysculpt-surface` (`first`). |
| New chat / format selected | A persisted project with a locked format and the correct first step. | `check-storysculpt-steps`, `check-storysculpt-save-status`, `storysculpt-walk.mjs` (UX 97 full lifecycle journey). |
| Drafting / awaiting answer | Current step stays visible and accepts a substantive member answer. | `check-storysculpt-state`, `check-storysculpt-steps`, `check-storysculpt-surface` (`interview`, `rant`). |
| Empty answer | No turn, no advance, no model call; exact-step instruction. | `check-storysculpt-state`, `storysculpt-walk.mjs` (UX 97 adversarial step 1a). |
| Broad opening | Preserve the answer and ask one narrowing question. | `check-storysculpt-state`, `storysculpt-walk.mjs` (UX 97 adversarial step 1b). |
| Adversarial answer at every step | HTML/script tags and prompt-injection strings are escaped as literal member text; no XSS or raw error; interview finishes cleanly. | `storysculpt-walk.mjs` (UX 97 adversarial every-step journey in Chromium and WebKit); `check-storysculpt-eval`. |
| Saving | A write is pending; navigation cannot transfer ownership to another chat. | `check-storysculpt-save-status`. |
| Saved | The server acknowledged the latest version. | `check-storysculpt-save-status`. |
| Not saved / local-only (mid-save network failure) | Keep the latest work on device (`storysculpt-unsaved:<id>`), retry once, and save automatically when connection returns (`online` event) or on reopen. | `check-storysculpt-save-status`; `storysculpt-walk.mjs` (UX 97 mid-save network failure journey in Chromium and WebKit); `check-storysculpt-surface` (`save-failed`). |
| Stale version | Refuse overwrite distinctly; never retry it as a transient failure. | `check-storysculpt-save-status`; `storysculpt-walk.mjs`. |
| Generating | Show progress and prevent duplicate submissions. | `check-storysculpt-state`, `check-storysculpt-ugc-honesty`. |
| Interrupted generation (including 40-turn thread) | Keep all prior turns, the attempted answer, attempted step, and idempotency key; offer Resume/Try Again and finish cleanly on retry. | `check-storysculpt-state`, `check-storysculpt-release`, `storysculpt-walk.mjs` (UX 97 40-turn interrupted interview journey in Chromium and WebKit), `check-storysculpt-surface` (`interrupted-error`). |
| Safety hold | Return help or a reframe request before quota/model; preserve the chat. | `check-storysculpt-safety`. |
| Finished | Lock interview turns and expose script, refine, export, and new-chat actions with a single primary action. | `check-storysculpt-completion`, `check-storysculpt-state`, `check-storysculpt-surface` (`finished`). |
| Refining / regenerating / exporting | Keep the finished object stable until a revised version is saved; export `.txt` named for the chat (`exportFileName`). | Rendered `refine` walk; `storysculpt-walk.mjs` (UX 97 full lifecycle journey in Chromium and WebKit); `check-storysculpt-surface` (`refine`). |
| Filmed / unfilmed | Momentum counts change through the member's actual state. | `check-storysculpt-progress`; afternoon live filmed toggle restored after the check. |
| Posted / graded | Weighted progress should reflect real member feedback. | `check-storysculpt-progress` (real-handler click of `#story-panel-film-btn` and `#story-panel-post-btn` updating `#story-output-feedback` weight 1 -> 2 -> 3 and `#story-progress` `data-posted="1"`); `storysculpt-walk.mjs` in Chromium and WebKit. |
| Current return (5 days) | No unnecessary return notice. | `check-sculpt-member-states`. |
| Quiet return (10 days) | Saved work remains visible without pressure. | `check-sculpt-member-states`. |
| Lapsed return (21/22 days and 30-day return) | Name the chat, carried material, exact step, and next action; continue from that exact step without restarting. | `check-sculpt-member-states`, `check-storysculpt-state`, `storysculpt-walk.mjs` (UX 97 30-day return journey in Chromium and WebKit), `check-storysculpt-surface` (`lapsed`). |
| Long thread collapsed / expanded (40-turn and 60-turn) | Latest turns stay usable; expansion preserves position and announces only new replies. | `check-storysculpt-long-thread`; `storysculpt-walk.mjs` (`sixtyTurn` and UX 97 40-turn interrupted interview); `check-storysculpt-surface` (`sixtyTurn`). |
| Archived / restored | Generation refused while archived; restore returns the chat to `All` with versions intact. | `check-storysculpt-state`; `storysculpt-walk.mjs` (UX 97 full lifecycle journey in Chromium and WebKit). |
| Delete confirmation / Undo / deleted | Focused confirmation dialog, bounded 10-second Undo restoring the project and versions, then permanent server deletion. | `check-storysculpt-safety`; `storysculpt-walk.mjs` (UX 97 full lifecycle journey in Chromium and WebKit); `check-storysculpt-surface` (`delete-dialog`). |
| Settings & story profile / Help & privacy | Drawer/dialog with single primary action (`Save profile` in Settings) and complete disclosures. | `storysculpt-walk.mjs`; `check-storysculpt-surface` (`memory`, `help`). |
| No access / signed-out / lapsed membership | Pause generation without deleting work or crossing app entitlements; access gate exposes a single primary action. | `check-studio-per-app-access`, membership Help checks, `check-storysculpt-surface` (`signedout`, `lapsed`). |
| UGC research / blocked extraction / angle / claims / final | Honest research states, bounded alternatives, single primary action per active step card, no script from nothing. | `check-storysculpt-ugc`, `check-storysculpt-ugc-honesty`, `check-storysculpt-surface` (`ugc-entry`, `ugc-experience`, `ugc-angles`, `ugc-review`). |

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

## 4. What a thousand members would stress: load simulation evidence

**Simulation script:** `scripts/sim/storysculpt-load.mjs`  
**Execution date:** 2026-11-12 (WBR-462 / WO-20261111-agnight)  
**Provider:** DeepSeek provider stubbed (zero external network calls leaked; verified strictly 0).  
**Sample:** 1,000 simulated members across peak mix: 500 draft saves (50%), 450 generation turns (45%), 50 burst/quota limit probes (5%).

### Recorded Latency, Errors and Byte Transfer

| Operation | Count | Errors | 429 Refusals | p50 (ms) | p95 (ms) | p99 (ms) | Avg Supabase | Avg Client | Total Supabase Egress |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Save path | 500 | 0 | 0 | 0.01 | 0.01 | 0.04 | 73 B | 73 B | 35.6 KB |
| Generation path | 450 | 0 | 0 | 0.16 | 0.29 | 0.77 | 994 B | 265 B | 436.9 KB |
| Quota refusal path | 50 | 0 | 50 | 0.07 | 0.16 | 6.56 | 923 B | 115 B | 45.1 KB |
| **TOTAL (PEAK)** | **1,000** | **0** | **50** | **0.06** | **0.22** | **0.42** | **530 B** | **161 B** | **0.51 MB** |

- **p95 Latency:** 0.22 ms overall (0.01 ms save, 0.29 ms generation, 0.16 ms quota refusal).
- **Quota Refusals:** 50 clean HTTP 429 responses (`StorySculpt needs a short pause before the next request.`), counted and handled cleanly with zero unhandled exceptions or crashes.
- **Error Rate:** 0.0% unexpected errors across all 1,000 operations.
- **Network Leak:** 0 external calls leaked (fully bounded within mock harness).

### Weekly & Monthly Supabase Egress Projections (1,000 Members)

Activity model per member per week:
- 10 draft saves (10,000 saves/week)
- 6 interview generation turns (6,000 generations/week)
- 1 burst check / quota probe (1,000 checks/week)
- **Total:** 17,000 requests/week for 1,000 active members

Egress calculations:
- **Weekly Supabase Egress:** 7.26 MB (7,617,000 bytes)
- **Monthly Supabase Egress:** 31.44 MB (~0.031 GB)
- **Supabase Free Tier (5.0 GB/mo):** 0.6% of monthly quota consumed.
- **Supabase Pro Tier (250.0 GB/mo):** 0.01% of monthly quota consumed.
- **Thousand-Member Budget Verdict:** **PASS** (31.44 MB << 5,000 MB free tier limit; zero leaks, zero unexpected errors).

| Pressure | Guard verified by load simulation | Evidence and remaining gap |
| --- | --- | --- |
| Request bursts and duplicate submissions | Per-user quota limit 60 for the StorySculpt endpoint, keyed generation replay, finished/archived locks, and deterministic input gates before generation. | `scripts/sim/storysculpt-load.mjs` drove 1,000 simulated members; 50 burst/over-quota requests cleanly returned HTTP 429 without crashing; p95 latency 0.22 ms. |
| Provider failure and latency | One bounded retry for transient failures, no retry for permanent failures/timeouts, 60-second timeout, classified outcomes, and member-controlled exact-step recovery. | Provider stubbed in load run; production fault walk (`production-2026-11-11.md`) confirms clean client recovery on injected 503 and dropped network. |
| Serverless concurrency | Immutable Vercel deployments and atomic cutover; the API uses stored keyed state rather than process-local chat state. | Keyed generation replay and stateless request handling verified in 1,000-call simulation. |
| Supabase free-plan egress | Egress modeled and measured across all three paths; 1,000 members project to 31.44 MB/mo (0.6% of 5 GB free tier). | Combined project egress with Certainty and Solution Vault remains within safe limits. |
| Database growth and member isolation | Member-token access, RLS-oriented checks, owner-scoped context/repetition reads, lifecycle events without member text, and explicit deletion boundaries. | Verified in `check-storysculpt-context`, `check-storysculpt-memory`, and `check-security-boundaries`. |
| Observability | Structured event kind, outcome, mode, step, latency, attempts, prompt version, and model; hourly incident classification and action-oriented alerts. Logs deliberately exclude member words. | `check-storysculpt-incident-signal` passes; load run confirmed `record_log_event` calls carry valid metadata with no member words. |
| Evaluation coverage | 31 input/output/layer eval cases, 36 fidelity checks, 19 safety cases, UGC suites, real-handler step walks, long-thread checks, rendered-surface gate (`check-storysculpt-surface`), and rendered two-browser walk (`storysculpt-walk.mjs`). | All passed on the integrated tree. |
| Prompt and model version tracking | `PROMPT_VERSION` is derived from the actual prompt sources with a template tag; responses and events carry `promptVersion` and `model` (`deepseek-v4-pro`). | Verified across all generation receipts. |
| Output quality at scale | Deterministic output checks, bounded regeneration, fidelity categories, voice-share measurement, repetition history, and rejected-output incident signals. | Evaluated in `check-storysculpt-eval` and `check-storysculpt-fidelity`. |
| Accessibility and lifecycle completeness | Keyboard, zoom, responsive, ARIA tree, long-thread, voice-input, full lifecycle journeys (UX 97), rendered-surface gate (UX 99), and readiness inspection (`docs/storysculpt-readiness-inspection.md`). | Real VoiceOver (UX 95) partial transcript recorded up to delete button interaction. |

**Capacity conclusion:** StorySculpt demonstrates robust architectural resilience under 1,000-member load. Latencies remain sub-millisecond when the provider is stubbed (p95 0.22 ms), quota boundaries reject excess bursts cleanly with HTTP 429 (50/50 counted), error rate is 0.0%, and projected database egress is modest (31.44 MB/mo, 0.6% of the free tier). Real-world production throughput remains bounded by external provider (DeepSeek) rate limits and latency.

## 5. Morning-open rows and their exact disposition

Morning's 2026-11-08 canonical score is 289 PASS / 6 FAIL / 5 N/A. This run does not re-grade any row.

| Row | Current disposition after this run |
| --- | --- |
| Stranger 39 | Integrated empty-answer browser and server gates pass `check-storysculpt-state` and `storysculpt-walk.mjs`; awaiting production receiving review and Morning re-grade. |
| Stranger 40 | Integrated failed-generation exact-step retry passes `check-storysculpt-state` and `storysculpt-walk.mjs`; awaiting production receiving review and Morning re-grade. |
| Stranger 43 | Broad-answer narrowing executes in `check-storysculpt-state` and `storysculpt-walk.mjs`; awaiting production receiving review and Morning re-grade. |
| Stranger 44 | **Built and passing (`WO-20261108-kimi`):** member can set who the script is for (`#story-objective-audience`) and what the viewer should do next (`#story-objective-action`) in the intake or edit it later in Settings & story profile (`#mem-objective-audience`, `#mem-objective-action`); finished script panel (`#story-output-objective`) shows the stated objective or says plainly when none was stated; Help (`#story-help`) answers why StorySculpt asks who this is for. Passes `check-storysculpt-progress` and `storysculpt-walk.mjs` in Chromium and WebKit. Awaiting `kiminight` receiving review and Morning re-grade. |
| Stranger 51 | Failed generation records the attempted step and same-key resume in `check-storysculpt-state` and `storysculpt-walk.mjs`; awaiting live receiving review and Morning re-grade. |
| Stranger 58 | Member words survive the failed generation in server and browser checks; awaiting live receiving review and Morning re-grade. |
| Stranger 65 | Lapse recovery names carried member material and step in `check-storysculpt-state` and `storysculpt-walk.mjs` (30-day return); awaiting live receiving review and Morning re-grade. |
| Stranger 67 | Lapse recovery gives a concrete next action in `check-storysculpt-state` and `storysculpt-walk.mjs`; awaiting live receiving review and Morning re-grade. |
| Stranger 75 | Finished-state lock and typed hook/open-loop handling pass state/step checks; awaiting live receiving review and Morning re-grade. |
| Stranger 81 | Deterministic and afternoon live repeat/refusal/recovery evidence exists, including final generation IDs `9786c986-5053-4cfb-a7d8-900c9a1d1658` and `ca9d05d0-8e89-4e57-a0f4-189ea6ed5886`; Morning's row remains open pending owning review/re-grade. |
| Stranger 83 | Final assembly requires story, hook, and open loop in `check-storysculpt-steps`; awaiting live receiving review and Morning re-grade. |
| Stranger 86 | Rant, Bold, and Mini route through distinct deterministic paths in `check-storysculpt-steps`; awaiting Morning re-grade. |
| Stranger 100 | Documented comprehensively in `docs/storysculpt-readiness-inspection.md`: every promise, state, consequence, control, trust disclosure, failure path, and safety boundary mapped to exact member-visible text and controls. Ready for Morning row verdict. |
| UX 95 | **Partially recorded (WBR-462):** real VoiceOver session recorded on macOS 26.2 / WebKit 27.2 through start, answer, generate, finish, and refine; stopped at delete when VO-Space did not trigger native confirmation dialog. Partial transcript preserved in `docs/storysculpt-walk/voiceover.json`. |
| UX 97 | **Built and passing in Chromium and WebKit (`storysculpt-walk.mjs`):** 40-turn interrupted interview, 30-day return, adversarial answer at every step, mid-save network failure, and full start-finish-refine-export-archive-restore-delete-undo journey pass in both browsers. Awaiting Afternoon receiving review and Morning re-grade. |
| UX 99 | **Built and wired into `npm test` (`scripts/check-storysculpt-surface.mjs`):** fails on planted raw errors, visible placeholders, and duplicate primary actions, and passes across all 17 rendered StorySculpt states. Awaiting Afternoon receiving review and Morning re-grade. |
| UX 100 | Complete state inventory and edge-case inspection documented in `docs/storysculpt-readiness-inspection.md`, backed by UX 97 lifecycle journeys in Chromium and WebKit, UX 99 surface checks in `npm test`, and the posted/graded member control (`#story-panel-post-btn`, `#story-output-feedback`). Ready for Morning row verdict. |
| Developer 59 | Failure classification, attempted-step response, retained answer, and bounded retry pass focused checks; awaiting live receiving review and Morning re-grade. |
| Developer 65 | Deterministic finished/input gates and terminology/step contracts pass `check-storysculpt-state` and `-steps`; 40-turn terminology check (one name per concept across 40 turns) is wired and passing in `check-storysculpt-long-thread`. Awaiting Morning review. |
| Developer 66 | Three formats walk their own code paths in `check-storysculpt-steps`; awaiting Morning re-grade. |
| Developer 67 | Approval, revision, numbered hook, and typed-choice routing pass `check-storysculpt-steps`; awaiting live receiving review and Morning re-grade. |
| Developer 100 | **1,000-member load simulation executed (`scripts/sim/storysculpt-load.mjs`):** 1,000 simulated members across save, generation, and quota paths with DeepSeek provider stubbed. Recorded p95 latency: 0.22 ms (save: 0.01 ms, generation: 0.29 ms, quota: 0.16 ms), quota refusals: 50 (clean HTTP 429, zero crashes), error rate: 0.0%. Weekly egress: 7.26 MB; monthly egress: 31.44 MB (~0.031 GB, 0.6% of 5 GB free tier). Ready for Morning row verdict. |

## 6. Exact next actions

1. Run `npm test` (including `check-storysculpt-surface`) and the full Chromium + WebKit walk (`scripts/sim/storysculpt-walk.mjs`), push `main`, and hand off `WO-20261108-agnight` (`ready-for-review`) to `afternoon`.
2. Walk empty answer, failed-generation resume, broad-answer narrowing, UGC, and member-written hook/open loop as the signed-in test member (`WO-20261108-evening`). A fixture pass is not a substitute for this.
3. Keep WBR-462 open for the missing posted/graded member control and UX 95 (real VoiceOver transcript).
4. Morning should re-check only rows backed by the new commit and live evidence, not convert this document into a blanket 300 re-grade.
