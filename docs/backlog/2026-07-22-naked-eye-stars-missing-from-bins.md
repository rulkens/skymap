# ~24 naked-eye constellation stars absent from the star bins

**Found:** 2026-07-22, during the constellations build (`tools/stars-rs`
constellation stage, collect-all-unresolvable-vertices output).

## Evidence

Resolving the 88 IAU figures' polyline vertices against the shipped star
population left 24 vertices with no matching bright star — every one a real
naked-eye star (Hipparcos Hp 3.9–5.1), e.g. φ And, and ξ UMa (which is absent
even from `hip2.dat`). They fall through the bin pipeline because:

- the `noBailerJones` policy drops Gaia rows without a Bailer-Jones distance,
  and these bright (often saturated/multiple) stars are exactly the rows that
  lack one;
- the Hipparcos bright-star patch only supplements Hp < 4, and these sit just
  below that cut.

## Current state (shipped workaround)

`data/seeds/constellation_overrides.seed.json` pins those vertices to explicit
positions, so the figures draw correctly — but the STAR itself is not in any
bin: no dot renders at that figure joint, and the star is unfindable in the
sky map generally.

## The decision to make

Bin-content policy, not a bug fix: either

1. widen the Hipparcos supplement to Hp ≲ 5.2 (adds ~hundreds of rows, all
   naked-eye — needs a dedup pass against existing Gaia rows via the
   `positional_gap_subtraction` machinery that already ships), or
2. accept the gap and keep the override seed as the permanent mechanism.

Option 1 also lets the corresponding `constellation_overrides` entries be
deleted (the resolver would find the real stars). Regenerating bins after any
change: `npm run build-stars-rs` + `sync-r2-secure` from the MAIN worktree.
