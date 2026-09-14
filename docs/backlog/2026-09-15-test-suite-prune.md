# Test-suite prune

> **Backlog item** · `ready` · area: Docs & process
> **Promote to:** a plan in `docs/superpowers/plans/` when picked up.
> **Runs after** the lean-SDD process change lands, and **before** the comment prune.

## The root fact

The suite is large (600+ files) and slow, and much of it was produced by the
plan-writing habit of a failing test per step — the habit
[`sdd-execution.md`](../superpowers/conventions/sdd-execution.md) and
[`plan-style.md`](../superpowers/conventions/plan-style.md) just removed. Tests
that restate code or a constant cost wall-clock on every run and maintenance on
every refactor, and cannot fail on a real bug. Doing that trimming per feature
stacks the cost onto every PR; doing it once, repo-wide, does not.

## Criterion

[`testing.md`](../superpowers/conventions/testing.md)'s: keep a test only if it
can fail on a real bug that the compiler and the remaining tests would miss.
Runtime type tests, constant/registry restatements, clamp-boundary mirrors and
tests that re-implement the function under test go.

## Approach

1. **Baseline first** — record the file count, the wall-clock of a full `npm test`,
   and the slowest 20 test files. Without the baseline the prune has no result.
2. **One agent per subsystem** (engine/state, renderer/gpu, tools/catalog, utils,
   components, …), each auditing its own slice against the criterion.
3. **Delete only** — no rewrites in this pass; a test worth keeping but badly
   written stays as it is.
4. **Every deletion listed in the PR body**, file by file with the one-line reason.
   The list is the review surface; a diff of removals alone is not reviewable.
5. **Re-measure** the same three numbers and put before/after in the PR body.

## Done when

The suite is green, the PR body carries the deletion list and the before/after
measurement, and the slowest-20 list is either shorter or explained.
