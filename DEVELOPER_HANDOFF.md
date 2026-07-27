# SeenInSeven — Developer Handoff Document

**Prepared for:** Incoming developer  
**Project:** SeenInSeven — AI video script builder  
**Owner:** David Bee, Colorado Mastermind  
**Date:** June 2026, updated July 27, 2026
**Repo:** https://github.com/DavidBeeeee/seen-in-seven  
**Live app:** https://studio.coloradomastermind.com
**Studio admin:** https://studio.coloradomastermind.com/admin
**SeenInSeven admin:** https://studio.coloradomastermind.com/admin/seeninseven
**Contact:** contact@davidbee.me / 303-596-0511

---

## Roadmap source of truth

Before planning or implementing roadmap work, read `SEENINSEVEN_ROADMAP.md`.

This handoff remains the source of truth for architecture, stack, debugging history, and current implementation shape. Its older roadmap notes are partially superseded by `SEENINSEVEN_ROADMAP.md`, especially around admin priorities, test-user timing, delayed email nudges, delayed paid access, removed posted-vs-filmed work, and the placeholder-only gamification phase.

---

## July 18, 2026 implementation record: Studio, AI Boardroom, and Prompt Tester

This section records the complete Studio expansion completed on July 18, 2026. It supersedes older statements in this document that describe the superapp, unified administration, AI Boardroom, or prompt editing as future work.

### Final product shape

`studio.coloradomastermind.com` is now the master Colorado Mastermind Studio application. It provides one login and one home for all current and future tools. SeenInSeven is one app inside Studio, not the Studio itself. AI Boardroom is the second connected app.

| Surface | Purpose | Source |
|---------|---------|--------|
| `/` | Studio login and customer app hub | this repository |
| `/seeninseven` | Full SeenInSeven experience | this repository |
| `/boardroom` | Full AI Boardroom experience under the Studio domain | proxied to the `DavidBeeeee/boardroom2` Vercel app |
| `/admin` | Studio-wide customers, access, and app summaries | this repository |
| `/admin/seeninseven` | Detailed SeenInSeven progress and support admin | this repository |
| `/admin/seeninseven/prompt-tester` | Restricted prompt testing and publishing workspace | this repository |
| `/admin/boardroom` | AI Boardroom access and activity admin | this repository |

The two code repositories are deliberately separate:

- Studio, SeenInSeven, shared access, and all production Supabase migrations: `https://github.com/DavidBeeeee/seen-in-seven`
- Full AI Boardroom Next.js app: `https://github.com/DavidBeeeee/boardroom2`

`vercel.json` rewrites `/boardroom` and its child paths to `https://boardroom2.vercel.app/boardroom`. This lets Boardroom keep its own deployment while appearing under the Studio domain and using the same Studio Supabase session. Do not copy the Boardroom source into this repository or point customers directly at `boardroom2.vercel.app` without a deliberate architecture change.

### 1. Studio customer hub

The former standalone SeenInSeven root was moved to `seeninseven.html`. `index.html` is now the Studio home.

Studio provides:

- One Supabase login shared by every Studio app.
- A customer profile greeting and app workspace.
- Dark and light modes, using the same preference pattern as SeenInSeven.
- App cards that show whether access is active or locked.
- SeenInSeven and AI Boardroom as separate entitlements.
- A restrained early-access message for locked apps instead of an aggressive upsell.
- A direct email path to David Bee for early access.

Studio access is not the same as authentication. A person may have a valid Studio login but no entitlement to a particular app.

Access is stored in `studio_entitlements` using:

- `app_key`: currently `seeninseven` or `boardroom`
- `status`: `active` or `revoked`
- `access_source`: `beta`, `manual`, `systeme`, or `admin`
- optional `expires_at`

All users who existed when Studio launched received active SeenInSeven beta access. AI Boardroom access is granted separately. The old SeenInSeven `users.is_paid` field remains for legacy/future use but is not the Studio entitlement system.

Systeme.io automation is intentionally deferred. A future Systeme webhook should grant or revoke rows in `studio_entitlements`; it should not create another login system or write app access into `is_paid`.

### 2. Studio-wide administration

`/admin` is the master control room. It loads customers, Studio entitlements, SeenInSeven scripts/progress/logs, and Boardroom activity through admin-gated RPCs.

It supports:

- Total customer and active-access summaries.
- SeenInSeven and Boardroom usage summaries.
- Customer search and access filters.
- Granting and revoking SeenInSeven or Boardroom access.
- A per-customer drawer showing each connected app.
- Direct entry into each app-specific admin.

App-specific administration remains available because the master view cannot replace detailed troubleshooting:

- `/admin/seeninseven` shows onboarding, scripts, video progress, events, errors, and SeenInSeven support details.
- `/admin/boardroom` shows access, profile completion, conversation/message/document counts, active and completed work cards, and last activity.

Revoking Boardroom access blocks entry immediately but does not delete the user's workspace or saved work. Regranting access restores the same data.

### 3. AI Boardroom integration

The fully developed `boardroom2` app was connected, not the old single-file HTML experiment.

Boardroom now uses the Studio Supabase project and enforces two checks on every workspace operation:

1. The signed-in Studio customer has an active `boardroom` entitlement.
2. The authenticated Supabase user is a member of the requested Boardroom workspace.

First entry calls `boardroom_ensure_workspace()`. It creates a private workspace, owner membership, workspace settings, and starter profile when needed. Every Boardroom data row carries `workspace_id`, and Row Level Security prevents one customer from seeing another customer's data.

Boardroom data includes:

- Workspaces and workspace members.
- Workspace settings and guardrails.
- Private uploaded documents in the `boardroom-documents` Storage bucket.
- Conversations and messages.
- Advisor Work Cards.
- Generated memory entries.
- One private CEO profile per workspace.

The customer's CEO profile contains preferred name, role, business name, business description, ideal customer, offers, goals, constraints, and additional context. New customers complete it before entering the Boardroom and can edit it later under My Profile.

The profile is verified workspace context in every group and one-to-one conversation. Context order is important: profile and workspace guardrails, documents, memory, recent conversation, then active work-card context. The prompt explicitly tells advisors not to assume every customer is David or reuse another workspace's identity.

David's existing workspace was seeded with his Colorado Mastermind profile so his current behavior stayed intact. Other customers receive their own blank/starter profile.

Fresh Start intentionally clears conversations, cards, and generated memory while preserving the profile, uploaded documents, workspace settings, and membership.

Advisor personalities and the current team were intentionally left functionally unchanged. A future phase may add advisor creation, removal, and personality editing, but this was not part of today's integration.

### 4. SeenInSeven Prompt Tester

The Prompt Tester at `/admin/seeninseven/prompt-tester` is an administrator-only workspace for rapid blueprint iteration.

It contains:

- The complete currently published `api/_lib/blueprints.txt` source.
- A browser-local working draft with edit undo and restore-published controls.
- Real user onboarding, previous scripts, and available prompt answers loaded as read-only copies.
- Level- and video-specific question boxes.
- Easy and Extended question modes for Videos 2 through 7.
- Prefilled answers when a user has saved them.
- Blank editable test fields when no answer exists, plus Clear Test Answers and Restore User Answers.
- The complete assembled user-message window showing all context that will influence the test.
- Test generation through the existing DeepSeek proxy without saving the output to the user.
- Raw and final output views.

Tester state is stored only in the administrator's browser. The selected user, video, level, question mode, test answers, and assembled message survive reloads or navigating away. Tester changes never update the selected user's onboarding, scripts, or prompt answers.

SeenInSeven itself now saves a level-keyed copy of users' prompt answers in `onboarding.video_answers`. Level 1 and Level 2 are separated to prevent their shared field names from colliding. This enables future cross-device restore and Prompt Tester prefilling. Video 1 can also be reconstructed from onboarding data. Older Video 2 through 7 answers that only existed in a user's browser before this change cannot be recovered centrally; future answers are saved as users type.

The Prompt Tester question catalog is in `js/admin-prompt-questions.js`. It is an admin-only copy of the question labels, hints, keys, and placeholders in `js/app.js`. When SeenInSeven questions change, update both and run a parity check.

#### Focused prompt architecture

`api/_lib/blueprints.txt` remains one source file, but its generation rules are organized in level order: Level 1 Videos 1 through 7, followed by Level 2 Videos 1 through 7. Each of the 14 sections contains that exact level/video combination's video blueprint, level rules, and local section guidance.

On July 20, 2026, David explicitly authorized a full prompt refinement pass. The old copyable Hook/Open Loop/Conclusion/CTA examples were replaced with per-video guidance about the move each section must make. The global generation order is now: choose the engagement ending, design the CONCLUSION destination and CTA together, reverse-engineer the MEAT from that destination, design the OPEN LOOP from the missing meaning, then engineer the independent HOOK last. The hook captures pre-story attention; the open loop converts that interruption into one exact unanswered question; the conclusion completes, reverses, complicates, challenges, or reopens the apparent meaning; and the CTA bridges from the conclusion before stating an action and reason. The Seamless Rule applies only inside MEAT. Hooks must not be progress reports, summaries, soft identification, or early lesson reveals. Open loops must not disclose the result or use an unnamed "something changed" as the mystery. CTAs must not begin with a video/series label.

The internal seven-video arc is currently: V1 declaration/introduction, V2 ordinary world and human identity, V3 first epiphany, V4 road of trials, V5 fall/ordeal, V6 second epiphany/finding the elixir, V7 return. The challenge itself remains intentionally named in the fixed Video 1 declaration and existing series orientation. Internal Hero's Journey terms are not used in the revised Level 1 question titles or explanations.

On July 25, the shared stage ownership was tightened across both levels. V1 keeps the fixed declaration. V2 owns the Ordinary World and Refusal. V3 owns the guide influence, first epiphany, and first threshold. V4 owns the Road of Trials in the actual subject of the larger story, including changed action, resistance, partial wins, and incomplete confidence. V5 owns the fall with no recovery. V6 owns the second epiphany and elixir. V7 owns the return and ongoing viewer relationship. The exact Level 2 balance inside V4 remains intentionally broad across work, craft, calling, business, life, and public communication for a later refinement pass.

Level 1 and Level 2 have separate Easy Mode and Extended question sets. The user-facing question catalog in `js/app.js` and the admin copy in `js/admin-prompt-questions.js` must remain identical. The Prompt Tester chooses the matching level's questions instead of using one shared list.

On July 21, 2026, the complete Level 2 path was rebuilt against `Hero's Journey 777 Video Challenge.md` while preserving the newer V5 Fall and V6 Elixir order. Level 2 is not Level 1 with business language. Its emotional movement is private competence becoming public ownership, and it must support both established professionals and aspiring experts who have knowledge but no company, clients, revenue, or formal offer.

The current Level 2 path is:

1. V1 introduces someone with real knowledge who has remained publicly invisible.
2. V2 remains inside the Ordinary World and Refusal. Identification comes before admiration: the viewer first recognizes an ordinary person, their familiar life, and why leaving that identity felt unreasonable. A future ability, responsibility, obsession, or recurring thread appears only as a quiet clue. The refusal must be shown through an actual choice, delay, dismissal, or retreat. It cannot become a hidden-expert origin story or explain the current method, mission, offer, service philosophy, or mature authority.
3. V3 introduces a literal human guide. A mentor, teacher, supervisor, peer, client, elder, or collaborator briefly challenges what the speaker believed, and the speaker tests that guidance against lived evidence until the first professional epiphany lands.
4. V4 tests that mentor-assisted realization through meaningful action, resistance, partial wins, and provisional confidence in the real subject of the story. It is not limited to public posting or the seven-video process, and it cannot deliver another epiphany or reveal the coming fall.
5. V5 is the fall inside the speaker's work, craft, calling, developing expertise, or hoped-for future. A real defeat happened, the speaker helped cause or worsen it, attempted recovery failed, and no way back was visible. It must not collapse into visibility anxiety. Aspiring experts do not need a business-scale disaster, but the loss must feel permanent from inside their experience.
6. V6 is the second professional epiphany and elixir earned specifically through V5. It must emerge through aftermath or rebuilding, deepen or correct V3, change the speaker's work or decisions, and give the viewer a useful lens. It cannot become an unrelated industry opinion.
7. V7 returns from private competence to public ownership. It connects the origin, both realizations, the public test, and the fall as one correction without recapping seven episodes. It shows observable change, keeps an honest unfinished edge, gives the audience a professional gift, and asks for an ongoing follow because the relationship and perspective are worth continuing. It is not an offer or lead-capture video.

On July 26, Level 2 Video 4 received a focused pre-test hardening pass. Its questions now read as ordinary journal prompts rather than asking users to diagnose trials, blind spots, or story stages. Generation privately reduces Video 2, Video 3, and the current Video 4 answers into the first lens, changed action, one highest-friction trial, one additional trial, resistance, partial win, confidence at that time, and one still-unresolved fact. The Hook is sourced only from the highest-friction trial, while the Open Loop may establish that same trial's immediate stakes without explaining its result or meaning. Later hindsight, the Video 5 fall, recovery, mature method, and offer material are removed before the writer sees the packet. The Video 4 conclusion now uses dramatic irony: the speaker reasonably trusts an earned partial win while the audience may notice one unexplained unstable fact. The CTA follows that specific confidence or unresolved pressure without predicting the fall or retreating into generic story commentary. A contaminated production-preview test confirmed that later collapse, elixir, offer, and booking instructions were removed. Follow-up testing added deterministic coverage for fragment-style and categorical false balance, predictive Video 4 CTA language, unsupported exact or sharpened time and measurement claims, and actual future-narrator diagnoses of the unresolved fact. Immediate uncertainty such as not knowing whether an action will work remains allowed; only backward-looking constructions and labels such as warning, signal, blind spot, or red flag fail. The packet cleanup receives the original Video 2, Video 3, and current Video 4 source beside the routed packet so it can remove invented evidence before the writer sees it, and an outcome the source leaves open must remain open in the script. The prepared packet ends with local drafting constraints that prohibit future-narrator language before the first draft and require the CTA bridge to precede the combined follow, reason, and Video 4 orientation, reducing reliance on repair retries.

On July 26, that Level 2 Video 4 architecture was replaced after live output revealed that the professional-proof framing produced a polished case study instead of a relatable Road of Trials. L2V4 is now the choice before proof: one recoverable trial where the old way appears to be winning, a supported human temptation to retreat, the choice made while the outcome remains unknown, and the first meaningful result. The router packet now uses `RECOVERABLE TRIAL`, `OLD-WORLD TEMPTATION`, `CHOICE BEFORE PROOF`, `FIRST MEANINGFUL RESULT`, `WHAT IT MADE POSSIBLE`, and optional `WHAT REMAINED OPEN`. The Hook remains a pure pattern interrupt. The Open Loop must create one exact pressing question, the Meat must stop before its answer, and the Conclusion must reveal the first meaningful result for the first time. The result may create hope but cannot become a method, case study, professional superiority claim, second epiphany, or manufactured warning. Video 5 now carries an explicit one-way-door boundary: it must contain an actual apparently irreversible loss and failed way back, making it different in kind from Video 4 rather than a more painful iteration of the same setback. The four L2V4 journal questions and Easy prompt were rewritten around changed action, old-world temptation, choice under uncertainty, and first meaningful result. Existing `v3p2` answers remain the meaningful-result input, the new choice-before-proof answer uses `v3p4`, and retired `v3p3` unresolved-limit data remains stored but is no longer shown or compiled for L2V4. No Level 1 question or L1V4 contract changed in this pass.

The first live output from that replacement confirmed that the Hook, exact Open Loop, recoverable trial, choice before proof, and delayed result were working, but exposed four narrower defects. The Meat replayed the Hook and Open Loop evidence, repeated the complete Video 3 reframe, positioned the speaker commercially through statements about having no pitch or purchase path, and let one result validate the broader philosophy. The CTA also framed Video 5 as the Video 4 tactic merely becoming insufficient. The L2V4 blueprint, private packet routing, final writer constraints, stage contract, and semantic reviewer were tightened together. The Meat must now advance beyond opening evidence, Video 3 continuity is limited to one short clause or sentence, commercial positioning by negation is removed, and the Conclusion may prove only that one choice mattered. The CTA contract intentionally changed: after the hopeful Conclusion, it must drop the emotional temperature and seriously foreshadow the catastrophic category and speaker responsibility of Video 5 while withholding the event, exact loss, causal choices, failed recovery, outcome, and Video 6 truth. The former deterministic rule that rejected collapse or failure language in an L2V4 CTA was removed, while hindsight diagnosis remains prohibited from the earlier sections. Questions and saved answer keys were unchanged in this refinement.

On July 25, the Level 2 blueprints gained mandatory journal-answer routing after L2V2 repeatedly promoted its strongest professional-origin detail into the Hook and Open Loop. L2V2 now takes its opening only from the detour, wound, obsession, or unlikely ordinary-life chapter; holds accidental beginnings, payment, demand, and usefulness until the middle of the Meat as quiet clues; and takes its lived refusal and unresolved Conclusion from the dismissal answer. A scoped deterministic validator rejects payment, clients, professional demand, or recognition in the L2V2 opening and rejects common present-day explanations of why the quiet thread was valuable. The same routing principle is documented for L2V3 through L2V7 so the first epiphany, warning sign, recovery, elixir, and return cannot drift into earlier sections. These later chapters use semantic stage review rather than additional phrase bans.

On July 26, the two Level 2 epiphany chapters were repaired as one paired system. L2V3 had been asking users to supply a complete industry thesis, polished reframe, mentor history, discovery scene, cost argument, and present-day stakes at once. This encouraged lectures, credential lists, current positioning, and mature philosophy instead of the raw first epiphany that L1 already inferred from evidence. L2V3 Easy and Extended questions now gather one accepted assumption and shaped action, one person's usable lens, one representative evidence moment, and compassionate human stakes. The direct question for the first smaller shift was removed, so the private evidence sorter infers it from the old assumption, guide lens, and representative evidence rather than making the user do the analysis. The blueprint must infer one narrow cognitive-surprise reframe, may honestly use a mentor's body of work as the guide lens, name only that one source figure, and must exclude complete methods, pricing ladders, current service descriptions, and later-stage wisdom. Its Open Loop must withhold the actual causal relationship without making a denial the Meat contradicts, and its Conclusion must reveal a hidden relationship or reversal instead of prescribing what the industry should do. L2V6 questions now gather aftermath evidence, the specific limit of Video 3, observable changed behavior, and a recognizable person who needs the hard-won perspective. Both L1V6 and L2V6 now apply a causal elixir test: the second epiphany must show what Video 3 revealed, what the Video 5 fall proved that first lens could not solve, and what truth now changes behavior. Because the user's cumulative context can contain much louder later-stage business material, both L2V3 and L2V6 now receive a private evidence-sorting model pass before script generation in production, full regeneration, section regeneration, and the Prompt Tester. A second packet-cleanup pass validates that handoff before the script writer sees it: Video 3 keeps exactly one named guide and one non-prescriptive first realization, while Video 6 keeps only the causal chain from the first lens through the fall, exposed limit, aftermath, changed behavior, and elixir. The packets remove mentor lists, pricing ladders, current positioning, unrelated opinions, commercial material, and banned output words that could be copied back into the script. The Prompt Tester now receives the same automatic fresh-draft retry as production when a routed draft still fails its final mechanical or story review. Existing answer storage keys were preserved, and the writer treats older polished answers as candidate material rather than controlling copy.

Later on July 26, the paired epiphany system received a full 5E hook and payoff audit after production showed that its evidence-first opening rules were generating mystery scenes instead of modern belief-disruption hooks. Videos 3 and 6 at both levels now use explicit exceptions to the default scene-first Hook rule. Video 3 uses a forbidden-idea promise: it signals that an accepted explanation, respectable assumption, or common measurement is incomplete, backward, or socially protected while withholding the exact reframe. Video 6 uses an earned verdict: it names the paradox, failed rule, or protected belief the Video 5 fall gives the speaker the right to challenge while withholding the deeper causal elixir. Video 3 now delivers one complete but bounded paradigm shift rather than a deliberately small insight; its boundary is determined by whether the later fall is required to earn the truth, not by weakening the first epiphany. In both chapters the Open Loop makes the promised hidden relationship consequential, the Meat carries the evidence and discovery arc without stating the answer, and the Conclusion performs the cognitive reframe, Aha transfer, cost revelation, and simplicity signal. The Level 2 evidence routers, packet cleanup, final drafting constraints, stage contracts, and semantic story reviewer were updated together so downstream review cannot convert the new hooks back into evidence-first scenes.

Level selection now routes anyone who says they want to teach what they know into Level 2, whether or not they selected an existing or developing business. Level 2 onboarding no longer assumes income, clients, offers, or a company. It gathers who needs the knowledge, the specific blocker keeping that expertise private, and why sharing it matters now. The Level 2 Easy and Extended question catalogs were parity-tested across production and the Prompt Tester, and all existing storage keys were preserved so saved customer answers continue to map to the correct video.

`js/script-prompt-engine.js` is the shared assembly layer used by both SeenInSeven and the Prompt Tester. For a generation request, it sends the global rules plus only the matching level/video section. This prevents one video from receiving all 14 sets of specialized instructions while keeping a single editable blueprint source.

Generation context is cumulative within the active level only. Each prior video contributes its latest current or locked script and its actual saved answers once. The current video's answers are placed last so they have the strongest immediate relevance. Edited script-version history is not sent.

Both production and the Prompt Tester use the same prompt focusing, context assembly, output validation, semantic review, targeted repair, and final-script assembly. As of July 21, 2026, every first draft receives a low-temperature DeepSeek story-editor pass even when its labels and word counts are valid. The editor judges whether the Hook is a real pattern interrupt, the Open Loop preserves one concrete unanswered relationship without leaking the Conclusion, the Meat carries the local Hero's Journey movement without repetition, the Conclusion creates an earned turn, and the CTA bridges naturally into a follow request. It also checks disguised false balance and generic AI phrasing. When a section fails, the editor returns replacements only for the failed sections; passing sections are preserved exactly. One precision re-review checks the merged script. Production Preview keeps the production drafting temperature of `0.8`, Consistent Test keeps `0.25`, and both use `0.15` for the shared review pass.

On July 25, the targeted repair loop increased from two to three review passes after production traces showed that DeepSeek could fix one section and introduce a new mechanical failure, such as false balance or repeated language, in the replacement. Full generation now tries at most two fresh drafts instead of three. The system therefore spends its budget cleaning a nearly finished script rather than repeatedly discarding the whole story, while keeping the request within the Vercel runtime limit.

Deterministic validation checks all five labels, enforces the 50-word Open Loop maximum, rejects vague or conclusion-leaking Open Loops, and applies the absolute banned-language list section by section. `version`, `lazy`, and `resonate` are banned as complete words in every context, along with the other listed phrases. Every CTA must make follow the primary action, use `because` exactly once, identify the current installment inside the seven-part sequence, and keep series orientation out of its opening bridge sentence. Video 7 has extra gates: it must acknowledge the completed Video 7 of 7 arc, invite late viewers back to Video 1, create an ongoing relational reason to follow, and avoid another-installment promises or manufactured urgency. Video 1's prewritten challenge declaration is still inserted between Open Loop and Meat in the canonical final script used for display, copy, PDF, database `final_content`, and future-video context. Section regeneration uses the same focused system prompt and cumulative context as full generation, then runs the semantic editor against only the requested section while treating the other four sections as read-only context. After semantic editing, any remaining deterministic failures receive up to two compact mechanical-only repair passes. Those passes may fix only the affected sections and cannot reconsider the story, which prevents an otherwise correct script from being discarded because a broad story rewrite repeatedly recreates a banned word, false balance, long Open Loop, CTA continuity problem, or format fault.

The tester's Comparison Mode still produces one output at a time. Consistent Test uses lower creativity (`0.25`) for close comparisons; Production Preview uses the production setting (`0.8`). Every newly generated script records a 12-character fingerprint of the exact system prompt in `scripts.prompt_version`. Existing scripts remain unchanged with a null version. Prompt versions are administrator-facing only.

### 5. Blueprint publishing safety

Prompt publishing is handled by `api/prompt-blueprint.js`, not by direct browser access to GitHub.

The publishing flow:

1. Validates the Supabase session and current admin status.
2. Validates the complete blueprint structure and required markers.
3. Shows a change review.
4. Requires two confirmations, including typing `APPLY BLUEPRINT`.
5. Creates a commit directly on `main` for `api/_lib/blueprints.txt` only.
6. Allows Undo Last Publish only when the latest relevant commit came from the Prompt Tester. Undo creates a new reversal commit rather than rewriting history.

Vercel has a restricted `GITHUB_PROMPT_TOKEN`. It must remain a fine-grained token with Contents read/write access to only `DavidBeeeee/seen-in-seven`. Never replace it with a broad personal token or expose it to the browser.

Outside this explicit admin publishing flow, `api/_lib/blueprints.txt` remains protected core IP and must not be edited without David's direct instruction.

### 6. Authentication and administrator corrections

All Studio admin surfaces currently recognize these administrator emails:

- `contact@davidbee.me`
- `davidkamau.t@gmail.com`
- `davidkamau@live.com`

The matching server-side allowlist lives inside `provision_admin_account()`. Client allowlists exist in `js/admin-studio.js`, `admin-seeninseven.html`, `js/admin-boardroom.js`, and `js/admin-prompt-tester.js`. All copies must be changed together when an admin is added or removed.

`contact@davidbee.me` and `davidkamau.t@gmail.com` are separate Supabase identities even though they belong to David. Both were granted admin access. Do not try to merge their database identities merely because the inboxes belong to the same person.

`shytanthecat@yahoo.com` remains a non-admin test account.

The Prompt Tester originally appeared to remain logged out because `.auth-screen` had a display rule that overrode the HTML `hidden` attribute. The stylesheet now contains `[hidden] { display:none !important; }`. Preserve that rule on admin pages that use the `hidden` attribute.

The critical Supabase auth rule still applies everywhere: do not await database work directly inside `onAuthStateChange`. Defer it with `setTimeout(0)` so Supabase can release its internal navigator lock.

### 7. Supabase migrations applied during this implementation

These migration files in the Studio repository describe the production changes and were applied to project `zdtkwpzdwnzzmdwrvmka`:

1. `2026-07-18-add-studio-entitlements.sql`
2. `2026-07-18-add-boardroom-to-studio.sql`
3. `2026-07-18-fix-boardroom-admin-activity-order.sql`
4. `2026-07-18-add-boardroom-user-profiles.sql`
5. `2026-07-18-fix-boardroom-profile-workspace-setup.sql`
6. `2026-07-19-fix-admin-email-allowlist.sql`
7. `2026-07-20-add-video-prompt-answers.sql`
8. `2026-07-19-add-script-prompt-version.sql`

The SQL files inside the `boardroom2/supabase` directory belong to the older standalone Boardroom setup and are historical reference only. Do not apply them to Studio. The Studio repository migrations are the production schema source of truth.

### 8. Deployment and verification record

The work shipped through SeenInSeven pull requests #1 through #8 and Boardroom pull request #1 plus the private-profile follow-up commit.

Production verification covered:

- Studio and each admin route.
- Shared authentication behavior.
- App entitlement grant and revoke flows.
- Boardroom workspace creation, profile isolation, and admin activity.
- Prompt Tester authentication and hidden-state behavior.
- Correct Level 1 and Level 2 question catalogs.
- Prefill, clear, restore, and browser persistence in the Prompt Tester.
- Desktop and mobile overflow checks.
- SeenInSeven startup after answer persistence was added.
- Confirmation that the protected blueprint source remained byte-for-byte unchanged during the tester build.
- Focused selection of exactly one of the 14 level/video rule sections per generation.
- Same-level cumulative context with one latest current script per prior video.
- Production and Prompt Tester parity for prompt assembly, validation, repair, and Video 1 declaration placement.
- Prompt-version recording for newly generated scripts.

### 9. Deliberately deferred next steps

- Systeme.io webhook automation for Studio entitlements.
- Paid-access enforcement outside the current beta period.
- Additional EEE apps inside Studio.
- Cross-app progress reporting beyond the current Studio summaries.
- Custom Boardroom advisor creation, removal, and personality editing.
- General-purpose ongoing prompt controls after David finishes the intensive blueprint iteration phase.

Do not create a second Studio, second SeenInSeven deployment, or separate login for a future app. New tools should use the Studio Supabase identity and `studio_entitlements`, then appear in the Studio hub and both levels of administration.

---

## What this app is

SeenInSeven is the free app reward for joining the 777 Challenge — a group video challenge where first-time entrepreneurs film 7 videos in sequence, building a complete digital brand from scratch.

**The most important thing to understand before touching this codebase:**

The challenge is the product. The app is the bonus. Every design, copy, and UX decision should reinforce that users are part of a community of content creators who are using this to connect with an audience and ultimately earn life-changing income, just as others are doing all around the world — not using an AI tool in isolation. The app interviews the user, finds their voice, and produces fully customized scripts for all 7 videos faster and easier than they could possibly expect. The scripts are built on a proprietary Hero's Journey framework that cannot be replicated.

The current business model: $7 gets access to the community challenge, with this ($300+) app as a free bonus. The upsell at completion is the Exit Escalator Engine (EEE) at $77/month founding rate, which teaches the full 5E framework for ongoing content creation and business building.

---

## Where the code lives

The GitHub repository is the shared source of truth. Developers and coding tools may work from local or temporary clones, but completed work must be committed and published here:

`https://github.com/DavidBeeeee/seen-in-seven`

To start working on this, clone the repo:

```bash
git clone https://github.com/DavidBeeeee/seen-in-seven
cd seen-in-seven
```

The Studio and SeenInSeven repository has no build step, package install, or bundler. Its static files can be run locally with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Note: the DeepSeek API proxy (`/api/generate.js`) requires the `DEEPSEEK_API_KEY` environment variable which is stored in Vercel. Script generation won't work locally without it, but the auth flow, dashboard, and all navigation can be tested locally.

**Deployment is automatic.** Every push to the `main` branch on GitHub triggers a Vercel deploy in approximately 30 seconds. There is no manual deployment step.

Coding tools may work from David's local checkout or from a temporary cloud clone. In either case, GitHub `main` is the handoff point and Vercel deployment source. Pull the latest published changes before beginning new work.

---

## What's in the repository

This repo is the entire 777 Challenge project folder, not just the app. Here's everything it contains:

**The SeenInSeven app (deployed to Vercel):**
- `index.html` — Colorado Mastermind Studio dashboard
- `seeninseven.html` — the full SeenInSeven app
- `admin.html` — Studio-wide customer and app-access dashboard
- `admin-seeninseven.html` — detailed SeenInSeven progress and support dashboard
- `admin-boardroom.html` — AI Boardroom access and activity dashboard
- `admin-prompt-tester.html` — restricted SeenInSeven prompt testing workspace
- `css/app.css` — all styles
- `js/app.js` — all application logic
- `js/admin-boardroom.js` — Boardroom administration
- `js/admin-prompt-tester.js` — Prompt Tester state, testing, and publishing
- `js/admin-prompt-questions.js` — Prompt Tester's level/video question catalog
- `js/supabase.js` — auth and database layer
- `api/_lib/blueprints.txt` — protected core IP; modify only with David's explicit instruction
- `api/generate.js` — DeepSeek serverless proxy
- `api/prompt-blueprint.js` — admin-gated blueprint read, publish, and undo endpoint
- `vercel.json` — URL routing

**Landing page HTML blocks (for Systeme.io):**
Located in `funnel-pages/`. These are the custom HTML blocks that get pasted into Systeme.io's page builder for the challenge landing pages, checkout pages, upsell/downsell pages, daily challenge pages, and thank you pages. They are not deployed by Vercel — they live here for version control and are manually copied into Systeme.io when updated.

**Project and planning documents:**
- `777_Challenge_Launch_Plan.docx` — full launch plan
- `7v7d7-project-document.docx` — project brief
- `Hero's Journey 777 Video Challenge.md` — framework reference
- `social-launch-kit.md` — social content
- `funnel-audit-brunson.md` — funnel analysis
- `LANDING_PAGES_INVENTORY.md` and `LANDING_PAGES_EDITS_SUMMARY.md` — landing page tracking
- `DEAR_FUTURE_CLAUDE.md` — debugging history (read this)
- `DEVELOPER_HANDOFF.md` — this file

---

## How GitHub Desktop fits in

David uses **GitHub Desktop** on his local machine to sync the repo. The local folder on his machine (inside his project folder) is a clone of this repository.

**Two different Claude tools push to this same repo:**

- **Claude.ai (browser)** — makes changes inside a temporary cloud container (`/home/claude/seen-in-seven`) and pushes directly to GitHub via git CLI. After a Claude.ai session, David needs to **pull in GitHub Desktop** to get those changes onto his local machine.

- **Claude Code (desktop/terminal tool)** — runs on David's local machine and pushes directly to GitHub via git CLI from there. The changes are already local when they go up.

Both tools commit under the same author name (`David Bee <contact@davidbee.me>`), so the git history doesn't distinguish between them. Both push to the `main` branch. Vercel watches `main` and auto-deploys within 30 seconds regardless of which tool pushed.

**GitHub Desktop is David's sync tool**, not a push mechanism for Claude. It gives a visual view of what's changed and is how David pulls Claude.ai session changes down to his local machine.

---

## Technical stack

| Layer | Technology |
|-------|-----------|
| Hosting | Vercel (auto-deploys from GitHub main branch, ~30s) |
| Database + Auth | Supabase (PostgreSQL, Row Level Security, shared email/password and magic link auth) |
| AI scripts | DeepSeek API via Vercel serverless proxy (`/api/generate.js`) |
| Studio + SeenInSeven frontend | Vanilla HTML/CSS/JS, no framework |
| AI Boardroom | Separate Next.js app in `DavidBeeeee/boardroom2`, proxied under `/boardroom` |
| Node version | 24.x on Vercel |

This repository has no frontend build step. AI Boardroom has its own Node/Next.js build and deployment.

---

## File structure

> **Note (July 2026):** the file structure, schema, and RPC list below have drifted from reality in several places (screen count, `screen-comm-layers` references, password auth was added, points system was added). `CLAUDE.md` and `SEENINSEVEN_ROADMAP.md` in this repo are kept current every session and should be treated as more authoritative than this section until it gets a full rewrite. The schema/RPC tables immediately below have been corrected as of July 2026; the file-structure tree and screen-flow section further down have not.

```
seen-in-seven/
├── index.html          — Colorado Mastermind Studio dashboard and login
├── seeninseven.html    — SeenInSeven screens, modals, and overlays
├── admin.html          — Studio-wide admin (magic link, allowlisted emails only)
├── admin-seeninseven.html — detailed SeenInSeven app admin
├── admin-boardroom.html — AI Boardroom access and activity admin
├── admin-prompt-tester.html — restricted SeenInSeven prompt tester
├── css/admin-studio.css — Studio-wide admin styles
├── css/studio.css      — Studio dashboard dark and light themes
├── css/app.css         — dark mode (default) — structural + dark styles
├── css/light.css        — light mode overrides only, kept in a separate file by convention
├── js/
│   ├── app.js          — all application logic, global state (~5,900 lines)
│   ├── studio.js       — Studio auth, theme, and app access display
│   ├── admin-studio.js — Studio admin summaries, customers, and app access
│   ├── admin-boardroom.js — Boardroom access and activity administration
│   ├── admin-prompt-tester.js — prompt testing, draft state, publish, and undo
│   ├── admin-prompt-questions.js — admin copy of level/video question definitions
│   ├── supabase.js     — auth + database layer, event logging, sync queue
│   └── points.js       — gamification points engine (client mirror of the SQL compute)
├── prompts/
│   └── _lib/blueprints.txt — SYSTEM_PROMPT + Hero's Journey blueprints ← CORE IP. MODIFY ONLY WITH DAVID'S EXPLICIT INSTRUCTION.
├── api/
│   ├── generate.js     — DeepSeek proxy serverless function
│   └── prompt-blueprint.js — admin-gated blueprint read/publish/undo endpoint
├── supabase_migrations/ — dated .sql files, one per applied schema/RPC change
├── vercel.json         — URL rewrites
├── DEAR_FUTURE_CLAUDE.md — debugging history (READ THIS FIRST)
└── DEVELOPER_HANDOFF.md  — this file
```

---

## Database schema (Supabase)

All tables in `public` schema. RLS enabled on all.

| Table | Purpose |
|-------|---------|
| `users` | id, auth_id, email, name, level, blocker, business_stage, is_paid, is_admin, last_active |
| `onboarding` | user_id (UNIQUE), posted, history, goal, mini_goal, mini_goal_text, business, mvo_q2/q3/q4, topic_freewrite, phase2_context (jsonb), video_answers (jsonb) |
| `scripts` | user_id, video_number, level, content, version, is_current, thumbs_up, generated_at, edited_at. Trigger auto-increments version on insert. |
| `video_progress` | user_id, video_index, level, status ('filmed'/'skipped'/**null**), filmed_at, **locked_at, posted, posted_at, post_url** (added July 2026 for gamification) |
| `logs` | user_id, event_type, detail (JSONB), created_at — admin activity log |
| `preauth_events` | anon_session_id, user_id (nullable), email, event_type, detail (jsonb), created_at — pre-auth funnel tracking, added mid-2026 |
| `points_config` | id=1, version, rules (jsonb) — tunable point values + milestone thresholds, added July 2026 |
| `studio_entitlements` | Per-user access to each Studio app, including status, source, and optional expiration |
| `boardroom_workspaces`, `boardroom_workspace_members` | Private Boardroom workspace ownership and membership |
| `boardroom_workspace_settings`, `boardroom_user_profiles` | Workspace guardrails and the customer's private CEO profile |
| `boardroom_documents` | Uploaded-document metadata; private files live in the `boardroom-documents` Storage bucket |
| `boardroom_conversations`, `boardroom_messages` | Private Boardroom chat history |
| `boardroom_advisor_cards`, `boardroom_memory_entries` | Advisor Work Cards and generated workspace memory |

**RPC functions (SECURITY DEFINER — bypass RLS):**
- `check_email_exists(email)` — pre-auth lookup for returning users
- `is_admin()` — checks if current user has is_admin flag
- `admin_get_users/scripts/progress/onboarding/logs/preauth_events/points()` — admin panel data
- `admin_set_paid(user_id, paid)` — toggle is_paid from admin panel
- `admin_get_studio_entitlements()` / `admin_set_studio_access(...)` — read and control per-app Studio access
- `boardroom_ensure_workspace()` — safely create or return the signed-in customer's private Boardroom workspace
- `admin_get_boardroom_activity()` — Boardroom activity and completion summary for administrators
- `admin_delete_subjects(user_ids[], anon_session_ids[])` — bulk delete from admin panel
- `provision_admin_account()` — the only way to self-grant `is_admin`; checks the caller's JWT email against a hardcoded allowlist. See the Admin Privilege Rule in `CLAUDE.md` — do not write `is_admin` directly from client code, a `BEFORE UPDATE` trigger blocks it.
- `get_my_points()` / `admin_get_points()` — wrap `compute_user_points()`, which has no direct grants of its own

**Auth method:** Supabase magic link (passwordless email OTP) **or password** (added mid-2026 — both coexist; see the sign-in screen's password toggle).

Anonymous users can add their first email directly from SeenInSeven Settings without repeating onboarding. Email-save actions write a short-lived `sis_pending_account_link_v1` marker before sending the magic link. When the matching email returns in the same browser, the auth flow preserves `bwb_challenge_v1`, creates or restores the account, and uploads onboarding, scripts, filmed/skipped status, locks, and posted progress before returning to the dashboard. Normal sign-ins without the matching marker still discard unrelated browser state. Keep this distinction intact.

**Admin access:** Gated by `is_admin = true` in the users table, granted only via `provision_admin_account()` against matching allowlists. The client copies are in `js/admin-studio.js`, `admin-seeninseven.html`, `js/admin-boardroom.js`, and `js/admin-prompt-tester.js`; the server-side allowlist is inside the RPC. Update all copies together.

---

## Key architecture decisions and why

**1. Global mutable state in `app.js`**

The entire app state lives in a single `state` object plus a handful of globals (`currentIndex`, `currentVideoIndex`, `screenOrder`, `editingFromPlan`). This is a deliberate choice — the app started as a single-file HTML and was refactored incrementally. A full state management rewrite is on the long-term roadmap but was intentionally deferred to prove the core product first.

**2. One shared Supabase identity across Studio apps**

Email/password and magic-link login coexist. The same Supabase session identifies the customer across Studio, SeenInSeven, and AI Boardroom. App entry is then controlled separately through `studio_entitlements`; being logged in does not automatically grant access to every tool.

**3. `onAuthStateChange` deadlock pattern — critical**

Supabase holds an internal navigator lock during `onAuthStateChange` callbacks. Any `await` on a Supabase database call inside this callback deadlocks forever. All DB work in the auth callback is deferred via `setTimeout(0)`. This pattern is load-bearing — do not remove it or move the DB calls back into the synchronous callback body.

**4. `api/_lib/blueprints.txt` is protected core IP**

The AI system prompt and Hero's Journey blueprints in `api/_lib/blueprints.txt` are David's core intellectual property. They run through multiple API iterations and produce something that cannot be replicated by a base LLM. Modify this file only when David directly authorizes the work. The administrator Prompt Tester is the approved browser-based editing and publishing path.

**5. DeepSeek proxy**

The AI API key never hits the browser. All generation calls go through `/api/generate.js` on Vercel. The key is stored as `DEEPSEEK_API_KEY` in Vercel environment variables.

---

## Screen flow

The app has 21 screens, all `<div class="screen">` elements that are direct children of `<body>`. This is a hard structural requirement — see the debugging section.

**New user path (never posted):**
`screen-0` → `screen-1` → `screen-email` → `screen-2a` → `screen-3` → `screen-4` → `screen-5` → `screen-6` → `screen-recap` → `screen-checklist` → `screen-comm-layers` → `screen-mvo2` → `screen-mvo3` → `screen-mvo4` → `screen-7` (prompts) → `screen-script-loading` → `screen-script` → `plan-screen` (dashboard)

**Previously posted path:** Same but `screen-2b` instead of `screen-2a`.

**Key global variables:**
- `screenOrder[]` — the active screen sequence (expands after screen-1)
- `currentIndex` — position in screenOrder
- `currentVideoIndex` — which of the 7 videos is active (0-based)
- `editingFromPlan` — true when user came from dashboard to edit a script

---

## The script generation system

1. User answers onboarding questions (screens 2-6, MVO screens, prompts screen)
2. `buildAPIUserMessage(videoIdx)` constructs the user prompt from state
3. `callDeepSeekAPIRaw(systemMsg, userMsg, temperature, trackPromptVersion)` calls the proxy; semantic review calls use `trackPromptVersion = false` so they do not replace the draft's prompt-version record
4. Response is parsed by `parseScriptSections(text)` into sections (HOOK, OPEN LOOP, MEAT, CONCLUSION, CTA)
5. Rendered in two views: **Structured** (section-by-section with psychological rationale) and **Edit** (clean textarea for direct editing)
6. Individual sections can be regenerated via `regenerateSection()`
7. Undo/redo system: every generation and edit (debounced 2s) pushes to a per-video undo stack in `state.videos['_undo_v' + idx]`

**DeepSeek context and restart behavior:**
- Every model call is stateless and sends one system message plus one user message. No DeepSeek conversation or session identifier is retained.
- Per-video **Delete & Start Over** clears the active script, section drafts, prompt answers, lock state, and prompt-version state. The previous database row remains only as non-current history and is not included when Video 1 is generated again.
- Full **Delete Everything** also clears the per-level answer cache and pending anonymous save queue, then waits for authenticated database deletion before the user begins again. This prevents stale answers or queued scripts from returning after a reset.
- **Regenerate Full Script** intentionally includes the current script so DeepSeek can create a stronger replacement from the existing draft.
- A restarted script can still resemble an earlier one when the onboarding answers, journal facts, and tightly defined story architecture are unchanged. That similarity comes from repeated source material, not hidden conversation memory.

**Spoken-script language firewall:**
- Hero's Journey chapter names, stage ownership, framework names, and production terminology are private construction tools. They must never appear in generated spoken copy.
- Real relationships are still valid story material. A person can naturally be called a mentor, teacher, guide, supervisor, peer, client, elder, or collaborator when that description comes from the user's life.
- Deterministic validation and the semantic story review both enforce the firewall.
- False balance includes one-sentence formulas, causal pivots such as `not because`, and adjacent sentences that negate and then repeat the same verb as the correction.
- Cross-section validation rejects any repeated phrase of eight or more consecutive words and assigns the repair to the later section.
- Level 2 Video 2 has a present-day interpretation embargo: evidence can reveal the unclaimed ability, but the speaker cannot explain its mature meaning or connect it to a current method or business philosophy. Its conclusion must preserve the unresolved reason the speaker could not yet recognize the path.
- Level 2 Video 2 Extended Mode uses three natural journal prompts: the unpolished origin of how the speaker came to know what they know, the detour/wound/obsession/unlikely chapter that shaped their relationship with the work, and what made them dismiss or resist taking it seriously. These prompts gather rich life material without exposing the private story architecture. Easy Mode remains unchanged pending a separate review.

**Version model:**
- Script is saved to DB on first generation (`queueScriptSave`)
- Manual edits update the current row in-place (`saveScriptEditToDb`)
- New DB version created only when user clicks "Lock In This Script" (sets `locked_v{idx}` in state) or "Delete & Start Over" (explicit snapshot before wiping)
- The Supabase trigger auto-increments `version` and flips `is_current` on new inserts

---

## Roadmap

The full phased roadmap lives in `SEENINSEVEN_ROADMAP.md` in this repo. **That document is the canonical source of truth for what to build next.** Treat it as more current than any older handoff notes or session history.

The phases are strictly sequential — do not skip ahead. Phase 1 must be complete before Phase 2 begins, and so on. The roadmap document explains why each phase is ordered the way it is.

Quick summary of phases in order — do not skip ahead:
1. **Admin Command Center and Stability** — current priority
2. **Onboarding Update** — free-text options on all choice screens, mission statement overhaul, knowledge base context documents
3. **Full User Experience Audit** — end-to-end refinement pass, not a feature sprint
4. **Gamification and Completion Experience** — placeholder, defined by David Bee when ready
5. **Script Output Update** — improve personalization depth and output quality before the paywall goes live
6. **Paid Access and Checkout Bridge** — Systeme.io webhook, is_paid enforcement
7. **Email and Follow-Up System** — automated nudges, requires proper transactional email provider
8. **Long-Term Superapp Foundation** — foundation is now live; future app additions remain separately scoped

---

## What is built now

- Full onboarding flow (all 21 screens)
- Shared email/password and magic-link authentication for new and returning users
- Script generation for all 7 videos, both levels (Relatable Hero L1, Authority Series L2)
- Section-level regeneration with undo/redo
- Dashboard with progress ring, video cards, version history modal
- Lock In workflow: Lock → Next Video button → filmed toggle → confetti → dashboard
- Settings panel (accessible from any screen): name, first-time email attachment, password, level switch, re-run onboarding
- Studio admin: all customer profiles, connected-app access, cross-app entry points, and app-level summaries
- SeenInSeven admin: onboarding answers, script content, activity log, progress, support notes, and the legacy paid toggle
- Studio customer hub with independent SeenInSeven and AI Boardroom entitlements
- Full AI Boardroom under `/boardroom`, with isolated workspaces, profiles, documents, conversations, cards, and memory
- Boardroom app-specific admin with access and activity reporting
- SeenInSeven Prompt Tester with real read-only user context, editable test answers, safe blueprint publishing, and undo
- Event logging: script_generated, script_failed, auth_completed, video_filmed, magic_link_sent
- Start Over (clears scripts and onboarding, stays logged in, stays on dashboard)
- Fullscreen preview mode for scripts
- PDF export (single script and all scripts)
- Copy (single script and all scripts)
- Vubli partner card (unlocks after first script generated)

---

## What is NOT built yet (roadmap)

**Phase 5 — The business-critical items:**

**1. Systeme.io entitlement automation**
Studio app access currently works and can be granted or revoked manually by an administrator. The remaining payment work is a Systeme.io webhook that finds the customer by email and grants or revokes the correct `studio_entitlements` row. Do not build a second login system or use legacy `users.is_paid` as the master Studio access record.

**2. Community bridge**
The Facebook group (`facebook.com/groups/coloradobiz`) is a core part of the product, not a footnote. Three moments in the app need a prominent, emotional bridge to the community: after first script generated, after each video filmed, and after all 7 completed. Currently there is only a small card at the bottom of the dashboard.

**3. Graduation Event bridge**
When all 7 videos are filmed, the completion screen needs to explicitly name the Graduation Event, build anticipation, and provide a register link. Currently it just says "Level Complete" and links cold to the EEE page.

**4. Email touchpoints**
Transactional emails for: first script generated (save your progress), 3-day nudge if stuck, completion congratulations, Graduation Event reminder. Requires a transactional email provider — Supabase's built-in mailer is rate-limited and unreliable for this. Postmark or Resend are recommended.

**Studio expansion after the current apps:**

The superapp foundation is built. Future priorities are connecting Systeme.io to entitlements, adding EEE tools to the existing Studio catalog and shared session, and expanding cross-app progress reporting. Every future app should plug into the existing identity, entitlement, hub, and master-admin model instead of creating another login or customer-facing deployment.

---

## David's preferences and working style

**Voice and copy rules — strictly enforced:**
- No em dashes anywhere. Ever. Use periods, commas, colons, parentheses, or ellipsis instead.
- No bold text emphasis mid-paragraph (headers and CTAs only)
- Banned words: algorithm, framework, funnel, ebook, guru, cohort, ultimately, resonate, webinar, "AI slop"
- No "not because X but because Y" / "that's not X that's Y" constructions
- No "most people" or "version of you" generalizations
- Face emojis only, at genuine emotional beats. No object or symbol emojis in copy.
- The challenge is always the product. SeenInSeven is always the bonus. Never reverse this.

**Design preferences:**
- Brand colors: Teal Deep `#0D2828`, Teal Vivid `#32B8B8`, Gold `#C8A84B`, Gold Light `#E8C86C`, Green `#4ade80`
- Fonts: Lora (headlines, serif italic), Nunito (body), Oswald (labels, buttons, eyebrows), Permanent Marker (pull quotes), Space Mono (technical, monospace labels)
- Body copy minimum 18px, line-height 1.75-1.85 (audience skews 50+)
- Buttons: 14-15px Oswald
- Eyebrows: 12px Space Mono, 0.28em letter-spacing
- One bold sentence per section (for skimmers), never em dashes

**Development preferences:**
- Make it work, don't over-engineer. Prove the core product before adding complexity.
- No new offer layers or feature additions before the existing funnel is proven.
- IP in `api/_lib/blueprints.txt` is changed only with David's explicit instruction and the protected publishing flow.
- Straightforward UX — the user base is non-technical, often 50+, camera-shy, first-time content creators.
- Progress and momentum matter more than feature completeness. Every screen should answer: where am I, what's done, what's next.

**Systeme.io is the payment/landing page platform.** Custom HTML blocks on Systeme must not contain full document structure (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>` tags). CSS classes are prefixed per page to prevent style bleed. OnlineCourseHost is the course delivery platform and should never be named directly in customer-facing copy.

---

## Debugging history — mistakes made, bugs found, lessons learned

Read `DEAR_FUTURE_CLAUDE.md` first. It documents the single most expensive debugging session in this project.

**The blank screen saga:**
The dashboard (`plan-screen`) was rendering with correct CSS, correct classes, correct innerHTML, but zero dimensions — `getBoundingClientRect()` returned all zeros. Multiple sessions concluded it was a JavaScript timing issue and spent hours on:
- `transitioning` flag races between concurrent auth events
- Double `showDashboard` calls from `initAuth` and `onAuthStateChange`
- Supabase auth deadlocks from awaiting DB calls inside the auth callback
- A missing `</head>` tag (real bug, not the blank screen)
- Animation timing issues in `showScreen`

**The actual cause: two missing `</div>` tags in `index.html`.** `screen-comm-layers` was never closed. The browser parsed every subsequent screen as a child of it. Since `.screen { display: none }`, all children inherited zero dimensions regardless of their own CSS. Total debugging time across multiple sessions: approximately 12-15 hours.

**The diagnostic you run first, before touching JavaScript:**
```js
const el = document.getElementById('THE-BLANK-ELEMENT');
let node = el;
while (node && node !== document.body) {
  const r = node.getBoundingClientRect();
  console.log(node.tagName, '#' + node.id, r.width + 'x' + r.height, getComputedStyle(node).display);
  node = node.parentElement;
}
```
If any ancestor has zero dimensions, the bug is in the HTML structure, not JavaScript.

**Also run this to verify all screens are direct body children:**
```js
[...document.querySelectorAll('.screen')].filter(s => s.parentElement !== document.body).map(s => s.id + ' inside: ' + s.parentElement.id)
```
Should return an empty array. If it doesn't, find and close the unclosed tag.

**Other confirmed bugs found and fixed:**

1. `renderVideoIntro()` takes a 1-based video number. Multiple navigation functions passed 0-based indices, sending users back to the same video. Always use `idx + 2` (not `idx + 1`) when calling `renderVideoIntro` from a 0-based index.

2. `onAuthStateChange` Supabase deadlock. Awaiting any DB call inside this callback causes a permanent hang. All DB work is deferred via `setTimeout(0)`. This is not optional.

3. `_mergeLocalStorage` only merged the videos object when it was empty. After `_restoreFromDatabase` runs, videos are already populated from DB, so localStorage keys like `locked_v0`, `_undo_v0`, and prompt answers were silently discarded on every return visit. Now uses an additive merge.

4. `goBackToPrompts` (both the script view back button and the prompts screen back button) was routing to `screen-7` for video 0. Video 0 uses `screen-comm-layers`, not `screen-7`. Required separate handling.

5. `dismissBanner` ("Start Fresh" on the returning user banner) was calling `signOut()`, logging the user out entirely. Should only clear local state.

6. The settings panel was inside `plan-screen` div. Since `plan-screen` has `display: none` on all other screens, `position: fixed` children are still invisible when the parent is `display: none`. The panel had to be moved to body level.

7. `confirmLevelChange` (in Settings) didn't archive existing scripts before switching levels. Scripts stored by index (`script_v0`) would render against wrong video titles after a level switch. Fixed to mirror `runItAgain()` which correctly archives L1 scripts to `l1Videos` before clearing.

8. The admin panel used direct Supabase table queries which hit RLS. Even with `is_admin = true`, the anon key couldn't read other users' data through standard queries. Fixed by using `SECURITY DEFINER` RPC functions that bypass RLS and verify admin status internally.

9. Multiple `copyScript` / `copyAllScripts` functions were reading from the textarea element value, which is empty when the user is on the Structured view. Always read from `state.videos['script_v' + idx]` as the source of truth.

10. `goBackToPrompts` set `editingFromPlan = true` when navigating backwards through normal flow. This caused the script view footer to show "Done — Back to Dashboard" instead of the normal "Next Video" CTA.

11. The Prompt Tester auth overlay remained visible after a successful session because an `.auth-screen` display rule overrode the HTML `hidden` attribute. Admin styles that use hidden panels must preserve `[hidden] { display: none !important; }`.

12. First-time email attachment originally routed anonymous users back through onboarding and the auth callback removed `bwb_challenge_v1` before `_mergeLocalStorage()` could preserve their work. Settings now has its own email form, and save-progress magic links use a matching, short-lived account-link marker so anonymous scripts and progress are uploaded before dashboard restoration.

12. Prompt Tester selections and editable answers initially reset when the page was left or reloaded. They are now namespaced in browser storage by selected user, level, and video. This storage is an administrator's test draft only and must never overwrite customer data.

13. Older SeenInSeven prompt answers lived only in each customer's browser, so they could not reliably prefill an administrator's tester. `onboarding.video_answers` now stores future answers by level while keeping Level 1 and Level 2 field names isolated.

---

## Key URLs and credentials (for reference)

| Resource | URL / Value |
|----------|-------------|
| Studio | https://studio.coloradomastermind.com |
| SeenInSeven | https://studio.coloradomastermind.com/seeninseven |
| AI Boardroom | https://studio.coloradomastermind.com/boardroom |
| Studio admin | https://studio.coloradomastermind.com/admin |
| SeenInSeven admin | https://studio.coloradomastermind.com/admin/seeninseven |
| Prompt Tester | https://studio.coloradomastermind.com/admin/seeninseven/prompt-tester |
| AI Boardroom admin | https://studio.coloradomastermind.com/admin/boardroom |
| GitHub | https://github.com/DavidBeeeee/seen-in-seven |
| AI Boardroom GitHub | https://github.com/DavidBeeeee/boardroom2 |
| Supabase project | zdtkwpzdwnzzmdwrvmka |
| Supabase URL | https://zdtkwpzdwnzzmdwrvmka.supabase.co |
| Vercel project ID | prj_z0cydoxLzaTOusdNd7kpkDyMdFou |
| Challenge landing | content.coloradomastermind.com/777challenge |
| Free trial | content.coloradomastermind.com/7videos |
| EEE membership | content.coloradomastermind.com/yeees |
| Facebook group | facebook.com/groups/coloradobiz |
| Calendly | calendly.com/davidbee |
| David email | email@davidbee.me / contact@davidbee.me |
| David phone | 303-596-0511 |

---

## What to read before writing any copy

The following principles govern every word of copy in this app and the broader Colorado Mastermind brand:

- The challenge is the product. The $311 app is the bonus. Do not reverse this.
- The Graduation Event is never called a webinar. It is a live training.
- The seven videos are not a streak challenge. Order matters. Pace does not.
- David is a peer doing the challenge alongside participants, not an expert coaching from above.
- The Facebook community is the participant's first real audience and an active algorithm boost, not just accountability. Never undersell it.
- The framework behind the 7 videos is described publicly as "scientifically, sociologically, and historically proven." Never use: framework, psychological architecture, Hero's Journey, or algorithm in public-facing copy.
- The hook and open loop have separate jobs. The hook is a truthful pattern interrupt that captures attention before the viewer cares. The open loop converts that attention into one specific unanswered question that the conclusion later pays off. Never merge them or remove either one.
- If it sounds like David, it stays. Loose, conversational, and playful language is correct, not a mistake.
## 2026-07-26: Restore the actual 5E Epiphany engine

- Untangled Hero's Journey chapter placement from 5E content construction for Videos 3 and 6 at both levels.
- Restored the Hook to a pure pattern interrupt in every video. Removed the Video 3 forbidden-idea and Video 6 earned-verdict Hook jobs.
- Added a private `UNANSWERED QUESTION` / `CONCLUSION ANSWER` contract. The Open Loop creates the exact conceptual gap, the Meat intensifies it through one evidence thread, and only the Conclusion may resolve it.
- Replaced mandatory seven-beat spoken checklists with four 5E content moves: familiar model, contradicting evidence, unresolved cognitive dissonance, and paradigm shift. Aha Transfer, Simplicity Signal, and Authority Anchor are now review outcomes.
- Removed the mandatory Level 2 mentor question and every runtime mentor requirement. Naturally supplied people or influences remain allowed as evidence.
- Simplified the Level 2 Video 3 and Video 6 private packets around cognitive dissonance and a reserved paradigm shift.
- Allowed Videos 3 and 6 a 240-300 word range so connective story logic is not compressed into slogan stacks.

## 2026-07-26: Global information ownership and metaphor discipline

- Added `nobody` as an exact global banned word. Previously, the style guide and deterministic validator only banned longer phrases containing it.
- Added a five-section Information Ledger to the shared writing rules. Hook, Open Loop, Meat, Conclusion, and CTA must each contribute a different story move, and paraphrased meaning counts as repetition.
- Added a one-metaphor-family rule with a normal limit of two meaningful uses per script.
- Strengthened semantic review to compare section meanings, replace later duplicates with their missing story function, preserve forceful controversial epiphany conclusions, and reject synonym swapping as a fake repetition fix.
- Deliberately avoided a deterministic semantic word-frequency check because it would risk another mechanical rejection loop on legitimate repeated subject words.

## 2026-07-26: False-balance generation loop repair

- Removed one overbroad deterministic voice check that treated any negated word repeated in the following sentence as false balance. It could reject legitimate epiphany contrast or evidence, then keep rejecting the repair for using the same subject word.
- Kept the precise deterministic bans for actual canned false-balance constructions, including `not because`, `it is not X, it is Y`, `you are not X, you are Y`, repeated `the point is not...the point is...`, and mirrored correction patterns.
- The semantic story reviewer still rejects false balance by meaning. The deterministic layer now blocks only shapes it can identify reliably.

## 2026-07-27: Level 2 Video 5 ordeal reconstruction

- Reduced the Level 2 Video 5 extended journal from five demanding questions to three human prompts: what happened and seemed lost, what part was the speaker's fault, and what they tried when recovery still failed. Existing `v4p4` and `v4p2` answers remain stored and are silently supplied as legacy context when present.
- Added a dedicated Level 2 Video 5 material router for production generation, full regeneration, section regeneration, and the admin Prompt Tester. It chooses one ordeal nucleus, distinguishes gradual or symbolic professional death from an ordinary setback, preserves the owned choice and failed recovery, and removes hindsight, recovery, and Video 6 meaning before the writer sees the packet.
- Corrected the shared current-answer extractor so Easy journal mode is recognized by the Level 2 preparation paths instead of accidentally forwarding the entire unsorted message.
- Restored the section boundary inside Video 5: the Hook is only a pattern interrupt, the Open Loop is only the pressing unfinished meaning, the Meat carries one causal descent, the Conclusion owns the lowest-point belief, and the CTA cannot announce that recovery has begun.
- Kept quality review deliberately narrow. Level 2 Video 5 may fail review for lacking a real defeat, owned contribution, or failed recovery, or for leaking recovery and Video 6 meaning. It must not fail merely because the ordeal is gradual, internal, commercially specific, morally complicated, unusually phrased, or less objectively dramatic than another person's hardship.

## 2026-07-27: Canonical script style guide

- Restored David's complete script style guide inside `<style_guide>` in `api/_lib/blueprints.txt`, where the initial writer, full regeneration, section regeneration, production preview, consistent test, and semantic reviewer all receive it through the same focused prompt.
- The Hook-and-Eye Seamless Rule applies only inside MEAT. Hook, Open Loop, Conclusion, and CTA remain independent writing operations, so continuity editing cannot soften the Hook or convert the Open Loop into setup.
- Added explicit rules for eighth-grade conversational speech, contractions, I/me/my perspective, one-listener language, concrete specificity, contextual `land` and `ship` bans, false balance, commercial wording, cross-section repetition, and preservation of intentional profanity, aggression, controversy, unusual facts, and emotional force.
- `<banned_script_terms>` is now the single machine-readable source for hard script bans. It includes complete vague-noun, generalization, LLM-cliche, and commercial word forms, including `thing`, `things`, `something`, `anything`, `everything`, `nothing`, `selling`, `sold`, `paid`, `payments`, and related inflections.
- `api/_lib/prompt-engine.js` parses that exact list for deterministic checks instead of maintaining a second JavaScript list. Prompt Tester draft validation and published blueprint validation now share one server-side validator and reject a missing or malformed style guide before generation or publishing.
- The Prompt Tester's Blueprint Draft toolbar includes a Style Guide jump button so the canonical guide remains directly editable alongside the 14 video sections.

## 2026-07-27: Reversible unified-composition experiment

- Replaced the five-line Information Ledger with one source-compression and whole-script composition rule. This is a replacement, not an additional framework.
- Material routers now treat their headings as non-overlapping evidence ownership. A fact, phrase, number, duration, event, or consequence is kept in its strongest location once; dependent headings add only the new relationship.
- The writer silently collapses duplicate source material, gives every retained fact one primary section, privately settles the Conclusion, CTA, Meat, Open Loop, and Hook jobs, then writes the visible five-section script once from Hook through CTA.
- The Hook and Open Loop definitions were deliberately preserved. The Hook remains an independent pattern interrupt, the Open Loop remains one pressing unanswered question, and sentence-level Hook-and-Eye remains limited to Meat.
- No word-frequency rejection or new repetition repair loop was added. The structural goal is to prevent duplicate material from reaching the visible draft.
- Rollback point: Git tag `before-unified-composition-2026-07-27` targets commit `33d3beca90c2cba5a1fd70a282ebcc7d8399ae0e`. Revert the isolated experiment commit or restore that tag if testing weakens Hooks, Open Loops, or overall output.

## 2026-07-27: True full-script regeneration

- `Regenerate Full Script` now means a genuinely fresh script from the saved answers, cumulative prior-video context, active blueprint, and new feedback. The previous script is not included in the browser request or API writing prompt.
- The previous script is still saved before regeneration and pushed into the local undo history. Database script versioning continues to preserve it when the new complete script is saved.
- Full regeneration now uses the same unified composition contract as first-time generation. The older regeneration-only instruction that described five distinct drafting operations was removed.
- Semantic review no longer stitches targeted section replacements into a full regeneration. If the first new draft needs substantive correction, the writer receives the issue descriptions and produces another complete five-section script. Reviewer replacement prose is deliberately ignored.
- Section regeneration is unchanged. It still receives the current complete script and replaces only the requested section.
- Level 2 Video 1 full regeneration now receives the same private material routing as its first generation, restoring parity for that chapter.
- `scripts/check-prompt-style-guide.mjs` verifies that a sentinel from the previous script cannot enter the full-regeneration prompt and that a failed semantic review produces one complete replacement rather than a section merge.

## 2026-07-27: Full-regeneration failure recovery

- The script view now keeps a persistent regeneration status visible. It clearly distinguishes writing, success, and failure, states that the previous script remains unchanged on failure, and offers an immediate retry button.
- A failed regeneration no longer flashes `Error` for three seconds and silently returns to the old script. The client records a `script_regeneration_failed` event with video, level, error code, and server message.
- The client refuses to save or label an exact unchanged response as a fresh script.
- The generation API now logs rejected requests with mode, level, video number, and error message without logging the user's answers. Error responses include a stable diagnostic code.
- Fresh regeneration still receives one independent story review. If that review or a hard rule finds a problem, all subsequent corrections rewrite the complete script. A final hard-format correction no longer requires another subjective review and never stitches section replacements together.
- The script asset query was changed to `full-regen-3` so existing browsers load the corrected interface immediately.
- Deleting and re-answering a video now clears any earlier full-regeneration status immediately. A successful standard generation also clears stale regeneration feedback before showing the newly generated script.

## 2026-07-27: Global Hook Studio and Open Loop separation

- This architecture supersedes every older handoff note that assigns a Hook to a journal answer, trial, scene, evidence source, present-day action, Hero's Journey beat, or chronological story opening.
- The story writer now creates `[OPEN LOOP]`, `[MEAT]`, `[CONCLUSION]`, and `[CTA]` around a disposable nonempty Hook placeholder. The story reviewer is explicitly prohibited from reviewing, replacing, connecting, or assigning story material to that placeholder.
- After the story passes, the global Hook Studio receives the completed story and full user context. It creates six materially different candidates across at least five attention mechanisms. Hooks may use defensible rhetorical compression, exaggeration, provocative framing, playful absurdity, or opinion, but may not invent a personal event, credential, measurable result, quotation, or audience reaction.
- A separate Hook judge chooses the strongest candidate. It rejects chronology, scene setup, biography, progress reports, chapter summaries, generic curiosity, explanations, lessons, results, and lines that require prior interest in the speaker. A Hook does not need to introduce the story, contain a Meat fact, represent the journey stage, or transition into the Open Loop.
- The Open Loop is also independent. It is written from the completed Meat and reserved Conclusion, not from the Hook. An abrupt pivot is valid. Its only job is to create one specific unfinished meaning, contradiction, cause, consequence, or question that retains the viewer without revealing the Conclusion.
- The Hook-and-Eye Seamless Rule applies only inside Meat. Conclusion and CTA remain their existing closing unit. CTA guidance was not changed in this correction.
- Regenerating only a Hook uses the same Hook Studio and judge. First-time generation and full regeneration both discard the draft Hook before story review and install the final selected Hook afterward.
- Blueprint validation now refuses publication unless all 14 video rules preserve global Hook Studio ownership. It also rejects known regression phrases that reconnect the Hook to the Open Loop, assign it to an answer, or restore composition from Hook through CTA.
- `scripts/check-prompt-style-guide.mjs` verifies all 14 ownership lines, forbidden coupling phrases, Meat-only continuity, provisional-Hook story review, judge-directed Hook retry, and byte-for-byte preservation of Open Loop, Meat, Conclusion, and CTA during final Hook installation.
- The generation request timeout is now 150 seconds to accommodate the final Hook Studio and judge without the browser abandoning a valid in-progress request.
- The current script asset query is `hook-studio-1`.

## 2026-07-27: Active script locks separated from lock history

- `video_progress.locked_at` remains the historical first-lock achievement used by the points engine. It no longer controls whether the current script appears locked.
- The additive `video_progress.is_locked` column is now the current cross-device UI state. Its migration backfills `true` only when a historical lock and a current script both exist.
- Deleting and restarting a script marks its current script version inactive and sets `is_locked = false`. The historical `locked_at` value remains intact.
- `Unlock to edit again` now persists `is_locked = false` instead of changing only local storage.
- Database restoration requires both `is_locked = true` and a current script before restoring `locked_v*`. A database `false` actively removes stale local lock state.
- Dashboard and tracker rendering also require a script to exist before showing `Locked`, providing a second defense against stale state.
- Local points use `ever_locked_v*`, populated from `locked_at`, so deleting or unlocking a script does not remove earned lock credit.
- `scripts/check-lock-state.mjs` guards the migration, deletion, unlock, restore, rendering, and historical-points boundaries.
- Script asset queries are `active-lock-1` for `supabase.js`, `points.js`, and `app.js`.

## 2026-07-27: CTA grammatical hinge and specific conditional bridges

- Replaced the old mandatory two-sentence CTA template, which structurally created an isolated bridge sentence followed by a detached follow command.
- Every CTA now carries one concrete element from the Conclusion through a conjunction, relative clause, or subordinating clause into the follow request without a full stop. The bridge, follow action, seven-video orientation, exactly one `because`, and specific reason remain one connected spoken movement.
- Conditional viewer-recognition bridges remain available when they name the exact situation, consequence, or emotion created by the current story. Generic approval tests such as `if that landed`, `if this resonates`, or interchangeable validation language remain prohibited.
- Added `somebody` to the canonical machine-readable banned-term list. The writer and validator must replace it with a specific role or relationship supported by the story rather than another vague placeholder.
- Deterministic CTA validation now rejects a period, question mark, or exclamation point between the CTA bridge and follow request. Regression coverage confirms that a connected hinge passes and the former period-plus-command structure fails.
- This change deliberately did not alter Open Loop construction. Payoff leakage remains the next architecture issue to resolve separately.

## 2026-07-27: Zeigarnik Open Loop Studio and payoff firewall

- `[OPEN LOOP]` remains the stored and visible section label, but its internal writing job is now defined as the Zeigarnik Retention Gap: one precise piece of unfinished mental business that the current Conclusion must fulfill or reframe.
- Added a Payoff Firewall to the global blueprint. Before the final Open Loop is written, the system quarantines every reveal-only person or role, event, action, delivery method, quotation, evidence, result, and distinctive phrase that would let the viewer predict how the Conclusion arrives.
- Added a dedicated Open Loop Studio after story review and before the existing Hook Studio. It receives the focused blueprint, stage contract, user context, Meat, Conclusion, and CTA. The draft Open Loop and Hook are deliberately withheld.
- The Studio generates exactly four 25-to-50-word candidates. Deterministic filtering removes banned language, invalid length, long cross-section repetition, and exact quarantined payoff leakage before an independent Open Loop judge sees the slate.
- The judge applies three semantic tests: the speaker could say the line immediately before the payoff occurred; the viewer cannot predict the person, event, action, delivery method, evidence, quotation, or result that resolves it; and a cold viewer can name the unresolved relationship and wants the answer.
- The current Open Loop closes in the current Conclusion. The CTA remains responsible for opening the next-video question.
- First-time generation, full regeneration, admin Prompt Tester production output, and single-section Open Loop regeneration all use the same Studio. Prompt Tester now also mirrors production by installing the final Open Loop before running the unchanged Hook Studio.
- The Open Loop Studio can replace only `[OPEN LOOP]`. Regression checks prove that Hook, Meat, Conclusion, and CTA remain byte-for-byte unchanged, that the old draft Open Loop is withheld, and that candidates naming a reserved delivery method do not reach the judge.
- Studio responses are capped at 650 tokens and judge responses at 300 tokens to keep the added generation time focused.
- Rollback point: Git tag `before-open-loop-studio-2026-07-27` targets commit `fb9a999`, immediately before this architecture was added.

## 2026-07-27: L2V4 Open Loop Studio failure repair

- Production logs showed two distinct failures after the Studio launch. Standard L2V4 generation reached the Studio but exhausted both Open Loop attempts. Full regeneration sometimes failed earlier because the legacy story review still rejected the disposable draft Open Loop for 65-to-67-word length, banned terms, and false balance before the final Studio could replace it.
- Hook and Open Loop are now both true provisional sections during whole-story review. Their draft text is replaced with safe placeholders, their deterministic and semantic issues are excluded from that review, and the reviewer receives an explicit scope limiting it to Meat, Conclusion, and CTA.
- The Open Loop Studio remains the only owner of the final Open Loop. This removes competing review authority rather than loosening the final retention standards.
- Payoff quarantine now discards broad abstract terms and details already established in the Meat. A detail visible before the Conclusion cannot be treated as reveal-only merely because the Studio repeated it in `quarantined_terms`.
- The Studio accepts a usable deduplicated candidate slate even when the model does not return four unique strings. Each rejected candidate now produces exact retry feedback for word count, named payoff leakage, banned language, stage rules, or cross-section repetition.
- Regression coverage proves that an overlong draft Open Loop containing banned language cannot block the story before the Studio and never reaches the story reviewer.

## 2026-07-27: Contract-first Zeigarnik architecture

- This section supersedes the earlier four-candidate Open Loop Studio and independent Open Loop judge described above. That design prevented direct payoff leakage but could still select the wrong unresolved question. In L2V4 it chose whether the speaker would continue, even though the Meat answered that decision immediately and the Conclusion actually owned a meaningful result.
- Removed the candidate contest and semantic rejection judge. Open Loop construction now has two affirmative steps: an Architect defines the exact retention contract, then a Writer executes that approved contract once.
- The Architect returns `answer_kind`, `retention_question`, `conclusion_answer`, `meat_boundary`, `known_before_payoff`, and `quarantined_details`. It is explicitly required to derive the retention target from what the Conclusion uniquely answers rather than from the loudest tension in the Meat.
- The `meat_boundary` is the load-bearing addition. It states what the Meat may establish and the exact answer it must stop before. For result-driven Conclusions, the Architect cannot use what the speaker decided as the retention question when the Meat already shows that decision.
- The Writer receives the contract, Meat, and Conclusion. It writes one 25-to-50-word Open Loop directly from `retention_question` and `known_before_payoff`, stops at `meat_boundary`, and withholds `conclusion_answer` and every quarantined detail.
- There is no semantic pass/fail judge after writing. Existing deterministic format, banned-language, length, stage, and repetition checks may request one targeted mechanical rewrite, but they do not choose among competing story interpretations.
- Regression coverage verifies that the Open Loop draft remains withheld, the Writer receives the exact approved retention question and Meat boundary, and only Open Loop changes during installation.

## 2026-07-27: Open Loop cleanup made non-blocking

- Production logs after the contract-first deployment showed that the Architect succeeded, but both Writer attempts were still converted into a 500 response when the old deterministic cleanup checks disliked the resulting prose.
- The Writer now receives at most one focused cleanup request. When the second nonempty Open Loop still has a mechanical or style imperfection, the app returns that written section instead of discarding the entire script.
- JSON remains the preferred Writer response, but plain spoken text is now accepted as a resilient fallback.
- Mechanical cleanup issues are logged with level, video, attempt, and issue descriptions without logging user answers or script content.
- The only remaining hard failure at this stage is an empty Writer response after both attempts. Regression coverage confirms that a nonempty Open Loop survives an unsuccessful cleanup pass.

## 2026-07-27: Narrow style packet for the Open Loop Writer

- The Open Loop Architect remains the only Open Loop step that receives the complete focused blueprint. It distills those story instructions into the approved Zeigarnik contract.
- The Open Loop Writer now receives only the canonical visible-script style guide, internal-story-language firewall, active video stage contract, approved Zeigarnik contract, Meat, and Conclusion.
- The full focused blueprint is deliberately not repeated in the Writer call. This avoids giving the prose step competing story maps or instructions from unrelated videos while restoring the banned-term and voice rules that had been missing from that call.
- The Writer is instructed to use the minimum setup required to make the retention question understandable and not copy complete sentences or distinctive phrases from Meat or Conclusion.
- Hook Studio code, prompts, candidate generation, judge behavior, and inputs were not changed. Existing regression checks continue to prove that Open Loop construction cannot change Hook and that final Hook installation cannot change Open Loop, Meat, Conclusion, or CTA.
- Regression coverage confirms that the Writer receives the canonical banned-term block and active stage ownership contract without receiving the full focused blueprint.

## 2026-07-27: Fourteen-path story audit and independent Video 6 epiphanies

- Audited every Level 1 and Level 2 chapter against the active seven-video journey, all question catalogs, focused prompt extraction, production generation, section regeneration, full regeneration, admin Prompt Tester, style enforcement, Open Loop Studio, and Hook Studio.
- Corrected the Video 6 architecture at both levels. Video 6 is always causally earned by the Video 5 ordeal and aftermath, but it no longer has to deepen, correct, or complete Video 3. A natural relationship may remain as one brief continuity clause; an independent second epiphany is equally valid.
- Rebuilt the Level 2 Video 6 evidence packet around `VIDEO 5 FALL`, `PRE-FALL UNDERSTANDING`, `AFTERMATH EVIDENCE`, `UNRESOLVED COLLISION`, observable change, and the reserved hard-won paradigm shift. `OPTIONAL VIDEO 3 CONNECTION` may explicitly return `Not supplied`.
- Reduced both Video 6 extended interviews from five questions to four journal-style prompts: hard-won understanding, aftermath evidence, observable change, and viewer recognition. Existing `v5p2` answers remain stored and flow through as optional legacy context, so no saved customer material is deleted.
- Updated Easy mode, user-facing chapter guidance, script-view rationale, the admin question catalog, the runtime stage contracts, semantic review, and the canonical journey guide to the same rule.
- Removed three stale local instructions that contradicted the global Hook/Open Loop separation: Level 1 Video 1 could no longer bridge from the Hook, Level 1 Video 2 could no longer require its unexpected detail in the Hook, and Level 1 Video 4 could no longer connect Hook evidence into the Open Loop.
- Kept the Hook Studio implementation unchanged. Regression coverage now executes its shared final-replacement path at both Level 1 and Level 2 and proves that Open Loop, Meat, Conclusion, and CTA remain unchanged.
- Restored production/admin parity for Level 2 Video 1. First generation, full regeneration, section regeneration, and Prompt Tester generation now all use the same private material preparation.
- Added `scripts/check-story-architecture.mjs`. It verifies all 14 focused prompt sections, all four local section-guidance lines, both stage contracts, the optional Video 3 rule, required Video 5 causality, production/test routing parity, exact app/admin question parity, four-question Video 6 interviews, and preservation of legacy `v5p2`.
- Browser asset queries are `story-audit-1` for the customer app and admin question catalog so refreshed sessions receive the audited questions immediately.
- Local production-secret testing is intentionally unavailable because Vercel returns `[SENSITIVE]` for the protected DeepSeek key. Do not copy the key into an unprotected local variable. Exercise live model output through the deployed authenticated Prompt Tester instead.
