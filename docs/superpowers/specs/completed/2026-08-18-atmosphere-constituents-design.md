# Atmosphere constituents — design

Status: draft · Supersedes `docs/backlog/2026-08-17-atmosphere-params-physical-channels.md`

Replace `ScatteringParams`' hard-coded Rayleigh / Mie / ozone triple with a list of
constituents, then recalibrate the six planet rows onto the channels the physics
actually lives in, and add Titan.

## Why

`rayleighScatter` is doing duty as a per-body colour dial. Rayleigh goes as λ⁻⁴, so
`[12, 10, 7]e-3` (Venus) and `[8, 5, 3]e-3` (Mars) describe no molecular scattering
that exists; both bodies' colour is aerosol. Uranus and Neptune's `[4, 10, 20]e-3` and
`[4, 9, 22]e-3` are, by contrast, ordinary λ⁻⁴ Rayleigh — within ~10% of shape and
~25% of the correct H₂/He magnitude
(`../../research/atmospheres/uranus-neptune.md` §0). Their actual defect is that the
table's one per-channel absorption vector sits at `[0, 0, 0]` in all six rows, so
methane — the thing that actually makes these planets blue — is absent from the
model entirely.

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
| Titan texture                               | ~~growth~~  | Dropped at stage 3: no visible-light global mosaic of Titan exists. The verdict was sound; the premise was not.                                                                                                     |
| Titan rotation                              | ~~growth~~  | Dropped with the texture — orientation is gated on texture-registry membership (`orientationForBody.ts:33`), so the row would never be read.                                                                        |

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

`MAX_CONSTITUENTS = 4` (Earth 3, Venus 3, Titan 3, Pluto 2; as shipped, Neptune 4 is
the only row that spends the budget). 48-byte stride, which
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

Derivations for all six rows live in `../../research/atmospheres/` (one note per
pair: `mars.md`, `venus.md`, `uranus-neptune.md`, `jupiter-saturn.md`); this section
states conclusions, not derivations.

Physics leads; the look follows. Each row is derived and tagged `[M]`easured /
`[D]`erived / `[L]`ook the way Pluto's row is, so a later tuner knows which values a
nudge would falsify.

Per body, what must be derived — **quantities, not values; the numbers are stage-2
research output and are deliberately not pre-committed here**:

- **Venus** — a geometry change first, not just coefficients: altitude 0 is
  currently the solid surface, which sits under τ ≈ 41 (blue Rayleigh) + τ ≈ 25
  (cloud) — unrenderable, and wrong even if it were rendered, since the
  multi-scatter LUT's Hillaire-style approximation is calibrated for τ ≲ 1. Re-anchor
  altitude 0 at the τ = 1 cloud top (68.8 km, 50 mbar) and drop `atmosphereTopKm`
  from `+100` to `+40`; `planetRadiusKm` itself is unaffected — the 68 km offset is
  1.1% of the radius, cosmetically irrelevant. Then: molecular Rayleigh for the thin
  column above the cloud top (λ⁻⁴, blue-heavy, not the current warm ramp); H₂SO₄
  cloud as a per-channel Mie constituent; the near-UV absorber as a third
  constituent, still unsettled in the literature, so an `[L]` row whatever shape the
  model takes — say so. See `../../research/atmospheres/venus.md`.
- **Mars** — thin CO₂ Rayleigh (blue-heavy but weak); suspended dust as the
  per-channel Mie constituent carrying the butterscotch. Dust loading is seasonal;
  pick a stated τ and record which.
- **Jupiter / Saturn** — H₂/He Rayleigh, but not grey: the current vectors
  (`[4,4,5]e-3`, `[4,4,4]e-3`) are wrong in shape, not magnitude — Jupiter's red is
  ~2.5× too high, blue ~1.9× too low. Jupiter's aerosol `absorb` should be `0`, not
  the current `1e-3`, which implies a single-scattering albedo of 0.75; both cloud
  and haze measure as conservative scatterers (k ≈ 1e-9). The Mie/aerosol scale
  heights are already right — Saturn's 25 km is the measured particle scale height —
  leave them. See `../../research/atmospheres/jupiter-saturn.md`.
- **Uranus / Neptune** — H₂/He Rayleigh λ⁻⁴; the current vectors are already close
  (see "Why"), so this row barely moves. The actual gap is methane, the change this
  design exists for — a constituent that both scatters (Rayleigh, like any molecule)
  and absorbs hard in the red. Two traps: 1 bar is _above_ the CH₄ condensation
  level, so methane there is saturation-limited and e-folds in ~6 km, not the 20–28 km
  gas scale height; and Neptune carries _less_ methane than Uranus, being colder.
  Neptune also needs a `tent` for the detached methane-ice layer, which takes it to
  four constituents — the whole budget. Their colour difference is attributed to an
  aerosol layer below the drawn sphere and is not fully explained in the literature;
  carry it in `groundAlbedo` against measured geometric albedos rather than
  manufacturing a haze for it.

Sources are to be verified before they are cited. The Pluto/Charon branch got a
fabricated citation — "Protopapa+19, ApJL 872 L36", no such paper — past two reviews
in `bodyTextureRegistry.ts`; a third caught it, and the 2.7% PCA figure turned out to
trace to Grundy et al. 2016, Science 351, aad9189, which the row cites today
(`docs/superpowers/plans/completed/2026-08-16-add-pluto-charon.ledger.md:64`). Two
reviews is not a filter. A quote that does not name the object it is being used to
describe is not support.

### Stage 3 — Titan

Titan takes **Venus's shape**, not Pluto's: the visible "surface" is the haze deck
itself. Supersedes `docs/backlog/2026-07-19-titan-atmosphere.md`, whose two-level
split named this. Derivation: `../../research/atmospheres/titan.md`.

**One row, no texture.** Titan ships as an `ATMOSPHERE_PARAMS` entry and nothing
else — no `BodyTextureId` member, no `BODY_TEXTURE_REGISTRY` / `TEXTURE_SOURCES` /
raw-registry row, no `ROTATION_ELEMENTS` row and no `LIMB_DARKENING_PARAMS` row. It
therefore draws through `planetsLayer` / `planetRenderer` as a flat Lambert sphere
tinted by its seed albedo, with the shell above it.

- **Three constituents.** N₂/CH₄ Rayleigh (0.2% of the extinction — correctness
  only), then the organic haze split across **two** Henyey–Greenstein lobes. The
  haze particles are fractal aggregates: a 2–3 µm projected area sets a 7.7°
  diffraction lobe while the 0.05 µm monomers keep a near-Rayleigh backscatter, and
  a single `g` must give up one of them — losing the forward lobe loses the twilight
  surge that is Titan's defining optical property (García Muñoz+17 measure Titan
  brighter backlit than fully lit). No methane constituent, unlike Uranus/Neptune:
  the CH₄ column above the reference level is 1.9 × 10⁻³ km-am against 4 km-am for
  the whole atmosphere, so the deep bands form below the drawn sphere.
- **The detached haze gets no `tent`, and does not motivate a fourth slot** — the
  claim this section previously made. Its normal optical depth is ~1 × 10⁻³ (100×
  thinner at the limb than Neptune's Aerosol-4, which is already a look risk) and it
  was undetectable from late 2012 to early 2016. A layer that comes and goes is not
  a table constant. The slot it would have taken goes to the second phase lobe.
- **Geometry.** Altitude 0 is the nadir τ = 1 haze level, 160 km up — 6.2% of the
  radius, against Venus's 1.1%, so Titan draws visibly small. `planetRadiusKm`
  cannot be raised to close that: above the rasterised radius the fragment's ground
  test reads true where no disc was drawn and the limb glow is amputated
  (`shell/fragment.wesl:176-181`). The prerequisite is instead that
  `planetRenderer` take its silhouette from the analytic sphere, since the
  tessellated mesh inscribes the true sphere by 0.43% — the same failure in
  miniature. That un-braiding landed as its own commit before this stage.

**Why textureless — and why not to go looking again.** There is **no Cassini ISS
visible-light global mosaic of Titan**. The search covered the USGS mosaic bucket
(every Titan product there is ISS 938 nm or radar), the NASA Photojournal (every
true-colour Titan is a small single-hemisphere perspective image, not
map-projected), Björn Jónsson's map set (no Titan) and Solar System Scope (no
Titan). `data/raw/textures/README.md` had already recorded this and was right.

The infrared surface maps (VIMS / ISS 938 nm) are not a substitute — the haze is
transparent there. Registering one as the surface would be wrong twice over: hidden
behind a correct haze from orbit, and — per
`docs/backlog/2026-07-29-in-atmosphere-haze.md` — rendered at **full albedo with no
haze at all** once the camera is inside the shell, because the near wall stops
rasterising and the over-disc haze branch gets no fragments.

The cost of shipping flat is a disc with no structure but its own shading gradient,
and a composite that reads too bright and much too red — predicted, quantified, and
attributed to the seed albedo rather than to the coefficients in the note's §0. The
seed correction is table-wide
(`docs/backlog/2026-08-18-body-seed-albedos-vs-measured.md`), not Titan's to make.
Titan's one piece of real large-scale visible structure is a seasonally reversing
north/south albedo asymmetry, which no static texture could carry anyway →
`docs/backlog/2026-08-18-titan-seasonal-albedo-asymmetry.md`.

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
- ~~`EngineGpuHandles.d.ts:490-507`'s stale "Mars / Venus / Titan opt in later"
  comment rides stage 3, which makes it true.~~ No such file. The surviving text is
  `CloudShellRenderer.d.ts:3`, and it is about the **cloud** shell (Earth's clouds),
  a different subsystem that stage 3 does not opt Titan into. Left alone.
