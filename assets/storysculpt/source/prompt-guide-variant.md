<!-- Source: Google Drive doc 17G18oXPgd-cb76mrjJwEzP9zAL9xb9l4AcDaCOXUbbM
     Near-identical variant of prompt-guide-current.md. Rather than duplicate a
     ~95%-identical 3,000-word spec, its full verbatim differences are recorded
     below. The command bodies (/Mini /Rant /Bold /fix, B*, M*, R1-R9, hook-last
     and escalate) are byte-for-byte the same as prompt-guide-current.md except
     as noted. -->

# Variant prompt guide — exact differences from prompt-guide-current.md

This variant is the same StorySculpt command spec as `prompt-guide-current.md`
with two additions and one substitution. Fold these into the build; use
`prompt-guide-current.md` as the base.

## Addition 1 — five recurring rant topics (verbatim)

Placed near the top, after the strategist preamble:

> We have five main topics we cover in our /rants:
>
> [Topic Title]
>
> 1) Apparently, I’m 40 and I Still Don’t Feel Like an Adult, and I’m Just Now Noticing the Person I Became by Accident So here is one thing about me you probably don’t know…
>
> 2) You Know what Pisses Me Off and You Should Probably Be Mad About Too?
>
> 3) I Learned This the Hard Way While Thinking Everything Was ‘Basically Fine’ and I Didn’t Know This Was a Lesson Until Years Later
>
> 4) What I Tell My Clients as a Professional Accountability Buddy and Implementation Partner These are Lessons From the Last Week or So
>
> 5) Things I Actually Use That Save Time, Reduce Stress, and Just Work and I Freakin I Wish I’d Found These Years Ago

## Addition/substitution 2 — explicit title line in the rant format

Where `prompt-guide-current.md` has:

> R5.3: Have the LLM Pause and take a deep breath before continuing.

this variant instead has:

> R5.3 [Topic Title]

i.e. the rant output format opens with a `[Topic Title]` line. (The "pause and
take a deep breath" instruction is only in `prompt-guide-current.md`.)

Everything else — B1–B5, M1–M5, R1–R9 including R6 hook-as-verdict and R7
three-level escalation, and /fix — is identical to `prompt-guide-current.md`.
