# No focused tests for `validateCompositeExclusivity` or `channelValueAt`

`deferred` · found by the blending-seq refactor-ground check (D8), 2026-11-07

## Problem

Two compile-time clip helpers have no test file of their own. Both are covered only through
`tests/services/engine/animation/compileClip.test.ts` and the evaluator tests:

- `src/services/engine/animation/validateCompositeExclusivity.ts` throws on four clashes. Each has
  one whole-clip test in `compileClip.test.ts` (the drift check calls it directly; base writer in a
  `flyPath` window, a body-framed writer on a composite channel, two overlapping composites go
  through `compileClip`). Nothing pins the non-clash side: a `roll` tween inside a `flyPath` window,
  or a base writer that only touches a composite's window.
- `src/services/engine/animation/channelValueAt.ts` decides where a composite starts and what
  `from` the first base segment after it gets. "a path after a looping spin" and "a move after a
  composite continues" exercise it end to end; the fold order with interleaved base and composite
  writers and the `byComposite` flag are pinned only by those outcomes.

## Before adding anything

Judge each candidate test by `docs/superpowers/conventions/testing.md`: write it only where a real
bug would get past the existing whole-clip tests. The likely keepers are the two non-clash cases
above; the clash throws may already be enough.
