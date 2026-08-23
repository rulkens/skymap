---
name: deletion-audit
description: Use when hunting removable code or surplus in a diff — after a fix wave, before /feature-done's verdict, when a PR feels heavier than its feature, or when asked "anything to delete in this PR/module?"
---

# Deletion audit — the leanness seat

A standing counter-bias against under-deletion: correctness reviewers must treat
every line as potentially load-bearing — the wrong stance for finding surplus,
which is why thorough reviews pass over hundreds of removable lines. This skill
dispatches a read-only auditor with the burden of proof inverted: surplus is
presumed until a line proves itself.

Calibration (13-audit experiment, 2026-08-23, PRs #623/#570): sonnet returned a
false clean bill (~0–25 LOC) where opus found 255–430 on the identical diff —
**opus-class only; a cheap seat's clean bill reads as evidence**. Adversarial
framing multiplied capable models' findings without recklessness. Legacy
time-shift won volume on both PRs; evidence-only proof-backs every claim;
greenfield validates what stays and catches spec/code divergence.

## When to run

1. **Mid-implementation** — after a fix wave (fixes add lines without
   re-thinking) or every few tasks; scope = the diff since the last audit.
2. **At /feature-done** — whole branch, before the DoD verdict (feature-done's
   audit list includes this step).
3. **On demand** — "anything to delete in this PR/module?"
4. **Existing code** — a module with no fresh diff: scope is a file list; the
   legacy framing is literally true. Fence from the landmine docs, memory, and
   deliberate-choice comments — expect more needs-ruling items. Findings land
   as a dedicated cleanup PR.

## How to run one

1. Scope it. Branch/PR: the SDD `review-package` script (it lives in the
   superpowers plugin, not this repo) or
   `git diff BASE..HEAD > <workspace>/audit-<range>.diff`. Merged squash commit:
   `git show <sha> > <file>` and audit the live tree. Existing code: a file
   list — no diff needed. Name any mechanical rename/move commits in the task
   context so the auditor doesn't read churn as cruft.
2. Dispatch ONE background general-purpose agent, opus-class — the read-only
   contract is prompt-enforced, so it must appear verbatim. Framing: LEGACY by
   default. `--verified` = EVIDENCE (every claim proof-backed — use when
   findings will be applied with little review, or on ground a prior audit
   covered, handing its report(s) to the fencing block). `--justify` = GREENFIELD
   (validates what stays — /feature-done on spec-bearing features).
3. Persist the returned report to `<workspace>/deletion-audit-<scope>.md` beside
   the ledger — its trap list and null results are the next audit's fencing —
   then triage and apply per
   [`docs/superpowers/conventions/leanness.md`](../../../docs/superpowers/conventions/leanness.md).

## Prompt template

Compose the dispatch from the blocks in [template.md](template.md), in order:
read-only contract, framing, task context, hunt categories, scope fencing,
output contract.

## Anti-patterns

- **Cheap model.** Sonnet's false clean bill is the measured failure mode; it
  actively misleads.
- **Quota framing** ("cut at least N lines") manufactures tail findings; the
  honest-null clause exists for a reason.
- **Implementer self-audit.** Surplus is invisible from inside the context that
  wrote it.
- **Auto-applying the report.** Application follows `leanness.md`'s triage;
  behavior changes and debug surface are the user's rulings.
- **Skipping the fencing block** — the audit burns its tokens re-arguing settled
  decisions.
