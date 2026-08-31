# Synthetic fallback cloud has no release predicate

Surfaced by the Quest 3 WebXR spike (branch `worktree-quest-vr-spike`, draft
PR #625, not merging), but the loader logic in question is main's — the spike
just happened to exercise the disable-then-re-enable path.

## What it is

The ~100k-point synthetic procedural cloud is the "no real data, show
_something_" backstop (`src/services/engine/wiring/createSyntheticFallback.ts`).
It arms via a one-way request flag: `state.requests.add('syntheticFallback')`
(`createSyntheticFallback.ts:158`) is only ever added, never removed —
confirmed by grep, no call site clears it. The `Synthetic` row in
`ASSET_WIRING` (`src/services/engine/wiring/assetWiring.ts:196-207`) reads
that flag as its whole `demand` predicate and declares no `release` field at
all, unlike the sibling per-body row a few lines above it
(`assetWiring.ts:154-160`) which pairs `demand`/`release` symmetrically.

So once every real galaxy catalog has settled without producing data and the
synthetic cloud loads, nothing turns it back off — not the request flag
(never cleared) and not the demand predicate (no release counterpart to
evaluate).

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

Add a `release` predicate to the `Synthetic` row mirroring its `demand`:
release once any real galaxy catalog's slot reaches `ready` with
`count > 0` (the same `anyRealReady` condition `createSyntheticFallback.ts`
already tracks internally — surface it as read-able state, or clear the
`'syntheticFallback'` request flag from the same real-catalog-ready
subscriber that currently only sets `anyRealReady`).
