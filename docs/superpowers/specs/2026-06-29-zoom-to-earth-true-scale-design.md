# Zoom to Earth at true relative scale — design

> **Status.** Approved design. **Phase 1 (the precision slice) SHIPPED to
> `main` via PR #386 (`504b15dc`, 2026-07-10)**, then folded onto the unified
> layer/slab/program renderer (see the
> [renderer-unification design](completed/2026-06-29-renderer-unification-design.md),
> now in `specs/completed/`, and its
> [fold plan](../plans/completed/2026-07-06-renderer-unification-04-fold-zoom-to-earth.md)).
> §§4/7/8/10–12 were re-grounded on the landed architecture on 2026-07-10;
> Phases 2–5 remain, tracked by plans 02 (Earth + anchors) and 03 (LOD + polish).
> **Date.** 2026-06-29.
> **Relationship to prior work.** Refines the precision stance of the
> 2026-05-08 "Cosmic Zoom — Powers of Ten" plan's
> [ADR 0001 (per-shell floating origin)](../plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md)
> for the _interactive free-zoom_ case (see §3). This is the first kept
> increment of that larger vision: the scale-architecture seam plus a
> visible payoff (fly down to a textured Earth past a few anchors).

## 1. What we're building

A user can zoom continuously from the galaxy/cosmic-web view **all the way
down to Earth, rendered at its true physical size relative to everything
else**, passing a handful of scale anchors (the Sun, the Moon, Jupiter, the
nearest star) on the way down.

This is a **kept foundation**, not a throwaway spike. The first task is a
precision-only vertical slice that proves the hard part in skymap's actual
renderer; if it works it stays and the rest builds on it.

### Goals

- Continuous, jitter-free zoom across ~17 orders of magnitude (cosmic horizon
  ~1.4×10⁴ Mpc → Earth radius ~2×10⁻¹⁶ Mpc).
- Earth at true relative scale: a textured (Blue Marble) sphere of radius
  6371 km, correctly placed, that resolves cleanly as you approach.
- A small set of correctly-scaled anchors so the descent is legible.
- A reusable scale-architecture seam (f64 truth, per-object floating origin,
  unit conversions) the rest of the cosmic-zoom work can build on.

### Non-goals (explicitly deferred)

- The scripted "Powers of Ten" cinematic tour, narrative overlays, atmosphere
  shader, the full nine-shell content set.
- Click-to-pick, per-type visibility toggles, and InfoCards for the new body
  types.
- A real star catalog `.bin`. Stars are seeded now (Sun + Proxima); the bulk
  catalog slots into the same loader path later.
- Live ephemeris. Anchor positions are fixed plausible constants.
- A polished "fly to Earth" UI control. A debug key is enough for now.

## 2. The hard constraint

Skymap represents every world position as **`f32` Megaparsecs** (1 world unit
= 1 Mpc; `galaxyCatalogFormat.ts`). WebGPU/WGSL is **`f32`-only** — no `f64`
storage or arithmetic on the GPUs we ship to.

`f32` carries ~7.2 decimal digits. Earth's radius is ~2×10⁻¹⁶ Mpc; the cosmic
horizon is ~1.4×10⁴ Mpc. That is **~17 orders of magnitude in one coordinate
space**, far beyond `f32`. Near the horizon, `f32` Mpc positions already snap
to a ~30 kpc grid — larger than the entire Solar System. A single global `f32`
Mpc space physically cannot hold Earth at true scale.

The audits confirmed the `f32` assumption is baked in end-to-end:

- Catalog positions decode to `Float32Array` with no `f64` intermediate
  (`galaxyCatalogFormat.ts:161`).
- **The default matrix math is `f32`.** `computeViewProj` composes the
  view/projection with wgpu-matrix's default `mat4`/`vec3` namespaces, which
  return `Float32Array` (`computeViewProj.ts`). wgpu-matrix also ships
  parallel `mat4d`/`vec3d` namespaces that return `Float64Array` — that is the
  `f64` path this feature uses (see §3 and §8).
- Camera _intent_ (yaw/pitch/distance/target) is, however, already stored as
  `f64` JS numbers in the `camera` slice and only narrowed at pose assembly —
  so the upstream truth survives; the loss happens at matrix compose + upload.

## 3. Precision model — continuous per-object floating origin (Approach B)

**Decision: f64 truth on the CPU; a per-object floating origin; narrow to
`f32` only at the GPU boundary.**

- **CPU truth is `f64`.** Every absolute position (body, camera pose) is a JS
  `Number` / `Float64Array` in heliocentric Mpc — the existing catalog
  convention (Sun at origin), just not prematurely narrowed.
- **`renderOrigin` (`f64`)** is a single Mpc point the per-object matrix math
  is expressed relative to. **For this feature it is fixed at the Sun
  `(0,0,0)`** — every body we render (Sun, Earth, Moon, Jupiter, Proxima) sits
  within ~1.3 pc of it, so a moving origin buys nothing here. `renderOrigin`
  landed as `src/data/renderOrigin.ts` (`RENDER_ORIGIN_MPC = [0,0,0]`),
  consumed directly (as a constant, not per-frame state) by `slabs.ts`'s
  near-field slab derivation and by `debugSpheresLayer`; it is the _named
  extension point_ where a future shell (zooming into M31, etc.) plugs a moving
  origin in. We do **not** build threshold-rebasing or per-instance buffer
  re-upload we won't exercise (YAGNI).
- **Per-object MVP composed in `f64`, narrowed to `f32`.** Each foreground body
  composes `MVP = proj · view · model` in `f64` using wgpu-matrix's `mat4d`
  (camera relative to `renderOrigin`, geometry in the body's **native unit**),
  then narrows the resulting `Float64Array` to `f32` for upload. Composing
  _before_ narrowing is what dodges catastrophic cancellation.
- **Where the `f64` compose is actually load-bearing (measured in the shipped
  Phase-1 work).** With `renderOrigin` at the Sun, `f32` is adequate all the way
  down to AU scale — a body at 1 AU keeps a ~700× precision margin, so Earth
  itself does not _need_ the double-precision compose to sit stably. Catastrophic
  cancellation only bites at **parsec** scale: Proxima at ~1.3 pc is where the
  large VP translation swamps the small delta, and separate-narrow loses ~376
  Earth radii while compose-in-f64-then-narrow holds to ~7×10⁻⁷. The Phase-1
  cancellation-guard test therefore uses **parsec geometry**, not 1 AU. In short,
  `f64` necessity shows up visually at the _star anchors_, not at Earth — which is
  also why the parsec regime is the concrete motivator for a future third slab.
- **Native units per body** keep model-scale factors sane: Earth/planets in
  **km**, stars in **pc**. Conversions live in one file (`scaleUnits.ts`).
- **The galaxy backdrop is unchanged.** Its `Float32Array` buffer renders with
  the existing `f32` `computeViewProj`. At galaxy scale that is identical to
  today; when zoomed to Earth the cloud is a sub-pixel backdrop where the
  ~5×10⁻¹² Mpc origin offset is invisible. It is **never re-uploaded**.

### Relationship to ADR 0001

ADR 0001 chose **discrete per-shell** floating origins with snap-once anchors,
designed for a _scripted tour_ with nine curated shells. This feature is
_interactive free zoom_: there is no "current shell" because the user parks
anywhere on the continuum, and discrete snap-once anchors would produce
re-anchor pops at boundaries. The **continuous per-object** scheme keeps ADR
0001's core (`f64` truth, `f32` on GPU, per-object/native units) while dropping
the global-shell-unit register and shell registry that the free-zoom case does
not want. ADR 0001 was "proposed, awaiting review," so this is a legitimate
refinement, not a reversal. A short ADR will record the refinement.

### Rejected alternatives

- **Single global `f32` Mpc (status quo).** No knob makes 17 OOM fit `f32`.
- **Emulated `f64` on the GPU (double-single).** ≈2× bandwidth, ≈3× ALU,
  shader complexity; ADR 0001 already rejected it. The per-object snap-and-
  narrow gives the precision we need without GPU-side `f64`.

## 4. Render pipeline — foreground bodies as content-layer rows (landed)

_(Rewritten 2026-07-10: the original section prescribed a bespoke opaque
foreground pass modelled on the `volumeOffscreen`/`volumeUpsamplePass` pattern,
slotted by hand into `renderFrame`'s single encoder. That shape shipped in the
first draft of PR #386 and was then dissolved onto the unified renderer before
merge — see the renderer-unification design and its fold plan in the References.)_

The load-bearing constraint stands: **the cosmological scene has no depth
buffer.** Every HDR layer uses pure additive blending (A+B = B+A,
order-independent, no occlusion). Opaque solids that occlude and self-occlude
(Earth, planets, the Sun's disc) cannot live in the additive HDR group.

The answer is no longer a bespoke pass but the unified renderer's **three
independent axes** — slab (which view-projection + depth range), target (which
texture), blend (how fragments combine). A visual element is a `ContentLayer`
row at one point in that space (`src/@types/engine/frame/ContentLayer.d.ts`),
registered in the flat `CONTENT_LAYERS` registry
(`src/services/engine/frame/passes/index.ts`, one file per layer under
`passes/<name>Layer.ts`), and drawn by the `FrameStep` program that
`frameProgram(tone)` returns (`src/services/engine/frame/frameProgram.ts`),
executed by `executeFrame.ts`.

How the foreground maps onto those axes (all shipped):

- **Foreground bodies are rows at `(NEAR0, foreground:0, opaque)`.** The
  Phase-1 slice ships `debugSpheresLayer`
  (`src/services/engine/frame/passes/debugSpheresLayer.ts`); Earth, planets,
  and resolved stars become sibling rows drawing their own renderers.
- **The `foreground:0` target row carries its own depth.** The target table in
  `src/services/gpu/renderTargets.ts` owns every offscreen's lifecycle; the
  `foreground:0` row is `{format: 'rgba16float', depth: 'depth32float',
scale: 1}`, clears colour to `a=0` (so an empty foreground composites to a
  no-op) and depth to `1.0`. The executor attaches the depth view
  (`depthViewOf`) automatically whenever a render step's target row declares
  depth — no per-feature pass code.
- **The frustum is the NEAR0 slab's.** `deriveSlabs`
  (`src/services/engine/frame/slabs.ts`) sizes the near-field near/far to the
  camera's orbit distance (see §7), so foreground depth precision is good
  regardless of the cosmic far plane.
- **The composite is a program step, not a second tonemap.** The
  `foreground:0 → swap` step uses the shared compositor's straight-alpha
  Porter-Duff `over` (`src/services/gpu/passes/compositor.ts`) and runs
  **after** the `hdr → swap` tonemap, carrying **the same `tone` object** — so
  tone parity across the Sun's limb is enforced by identity (see §12).
- **Captions are a `(NEAR0, swap, over)` row** — `foregroundLabelsLayer`, a
  second MSDF label renderer projected through the NEAR0 slab (the COSMO near
  plane would clip the solar system away).
- **Occlusion ordering is a visible program decision.** In `frameProgram` the
  foreground render + composite follow the cosmological swap render (so opaque
  bodies occlude cosmological labels), and the NEAR0 swap render (captions)
  follows the composite (so captions land on top of the bodies).

The foreground still renders only **currently-resolved near bodies**. Distant
bodies — Proxima when you're at Earth, and all galaxies always — stay **points
in the additive backdrop**, sidestepping an Earth-surface → Proxima depth range
in one buffer and unifying cleanly with LOD (below).

**Adding a new body type (Earth, planets, star spheres) is a data edit**: one
layer file + one registry row + a renderer — no new frame hooks. A new
`(target, slab)` pair needs one new program step in `frameProgram`; the
existing `(foreground:0, NEAR0)` and `(swap, NEAR0)` steps already cover
resolved spheres and captions.

### LOD — presentation chosen by apparent size

A body's _presentation_ is chosen by `apparentSizePx()` (the existing util that
drives the famous-galaxy point→thumbnail promotion at ≥200 px):

- A **star** is a **point** when far, and **promotes to a resolved emissive
  sphere** in the foreground group when near. The Sun is just an
  always-resolved star.
- **Planets / Earth** are only ever seen up close, so they are always rendered
  as foreground spheres when present.

In layer terms: resolved spheres join the `foreground:0` rows, while the
distant-star **points** become an **additive layer into the `hdr` target
through the NEAR0 slab** — they cannot ride the COSMO slab because its near
plane (0.01 Mpc) would clip parsec-scale anchors away. `(hdr, NEAR0)` is a new
`(target, slab)` pair, so it needs **one new render step** in `frameProgram`;
everything else is registry data.

This is the same "point when far, resolved when near" mechanism galaxies
already use — not a new concept.

## 5. Data model — three new data types

Following the existing `SOURCE_REGISTRY` + per-type-store + seed/catalog
architecture (ADR 0005), add **three new data types**, each a tagged
`SOURCE_REGISTRY` entry dispatched by its `type` discriminant:

| Data type | `type`     | Source (now)        | Source (later)                              | Presentation                         |
| --------- | ---------- | ------------------- | ------------------------------------------- | ------------------------------------ |
| Star      | `'star'`   | seed: Sun, Proxima  | star `.bin` + meta sidecar (famous pattern) | point (far) ↔ emissive sphere (near) |
| Planet    | `'planet'` | seed: Moon, Jupiter | ephemeris                                   | lit sphere                           |
| Earth     | `'earth'`  | seed: Earth         | —                                           | textured sphere (atmosphere later)   |

- **Source codes are appended, never renumbered** (the append-only rule in
  `source.ts`'s docstring). Three new codes for `star`/`planet`/`earth` —
  the next free codes are **21/22/23** (Flow took 17; the DESI patches took
  18–20: DesiDeep 18, DesiWedge 19, DesiSgw 20).
- **Seeded now** via the structures "featured anchors" pattern: a small static
  data file loaded into a bodies store. The real star `.bin` slots into the
  same fetcher/slot path later (the famous `.bin` + index-aligned
  `*_meta.json` sidecar is the reference shape).
- **Deferred:** pick-texture codes, per-type visibility toggles, InfoCards.
  The bodies render; they are not yet selectable.

Three flat types (rather than one `solarSystemBody` with a category union, the
structures shape) is a deliberate granularity choice: Earth's presentation will
diverge substantially (atmosphere, clouds), so it earns its own type and
renderer. This is still a tagged union dispatched by `type` (§simplicity #7) —
each type maps 1:1 to a renderer via table dispatch, never an `if (type === …)`
chain.

### Contract sketch (`@types`, one type per file)

```ts
// src/@types/data/StarSourceEntry.d.ts  (+ PlanetSourceEntry, EarthSourceEntry)
export type StarSourceEntry = SourceEntryBase & { readonly type: 'star' };

// src/@types/scene/StarBody.d.ts  — a seeded/catalog star record
export type StarBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
  readonly absMag: number; // drives point brightness/size + LOD
  readonly color: Vec3; // B–V → rgb
  readonly radiusKm: number; // used once resolved to a sphere (the Sun)
};

// src/@types/scene/PlanetBody.d.ts
export type PlanetBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;
  readonly albedo: Vec3; // flat lit colour (no texture yet)
};

// src/@types/scene/EarthBody.d.ts
export type EarthBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number; // 6371
  readonly textureUrl: string; // Blue Marble equirectangular
};
```

Positions are authored in human units via `SCALE_UNITS` (e.g.
`[1 * SCALE_UNITS.AU_TO_MPC, 0, 0]`) and stored canonically in Mpc — one
position unit across all bodies, no per-kind unit braid.

## 6. Renderers — shared sphere infrastructure, thin specializations

Per `renderers.md` and the `instancedQuadRenderer`-shared-by-three precedent:
share a **sphere infrastructure**, wrapped by thin per-type renderers that
differ only in fragment shading. That infrastructure **shipped with Phase 1**:
`src/utils/math/uvSphereMesh.ts` (generated UV-sphere mesh),
`src/services/gpu/shaders/lib/sphere.wesl` (`SphereUniforms` + the per-object
transform), and `src/services/gpu/renderers/debugSphereRenderer.ts` as the
first consumer / reference implementation.

- `earthRenderer` — equirectangular texture sample (Blue Marble); atmosphere
  later.
- `planetRenderer` — flat lit albedo.
- `starRenderer` — emissive sphere (resolved stars: the Sun, or any star you
  fly up to).
- `starPointRenderer` — distant stars as points; reuses the point pipeline.

All follow the convention: `satisfies Renderer`, GPU resources in the closure,
a nullable slot on `EngineGpuHandles`
(`src/@types/engine/handles/EngineGpuHandles.d.ts`), constructed in
`initGpu.ts`. The factory-signature idiom for foreground renderers is
**positional `(device, targetFormat, depthFormat)`**, matching
`createDebugSphereRenderer` — and the two formats must match the
`foreground:0` target row's `format`/`depth` (`rgba16float`/`depth32float`),
the target↔renderer-profile invariant the unified registry rests on.
Renderers stay slab-ignorant GPU-resource owners; they are **drawn by content
layers**, which thread the slab's view-projection into `draw` (the layer is
where a `(target, slab, blend)` row meets its renderer). Shader code shares
`lib/` aggressively (the `package::lib::camera`/`package::lib::sphere`
imports); follow `wesl-shaders` conventions (no backticks in comments, literal
`package::` prefix, `?static` on the TS side).

Earth texture upload uses the existing `copyExternalImageToTexture` pattern
(`textureAtlas.ts`).

## 7. Camera

- **`MIN_DISTANCE_MPC` is a `?deepZoom`-gated pair (shipped).** In
  `clampDistance.ts`, `MIN_DISTANCE_MPC = hasUrlGate('deepZoom') ? 1e-17 :
0.05` — the releasable floor (0.05 Mpc) stops the descent while the deep
  range shows only debug placeholder bodies; `?deepZoom` opens the full
  descent to Earth-surface scale. The existing exponential wheel/pinch zoom
  spans it.
- **The NEAR0 slab row IS the foreground projection home.** `deriveSlabs` in
  `src/services/engine/frame/slabs.ts` builds the near-field row's
  origin-relative `f64` view-projection via `computeForegroundViewProj`, with
  near/far tracking the orbit distance (`NEAR0_NEAR_RATIO = 1e-4`,
  `NEAR0_FAR_RATIO = 100` — one home, in `slabs.ts`). Those fixed ratios are
  the current heuristic; the LOD plan (plan 03) replaces them with an adaptive
  `foregroundFrustum(cam.distance)`. The galaxy backdrop keeps its fixed wide
  COSMO frustum (0.01 → 50 000 Mpc).
- **Fly-to-Earth** is a **debug key** for now (real UI control deferred —
  still deferred to plan 03).

## 8. Shared pieces (shipped with Phase 1)

All of these exist on `main`:

- **`src/data/scaleUnits.ts`** — `SCALE_UNITS` with `KM_TO_MPC`, `AU_TO_MPC`,
  `PC_TO_MPC`, `KPC_TO_MPC`, `MPC_TO_MPC`, `GPC_TO_MPC` (+ `LY_TO_MPC` for
  copy only). Single source of truth (the path ADR 0005 reserved).
- **`src/data/renderOrigin.ts`** — `RENDER_ORIGIN_MPC` (§3), the named
  floating-origin extension point.
- **f64 matrix composition via wgpu-matrix `mat4d`/`vec3d`** (no hand-written
  helpers needed — the gl-matrix → wgpu-matrix migration in PR #382 provides the
  `Float64Array` namespaces directly: `mat4d.lookAt`, `mat4d.perspective` (ZO by
  default), `mat4d.multiply`, `mat4d.translate`, `mat4d.scale`). The bespoke
  pieces are **`src/utils/camera/composeBodyMvp.ts`** (per-body
  compose-in-f64-then-narrow), **`src/utils/camera/computeForegroundViewProj.ts`**
  (the NEAR0 slab's origin-relative f64 view-projection), and
  **`src/utils/math/narrowMat4.ts`** — a one-line `f64 → f32` narrow
  (`new Float32Array(m)`) for the GPU upload boundary.
- **`src/utils/math/uvSphereMesh.ts` + `src/services/gpu/shaders/lib/sphere.wesl`**
  — the shared sphere infrastructure (§6).

## 9. Testing

- **Unit:** `mat4d` compose-then-`narrowMat4` round-trip + a
  **catastrophic-cancellation guard** (shipped with Plan 01; it uses **parsec
  geometry** — Proxima-scale, where separate-narrow visibly fails — because at
  1 AU `f32` still has a ~700× margin and the guard would pass either way, see
  §3); `SCALE_UNITS` constants snapshot; UV-sphere mesh vertex/winding;
  foreground composite math.
- **Visual** (user-verified on the dev server): zoom galaxies → Earth; Earth
  resolves as a stable, round, textured sphere with no jitter / clipping /
  swim; anchors at believable relative sizes; backdrop intact.

## 10. Phasing

1. **Precision slice — SHIPPED** (kept, green, merged to `main` via PR #386,
   `504b15dc`, 2026-07-10). `scaleUnits` + `narrowMat4` + f64 compose via
   `mat4d`/`composeBodyMvp` + the `foreground:0` depth-bearing target + the
   `?deepZoom`-gated min-distance clamp + `renderOrigin` + **plain debug
   spheres** (Sun, Earth) at true size/position, folded onto the layer/slab/
   program renderer before merge. Acceptance held: stable, jitter-free zoom
   from the galaxy view down to the sphere, galaxy backdrop intact
   (user-verified visual gate, 2026-07-09).
2. **Earth.** `earth` type + `earthRenderer` + Blue Marble texture + Earth
   seed, on the shared sphere infrastructure. _(Plan 02 — Earth + anchors.)_
3. **Anchors.** `star`/`planet` types + seed (Sun, Moon, Jupiter, Proxima) +
   `starRenderer` / `starPointRenderer` / `planetRenderer` on the shared lib.
   _(Plan 02.)_
4. **LOD + depth.** Adaptive foreground near/far (`foregroundFrustum` replacing
   the fixed slab ratios); apparent-size point↔sphere promotion for stars;
   foreground/backdrop partition by apparent size. _(Plan 03 — LOD + polish.)_
5. **Polish.** Fly-to-Earth affordance, tests, docs, `entanglement-radar`
   pass, short ADR recording the ADR-0001 refinement. _(Plan 03.)_

Phases 2–5 remain. Their plans
(`docs/superpowers/plans/2026-06-29-zoom-to-earth-02-earth-and-anchors.md`,
`...-03-lod-and-polish.md`) were re-grounded onto the layer/slab model on
2026-07-10, alongside this spec (a foreground body renderer becomes a
`foreground:0` layer's renderer; the adaptive frustum lands in `slabs.ts`).

## 11. File inventory

Shipped with Phase 1 (on `main`):

```
src/data/scaleUnits.ts
src/data/renderOrigin.ts
src/data/bodies/debugSphereBody.ts             seed: debug Sun + Earth stand-ins
src/utils/math/narrowMat4.ts                   (f64 → f32 for GPU upload; f64
                                                compose itself uses wgpu-matrix mat4d)
src/utils/camera/composeBodyMvp.ts
src/utils/camera/computeForegroundViewProj.ts
src/utils/math/uvSphereMesh.ts
src/services/gpu/renderers/debugSphereRenderer.ts
src/services/gpu/shaders/lib/sphere.wesl
src/services/gpu/shaders/debugSphere/*.wesl
src/services/engine/frame/passes/debugSpheresLayer.ts
src/services/engine/frame/passes/foregroundLabelsLayer.ts
src/utils/camera/clampDistance.ts              (?deepZoom-gated MIN_DISTANCE_MPC)
tests/** mirroring the above
```

_(The originally-anticipated `encodeForegroundPass.ts` and
`foregroundOffscreen.ts` were built on the branch and then deleted by the
unification fold — superseded by the layer files above plus the `foreground:0`
row in `src/services/gpu/renderTargets.ts`.)_

New (phases 2–5):

```
docs/adrs/0009-continuous-floating-origin-for-free-zoom.md   (refines ADR 0001;
                                                              next free ADR number)
src/data/bodies/sceneBodies.ts                seed: Sun, Earth, Moon, Jupiter, Proxima
src/@types/data/StarSourceEntry.d.ts          (+ Planet, Earth source entries)
src/@types/scene/StarBody.d.ts                (+ PlanetBody, EarthBody)
src/@types/rendering/EarthRenderer.d.ts        (+ Planet, Star, StarPoint renderer types)
src/services/gpu/renderers/earthRenderer.ts    (+ planet/star/starPoint renderers)
src/services/gpu/shaders/earth/*.wesl          (+ planet/star shader dirs)
src/services/engine/frame/passes/earthLayer.ts (+ planetsLayer, starSpheresLayer,
                                                starPointsLayer — one ContentLayer
                                                row per body type)
src/services/engine/data/createBodyStore.ts    (EngineData grows a bodies store)
public/images/earth/blue-marble-4k.jpg
tests/** mirroring the above
```

Modified (phases 2–5):

```
src/data/source.ts + src/data/sources/{star,planet,earth}.ts   (append codes 21/22/23 + entries)
src/@types/.../SourceEntry union
src/services/engine/frame/passes/index.ts       (register the new layer rows)
src/services/engine/frame/frameProgram.ts       (ONE new render step: (hdr, NEAR0)
                                                 for distant-star points)
src/services/engine/frame/slabs.ts              (adaptive foregroundFrustum — plan 03)
src/services/engine/phases/initGpu.ts           (construct the new renderers)
src/@types/engine/handles/EngineGpuHandles.d.ts (new nullable renderer slots)
```

## 12. Open questions — all resolved

- **Foreground depth format — resolved: `depth32float`.** Shipped as the
  `foreground:0` row in `src/services/gpu/renderTargets.ts`
  (`{format: 'rgba16float', depth: 'depth32float', scale: 1}`), matching this
  section's original lean (precision across the adaptive near/far spread).
- **Composite path — resolved: over the tone-mapped swap chain, with the SAME
  `tone` object as the `hdr → swap` composite.** This differs from the
  section's original lean (compositing into the HDR offscreen before the
  single tonemap), but it is equivalent for the requirement that lean was
  protecting — one shared tone curve across the Sun's limb: `frameProgram`
  threads one `tone` object by reference into **both** composites, so the
  curve is identical by identity rather than by passing through one pass. The
  landed shape is also what lets the opaque bodies occlude the cosmological
  swap-chain labels (the composite runs after the cosmological swap render —
  a program-ordering decision the HDR-offscreen path could not express).
- **Camera-intent-slice state — resolved: landed on `main`.**
  `cameraSlice`/`startCameraTween` exist; the NEAR0 slab derivation reads the
  live camera pose the same way the COSMO one does.

## References

- [Renderer-unification design](completed/2026-06-29-renderer-unification-design.md) — the layer/slab/program model §4 now rests on
- [Renderer-unification plan 04 — fold zoom-to-earth](../plans/completed/2026-07-06-renderer-unification-04-fold-zoom-to-earth.md) — how PR #386's bespoke wiring dissolved into layer rows + program steps
- [ADR 0001 — per-shell floating origin](../plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md) (refined here)
- [ADR 0005 — units and scale](../plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0005-units-and-scale.md)
- [ADR 0005 — engine data layer + asset loading](../../adrs/0005-engine-data-layer-and-asset-loading.md) (data-type vs presentation axis)
- [`renderers.md`](../conventions/renderers.md), [`simplicity.md`](../conventions/simplicity.md), [`intent.md`](../conventions/intent.md)
- Audit findings (2026-06-29 design session — pre-unification file names):
  main scene is depthless/additive; the default matrix path is `f32`, with
  `f64` available via wgpu-matrix `mat4d`/`vec3d` (`computeViewProj.ts`,
  PR #382); `apparentSizePx` LOD precedent; the volume-offscreen composite
  template (since absorbed into `renderTargets.ts` + the `volume-upsample`
  layer by the unification).
