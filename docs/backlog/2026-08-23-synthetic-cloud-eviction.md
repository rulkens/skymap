# Synthetic fallback cloud has no release predicate

Surfaced by the Quest 3 WebXR spike (branch `worktree-quest-vr-spike`, draft
PR #625, not merging), but the loader logic in question is main's — the spike
just happened to exercise the disable-then-re-enable path.

## What it is

The ~100k-point synthetic procedural cloud is the "no real data, show
_something_" backstop. Its arming half is fixed: plan 04d replaced the one-way
`'syntheticFallback'` request flag with `syntheticShouldArm`, a pure predicate
over the galaxyCatalog Layer's own slots, so the row's `demand` goes false again
the moment a real survey catalog lands with data.

What is unfixed is eviction. The row (`galaxyCatalogAssetRows.ts`) still declares
no `release` field, and `reevaluateDemand` treats an omitted `release` as "never
evict" — so demand going false does not unload what is already resident, unlike
the sibling per-body row that pairs `demand`/`release` symmetrically.

## Why it matters

If a user disables every galaxy catalog (synthetic loads as the backstop)
and then re-enables one, the real catalog loads _alongside_ the still-resident
synthetic cloud rather than replacing it: ~100k extra points drawn and held
in memory indefinitely, for no visual benefit once real data is back.

## Verification needed

This has not been reproduced against `main` directly — only inferred from
reading the loader code plus what the spike observed. To confirm on `main`:

1. Disable every galaxy catalog in Settings.
2. Wait for the synthetic cloud to load (status bar / `Source.Synthetic`
   ready event).
3. Re-enable a catalog (e.g. SDSS) and let it finish loading.
4. Check whether the synthetic points are still resident — GPU memory,
   `galaxyPointRenderer.totalCount()`, or a visible draw-cost regression with
   both clouds rendering.

If reachable this way in plain 2D `main`, it is a real bug, not spike-only.

## Approach (once verified)

Add a `release` predicate to the synthetic row: the negation of
`syntheticShouldArm`, which already answers "has a real survey catalog landed
with data" over the Layer's slots.
