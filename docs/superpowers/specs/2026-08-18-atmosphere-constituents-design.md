# Atmosphere constituents — design

Status: draft · Supersedes `docs/backlog/2026-08-17-atmosphere-params-physical-channels.md`

Replace `ScatteringParams`' hard-coded Rayleigh / Mie / ozone triple with a list of
constituents, then recalibrate the six planet rows onto the channels the physics
actually lives in, and add Titan.

## Why

`rayleighScatter` is doing duty as a per-body colour dial. Rayleigh goes as λ⁻⁴, so
`[12, 10, 7]e-3` (Venus) and `[8, 5, 3]e-3` (Mars) describe no molecular scattering
that exists; both bodies' colour is aerosol. Uranus and Neptune push the other way —
`[4, 10, 20]e-3` mimics methane's red _absorption_ as scattering, while the table's
one per-channel absorption vector sits at `[0, 0, 0]` in all six rows.

Pluto's row widened `mieScatter` to a `Vec3`, so aerosol colour now has a correct
home. Methane does not: it is **well-mixed**, and the only absorption profile in the
shader is a tent (`densityOzone`), a shape that describes a stratospheric layer.
Expressing a well-mixed absorber as a tent centred at zero is a knowingly wrong
falloff — the trigger for this design rather than a data edit.

## Ground preparation

Ran 2026-08-18. Full checkpoint in the session; verdicts:

| Touchpoint                                  | Verdict     | Blocker                                                                                                                                                                                                             |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Well-mixed absorber has no home             | **bolt-on** | `scattering.wesl:105-118`, `sampleMedium:195-213` — methane would be the **4th** hardcoded term and the **second** absorption-only special case. Ozone being the first is the consolidation trigger, not precedent. |
| Phase applied by the caller, by name        | **bolt-on** | `skyViewLut.wesl:148` — `scatterR*rp + scatterM*mp` cannot be written for N unnamed constituents.                                                                                                                   |
| `densityRayleigh` / `densityMie` duplicated | trivial     | `scattering.wesl:165-171` — one `densityExponential`.                                                                                                                                                               |
| Titan atmosphere                            | growth      | none: `atmosphereDrawList.ts:39` data-gate; `initGpu.ts:597-604` bakes per row.                                                                                                                                     |
| Titan texture                               | growth      | rows in four closed tables; the one-table-two-views seam already exists.                                                                                                                                            |
| Titan rotation                              | growth      | absent row falls back to `IDENTITY_MAT3` — silent, so it is a task, not an afterthought.                                                                                                                            |

**Prep = stage 1 below, its own PR.** Stages 2 and 3 are then pure growth.

Blast radius is small and was verified, not assumed: the physics fields have exactly
one reader — `packScatteringParams` → the three LUT bakes. `initialState.ts:194`,
`atmosphereShellLayer.ts` and `initGpu.ts` read only `exposure` and geometry.

## Data model

Three new types, one per file per the `@types/` convention:

```ts
// @types/scene/DensityProfile.d.ts
export type DensityProfile =
  | { readonly kind: 'exponential'; readonly scaleHeightKm: number }
  | { readonly kind: 'tent'; readonly centerKm: number; readonly widthKm: number };

// @types/scene/PhaseFunction.d.ts
export type PhaseFunction =
  | { readonly kind: 'rayleigh' }
  | { readonly kind: 'henyeyGreenstein'; readonly g: number };

// @types/scene/AtmosphereConstituent.d.ts
export type AtmosphereConstituent = {
  readonly scatter: Vec3; // 1/km, per channel
  readonly absorb: Vec3; // 1/km, per channel
  readonly profile: DensityProfile;
  readonly phase: PhaseFunction;
};
```

`AtmosphereParams` loses nine physics fields and gains one:

```ts
readonly constituents: readonly AtmosphereConstituent[];   // ≤ MAX_CONSTITUENTS
```

Geometry (`planetRadiusKm`, `atmosphereTopKm`, `groundAlbedo`) and the look dials
(`twilightSoftness`, `twilightIntensity`, `sunIrradiance`, `exposure`) are unchanged.

What this buys beyond methane: the roles stop being positional. Today Rayleigh is
scatter-only by construction, ozone absorb-only by construction, and only Mie may do
both. After, a constituent that absorbs and scatters is one row that sets both
vectors — which is what Titan's haze and Venus's UV absorber need.

## Uniform layout

`MAX_CONSTITUENTS = 4` (Earth 3, Venus 3, Titan 3–4, Pluto 2). 48-byte stride, which
satisfies WGSL's 16-byte array-stride rule:

```
struct Constituent {           // 48 B, align 16
  scatter:       vec3<f32>,    //  0..11
  phaseG:        f32,          // 12..15
  absorb:        vec3<f32>,    // 16..27
  scaleHeightKm: f32,          // 28..31
  centerKm:      f32,          // 32..35
  widthKm:       f32,          // 36..39
  profileKind:   u32,          // 40..43   0 = exponential, 1 = tent
  phaseKind:     u32,          // 44..47   0 = rayleigh,    1 = henyeyGreenstein
}

struct ScatteringParams {      // 224 B
  groundAlbedo:      vec3<f32>,          //   0..11
  planetRadiusKm:    f32,                //  12..15
  atmosphereTopKm:   f32,                //  16..19
  constituentCount:  u32,                //  20..23
  _pad:              vec2<f32>,          //  24..31   array must start 16-aligned
  constituents:      array<Constituent, 4>,  //  32..223
}
```

The kind tags are `u32`, not float sentinels compared with `< 0.5`. That makes
`packScatteringParams` return an `ArrayBuffer` with a `Float32Array` and a
`Uint32Array` view over it rather than a bare `Float32Array` — a one-line change at
its single call site (`atmosphereShellRenderer.ts:380`).

Unused constituent slots are zero-filled and never read: the loop bounds on
`constituentCount`.

## Shader

`sampleMedium` gains `cosTheta` and loops:

```wgsl
struct MediumSample {
  scatterPhased: vec3<f32>,   // Σ scatter_i · density_i · phase_i(cosTheta)
  scatterTotal:  vec3<f32>,   // Σ scatter_i · density_i
  extinction:    vec3<f32>,   // Σ (scatter_i + absorb_i) · density_i
}
```

`multiScatterLut.wesl:99` wants the unphased sum only, so there are two entry points
over one inner loop — `sampleMedium(params, pos, cosTheta)` and
`sampleMediumIsotropic(params, pos)` — rather than evaluating phases the
multi-scatter bake would discard.

Call-site delta is three lines:

- `multiScatterLut.wesl:99` `m.scatterR + m.scatterM` → `m.scatterTotal`
- `skyViewLut.wesl:148` `m.scatterR * rp + m.scatterM * mp` → `m.scatterPhased`
- `skyViewLut.wesl:149` `m.scatterR + m.scatterM` → `m.scatterTotal`

**Keep the zero-width guard.** `densityTent` retains `if (widthKm <= 0) return 0`.
Without it the tent divides by zero at every sample, and WGSL's Finite Math
Assumption then makes the whole expression an indeterminate value — the spec names
`max` as a builtin that misbehaves under exactly that optimisation. The outer clamp
is not a guard. This is a fix that shipped with Pluto; do not let the rewrite drop it.

## Staging

### Stage 1 — constituent model, zero visual change (own PR)

All eight existing rows re-expressed as constituents that produce **identical**
output. Earth's molecules/aerosol/ozone map one-to-one onto the old three terms, so
this is provable rather than eyeballed — the same discipline that made the
`mieScatter` widening safe.

Gate: an equivalence test that evaluates the new accumulation against the old
three-term expression across a spread of altitudes and `cosTheta`, per body row.

### Stage 2 — recalibrate six rows (one commit + one visual pass per body)

Physics leads; the look follows. Each row is derived and tagged `[M]`easured /
`[D]`erived / `[L]`ook the way Pluto's row is, so a later tuner knows which values a
nudge would falsify.

Per body, what must be derived — **quantities, not values; the numbers are stage-2
research output and are deliberately not pre-committed here**:

- **Venus** — molecular Rayleigh for a ~92 bar CO₂ column (λ⁻⁴, blue-heavy, not the
  current warm ramp); H₂SO₄ cloud as a per-channel Mie constituent; the near-UV
  absorber as a third constituent. The UV absorber's identity is still unsettled in
  the literature, so it is an `[L]` row whatever shape the model takes — say so.
- **Mars** — thin CO₂ Rayleigh (blue-heavy but weak); suspended dust as the
  per-channel Mie constituent carrying the butterscotch. Dust loading is seasonal;
  pick a stated τ and record which.
- **Jupiter / Saturn** — H₂/He Rayleigh; ammonia (Jupiter) / ammonia + haze (Saturn)
  aerosol. Least affected today; verify rather than assume they need no change.
- **Uranus / Neptune** — H₂/He Rayleigh λ⁻⁴, and methane as a **well-mixed absorbing
  constituent** (`exponential` profile at the gas scale height, `scatter: 0`), which
  is the change this design exists for. Neptune's deeper blue than Uranus at similar
  CH₄ mixing ratio is a real and only partly explained difference — do not
  manufacture a tidy derivation for it.

Sources are to be verified before they are cited. This branch has already shipped one
fabricated citation past two reviews; a quote that does not name the object it is
being used to describe is not support.

### Stage 3 — Titan

Titan takes **Venus's shape**, not Pluto's: the visible "surface" is the haze deck
itself. Supersedes `docs/backlog/2026-07-19-titan-atmosphere.md`, whose two-level
split named this.

- Atmosphere row: N₂ Rayleigh, the main organic haze as a per-channel Mie
  constituent, and the detached haze layer as a `tent` constituent — the case that
  motivates a fourth slot.
- Texture — the **haze deck**, from a Cassini ISS visible-light global mosaic:
  `BodyTextureId` member, `BODY_TEXTURE_REGISTRY` row (`surface: 'medium'`, a look
  ceiling — unresolved cloud, same reasoning as Venus's row), `TEXTURE_SOURCES` row,
  raw-data registry entry, a `ROTATION_ELEMENTS` row (tidally locked; pole from
  Archinal et al. 2018), and a `LIMB_DARKENING_PARAMS` row so the disc darkens toward
  the limb like a lit body.
- **Why not the surface mosaic.** The available Titan surface maps are infrared
  (VIMS / ISS 938 nm), where the haze is transparent. Registering one as the surface
  would be wrong twice over: hidden behind a correct haze from orbit, and — per
  `docs/backlog/2026-07-29-in-atmosphere-haze.md` — rendered at **full albedo with no
  haze at all** once the camera is inside the shell, because the near wall stops
  rasterising and the over-disc haze branch gets no fragments. A haze-deck texture is
  correct at every distance the camera can currently reach, and depends on no
  deferred renderer work.

## Testing

Per `docs/superpowers/conventions/testing.md` — test what can break:

- **Packer layout** — offsets and stride against the WGSL struct, including that
  `u32` tags land in the right words. A drift here is silent on GPU.
- **Profile and phase dispatch** — each `kind` selects the right function; the
  zero-width tent guard returns 0 rather than a NaN.
- **Stage-1 equivalence** — new accumulation vs old three-term, per row.
- **Not tested:** the recalibrated constants themselves. They are eye-gated by
  design, exactly as today; a test restating them would fail only on an intentional
  change.

## Out of scope

- `AtmosphereParams.sunIrradiance` is a **named pad**, not a lapsed feature. Byte 92
  of `AtmosphereUniforms` exists only to fill `camPosLocal`'s trailing 4-byte slot
  under the dense vec3-tail convention (`sphere.wesl:406-421`); it was given a
  physical-sounding name, and an authored field plus `1.0` in all nine rows grew
  backwards to feed it. No fragment reads it. (Unrelated to
  `EARTH_SURFACE_PARAMS.sunIrradiance`, which is live.) The byte cannot go — it is
  structural alignment — but the authored field and its plumbing can. Not forced by
  this work. → backlog.
- Seed albedos vs measured Bond albedos (Pluto's 0.49 vs 0.72 ± 0.07, and the same
  question for every row). → backlog.
- Multiple scattering beyond the existing Hillaire-style LUT; no change here.
- `EngineGpuHandles.d.ts:490-507`'s stale "Mars / Venus / Titan opt in later" comment
  rides stage 3, which makes it true.
