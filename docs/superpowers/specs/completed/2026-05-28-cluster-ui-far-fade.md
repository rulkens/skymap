# Cluster UI far-distance fade — design

> **Status:** design spec, not yet planned. Captured 2026-05-28 after a
> visual review showed that cluster / supercluster / void rings and
> labels keep drawing at full alpha when the projected ring shrinks to
> 1–2 px, cluttering the far-zoom view. Famous galaxies already fade
> out in this regime via their per-POI `minApparentSizePx +
> fadeBandPx` ramp; clusters have no symmetric far-side fade.

## What it is

Add a **far-distance** fade-out to the cluster / supercluster / void
marker pass, mirroring the existing **close-approach** fade-out that
already lives in `poiSubsystem.produceMarkers` and `produceLabels`.

The control quantity is the same one the close-approach side reads:
the projected ring radius in pixels (`apparentRadiusPx`). Below a
per-category floor the ring + halo + label fade to 0 via smoothstep;
above the floor + band they're at full alpha.

## Why it matters

Today, `produceMarkers` only fades the ring/halo OUT when the apparent
radius grows past `markerMaxApparentRadiusPx` (700 px — too close,
fills the viewport). There is no symmetric floor at the small end.
`produceMarkers` literally notes the gap:

```ts
// Apparent-size fade-IN band reuses produceLabels' logic — only
// applies when both minApparentSizePx AND apparentDiameterKpc are
// set.  For cluster / SC / void anchors neither is set, so the
// fade-in alpha defaults to 1 (always visible above 0 distance).
// Implementer note: if a future POI wants a min-size fade-in for
// markers, mirror the produceLabels logic here.
const minFadeAlpha = 1;
```

The result is that at far zoom you see dozens of tiny illegible rings
and floating labels with no anchor visible — the UX cluster the rings
are supposed to relieve, but inverted.

Famous galaxies don't suffer this because their visibility gate uses
per-POI `minApparentSizePx + style.fadeBandPx` measured against the
galaxy's own `apparentDiameterKpc`. Clusters anchors set neither field
(they're conceptual structures, not luminous objects), so the gate
never engages. The natural quantity for ring-bearing categories is the
ring's projected radius — which the close-approach math already
computes.

## Approach

Add two new fields to `CategoryStyle` in
`src/services/engine/subsystems/poiSubsystem.ts`:

```ts
type CategoryStyle = {
  // ...existing fields...
  /** Apparent ring radius (px) below which the marker fades OUT. */
  readonly markerMinApparentRadiusPx: number;
  /** Smoothstep band width for the marker fade-out at the far side. */
  readonly markerMinApparentFadeBandPx: number;
};
```

In `produceMarkers`, after `apparentRadiusPx` is computed and before
`maxFadeAlpha`, derive a `minFadeAlpha` from the new fields:

```ts
let minFadeAlpha = 1;
if (apparentRadiusPx < style.markerMinApparentRadiusPx) {
  // Fully faded below the floor.
  minFadeAlpha = 0;
} else if (apparentRadiusPx < style.markerMinApparentRadiusPx + style.markerMinApparentFadeBandPx) {
  const t = (apparentRadiusPx - style.markerMinApparentRadiusPx) / style.markerMinApparentFadeBandPx;
  minFadeAlpha = t * t * (3 - 2 * t);
}
if (minFadeAlpha <= 0) continue; // fully faded — skip
const fadeAlpha = Math.min(maxFadeAlpha, minFadeAlpha);
```

`fadeAlpha` already multiplies into halo/ring alpha downstream — no
other changes in `produceMarkers`.

In `produceLabels`, mirror the math next to the existing close-approach
block (lines 421–439). Use the same `apparentRadiusPx` derivation
already present there (`markerRadiusMpc / distanceMpc * pxPerRad`).
This keeps the label and ring fading together at both ends, which is
what the existing close-approach block also does.

### Per-category defaults

Values are tuned per category by structure type, not strictly by
physical extent — superclusters get the *highest* floor despite being
larger than clusters, because their huge projected ring at far zoom
wraps the viewport with sub-readable chrome (the specific clutter
mode this spec solves).

| Category | `markerMinApparentRadiusPx` | `markerMinApparentFadeBandPx` |
|---|---|---|
| cluster (~1–5 Mpc cores) | 12 | 12 |
| supercluster (~20–100 Mpc) | 28 | 20 |
| void (~30–100+ Mpc) | 28 | 20 |
| famousGalaxy | 0 | 1 |

Famous galaxies don't have ring markers (`haloColor === null` short-
circuits `produceMarkers`), and their labels already have their own
`minApparentSizePx + fadeBandPx` regime measured against the galaxy's
diameter — so the new fields are filled with no-op values purely for
the type's sake. Setting them to 0/1 means even if the gate did engage,
it'd be a single-pixel ramp that never visibly fires.

## Trade-offs considered

- **Distance-based (Mpc) floor instead of apparent radius.** Simpler
  but FOV-dependent — a 100 Mpc cluster at 500 Mpc looks different on
  a phone vs. a 4K monitor. Apparent radius in pixels is what already
  drives the close-approach side, so this is the consistent quantity
  and benefits from automatic FOV/viewport adaptation.

- **Reuse `minApparentSizePx` + per-POI `apparentDiameterKpc`.** Doesn't
  fit: cluster anchors don't have `apparentDiameterKpc` because they're
  not point sources with a measurable diameter. Adding a separate
  ring-radius-driven pair keeps the two ramps semantically distinct
  (point-source size vs. structure-anchor extent).

- **Single global floor for all categories.** Simpler config, but a
  60 px cluster floor would fade out voids at distances where they're
  still informative (they're 10× the extent). Per-category tuning is
  one extra field per category — cheap.

- **Expose as a user setting in SettingsPanel.** Considered and
  rejected — symmetric with the existing `markerMaxApparentRadiusPx`
  which is also hardcoded in `POI_STYLES`. If the values need
  iterating, edit the file. Adding a slider means settings state, URL
  sync, and panel UI for what is essentially a tuning constant.

## Files touched

- `src/services/engine/subsystems/poiSubsystem.ts` — add the two
  fields to `CategoryStyle`, populate them in all four `POI_STYLES`
  entries, add the min-radius fade math in `produceMarkers` and
  `produceLabels`.

No new types, no shader changes, no GPU layout changes, no settings
state, no URL params. All math is CPU-side, runs inside the existing
per-POI loop (n ≤ ~50 POIs total). Render-on-demand semantics are
preserved — no `awake` signal added, same rationale as the existing
fade ramps (camera motion already wakes the loop).

## Tests

Mirror the existing close-approach fade-out tests (search
`markerMaxApparentRadiusPx` under `tests/`). Each category gets:

- Below floor → descriptor skipped entirely (or `fadeAlpha === 0`).
- Inside band → `fadeAlpha` is the expected smoothstep value at the
  band midpoint (= 0.5).
- Above band → `fadeAlpha === 1` (modulo close-approach max math).

Label-side parity test: at the same camera distance + POI, the label's
`fadeAlpha` matches the marker's `fadeAlpha` from `produceMarkers`.
