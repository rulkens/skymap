# `starCatalogLayer` god-layer split (three owned concerns, layer-imports-layer)

Surfaced by the 2026-08-17 renderer/layer sweep
([`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):74,
"God-layers" table, and :206, ladder-assignments table). `ORPHAN` in the
2026-08-20 carry-forward audit: explicitly ruled "worthwhile but not
contract-blocking … backlog" but no `docs/backlog/` file or `BACKLOG.md` line
was ever filed for it — distinct from `foregroundLabelsLayer`'s 812-LoC split,
which rung 8 does own.

## What it is

`starCatalogLayer` is 983 LoC and owns three separable concerns in one file:

- `starCatalogVisible` — the layer's own visibility/liveness gate.
- `prepareStarCut` — the shared octree walk hoisted to `runFrame` and
  memoised on `ctx`, feeding all three star-catalog layers
  (`star-aggregates`, `star-catalog`, `star-upsample`; see
  [`subsystem-sweep.md`](../research/engine/subsystem-sweep.md) row "Star
  catalog (Gaia survey)").
- The stream SoA (structure-of-arrays) bookkeeping for the crossfade.

Two sibling layers import `starCatalogLayer`'s `enabled` directly — a layer
importing another layer's internals, rather than each layer deriving its own
gate from a shared function. The renderer sweep's median layer size is ~100
LoC; this one is roughly 10× that.

## Why it matters

Cleanup, not a correctness bug today. The risk is maintainability: three
concerns compacted into one file with cross-layer imports makes it harder to
reason about which sibling depends on which internal, and raises the odds a
future edit to one concern (say, the SoA layout) silently breaks a sibling
that imported `enabled` rather than going through a declared seam.

## Approach

No design has been done yet — this needs a `needs-design` pass before a plan,
because the split boundary isn't obvious from the audit alone. Starting
points to weigh:

- Whether `prepareStarCut`'s hoisted-and-memoised walk should live in its own
  module (it already conceptually stands apart — it's the "shared derivation,
  hoisted to runFrame" pattern decisions.md #7 wants the four solar-system
  derivations to follow too; see the companion orphan item
  [hoist the solar-system derivations](2026-08-20-hoist-solar-system-derivations.md)).
- Whether the two sibling layers' `enabled` import should become a shared
  liveness function (`deriveStarCatalogLiveness`-style) instead of a
  layer-importing-layer edge — matching the `deriveXLiveness` convention
  already used for the two dedicated liveness files in the codebase.
- Whether the SoA stream bookkeeping is cleanly separable from the layer's
  `draw`/`drawPick`, or whether it's load-bearing enough to stay put.

Sequencing note: `foregroundLabelsLayer`'s god-layer split (the sibling
finding in the same table row) falls out of rung 8 (label/marker-mechanism
unification) as a side effect. This item does not ride rung 8 — nothing in
the ladder currently owns it.
