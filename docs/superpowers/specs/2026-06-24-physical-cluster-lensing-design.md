# Physical cluster lensing — design

**Status:** spec (awaiting plan)
**Branch:** `feat/gravitational-lensing`
**Related:** builds on the SIS/NFW thin-lens renderer and the NFW image-finding
LUT (`2026-06-24-nfw-lensing-lut.md`). This spec changes only *what strength and
shape each cluster lens carries*; the image-finding math (LUT, counter image,
magnification) is untouched.

## Goal

Drive each foreground cluster's gravitational lensing from its **actual physical
size** instead of an artistic master angle, and expose a single dimensionless
**strength** multiplier where `0` = no lensing, `1` = the real physical effect,
and the slider runs up to ~`1000×` for an exaggerated, visible effect.

## Why

Today the per-cluster Einstein radius is `lensStrengthDeg (3°) × normalized
log₁₀(M500)` — purely artistic. Two problems:

1. The absolute scale is invented, and the per-cluster mass weighting is a
   normalized [0,1] proxy that has thrown away the real mass.
2. There is no honest "this is what nature does" setting, and no clean off→
   physical→exaggerated control.

The catalog already carries the physical inputs; we are discarding them.

## The physical model

Every cluster — bulk (MCXC) **and** hand-seeded anchor (Coma, Virgo, …) —
carries `physicalRadiusMpc`. For an MCXC cluster this is **R500** (the Δ=500
overdensity radius). MCXC's R500 is itself derived from M500, so R500 carries the
same information as the catalog mass; driving from R500 lets one chain cover
clusters that have no stored M500 (the anchors).

Treat each cluster as a singular isothermal sphere truncated at R500, with mass
from the spherical-overdensity definition:

```
M500 = (4/3)·π·500·ρ_crit·R500³
σ_v² = G·M500 / (2·R500)
α∞   = 4π·σ_v²/c²
```

Substituting gives a closed form in R500 alone:

```
α∞ = (8π²/3)·500·G·ρ_crit·R500² / c²        (deflection-at-infinity, radians)
```

so **α∞ ∝ R500²**. `α∞` is the SIS deflection for a source at infinity; it is
distance-independent (an intrinsic cluster property). The shader already applies
the per-source geometric factor `D_ls/D_s`, so `α∞` drops straight into the
existing per-lens `thetaERad` slot.

The NFW scale radius is the same R500 divided by a fiducial concentration:

```
r_s = R500 / c500          c500 = 3.2   (≡ c200 ≈ 5)
```

### Constants

Use SI-friendly astrophysical units so the formula stays legible:

- `G = 4.30091e-9` Mpc·(km/s)²·M☉⁻¹
- `c = 299792.458` km/s
- `ρ_crit = 2.775e11 · h²` M☉·Mpc⁻³, with `h = 0.7` ⟹ `ρ_crit ≈ 1.360e11`
  M☉·Mpc⁻³. Use the existing project Hubble constant if one is already defined
  (check `src/data` for an `H0`/`h` constant before introducing a new one —
  single-source-of-truth).
- `c500 = 3.2`

These collapse to a single multiplicative constant `K` such that
`α∞ = K · R500²` (R500 in Mpc, α∞ in radians). The plan computes `K` once.

### Sanity check (must hold in a test)

Coma: R500 ≈ 1.4 Mpc.
- M500 = (4/3)π·500·1.360e11·1.4³ ≈ 7.8e14 M☉ (catalog Coma M500 ≈ 7e14 ✓)
- σ_v ≈ 1040 km/s (catalog Coma σ_v ≈ 1000 km/s ✓)
- α∞ ≈ 1.5e-4 rad ≈ 31 arcsec (real cluster Einstein radii are tens of
  arcsec ✓)

A unit test asserts `α∞(1.4 Mpc)` is within a tolerance band of `1.5e-4` rad and
`r_s(1.4) = 1.4/3.2`.

## The strength control

`lensStrength` is a dimensionless multiplier. Per lens:

```
thetaERad = lensStrength · α∞(R500)
rsMpc     = R500 / c500            (independent of strength)
```

- `lensStrength = 0` ⟹ `buildClusterLenses` returns no lenses (existing
  early-out, gate changes from `masterThetaRad ≤ 0` to `lensStrength ≤ 0`).
- `lensStrength = 1` ⟹ the physical effect.
- Slider runs to ~`1000` for the exaggerated regime.

### UI: log-scaled slider

The DebugPanel slider is **linear in log-space** so `1` sits comfortably
mid-range and both the subtle (≈0.1) and huge (≈1000) ends are reachable:

- Slider position `p ∈ [0, 1]`.
- `p = 0` maps to a sentinel `lensStrength = 0` (hard off).
- `p ∈ (0, 1]` maps to `lensStrength = 10^(LOG_MIN + p·(LOG_MAX − LOG_MIN))`
  with `LOG_MIN = -1` (0.1×) and `LOG_MAX = 3` (1000×).

The stored setting is the resolved `lensStrength` value (e.g. `1.0`), not the
slider position — the renderer and any deep-link consume the multiplier
directly. The label shows the multiplier (`1.0×`, `42×`, `off`).

## Uniform layout change

Per-lens `r_s` requires growing each lens slot. The current single-`vec4` lens
(`xyz` + `θ_E`) becomes **two** `vec4`s:

```
struct LensingUniforms {
  enabled: u32,
  count:   u32,
  mode:    u32,
  _pad0:   u32,                       // was the global scaleRadius (retired)
  lenses:  array<LensData, 16>,
}
struct LensData {
  centreThetaE: vec4<f32>,            // xyz = centre Mpc, w = thetaERad
  rs:           vec4<f32>,            // x = r_s Mpc, yzw = 0 (reserved)
}
```

- New size: `16 + 16·32 = 528` bytes (was 272).
- The header's old `scaleRadius` word is retired to padding — `r_s` is now
  per-lens. The global `lensScaleRadiusMpc` setting and its slider are removed.
- `MAX_LENSES = 16` is unchanged; the WESL `array` length and the CPU packer
  stay the single drift point (existing convention).

`packLensingUniforms` writes `centre + thetaERad` into the first vec4 and `r_s`
into the second per lens. `lensing.wesl` reads `lenses[i].rs.x` where it
currently reads the global `lensing.scaleRadius`.

## Lens selection change

`buildClusterLenses` currently skips clusters with `significance ≤ 0` and
sorts/caps by `significance`. With the physical model:

- A cluster lenses if it is `category === 'cluster'`, in front of the camera,
  and `physicalRadiusMpc > 0` (every cluster). `significance` no longer gates or
  weights lensing — it remains a *display* weight only.
- Sort/cap by `α∞` (i.e. by R500², i.e. by `physicalRadiusMpc`) descending, keep
  the top `maxLenses` — the most strongly lensing clusters survive the cap.
- This makes the featured anchors (Coma, Virgo) first-class lenses.

## Components

| Unit | Responsibility | Change |
| --- | --- | --- |
| `src/utils/lensing/clusterLensDeflection.ts` *(new)* | pure R500 → `{ alphaInfRad, rsMpc }` | one function, tested against the Coma sanity check |
| `src/utils/lensing/buildClusterLenses.ts` | select + weight in-view lenses | gate/sort on physical α∞; return per-lens `rsMpc`; take `lensStrength` not `masterThetaRad` |
| `src/@types/rendering/LensSpec.d.ts` | per-lens spec | add `rsMpc` |
| `src/@types/rendering/LensingUniformsValue.d.ts` | packer input | drop global `scaleRadiusMpc`; per-lens carries `rsMpc` |
| `src/utils/gpu/packLensingUniforms.ts` | byte layout | two-vec4 lens stride, 528 B, retire header `scaleRadius` |
| `src/services/gpu/shaders/lib/lensingUniforms.wesl` | GPU struct | `LensData` two-vec4 struct |
| `src/services/gpu/shaders/lib/lensing.wesl` | model | read `lenses[i].rs.x` per lens instead of header `scaleRadius` |
| `src/state/settings/*` + `src/data/defaults.ts` | settings | `lensStrengthDeg` → `lensStrength` (default 1.0); remove `lensScaleRadiusMpc` |
| `src/services/engine/frame/renderFrame.ts` | wiring | pass `lensStrength` into `buildClusterLenses`; drop the degree→rad conversion and the global r_s |
| `src/components/DebugPanel/*` + `DebugPanelContainer` | UI | log-scaled strength slider; remove r_s slider |

## What does NOT change

- The NFW image-finding LUT, the counter-image math, magnification, the pick
  pass, the 12-vertex gate, the `@group(3)` scene group wiring.
- `MAX_LENSES`, the SIS/NFW mode toggle, the in-front-of-camera test.
- `c500` and `ρ_crit` are fixed fiducials this pass — not user knobs.

## Testing

- `clusterLensDeflection`: Coma sanity (α∞ band + r_s), monotonic in R500,
  `R500 = 0 → 0`.
- `buildClusterLenses`: physical θ_E and r_s per returned lens; `lensStrength =
  0` → empty; sort/cap by R500; featured anchor (significance 1, real R500) is
  included; in-front filter preserved.
- `packLensingUniforms`: 528-byte layout, two-vec4 stride, r_s in the second
  vec4, header `scaleRadius` word zero; round-trip a multi-lens value.
- WESL link test stays green; the constants parity test gains nothing new (no
  new TS↔WESL mirror — `c500`/`ρ_crit` live only in TS).
- DebugPanel: slider position ↔ `lensStrength` log mapping (`0 → 0`, `p=1 →
  1000`, mid → 1.0 at the appropriate position), unit-tested on the pure mapper.

## Definition of Done

- [ ] All tasks complete, suite green, typecheck clean, `npm run build` links.
- [ ] Coma sanity test passes (α∞ ≈ 31″).
- [ ] Strength `0` is hard-off; `1` is physical; slider reaches ~1000×.
- [ ] Per-cluster r_s renders (NFW ring size varies between clusters).
- [ ] `lensScaleRadiusMpc` and `lensStrengthDeg` fully removed (no dead
      references).
- [ ] **Visual confirmation**: NFW rings appear on featured clusters and scale
      with the strength slider.

## Out of scope (deferred)

- Per-cluster concentration `c500` from a mass–concentration relation (fixed
  fiducial for now).
- Redshift-dependent `ρ_crit(z)` (uses `ρ_crit,0`; the lensing clusters are all
  low-z under `Z_MAX`).
- Supercluster / group lensing (only point-like clusters lens).
