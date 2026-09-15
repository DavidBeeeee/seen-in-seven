# 777 Challenge Master Overview

**Owner:** David Bee  
**Canonical planning status:** Current working truth  
**Last reconciled:** September 15, 2026  
**Applies to:** the private validation challenge, the future monthly group challenge, SeenInSeven, the public Systeme pages, Studio access, and the continuation offer

## 0. Why this document exists

This is the first file to read before planning, writing, editing, or building anything for the 777 Challenge.

The older Word overview remains useful source history, but it mixed together three different things:

1. The private one-person-at-a-time validation experience happening now.
2. The recurring monthly group challenge being prepared for later.
3. SeenInSeven, which has two levels and fourteen script paths underneath the seven-day challenge.

Those three layers are related. They are not interchangeable.

### Source-of-truth order

Use these sources in this order:

1. **This overview for business decisions and the shape of the experience.**
2. **`SEENINSEVEN_ROADMAP.md` and `CLAUDE.md` for product direction and technical constraints.**
3. **`Hero's Journey 777 Video Challenge.md` and `api/_lib/blueprints.txt` for the current story architecture.**
4. **Live Systeme, Supabase, Vercel, and Studio for what is actually running.**
5. **Older launch plans, decks, copied HTML, and handoff documents as historical reference only.**

A live system can be intentionally paused, unfinished, or carrying stale copy. Seeing something live does not automatically make it the business decision. When live behavior and this document disagree, verify the discrepancy and update the correct owner instead of silently choosing whichever source is easier.

## 1. The one-paragraph version

The 777 Challenge helps a camera-shy person turn their lived experience into seven connected short videos and actually begin showing up. The challenge is the product. SeenInSeven is the tool included with it, and it interviews the participant, discovers the story, and writes the scripts in their voice. The active program is private validation with one person at a time. The future group version will run on a synchronized monthly cycle beginning on the 7th, once the private proof gates are met. The Momentum Hub is the intended continuation after the challenge.

## 2. Current status, dated September 15, 2026

### Active now

- The private Tiny Challenge is the active validation program.
- Naya has generated Videos 1 and 2 at Level 2.
- Magdalena has completed onboarding and generated Videos 1 and 2 at Level 1.
- The $7 checkout, signed webhook, and SeenInSeven Studio entitlement route work.
- `777Interest` and `777Joined` are the only two 777 contact-state tags.

### Built but intentionally inactive

- The future monthly group launch cycle is disabled in `js/777-launch-cycle.js`.
- Systeme campaign `1194092` contains twelve written emails. All twelve are inactive and have no sending positions while David finishes the sequence.
- The Momentum Hub page is closed because the public group challenge is not open.

### Still incomplete

- The private validation ledger must reflect the people actually participating.
- The live day pages still contain missing videos and several stale labels.
- The paid product has no custom confirmation email.
- The private-offer language and the Momentum Hub continuation need one final reconciliation.

No calendar date overrides proof. The group version is not ready merely because another 7th arrives.

## 3. The three operating layers

### Layer 1: Private validation

One person at a time, free during validation, privately guided by David Bee. This is where the experience, app, objections, offer, and delivery are proved.

### Layer 2: Monthly group challenge

A synchronized recurring experience beginning on the 7th of a month. It is automated around a shared calendar, public daily pages, a Kickoff, and a Victory Celebration. It is not on-demand evergreen.

### Layer 3: SeenInSeven product

The app and story engine underneath the experience. It contains two seven-video levels, fourteen video paths in all. The $7 challenge promises the first seven-video experience, not an unlimited script generator.

## 4. Audience

Write to one recognizable person rather than a room.

- Usually 45 to 60 and often non-technical.
- Has useful experience, a craft, a career, a practice, or years of helping people informally.
- Has never posted consistently, or tried a few times, disliked the result, and stopped.
- Feels time moving and believes other people figured out something they missed.
- Is afraid of judgment from people who already know them.
- Has been told to be authentic and consistent without being shown what to say.
- May be building a business, considering one, or trying to become visible before the rest of the business is fully built.

The useful diagnosis is not that this person lacks motivation or value. They have been trying to solve visibility, message, confidence, technology, and the business behind the content all at once.

## 5. Offer ladder

1. **777 Challenge, $7 one time.** The product and the front door.
2. **SeenInSeven.** Included with the challenge and valued publicly at $297. Its standalone retail page is a separate shelf, not the challenge entry point.
3. **The Momentum Hub, $250 per month.** The intended continuation after the challenge, with StorySculpt, Next Step Navigator, AI Boardroom, and Certainty Sessions.
4. **Unlimited One-on-One Support, $250 per month.** A separate parked possibility at `yes.davidbee.me`, not part of the public 777 path unless David explicitly reopens it.

The retired $311 SeenInSeven price and the retired $77 Hub price must not return.

## 6. Funnel and customer journey

| Stage | URL | Current job |
| --- | --- | --- |
| Opt-in | `content.coloradomastermind.com/777` | Captures interest and applies `777Interest`. It is not the checkout. |
| Paid checkout | `content.coloradomastermind.com/777challenge` | Sells the $7 challenge through digital product `3275807` and price plan `3122070`. |
| Buyer start | `content.coloradomastermind.com/startnow` | Sends the buyer toward Studio after checkout. |
| Studio | `studio.coloradomastermind.com/seeninseven` | Authenticated SeenInSeven experience and progress tracking. |
| Kickoff | `content.coloradomastermind.com/kickoff` | Day 0 presentation and working start. |
| Meeting booking | `content.coloradomastermind.com/777meeting` | Books the Midweek Momentum Meeting. |
| Booking gift | `content.coloradomastermind.com/day1b-26c3684c` | Delivers the interactive recording-beliefs gift after booking. |
| Daily experience | `/day1` through `/day7` | Public teaching and conversion pages plus the participant's daily action. |
| Victory | `content.coloradomastermind.com/victory` | Graduation for every participant, regardless of completion. |
| Continuation | `content.coloradomastermind.com/yeees` | Momentum Hub offer page. |
| Hub checkout | `content.coloradomastermind.com/yeseee` | Momentum Hub checkout. |

The old `/7videos` page is retired and must not be referenced.

## 7. Contact state and paid access

The 777 funnel has two contact states:

- **`777Interest`:** the person opted in. This does not prove payment.
- **`777Joined`:** Systeme recorded a successful purchase of the $7 product.

`777Joined` is a resource on the paid digital product. It is applied after successful payment, not when the checkout form is submitted.

The same successful purchase independently reaches `studio.coloradomastermind.com/api/systeme-webhook`. The webhook verifies the signature, records the message id, maps price plan `3122070` to SeenInSeven, and creates the Studio access grant. The Systeme tag records the commercial contact state. The Studio entitlement controls app access.

There is no `777Emails` routing tag. When the email sequence is ready, it should subscribe directly from `777Joined` rather than inventing a third state.

## 8. Private Tiny Challenge validation

### Purpose

Prove that David's guided experience reliably turns lived experience into approved scripts, reveals the real blocker, and creates a continuation people want.

### Normal shape

1. Private intake and written commitment.
2. Day One diagnostic, belief shifts, SeenInSeven demonstration, and at least one approved script.
3. Two working sessions that aim for three approved scripts total.
4. One optional recovery session when a real blocker prevents the promised result.
5. Graduation, evidence recap, referrals, permission-based continuation offer, and objection capture.

Recording and posting are recognized progress, never continuation gates. Two strong scripts are enough for Graduation when they represent meaningful movement.

### Proof gates

The group version is not ready until both are true:

- Ten private Tiny Challenges are complete.
- Five participants enroll in the paid continuation.

If ten runs produce fewer than five enrollments, revise the weakest stage and continue private validation. Do not force the calendar to declare the experiment successful.

### Improvement rule

Change one major variable at a time. Fix app friction immediately only when it blocks completion or repeats. One person's preference is evidence, not an automatic product requirement.

## 9. Monthly group cycle

The future group challenge recurs monthly and begins on the 7th. It is synchronized, not evergreen on demand.

| Date | Experience |
| --- | --- |
| 7th | Day 0, live Kickoff |
| 8th | Day 1, Declaration |
| 9th | Day 2 |
| 10th | Day 3 |
| 11th | Day 4 |
| 12th | Day 5 |
| 13th | Day 6 |
| 14th | Day 7, Return |
| 15th | Victory Celebration |

The copy may say the day of the month, today, tomorrow, a weekday, and a recurring room time. It must not name a month unless that copy is being written for one specific cycle.

Pace does not determine belonging. Sequence matters more than speed. A participant may complete one per day, batch work, or take longer and still attend Victory.

## 10. SeenInSeven and the fourteen-video architecture

SeenInSeven contains two seven-video levels.

### Level 1: The Person Series

For someone finding their voice, becoming comfortable on camera, and proving they are worth listening to. This is the level the public $7 challenge sells.

### Level 2: The Expert Series

For someone with knowledge, skills, experience, or a developing offer who needs to become visible as a useful guide. It must never assume an established company, clients, revenue, or a mature offer.

Level 2 exists and is already being used privately. Whether it appears in public challenge marketing remains a decision. Do not promise fourteen videos publicly until David settles that.

### Current internal story architecture

The generation source currently assigns the chapters this way:

1. Declaration
2. Ordinary World and Refusal
3. First Epiphany and Threshold
4. Road of Trials and the choice before proof
5. Fall or Ordeal
6. Second Epiphany or Elixir
7. Return

The older public labels still describe Video 2 as Introduction, Video 5 as Conviction, and Video 6 as Ordeal. That public language is now behind the generation architecture. Do not change the product architecture to match stale pages. Reconcile the participant-facing names before the group version launches.

The earlier open question about which videos carry the two epiphanies is resolved internally: Videos 3 and 6.

## 11. Kickoff

Kickoff is free to attend in the future group model and functions as Day 0. It should:

1. Make the person feel understood before teaching.
2. Establish that short video is necessary for a trust-based business.
3. Collapse the internal belief that a personal trait disqualifies them.
4. Collapse the external belief that they have nothing to say.
5. Reveal SeenInSeven as the mechanism.
6. Get the participant through profile and story setup.
7. Build the first scripts live.
8. Lead naturally into the paid challenge and the next concrete action.

David's retail quota story establishes credibility and the cost of waiting. The presentation stays practical, logical, imperfect, and peer-level. It does not become a long 5E lecture or an app feature tour.

## 12. Midweek Momentum Meeting and booking gift

The live meeting page promises a 15 to 30 minute one-on-one working session and points to David's Calendly. The meeting solves the blocker that actually appeared: emotional, message-related, technical, time-related, app friction, or business clarity.

Booking unlocks the interactive gift at `/day1b-26c3684c`, currently built around ten counterintuitive truths about recording.

**Open commercial decision:** Is the one-on-one meeting permanently included in every $7 purchase? The live post-purchase page says yes, while the checkout page does not advertise it. My recommendation is either include it and name it on the sales page, or make the meeting selectively offered. Do not keep a standing promise hidden until after payment.

## 13. Daily pages

The daily pages are public on purpose. They serve three people at once:

1. The participant on track.
2. The participant who joined and fell behind.
3. The visitor who found the work without joining.

They teach enough motivation and meaning to support the action. They do not teach the entire story system or the 5E model.

Each page should carry:

- The day and participant-facing title.
- Correct back and forward navigation.
- The day's video or presentation.
- What the video accomplishes.
- A distinct emotional teaching block.
- The action: open SeenInSeven, review the script, record, and optionally post.
- A catch-up path that removes shame.
- A way to reach David.
- A clear invitation for a visitor who has not joined.

## 14. Rewards

| Earned action | Reward |
| --- | --- |
| Join the $7 challenge | SeenInSeven access for the challenge experience |
| Book the Midweek Momentum Meeting | The interactive recording-beliefs gift at `/day1b-26c3684c` |
| Attend Victory | The Content Creators Toolbox and the 5E guide |

The Victory gifts must remain easy to collect. A promised gift should not require scrolling past a price or decoding the offer page.

## 15. Victory

Victory is for everyone:

- all seven completed,
- some completed,
- scripts prepared but nothing posted,
- or no first script yet.

The achievement is beginning a visible practice and learning what actually stopped them. Completion is evidence, not admission.

Victory answers two questions:

1. What do I say after these seven videos?
2. What do I do when attention begins turning into conversations?

The session may teach the 5E and the simple business path from attention to next step to offer. It then bridges to the paid continuation without pretending one week completed the participant's entire business.

## 16. Continuation offer

The future group path points toward the Momentum Hub at $250 per month. Its current four components are:

- StorySculpt
- Next Step Navigator
- AI Boardroom
- Certainty Sessions

Enrollment scarcity is real only when David's weekly calendar capacity creates it. The page may explain that limit, but it must never perform fake urgency.

**Open offer decision:** The private validation playbook still names a separate $250 partnership as the primary Graduation offer and an old $77 EEE offer as the downsell. The current business ladder names the Momentum Hub at $250 and retires the $77 price. Before the next private Graduation, replace the old partnership/downsell language with one current continuation path or explicitly define the difference. Do not present two vaguely different $250 offers.

## 17. Email system

The attached overview's nine-send plan is retired.

Systeme campaign `1194092` currently holds twelve written emails. As of September 15:

- all twelve are inactive,
- all twelve have null positions,
- the sender is David Bee at `email@davidbee.me`,
- no automation rule subscribes a buyer,
- and digital product `3275807` has no custom confirmation email.

That inactive state is deliberate while David finishes the sequence.

When the sequence is ready:

1. Set and verify the twelve positions.
2. Subscribe directly from `777Joined`.
3. Add an immediate confirmation email naming the Studio URL and sign-in step.
4. Keep prospect copy free of paid access instructions.
5. Verify every time, day, room, and link against the synchronized monthly cycle.
6. Run one complete purchase-to-email-to-Studio rehearsal before opening the group version.

## 18. Current build gaps

### Customer-facing pages

- Kickoff, all seven daily pages, and Victory still contain missing-video placeholders.
- Several navigation labels use the old chapter names or the wrong day.
- Day 2 still contains a placeholder hashtag instruction.
- Public names do not match the current internal Videos 5 and 6 architecture.
- The meeting promise appears after purchase but not on the checkout page.

### Delivery and access

- The paid tag and Studio entitlement path work.
- The custom buyer confirmation email does not exist.
- The private participant ledger has lagged behind actual app use.
- Live private participants need stable, visible entitlement records rather than invisible access assumptions.

### Validation

- Ten completed private runs have not been documented.
- Five paid continuation enrollments have not been documented.
- Group scheduling remains proof-gated.

## 19. Decisions still open

1. Is the Midweek Momentum Meeting included for every $7 buyer or selectively offered?
2. Is the private Graduation continuation the Momentum Hub, a separate high-touch partnership, or one clearly defined version of both?
3. What public-facing names replace the stale labels for Videos 5 and 6?
4. Does Level 2 remain private and in-app, or become part of public challenge messaging later?
5. What are the recurring Kickoff and Victory room URLs?
6. What exact confirmation and sign-in experience should a buyer receive immediately after payment?

These are the only items in this document that should be treated as undecided. Everything else is the working plan until David changes it.

## 20. What not to do

- Do not reverse the product and the app. The 777 Challenge is the product. SeenInSeven is included to make it possible.
- Do not call the monthly cycle evergreen on demand.
- Do not treat the public day pages as gated support documentation.
- Do not make Victory finishers-only.
- Do not resurrect the $311 app price or the $77 Hub price.
- Do not add new 777 tags without a state that cannot be represented by `777Interest` or `777Joined`.
- Do not activate or reorder the email campaign while David is still editing it.
- Do not modify `api/_lib/blueprints.txt` to make old page labels appear correct.
- Do not promise testimonials, results, proof, scarcity, or deadlines that have not been earned.
- Do not turn one participant's preference into a major app build.

## 21. Build order from here

1. Protect and document the two current private participants and their access.
2. Correct the live navigation labels, hashtag placeholder, and participant-facing chapter-name mismatch.
3. Record the meeting and gift pages as part of the customer journey and settle whether the meeting is included.
4. Produce or install the missing Kickoff, daily, and Victory video content.
5. Reconcile the private Graduation offer with the current Momentum Hub.
6. Finish the twelve-email sequence and the immediate buyer confirmation.
7. Run the full journey with a real test purchase: opt-in, payment, `777Joined`, email, Studio claim, script creation, meeting booking, daily pages, Victory, continuation.
8. Continue private runs until both proof gates are met.
9. Schedule the first public monthly cycle only after the experience passes that rehearsal and the evidence gates.

## 22. Launch acceptance test

The monthly group challenge is ready only when all of the following are true:

- Ten private runs and five paid continuation enrollments are documented.
- The public labels match the current story architecture.
- Every live page has working navigation, final links, and its required video.
- A real purchase applies `777Joined` and creates SeenInSeven Studio access.
- The buyer receives a usable confirmation and can claim the Studio account.
- The twelve-email sequence is ordered, reviewed, active, and tested.
- Kickoff and Victory links are real and recurring.
- Refund behavior removes only the access created by that purchase.
- The participant can fall behind without being shamed or locked out.
- Victory welcomes every completion state.
- The continuation offer has one name, one price, one promise, and one honest capacity limit.

Until those checks pass, the private validation program remains the active version of 777.
