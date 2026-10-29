# StorySculpt fidelity report

**Run date:** 2026-10-29  
**Work item:** WBR-462  
**Scope:** the latest 20 stored, non-empty finished StorySculpt scripts, out of 21 eligible at read time.

## Result

The conservative `0.15` voice-share threshold stays unchanged. Eighteen of 20 scripts passed the deterministic screen; two were flagged. One script had an unsupported number, two had low voice share, and one script had both findings.

| Measure | Result |
| --- | ---: |
| Scripts examined | 20 |
| Passed | 18 |
| Flagged | 2 |
| Pass rate | 90% |
| Flagged rate | 10% |

### Findings by refusal kind

Counts are per script, not per occurrence. A script can appear in more than one row, so these counts do not sum to the number of flagged scripts.

| Kind | Scripts flagged |
| --- | ---: |
| Credential | 0 |
| Result | 0 |
| Testimonial | 0 |
| Inference presented as fact | 0 |
| Invented personal history | 0 |
| Number | 1 |
| Date | 0 |
| Diagnosis | 0 |
| False memory | 0 |
| Overconfidence | 0 |
| Lost voice | 2 |

### Voice-share distribution

Voice share is the proportion of content words in the finished script whose crude stems also occur in the member's own material. Scripts shorter than 40 content words are excluded from voice enforcement.

| Measure | Result |
| --- | ---: |
| Scripts measured | 20 |
| Minimum | 0.05 |
| Median | 0.415 |
| Maximum | 0.83 |
| Below 0.15 | 2 |

The median remains close to the 2026-10-25 baseline of about 0.42. Raising the threshold to `0.25` would flag scripts with substantial fresh imagery as well as genuinely lost voice, so this sample does not justify tightening it.

## Method and privacy

- A service-role Supabase connection selected the latest 20 finished scripts in a read-only query. No member record was created, updated, patched or deleted.
- SQL aggregated the same refusal categories and voice-share formula used by the server-side deterministic screen, returning counts and distribution statistics only.
- This document contains no names, email addresses, user or project IDs, topics, quotations, prompts, conversations or script text. No raw member material was copied into the repository or this report.
- The production fixtures separately prove that sourced credentials, figures, dates, feelings and personal history pass, while planted unsupported versions are refused and retried with the reason named.

## Limitations and next review

This is a small, most-recent sample, not a random audit or semantic ground truth. Deterministic checks can miss a novel wording and can flag a legitimate paraphrase. The inference and history checks deliberately target high-confidence first-person claim shapes rather than attempting unrestricted semantic inference. The two low-voice findings were not resolved by reading or publishing member text, so this run does not label them false positives.

The afternoon reviewer should inspect the implementation and aggregate evidence independently, then decide whether a future authorized review should sample false positives under the same privacy constraints. No threshold change is recommended from this run.
