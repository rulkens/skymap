---
name: deletion-audit
description: Use when hunting removable code or surplus in a diff — after a fix wave, before /feature-done's verdict, when a PR feels heavier than its feature, or when asked "anything to delete in this PR/module?"
---

# Deletion audit — the leanness seat

A standing counter-bias against under-deletion. Correctness reviewers must treat
every line as potentially load-bearing — exactly the wrong stance for finding
surplus, which is why thorough task reviews pass over hundreds of removable lines.
This skill dispatches a dedicated read-only auditor whose burden of proof is
inverted: surplus is presumed until a line proves itself.

Calibration (13-audit experiment, 2026-08-23, PRs #623/#570): sonnet returned a
false clean bill (~0–25 LOC) where opus found 255–430 on the identical diff —
**opus-class only; a cheap seat's clean bill reads as evidence**. Adversarial
framing multiplied capable models' findings without recklessness. Legacy
time-shift won volume on both PRs; evidence-only proof-backs every claim;
greenfield validates what stays and catches spec/code divergence.

## When to run

1. **Mid-implementation** — after a fix wave (bug-fix asks add lines without
   re-thinking the task) or every handful of SDD tasks. Scope: the diff since the
   last audit, so runs stay cheap.
2. **At /feature-done** — whole branch, before the DoD verdict (feature-done's
   audit list includes this step).
3. **On demand** — "anything to delete in this PR/module?"
4. **Existing code** — a module or subsystem with no fresh diff. Scope is a file
   list instead of a range; the legacy framing is literally true there. Fencing
   sources without a ledger: the landmine docs, memory, and deliberate-choice
   comments — expect more needs-ruling items. Findings land as a dedicated
   cleanup PR.

## How to run one

1. Scope it. Branch/PR: the SDD `review-package` script (it lives in the
   superpowers plugin, not this repo) or
   `git diff BASE..HEAD > <workspace>/audit-<range>.diff`. Merged squash commit:
   `git show <sha> > <file>` and audit the live tree. Existing code: a file
   list — no diff needed. Name any mechanical rename/move commits in the task
   context so the auditor doesn't read churn as cruft.
2. Dispatch ONE background agent, opus-class, with the template below. Default
   framing: LEGACY. `--verified` swaps in EVIDENCE (use when findings will be
   applied with minimal human review — every claim arrives proof-backed).
   `--justify` swaps in GREENFIELD (use at /feature-done on spec-bearing features;
   its product is validation of what stays, not maximal deletion). Dispatch a
   general-purpose agent — the read-only contract is prompt-enforced, so it must
   appear verbatim. On ground a previous audit already covered, prefer
   `--verified` and hand the prior audit report(s) to the fencing block; without
   them you can fence only at bucket granularity.
3. Persist the returned report to `<workspace>/deletion-audit-<scope>.md` beside
   the ledger — its trap list and null results are the next audit's fencing —
   then triage and apply per
   [`docs/superpowers/conventions/leanness.md`](../../../docs/superpowers/conventions/leanness.md).

## Prompt template

Compose the dispatch from the blocks in [template.md](template.md) — read it
when dispatching, in this order: read-only contract, framing (LEGACY default /
EVIDENCE `--verified` / GREENFIELD `--justify`), task context, hunt categories,
scope fencing, output contract.

## Anti-patterns

- **Running it on a cheap model.** Sonnet's false clean bill is the measured
  failure mode; it actively misleads.
- **Quota framing** ("cut at least N lines"). Manufactures tail findings; the
  honest-null clause exists for a reason.
- **Letting the implementer self-audit.** The surplus is invisible from inside the
  context that wrote it (same blindness refactor-ground's greenfield cross-check
  exists for).
- **Auto-applying the report.** The audit finds; application follows the triage in
  `leanness.md` — behavior changes and debug surface are the user's rulings.
- **Skipping the fencing block.** An unfenced audit spends its tokens re-arguing
  settled design decisions.
