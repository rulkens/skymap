# Satellites onto a shared, data-only orbit-trail contract

**Why.** Satellites draw their selected orbits through their own `satelliteOrbitsPass` and a
second `OrbitTrailRenderer`; core's `orbitTrailsPass` draws everyone else's from the Layer
contract (`LayerGuides.orbitTrails`). Two loops, two renderers. The owner wants one contract,
and Layer contracts as data only, no functions (ruled 2026-11-02, PR #986).

**Where it stands.** #986 added the minimal data field `OrbitTrailGroup.selectedOnly`
(ids that draw only while selected or focused) for Vesta, Ceres and Bennu.

**Sketch (not ruled):**

```ts
export type OrbitTrailGroup = {
  readonly show: ShowKey;
  readonly orbits:
    | { readonly kind: 'kepler'; readonly rows: readonly OrbitalElements[]; readonly when: 'always' | 'selected' }
    | { readonly kind: 'conics'; readonly conics: readonly OrbitTrail[] }; // a Layer-refilled list
};
// OrbitTrail = OrbitConic & { color; fade }; LayerGuides.orbitTrails becomes a list
```

The satellites Layer points a `conics` group at a runtime list that a satellites planner
refills each frame (SGP4 ellipses of the selected and focused satellites, fade = class fade ×
layer opacity); `satelliteOrbitsPass` and its renderer are deleted (~100 lines).

**Open.** The planner must run before `orbitTrailsPass` in `FRAME_ORDER` (unchecked); a
`selectedOnly` id list may fold into `when: 'selected'` or stay as is.
