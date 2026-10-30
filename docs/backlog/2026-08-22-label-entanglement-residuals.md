# Label-entanglement residuals from the rung-8 radar pass

Surfaced by an `entanglement-radar` review of `refactor/label-unification`
(rung 8, label/marker-mechanism unification). Deferred rather than folded
into the rung's own PRs — none block the shipped work, each is independently
pickable.

## What it is

One finding (a second, `FOREGROUND_LABEL_CAPACITY`, was fixed in #795:
`labelRenderer` now grows its capacity):

1. **`signatureOf` hand-picks which `Label2D` fields matter for re-upload.**
   `label2DDirector.ts`'s `signatureOf` (from line 348) gates GPU re-upload on a
   hand-maintained subset of fields — `id`, `fadeAlpha`, `worldPos`,
   `leader.toWorld`, `color`, `pickId` (not `text`). Which fields actually vary per `id` is decided
   independently in each producer file, which `signatureOf` never sees.
   The function's own comment documents the resulting hole: a producer that
   mutates `text` at a fixed `id` would not trigger re-upload (stale GPU
   buffer). No current producer does this, but nothing stops a future one
   from reintroducing the failure the comment already anticipates.

## Why it matters

Not a correctness bug today — the producers and the signature currently agree.
The risk is drift under a future edit that touches only one side:

1. A producer that starts varying a field `signatureOf` doesn't key on
   silently ships a stale GPU buffer — the exact bug class the function's
   own comment already flags as a known gap, just not yet triggered.

## Approach

1. Replace the hand-maintained field list with either a structural hash of
   the whole `Label2D` (minus a documented, deliberately-excluded field list
   ) or a `satisfies`-checked key
   list derived from the `Label2D` type itself, so a new field forces an
   explicit include/exclude decision at compile time rather than silently
   falling outside the signature.
