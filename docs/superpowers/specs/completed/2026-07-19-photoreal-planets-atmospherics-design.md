# Photoreal-planet atmospherics — Venus, Mars, and the four giants — design

> **Status.** Approved design — every decision below is user-ratified and final.
> Awaiting plans.
> **Date.** 2026-07-19.
> **Relationship to prior work.** Grows the body-agnostic scattering shell shipped by
> photoreal Earth (`specs/completed/2026-07-18-photoreal-earth-design.md`, plans A–E,
> PR #453) onto the other atmosphere-bearing bodies, and adds the gas-giant limb-darkening
> path that spec §8.4 named as a `texturedBodyRenderer` follow-on. It consumes the
> `AtmosphereParams` data-gate, the `atmosphereShellRenderer` (Bruneton/Hillaire LUTs),
> the `CONTENT_LAYERS` (target, slab, blend) table, the `foreground:0` NEAR0 slab, the
> `composeBodyMvp` f64 precision path, and the `sunDirLocal`/`camPosLocal` local-frame
> lighting seams — all unchanged in kind. Picks up follow-ups **#1** (shared per-frame
> atmosphere-pose derivation) and **#4** (Venus/Titan atmosphere = more than a params row)
> from `docs/backlog/2026-07-19-photoreal-earth-followups.md`.

## 1. What we're building

Six more foreground bodies get an atmosphere. Today only Earth does — its scattering
shell renderer is genuinely body-agnostic (it bakes whichever `AtmosphereParams` row it is
handed), but the *wiring around it* (`initGpu` construction, the `atmosphereShellLayer`
draw, the `encodeAtmosphereSkyView` bake) is hard-coded to `state.data.bodies.earth`. This
feature generalises that wiring to a per-body table, adds six scattering-parameter rows,
and gives the four gas giants plus Venus a limb-darkening term composed into the shared
textured-body fragment.

The zero-new-asset constraint is load-bearing: **no new textures, no fetch/build/R2
changes.** Every effect here is either a scattering shell driven by an authored
coefficient row, or a shading term over the surface texture each body already ships.

### 1.1 Treatment matrix (approved)

| Body | Surface path | Limb darkening | Scattering shell | Cloud shell |
|---|---|---|---|---|
| **Venus** | existing SSS cloud map as the opaque surface (unchanged; cloud-as-surface) | mild | thick CO₂ / H₂SO₄-haze row | none |
| **Mars** | unchanged textured surface | none | thin dusty-CO₂ row | none |
| **Jupiter, Saturn** | unchanged textured surface | **yes (dominant effect)** | thin row, cloud-tops-as-ground | none |
| **Uranus, Neptune** | unchanged textured surface | yes | methane-blue rows | none |
| **Earth** | untouched (`earthRenderer`) | n/a | existing row, via the generalized wiring | untouched |

Every one of the six gets a scattering-shell row; five of the six (all but Mars) also get a
limb-darkening row. A body can carry both — Venus, Uranus and Neptune do.

### 1.2 Goals

- Generalise the atmosphere-shell wiring from Earth-only to a per-body table, **without
  changing Earth's rendered output by a pixel** (the prep PR is behavior-neutral).
- Add scattering shells for Venus, Mars, Jupiter, Saturn, Uranus, Neptune with
  physically-motivated, eye-tunable starting coefficients.
- Add a limb-darkening term to the shared textured-body fragment, data-gated by a per-body
  table, that is the dominant visual for the gas-giant discs.
- Consolidate the duplicated `bodies.earth` reads and pose derivation across the bake and
  draw sites into one shared per-frame derivation (follow-up #1).

### 1.3 Non-goals (explicitly deferred)

- **`earthRenderer`, `cloudShellRenderer`/`cloudShellLayer`, the cloud shell as a whole** —
  untouched. The cloud shell stays Earth-only; no body here grows a cloud deck (Venus's
  clouds are baked into its surface texture as the opaque "cloud-as-surface" map).
- **All textures + the fetch/build/R2 pipeline** — zero new assets.
- **Rings** — untouched. This feature adds no ring systems.
- **Airless bodies** — Mercury, the Moon, and the Galilean moons stay airless (absent from
  both new tables → both terms reduce to identity by the data-gate).
- **Titan** — seeded in `SCENE_PLANETS` today (`scenePlanets.ts`) but **untextured**: it
  draws as a flat-lit albedo sphere, with no `BODY_TEXTURE_REGISTRY` row. Its Venus-style
  treatment (cloud-as-surface map + haze row + limb term) needs a texture through the
  fetch/build pipeline — exactly what this feature excludes — so it is deferred to a backlog
  detail file (§12).
- **Venus's super-rotating upper haze deck** (a second, faster cloud layer), **Mars dust
  storms / seasonal clouds**, **Uranus/Neptune rings**, **the aerial-perspective froxel**
  (the 3D view-dependent LUT), **volumetric clouds**, **radiometric solar falloff** (the
  Sun's irradiance is a per-body dial, not a `1/r²` computed value), and **per-body
  exposure sliders** (only Earth keeps a live slider; the rest tune via HMR on the data
  file). All deferred — see §13.

## 2. Ground preparation

Per the refactor-the-ground convention, one **behavior-neutral prep PR lands before the
feature PR**: *"atmosphere-shell wiring goes per-body."* The `refactor-ground` pass over the
touchpoints found that the renderer is already body-agnostic and the `AtmosphereParams`
table is already data-not-code — the missing joint is entirely in the *wiring* that
constructs, gates, bakes, and draws the shell, which reads `bodies.earth` at three hard
sites. This is exactly follow-up #4's verdict ("`initGpu` constructs one Earth-bound
renderer instance and the layer/encode are Earth-scoped") and follow-up #1's verdict (the
bake and draw derive the same pose from the same inputs, coupled only by prose).

### 2.1 Ideal shape (data delta first)

```
── DATA (unchanged in the prep; grows in the feature — see §3) ──────────
ATMOSPHERE_PARAMS   Record<string, AtmosphereParams>   (still one row: earth)

── MODULES (prep: reshape the wiring to a per-body table) ───────────────
atmosphereShellRenderer   createAtmosphereShellRenderer(device, targetFormat,
                            depthFormat, paramsById)      // was a single `params`
                          per-body bundles in a Map; pipelines/sampler/mesh SHARED;
                          startup bake loops ALL bodies in ONE encoder + one submit;
                          encodeSkyView(encoder, bodyId, uniforms)
                          draw(pass, bodyId, uniforms)
AtmosphereShellRenderer.d.ts   the per-bodyId signatures

frame/atmosphereDrawList.ts   NEW — atmosphereDrawList(state, ctx): Array<{body, params}>
                              the ONE derivation feeding BOTH the bake and the draw

atmosphereShellLayer.ts        iterate atmosphereDrawList instead of reading bodies.earth
encodeAtmosphereSkyView.ts     iterate atmosphereDrawList instead of reading bodies.earth
initGpu.ts                     pass the whole ATMOSPHERE_PARAMS table (drop hardcoded 'earth')
```

### 2.2 The renderer goes per-body (the `texturedBodyRenderer` bundle idiom)

`createAtmosphereShellRenderer` takes `paramsById: Readonly<Record<string,
AtmosphereParams>>` in place of the single `params: AtmosphereParams`. Internally it holds a
`Map<string, AtmosphereBundle>`, one bundle per body id, where a bundle is that body's:

- three LUT textures (transmittance 256×64, multi-scatter 32×32, sky-view 192×108) + views,
- the `ScatteringParams`, `SkyViewParams`, and `AtmosphereUniforms` uniform buffers,
- the four bind groups (transmittance-bake, multi-scatter-bake, sky-view-bake, shell-draw).

Everything **not** body-specific stays shared across the whole set: the four pipelines, the
LUT sampler, and the proxy-sphere mesh (positions + index buffers). This mirrors
`texturedBodyRenderer`'s per-body `Map<BodyTextureId, BodyResources>` — per-body buffers so
no shared state exists for a mid-frame write to clobber, shared pipelines so one program
serves all.

The **startup bake** (view-independent transmittance → multi-scatter) loops every body in
`paramsById`, recording all bakes into **one** command encoder and issuing **one**
`queue.submit`. The transmittance→multi-scatter ordering per body is the compute-pass
barrier WebGPU inserts between passes in one encoder (the two-pass lesson already documented
in the renderer header), unchanged — the loop just repeats the pair per body inside the same
encoder.

```ts
// contract sketch — createAtmosphereShellRenderer (per-body)
type AtmosphereBundle = {
  transmittanceTex: GPUTexture;
  multiScatterTex: GPUTexture;
  skyViewTex: GPUTexture;
  scatteringBuffer: GPUBuffer;
  skyViewParamsBuffer: GPUBuffer;
  shellUniformBuffer: GPUBuffer;
  transmittanceBindGroup: GPUBindGroup;
  multiScatterBindGroup: GPUBindGroup;
  skyViewBindGroup: GPUBindGroup;
  shellBindGroup: GPUBindGroup;
};

export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  paramsById: Readonly<Record<string, AtmosphereParams>>,
): AtmosphereShellRenderer;

type AtmosphereShellRenderer = Renderer & {
  encodeSkyView(encoder: GPUCommandEncoder, bodyId: string, skyViewUniforms: Float32Array): void;
  draw(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array): void;
};
```

`encodeSkyView` and `draw` gain a leading `bodyId` that selects the bundle. Both throw (or
assert) on an unknown id — the callers only ever pass ids from `atmosphereDrawList`, whose
entries are filtered to `paramsById` members, so an unknown id is a programming error, not a
data path. `AtmosphereShellRenderer.d.ts` is updated to the per-bodyId signatures and its
"one baked set in v1" prose is replaced by "one bundle per `paramsById` row". In passing,
the same `.d.ts`'s stale pipeline description is refreshed: it still says `cullMode:
'front'`, while the shipped pipeline is `cullMode: 'none'` with a `front_facing` duty split
(a pre-existing doc drift this prep PR corrects since it rewrites that prose anyway).

`initGpu` passes the whole table:

```ts
// initGpu.ts — was ATMOSPHERE_PARAMS['earth']!
state.gpu.atmosphereShellRenderer = createAtmosphereShellRenderer(
  device, 'rgba16float', 'depth32float', ATMOSPHERE_PARAMS,
);
```

### 2.3 Neutrality check

With only the Earth row present in `ATMOSPHERE_PARAMS` (the prep PR does **not** add the six
new rows — those land in the feature PR), the reshaped renderer bakes exactly one bundle,
`atmosphereDrawList` yields exactly the Earth entry whenever Earth is in near-field range,
and the shell draws with the same LUTs, the same uniforms, and the same pipeline as before.
Rendering is **pixel-identical**. The prep PR is a pure refactor; its plan carries a
neutrality task and a visual before/after check on the Earth limb.

## 3. Data delta (feature PR)

```
── AtmosphereParams (@types/scene/AtmosphereParams.d.ts) ────────────────
+ sunIrradiance: number   // solar radiance into the in-scatter integral
                          //   (carried per the uniform contract; fragment-unused today)
+ exposure: number        // per-body in-scatter look dial (HDR intensity scale)
+ twilightSoftness: number // [ADDED 2026-07-19, mid-execution — see §7.1] night-limb
                          //   twilight width in mu (cos-zenith) space; 0 = hard shadow.
                          //   Replaces ScatteringParams _pad0 (slot 18) — no struct growth.

── ATMOSPHERE_PARAMS (data/bodies/atmosphereParams.ts) ──────────────────
  earth   { … , sunIrradiance: 1.0, exposure: 2.35 }   // folded in from the deleted table
+ venus, mars, jupiter, saturn, uranus, neptune         // six new rows (§7)

── atmosphereShellParams.ts ─────────────────────────────────────────────
  DELETED — its two values fold into the earth row; its physics-vs-look
  docblock rationale moves into atmosphereParams.ts

── TexturedBodyUniforms (shaders/lib/sphere.wesl) ───────────────────────
  _pad0 → limbStrength        // the two existing trailing pad floats become fields
  _pad1 → limbExponent
+ camPosLocal: vec3 (+ pad)   // NEW 16-byte tail — the view vector for N·V limb
                              //   darkening; struct grows 96 → 112 bytes

── LIMB_DARKENING_PARAMS (data/bodies/limbDarkeningParams.ts) ── NEW ─────
  Record<string, { strength: number; exponent: number }>
  venus, jupiter, saturn, uranus, neptune                 // Mars + airless bodies absent

── shaders/lib/limbDarkening.wesl ── NEW ────────────────────────────────
  the Minnaert / cosine-power darkening function

── packTexturedBodyUniforms.ts ─────────────────────────────────────────
  + limbStrength, limbExponent, camPosLocal args (out[22], out[23], out[24..26]);
    TEXTURED_BODY_UNIFORM_FLOATS 24 → 28
```

### 3.1 Fold the two look fields into `AtmosphereParams`; delete `ATMOSPHERE_SHELL_PARAMS`

`AtmosphereParams` grows two "look" fields:

- **`sunIrradiance`** — scales the solar radiance driving the in-scatter integral. It is
  carried through `packAtmosphereUniforms` per the uniform contract but is **fragment-unused
  today** (the sky-view LUT bakes its own irradiance normalisation). Keep that documented
  caveat verbatim in `atmosphereParams.ts`: it is packed so the CPU write never drifts from
  the WGSL struct and becomes live only if the fragment ever routes it. `1.0` is the neutral
  value for every row.
- **`exposure`** — the per-body HDR intensity scale on the shell's in-scattered radiance,
  before the shared tone-map. This is a *look* dial, not physics.

`ATMOSPHERE_SHELL_PARAMS` (`atmosphereShellParams.ts`) is **deleted**. Its two values fold
into the Earth row (`sunIrradiance: 1.0`, `exposure: 2.35`), and its physics-vs-look
docblock rationale moves into `atmosphereParams.ts`.

**Rationale (and the rejected alternative).** A second body-keyed look table (an
`ATMOSPHERE_SHELL_PARAMS` grown to `Record<string, …>`) would be a **co-keyed mirror** of
`ATMOSPHERE_PARAMS` — two records keyed by the same body id, an omitted row in either
compiling clean into a silent wrong-look render, and every new body forced to touch two
files. The look dials are per-body scattering data that happens to be tuned by eye rather
than derived from physics; that is a reason to *document* them differently (they carry no
numeric test — see §10), not to *key* them separately. One row per body, one home. The
existing `earthSurfaceParams` / `pbr.wesl` split between artistic dials and shading-model
floors stays that split *within a shading model*; here both live on the one atmosphere row
because both are per-body atmosphere authoring.

## 4. Renderer reshape

Covered structurally in §2.2 (it is the whole of the prep PR). The feature PR adds nothing
to the renderer — the six new rows flow through the already-per-body bundle machinery. The
gas-giant "cloud-tops-as-ground" treatment is **pure data**: a giant's `planetRadiusKm` is
its drawn texture-sphere radius and its `atmosphereTopKm` sits a few scale heights above, so
`bottomRadius = planetRadiusKm / atmosphereTopKm` is close to 1 and the shell is a thin
scattering rim. No shader branch distinguishes a giant from a terrestrial body — the LUT
bake integrates whatever thin or thick shell the row describes.

## 5. The shared draw-list derivation (`atmosphereDrawList`) — follow-up #1

A new module `src/services/engine/frame/atmosphereDrawList.ts` exports **one** per-frame
derivation that both the bake step and the draw layer consume:

```ts
// contract sketch — atmosphereDrawList.ts
type AtmosphereDrawEntry = {
  body: EarthBody | PlanetBody; // carries positionMpc, radiusKm, orientation, id
  params: AtmosphereParams;
};

export function atmosphereDrawList(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly AtmosphereDrawEntry[];
```

The derivation is: start from `[state.data.bodies.earth, ...state.data.bodies.planets]`,
drop the `null` Earth, filter to bodies that **have an `ATMOSPHERE_PARAMS` row**, then apply
the two existing near-field gates per body:

- the shared `FOREGROUND_MAX_DISTANCE_MPC` distance cull (`ctx.cam.distance`), and
- the shared `SUB_PIXEL_BODY_CULL_PX` cull on the body's **surface** diameter
  (`apparentSizePx`), matching the surface/shell rows so the limb appears exactly when the
  disc does.

In practice **at most one entry** passes: the camera is in near-field range of one body at a
time, and two atmosphere bodies are never both supra-pixel at once. The per-body bundle
design (§2.2) is nonetheless correct for N>1 — practice is ≤1, correctness is general.

### 5.1 What this consolidates

Today `atmosphereShellLayer.ts` and `encodeAtmosphereSkyView.ts` each hard-read
`state.data.bodies.earth`, each re-derive the `ATMOSPHERE_PARAMS` lookup, and each re-derive
`camPosLocal` / `sunDirLocal` / the atmosphere-top scale from `ctx.drawCamPos` — with a
prose "MUST equal" contract binding the bake's baked view-height to the draw's fragment
altitude. `atmosphereDrawList` replaces **both** hard reads and the **both** gate copies
with one derivation. The per-entry pose (the `composeBodyMvp` inputs, `sunDirLocal`,
`camPosLocal` in atmosphere-top units, `bottomRadius`) is derived by each consumer from the
same entry via the **same** `camPosLocal`/`sunDirLocal` utils with the **same** inputs — so
the "MUST equal" coupling becomes structural (one entry, one set of utils) rather than two
prose-linked copies. Follow-up #1 is picked up for the atmosphere sites.

### 5.2 The bake↔draw gate relation is upgraded from superset to equality

Today the bake (`encodeAtmosphereSkyView`) deliberately gates on a *superset* of the draw's
predicate — it applies the distance cull but **not** the sub-pixel cull, so the bake can
never be stricter than the draw (a draw against an un-baked LUT would be a bug). With both
sites reading the **same** `atmosphereDrawList` (which includes the sub-pixel cull), the
bake and the draw iterate the **identical** list from the identical `(state, ctx)`: the
shell bakes iff it draws — **equality**, not superset. This is strictly better (it also
retires the thin over-bake band where the camera was in-range but the disc had gone
sub-pixel, where the old superset baked a sky-view LUT nothing sampled). The bake still runs
in the compute prelude (before the render pass opens) so the storage-write→fragment-read
barrier holds; only *which* bodies it bakes now comes from the shared list. The
"bake gate must be a superset" prose invariant is deleted — the shared derivation makes it
moot.

### 5.3 Per-body draw and bake (the exposure resolution)

Each consumer loops the list. The draw packs `AtmosphereUniforms` per entry via
`packAtmosphereUniforms(mvp, sun, camLocal, bottomRadius, params.sunIrradiance, exposure)`,
where **`exposure` resolves from `params.exposure` for every body except Earth, which reads
its live `settings.earth.atmosphereExposure` slider** (seeded from the Earth row's
`exposure`). Earth is the one body with a user-facing exposure slider (an existing shipped
affordance; the approved decision is no per-body sliders), so the pack site carries a single
Earth-keyed branch — `body.id === 'earth' ? settings.earth.atmosphereExposure :
params.exposure`. This is an essential asymmetry (Earth has a slider, the rest do not), not
an accidental one; it is one line at the one pack site, not a shading-model fork.

## 6. Limb darkening

A plain Lambert term gives the giant discs a generic ball-lit falloff; real giant discs have
a distinctly *flatter centre and steeper limb falloff*, and the profile is **view**-dependent
— the darkening hugs the visible silhouette from every approach angle, not the terminator.
This is the `lib/limbDarkening.wesl` term the Earth spec §8.4 named as a
`texturedBodyRenderer` follow-on.

### 6.1 The law and the view vector

`src/services/gpu/shaders/lib/limbDarkening.wesl` implements the **Minnaert**
planetary-photometry law: `I/F = mu0^k · mu^(k-1)`, where `mu0 = N·L` (incidence cosine) and
`mu = N·V` (emission cosine). The textured-body fragment already applies a Lambert term
(∝ `mu0`), so the lib exposes Minnaert *relative to Lambert* — the factor composed on top is
`(mu0 · mu)^(k-1)`, which is exactly `1.0` at `k = 1` (Lambert identity) and, for `k > 1`,
flattens the disc centre while steepening the falloff at BOTH the silhouette (`mu → 0`) and
the terminator (`mu0 → 0`), from any viewing angle.

The fragment needs a view vector for `mu`. `TexturedBodyUniforms` grows a 16-byte tail
carrying `camPosLocal` — the camera in the body's local unit-sphere frame, the same
`camPosLocal` util + uniform idiom `EarthSurfaceUniforms` already uses for the ocean glint —
taking the struct from 96 to 112 bytes. No new varying is needed: on the unit sphere the
fragment's local position IS its unit normal, so `V = normalize(u.camPosLocal - n)`.

```
// limbDarkening.wesl — contract sketch (single quotes in comments; no backticks)
// Minnaert relative to the Lambert term the caller already applies:
//   I/F = mu0^k · mu^(k-1)  =  mu0 · (mu0 · mu)^(k-1)
// so the composable darkening factor is (mu0 · mu)^(k-1).
// 'strength' == 0 returns 1.0 exactly (the identity the absent-row data-gate
// relies on); 'exponent' is the Minnaert k ('k == 1' is also the identity).
fn limbDarkening(mu0: f32, mu: f32, strength: f32, exponent: f32) -> f32 {
  let darken = pow(max(mu0 * mu, 0.0), exponent - 1.0);
  return mix(1.0, darken, strength);
}
```

### 6.2 Composition into the textured-body fragment

`texturedBody/fragment.wesl` composes the term multiplicatively on the lit colour, after the
ring-shadow attenuation, gated by `limbStrength`:

```
// fragment.wesl — sketch of the added lines (single quotes in comments)
// 'noL' is the same sun cosine the Lambert term uses. The view vector needs no
// new varying: in the unit-sphere local frame the surface position IS the unit
// normal, so 'u.camPosLocal - n' is the fragment-to-camera vector.
// 'limbStrength == 0' (every body absent from LIMB_DARKENING_PARAMS) returns
// 1.0 -- shader identity.
let noL = max(dot(n, u.sunDirLocal), 0.0);
let v = normalize(u.camPosLocal - n);
let noV = max(dot(n, v), 0.0);
let limb = limbDarkening(noL, noV, u.limbStrength, u.limbExponent);
let colour = albedo * shade * limb;
```

`limbStrength == 0` yields the identity `1.0`, so Mercury, the Moon, and the Galilean moons
(absent from the table) render exactly as today — the same data-gate pattern `sceneRings` /
`ATMOSPHERE_PARAMS` use.

### 6.3 Uniform, packer, and data table

- **`TexturedBodyUniforms`** (`shaders/lib/sphere.wesl`): the two trailing pad floats
  (`_pad0` byte 88, `_pad1` byte 92) become `limbStrength` (byte 88) and `limbExponent`
  (byte 92), and a NEW 16-byte tail carries `camPosLocal: vec3<f32>` (bytes 96–107, the
  16-byte alignment holds — 96 is a vec3 boundary) + one pad float. The struct grows
  **96 → 112 bytes**; `UNIFORM_BUFFER_SIZE` in `texturedBodyRenderer.ts` updates to 112
  (still a restated literal — the derive-from-packer-count knot stays in the backlog,
  untriggered). The struct docblock's byte-layout table is updated.
- **`packTexturedBodyUniforms`** gains `limbStrength`, `limbExponent`, `camPosLocal` args,
  writing `out[22]`, `out[23]`, and `out[24..26]`. `TEXTURED_BODY_UNIFORM_FLOATS` goes
  24 → 28.
- **`LIMB_DARKENING_PARAMS`** (`src/data/bodies/limbDarkeningParams.ts`), a NEW data table:

```ts
// limbDarkeningParams.ts — contract sketch
export const LIMB_DARKENING_PARAMS: Readonly<Record<string, { strength: number; exponent: number }>> = {
  venus:   { strength: 0.25, exponent: 1.15 }, // mild
  jupiter: { strength: 0.6,  exponent: 1.3 },  // dominant on the banded disc
  saturn:  { strength: 0.55, exponent: 1.3 },
  uranus:  { strength: 0.45, exponent: 1.25 },
  neptune: { strength: 0.45, exponent: 1.25 },
  // mars + airless bodies (mercury, moon, galileans) absent => strength 0 => identity
};
```

  Values are eye-tunable starting points, no numeric test (§10). `strength` in `[0,1]` lerps
  identity→law; `exponent` is the Minnaert `k` — `1.0` is the Lambert identity, `> 1`
  flattens the disc centre and steepens the limb falloff.
- **`texturedBodiesLayer`** packs from the table via a small lookup helper (sibling of the
  existing `ringRatios`): `limbParams(body)` returns the row or `{ strength: 0, exponent: 1
  }` when the body is absent. The loop also derives each body's `camPosLocal` via the
  existing `camPosLocal` util — the same `(view.camPos, body.positionMpc, radius,
  body.orientation)` inputs its `composeBodyMvp` call already consumes, with the body's
  SURFACE radius as the scale (the fragment's unit sphere) — and passes all three into
  `packTexturedBodyUniforms`.

## 7. Per-body scattering-shell starting parameters

Six new `ATMOSPHERE_PARAMS` rows. **`planetRadiusKm` is derived from each body's
`SCENE_PLANETS` `radiusKm`** (single source of truth, exactly as the Earth row derives from
`SCENE_EARTH.radiusKm`) via a small in-module lookup — so the scattering proxy is concentric
with the drawn sphere by construction and cannot drift. All other numbers are
**physically-motivated but eye-tuned starting points**: they carry no numeric test (a
restatement would fail on every legitimate look tweak — the same convention the Earth row
already documents), and the plan's row-tuning tasks nudge them live via HMR against each
body's reference imagery.

Starting table (magnitudes sanity-checked; **all eye-tuned later**):

| Body | radiusKm (from `SCENE_PLANETS`) | atmosphereTopKm | rayleighScaleHeightKm | rayleighScatter (1/km, tint) | Mie (scatter / absorb / scaleH / g) | ozone | groundAlbedo | sunIrr | exposure |
|---|---|---|---|---|---|---|---|---|---|
| **Venus** | 6052 | +100 → 6152 | 15.9 | `[12e-3, 10e-3, 7e-3]` warm/whitish-yellow | `25e-3 / 2e-3 / 5 / 0.7` (thick haze) | 0 | `[0.85, 0.80, 0.60]` | 1.0 | 3.0 |
| **Mars** | 3390 | +60 → 3450 | 11.1 | `[8e-3, 5e-3, 3e-3]` reddish (dust) | `10e-3 / 4e-3 / 8 / 0.6` (dusty) | 0 | `[0.60, 0.32, 0.23]` | 1.0 | 1.5 |
| **Jupiter** | 69911 | +150 → 70061 | 27 | `[4e-3, 4e-3, 5e-3]` near-neutral | `3e-3 / 1e-3 / 12 / 0.6` (thin) | 0 | `[0.80, 0.65, 0.45]` | 1.0 | 1.3 |
| **Saturn** | 58232 | +300 → 58532 | 59.5 | `[4e-3, 4e-3, 4e-3]` pale gold | `3e-3 / 1e-3 / 25 / 0.6` (thin) | 0 | `[0.80, 0.70, 0.50]` | 1.0 | 1.3 |
| **Uranus** | 25362 | +150 → 25512 | 27.7 | `[4e-3, 10e-3, 20e-3]` methane-blue | `2e-3 / 1e-3 / 12 / 0.6` (thin) | 0 | `[0.60, 0.80, 0.82]` | 1.0 | 1.8 |
| **Neptune** | 24622 | +120 → 24742 | 20 | `[4e-3, 9e-3, 22e-3]` methane-blue | `2e-3 / 1e-3 / 10 / 0.6` (thin) | 0 | `[0.30, 0.42, 0.75]` | 1.0 | 1.8 |

Notes on the physical motivation encoded:

- **Ozone is zeroed for all six** (`ozoneAbsorption [0,0,0]`, centre/width `0`) — the ozone
  tent is an Earth-specific feature of the terrestrial stratosphere; none of these bodies
  has an analogous absorbing layer worth modelling.
- **`groundAlbedo` approximates each texture's mean colour** — reusing each body's
  `SCENE_PLANETS` `albedo` triple, which was already authored as the body's plausible mean
  surface colour. The multi-scatter LUT bakes an isotropic ground bounce from it.
- **Venus** is Mie-dominated: the thick CO₂ + H₂SO₄ haze gives a large `mieScatter` and a
  low scale height (dense near the cloud tops), with a warm/whitish-yellow Rayleigh tint. Its
  `atmosphereTopKm` sits `+100 km` above the surface — the tallest visible band.
- **Mars's butterscotch sky is dust-driven, not molecular.** We encode it through the
  wavelength-dependent `rayleighScatter` vec3 (red-heavy, blue-suppressed — inverted from
  Earth's blue-heavy tint) plus a dusty Mie term, giving a thin, reddish shell. There is no
  separate "dust" channel; the tint + Mie *are* the dust.
- **Jupiter and Saturn treat the drawn texture sphere as the ground** (cloud-tops-as-ground):
  `planetRadiusKm` is the cloud-top radius they already draw, and the shell is thin (a few
  scale heights). Their dominant close-approach visual is the **limb-darkening** term (§6),
  not the scattering rim — the shell is a faint edge glow.
- **Uranus and Neptune** carry methane-blue-tinted Rayleigh (blue/cyan-heavy, red
  suppressed, mimicking methane's red absorption), giving the cyan-blue limb both worlds
  show.

### 7.1 Twilight softness (night-limb glow)

> **Provenance — 2026-07-19 mid-execution scope addition (user-approved).** The rest of
> this spec is a pre-execution artifact. This subsection was added on 2026-07-19 *during*
> the feature PR's execution, after the user approved one scope addition: a per-body
> twilight-softness knob. It ships in the feature plan as **Task 7** (which executes before
> the plan's final visual-pass task). The reader should know it arrived later than the
> surrounding design.

A per-body `twilightSoftness` field on `AtmosphereParams` (unit: a width in mu = cos-zenith
space; `0` disables). It controls how the **whole in-scatter source (single + multi
scatter)** fades as the sun drops below a march sample's local horizon — and in doing so
**fixes an existing unphysical clamp** on the night limb.

**Today's behaviour (the bug it fixes).** `raymarchInScatter`
(`src/services/gpu/shaders/atmosphere/skyViewLut.wesl`) is the only consumer of per-sample
sun lighting. Each sample's sun contribution is
`sunTransmittance = sampleTransmittanceToTop(..., r, sunCosZenith)` with **no planet-shadow
test**. When the sun is below the sample's local horizon, the transmittance LUT's `(r, mu)`
parametrisation clamps to its horizon-grazing edge — a deep-red, small, but **nonzero**
value. So a sample in deep planet shadow is still lit at a constant grazing value: deep
shadow is unphysically lit, and the terminator's falloff is not controllable.

**The knob.** In `raymarchInScatter`, per sample, compute the local horizon cosine and a
sun-visibility factor, and weight the **whole in-scatter source** (single + multi scatter) by
it (single quotes in WESL comments; never backticks):

```
// twilightSoftness: fade the WHOLE in-scatter source (single + multi) across the
// terminator. 'muHorizon' is the cosine of the sun-zenith angle at which the sun grazes
// this sample's local horizon; below it the sun is geometrically set. Without this the
// transmittance LUT clamps to its grazing edge and deep shadow stays lit.
let muHorizon = -sqrt(max(0.0, r * r - bottom * bottom)) / r;
let sunVis = smoothstep(muHorizon - params.twilightSoftness, muHorizon, sunCosZenith);
let s = sunVis * (sunTransmittance * scatterPhased + psiMultiScatter * scatterTotal);
```

(`bottom` and `r` are already in scope in `raymarchInScatter` — `bottom = params.planetRadiusKm`,
`r = length(pos)`.)

**Why this is the right model (didactically):**

1. **It is what the real twilight ring is.** At altitude the sun sets ~`sqrt(2h/R)` later than
   at the surface, so a band above the terminator stays sunlit while the ground below is dark
   — the twilight ring. The `smoothstep` width stands in for the sun's finite angular diameter
   plus the atmospheric refraction this model omits, both of which soften the geometric
   terminator into a band.
2. **It fixes the unphysical clamp.** With `sunVis`, a sample whose sun is well below
   `muHorizon` gets `sunVis → 0`, so deep night goes properly black; only the
   `[muHorizon - twilightSoftness, muHorizon]` band keeps a controlled glow. The old LUT-edge
   grazing floor is gone.
3. **The multi-scatter term IS factored, on purpose.** `psiMultiScatter * scatterTotal` is the
   isotropic ambient floor, and at the night limb it dominates the grazing-attenuated single
   scatter by orders of magnitude: its own LUT clamps to the same below-horizon edge, so
   gating single scatter alone leaves the knob modulating a sub-percent component and the fade
   reads as visually inert. Multiplying the whole source by `sunVis` is what makes deep night
   go black.
4. **The startup LUT bakes do not read the knob.** Only the per-frame sky-view bake
   (`raymarchInScatter`) consumes `twilightSoftness`; the transmittance and multi-scatter
   bakes (startup, once) are untouched. So tuning the value is **instant via HMR** — no LUT
   rebake.
5. **Per-body because twilight character is a per-atmosphere property** — Mars's wide, dusty
   twilight versus the giants' thin, sharp rings.

**Data + packing.** `twilightSoftness` replaces `ScatteringParams._pad0` (f32 slot 18) —
**no struct growth** (80 B / 20 f32 unchanged); `packScatteringParams` writes
`out[18] = params.twilightSoftness` in place of the zeroed pad (`_pad1` at slot 19 remains).
The byte-layout parity test gains a slot-18 assertion.

**Starting values (HMR-tunable; the visual pass adjusts):** earth `0.05`, venus `0.05`,
mars `0.07`, jupiter `0.03`, saturn `0.03`, uranus `0.03`, neptune `0.03`.

> **Amendment — 2026-07-19 mid-visual-pass (user-approved).** The transport moved off the
> construction-written `ScatteringParams` buffer and onto the per-frame `SkyViewParams`
> (`skyViewLut.wesl`) — `twilightSoftness` lands at that struct's slot 2 (its former `_pad0`),
> and `ScatteringParams` slots 18/19 revert to inert pad. The reason is **live tunability**:
> `ScatteringParams` is written once at LUT-bake construction, so a value packed there needs a
> reload to change, whereas `encodeAtmosphereSkyView` repacks `SkyViewParams` every frame. With
> the knob there, Earth gains a **live Settings → Display → Earth "Twilight softness" slider**
> (range 0–0.5, step 0.005), seeded from `ATMOSPHERE_PARAMS.earth.twilightSoftness` — the exact
> **exposure-seam twin**: Earth reads the settings value each frame, every other body reads its
> own `AtmosphereParams` row. `AtmosphereParams` keeps the field (the seed + the six planets'
> authored values); only the *packer* stops reading it. The march reads `view.twilightSoftness`
> instead of `params.twilightSoftness`; the byte-parity test moves its slot assertion accordingly.

> **Amendment — 2026-07-19 mid-visual-pass (user-approved).** A second knob,
> **`twilightIntensity`**, tunes the twilight band's brightness. The surviving twilight band —
> once the whole in-scatter source is faded — is physically dim, so `twilightIntensity` is a
> gain applied *inside* the fade: `let twilightGain = mix(1.0, view.twilightIntensity, 1.0 - sunVis);`
> and `let s = sunVis * twilightGain * (sunTransmittance * scatterPhased + psiMultiScatter * scatterTotal);`.
> The gain is identity where the sun is above the local horizon (`sunVis = 1 -> gain = 1`, day
> side untouched); at intensity `1` the whole thing is the physical result; `> 1` amplifies only
> the twilight band; deep night stays black at any intensity because `sunVis -> 0` dominates. It
> is a per-body `AtmosphereParams` row value (default `1.0` = physical for all seven bodies),
> rides `SkyViewParams` slot 3 (the former `_pad1`), and Earth gains a **live Settings → Display
> → Earth "Twilight intensity" slider** (range 0–10, step 0.05) through the exact same
> Earth-keyed seam as `twilightSoftness`.

## 8. Settings story

`settings.earth.atmosphereExposure` **stays Earth's live override**, unchanged in behavior:

- Its seed source changes from `ATMOSPHERE_SHELL_PARAMS.exposure` to the Earth row's
  `exposure` (`ATMOSPHERE_PARAMS.earth.exposure`) at `state/settings/initialState.ts` — a
  one-line import/reference change. `EngineSettingsState.d.ts`'s docstring citing
  `ATMOSPHERE_SHELL_PARAMS.exposure` updates to the Earth row.
- The Earth-section slider (`SettingsPanel/EarthSection.tsx`, `EarthSectionContainer.tsx`,
  the `settingsSlice` reducer, the selector) is untouched.

**No per-body sliders, no settings migration.** The other six bodies tune their `exposure`
(and every other coefficient) via **HMR on `atmosphereParams.ts`** — the same eye-tuning
loop the Earth row's physical coefficients already use. The approved decision is that only
Earth (the descent's landing target) warrants a live UI dial; the rest are authored data.

## 9. Compositing, occlusion, picking (unchanged in kind)

The six shells draw through the same `atmosphereShellLayer` row as Earth: `blend: 'over'`,
`target: 'foreground:0'`, `slab: NEAR0`, drawn last, depth-**tested** against the opaque
bodies (`less-equal`) but writing **no** depth. Cross-body occlusion (e.g. the Moon passing
in front of a planet, or a planet in front of another's shell) is the ordinary depth test —
unchanged. The shells stay **non-pickable** (a translucent halo has no clickable
silhouette); `bodyPickRenderer` is untouched. The march bound stays the analytic
ray–surface-sphere intersection, so the `foreground:0` depth texture stays
`RENDER_ATTACHMENT`-only.

## 10. Testing

Per `docs/superpowers/conventions/testing.md` — test only what a real bug could break that
no compiler check or other test catches. **No numeric coefficient restatements, no runtime
type tests, no clamp-boundary/mirror tests.**

- **`atmosphereDrawList` selector behavior (TS).** The real logic worth guarding:
  - a body **with** an `ATMOSPHERE_PARAMS` row and a supra-pixel disc in near-field range is
    **in** the list; a body **without** a row is **out** (the data-gate);
  - a body beyond `FOREGROUND_MAX_DISTANCE_MPC` is **out** (distance cull);
  - a body whose disc is **sub-pixel** is **out** (sub-pixel cull) — this is the gate that
    makes the bake↔draw relation equality (§5.2), so it is worth a test;
  - a `null` Earth is skipped without throwing.

  These are behavioral branches a refactor could silently break; they are not restatements
  of constants.
- **Params-table structural drift-catchers (TS).**
  - **`atmosphereTopKm > planetRadiusKm`** for every `ATMOSPHERE_PARAMS` row — a real
    drift-catcher (an author fat-fingering a top below the surface would float the limb
    inside the ground; the compiler cannot catch it).
  - **Every `ATMOSPHERE_PARAMS` and `LIMB_DARKENING_PARAMS` key resolves to a real seeded
    body** (`SCENE_PLANETS` id or `earth`) — catches a typo'd id that would otherwise
    silently never render (no row, no error).
- **Deliberately NOT tested.** `planetRadiusKm === <scene radius>` is **guaranteed by
  construction** (the row derives `planetRadiusKm` from `SCENE_PLANETS`/`SCENE_EARTH`, the
  Earth-row precedent) — asserting it would be a tautology restating the derivation, which
  testing.md forbids. The scattering coefficients, scale heights, Mie/ozone terms,
  `groundAlbedo`, `sunIrradiance`, `exposure`, and the limb `strength`/`exponent` carry **no
  numeric test** — every one is an eye-tuned look value expected to move.
- **`limbDarkening.wesl` / shader composition** is verified visually (§11), not by a WGSL
  unit test — the identity-at-`strength==0` property is a plain `mix(1.0, …, 0.0)` the
  compiler guarantees.

## 11. Visual verification pass (per body)

HMR-driven, at close approach to each body:

- **Venus** — a thick, warm/whitish-yellow limb band; mild disc limb-darkening; the surface
  is the existing cloud-as-surface map (no cloud shell).
- **Mars** — a thin reddish/butterscotch limb; no limb-darkening on the disc.
- **Jupiter** — pronounced **limb darkening** across the banded disc (the dominant effect);
  a faint thin scattering rim at the edge.
- **Saturn** — pronounced limb darkening; a faint pale-gold rim; **rings unaffected**
  (untouched).
- **Uranus / Neptune** — limb darkening plus a cyan-blue methane limb.
- **Airless control** — Mercury, the Moon, and the Galilean moons show **no** limb band and
  **no** disc darkening (both tables absent → identity).
- **Moon-in-front occlusion still correct** — a body passing in front of an atmosphere body
  occludes both the disc haze and the limb (the depth test, unchanged).
- **Earth pixel-identical after the prep PR** — the Earth limb, sunset arc, and over-disc
  haze read exactly as on `main` before the six rows land (§2.3).
- **iOS spot-check** — the per-body bundle loop and the extra shells present correctly on
  iOS WebKit (the storage-texture LUT bakes are unchanged in kind; the risk is only the
  multiplied bundle count).

## 12. Backlog hygiene (same change)

- **Remove follow-up #1** ("Shared per-frame atmosphere-pose derivation") from
  `docs/backlog/2026-07-19-photoreal-earth-followups.md` — picked up by §5.
- **Remove follow-up #4** ("Venus/Titan atmosphere = more than a params row") from the same
  file — picked up by §2. Update the `docs/BACKLOG.md` index line's parenthetical to drop
  those two items (the detail file still holds #2, #3, #5, #6, which remain deferred).
- **Create `docs/backlog/2026-07-19-titan-atmosphere.md`** + a terse `docs/BACKLOG.md` index
  line. Titan is already seeded in `SCENE_PLANETS` but untextured (flat-lit albedo sphere).
  The detail file records both paths: the **minimal** one — a single `ATMOSPHERE_PARAMS` row
  (thick, orange, methane-haze, Mie-dominated) over today's flat sphere, which the
  generalized wiring would render with zero further code — and the **full** Venus treatment
  (a cloud-as-surface texture through the fetch/build pipeline + a `LIMB_DARKENING_PARAMS`
  row, which requires the textured-body path). The split keeps the "just add a row"
  shortcut honest about what each level of Titan actually needs.

## 13. Delivery — two-PR sequence

Explicit two-PR structure, prep before feature:

| PR | Scope | Behavior |
|---|---|---|
| **Prep** | Atmosphere-shell wiring goes per-body: `createAtmosphereShellRenderer(paramsById)` + per-body bundles, `atmosphereDrawList`, layer/encode iterate it, `initGpu` passes the whole table, `AtmosphereShellRenderer.d.ts` updated | **Behavior-neutral** — Earth pixel-identical (§2.3) |
| **Feature** | `AtmosphereParams` grows `sunIrradiance`+`exposure` & `ATMOSPHERE_SHELL_PARAMS` deleted; six new rows; `limbDarkening.wesl` + `LIMB_DARKENING_PARAMS` + the `TexturedBodyUniforms` pad→field + `camPosLocal` tail (96 → 112 B) + packer args + `texturedBodiesLayer` packing; backlog hygiene | Six new atmospheres + gas-giant limb darkening |

This spec + both plans ride the **first PR** (the prep PR), not a separate docs PR. Each PR
is its own plan under `docs/superpowers/plans/` per `plan-style.md`.

## 14. Deferred / future extensions

- **Venus's super-rotating upper haze deck** — a second, faster cloud layer above the
  surface map. Needs a cloud-shell generalisation (currently Earth-only) plus a rotation
  model skymap lacks.
- **Mars clouds / dust storms** — seasonal water-ice clouds and global dust events; a
  time-varying optical field, out of scope for a static coefficient row.
- **Uranus / Neptune rings** — narrow, dark ring systems; a `SCENE_RINGS` + ring-texture
  effort, not an atmosphere one.
- **Titan** — a scene body first (§12), then one atmosphere row + a cloud-as-surface map.
- **Aerial-perspective froxel** — the 3D view-dependent LUT for looking *through* an
  atmosphere from inside; deferred with the Earth froxel (iOS-risky, terrain/descent phase).
- **Volumetric clouds** — genuine 3D cloud rendering; a separate large effort.
- **Radiometric solar falloff** — the Sun's irradiance as a computed `1/r²` per body rather
  than a per-body `sunIrradiance` dial (which is fragment-unused today anyway).
- **Per-body exposure sliders** — only Earth has a live slider; the rest tune via HMR by
  approved decision.
