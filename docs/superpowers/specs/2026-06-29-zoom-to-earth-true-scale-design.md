# Zoom to Earth at true relative scale — design

> **Status.** Approved design (brainstorm output). Awaiting a TDD plan.
> **Date.** 2026-06-29.
> **Relationship to prior work.** Refines the precision stance of the
> 2026-05-08 "Cosmic Zoom — Powers of Ten" plan's
> [ADR 0001 (per-shell floating origin)](../plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md)
> for the *interactive free-zoom* case (see §3). This is the first kept
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
- **gl-matrix uses `Float32Array` by default**, so `computeViewProj` already
  composes the view/projection in `f32` (`computeViewProj.ts:118/131/136`).
- Camera *intent* (yaw/pitch/distance/target) is, however, already stored as
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
  exists as the *named extension point* where a future shell (zooming into M31,
  etc.) plugs a moving origin in. We do **not** build threshold-rebasing or
  per-instance buffer re-upload we won't exercise (YAGNI).
- **Per-object MVP composed in `f64`, narrowed to `f32`.** Each foreground body
  composes `MVP = proj · view · model` in `f64` (camera relative to
  `renderOrigin`, geometry in the body's **native unit**), then narrows the
  resulting `mat4` to `f32` for upload. Composing *before* narrowing is what
  dodges catastrophic cancellation.
- **Native units per body** keep model-scale factors sane: Earth/planets in
  **km**, stars in **pc**. Conversions live in one file (`scaleUnits.ts`).
- **The galaxy backdrop is unchanged.** Its `Float32Array` buffer renders with
  the existing `f32` `computeViewProj`. At galaxy scale that is identical to
  today; when zoomed to Earth the cloud is a sub-pixel backdrop where the
  ~5×10⁻¹² Mpc origin offset is invisible. It is **never re-uploaded**.

### Relationship to ADR 0001

ADR 0001 chose **discrete per-shell** floating origins with snap-once anchors,
designed for a *scripted tour* with nine curated shells. This feature is
*interactive free zoom*: there is no "current shell" because the user parks
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

## 4. Render pipeline — an opaque foreground pass

The audit surfaced the load-bearing constraint: **the main scene has no depth
buffer.** Every HDR pass uses pure additive blending (A+B = B+A,
order-independent, no occlusion); depth was deliberately removed
(`postProcess.ts:48–62`). Opaque solids that occlude and self-occlude (Earth,
planets, the Sun's disc) therefore cannot live in the existing HDR mega-pass.

**Decision: add a new opaque, depth-tested foreground pass, composited over the
additive backdrop using the existing half-res-volume offscreen pattern.**

- The foreground pass owns **its own depth texture** and **its own adaptive
  frustum** (near/far sized to the local scene), so its depth precision is
  good regardless of the cosmic far plane.
- It renders only **currently-resolved near bodies**. Distant bodies — Proxima
  when you're at Earth, and all galaxies always — stay **points in the additive
  backdrop**. This sidesteps trying to fit Earth-surface → Proxima into one
  depth buffer, and it unifies cleanly with LOD (below).
- Composite follows `volumeOffscreen` → `volumeUpsamplePass` (allocate target
  in `initGpu`, render pre-composite, blend into HDR). Unlike the volume
  (additive), the foreground composites **over** (opaque geometry).
- The single-encoder frame loop (`renderFrame.ts:150–178`) slots the new pass
  in without restructuring.

### LOD — presentation chosen by apparent size

A body's *presentation* is chosen by `apparentSizePx()` (the existing util that
drives the famous-galaxy point→thumbnail promotion at ≥200 px):

- A **star** is a **point** in the additive backdrop when far, and **promotes
  to a resolved emissive sphere** in the foreground pass when near. The Sun is
  just an always-resolved star.
- **Planets / Earth** are only ever seen up close, so they are always rendered
  as foreground spheres when present.

This is the same "point when far, resolved when near" mechanism galaxies
already use — not a new concept.

## 5. Data model — three new data types

Following the existing `SOURCE_REGISTRY` + per-type-store + seed/catalog
architecture (ADR 0005), add **three new data types**, each a tagged
`SOURCE_REGISTRY` entry dispatched by its `type` discriminant:

| Data type | `type` | Source (now) | Source (later) | Presentation |
|---|---|---|---|---|
| Star | `'star'` | seed: Sun, Proxima | star `.bin` + meta sidecar (famous pattern) | point (far) ↔ emissive sphere (near) |
| Planet | `'planet'` | seed: Moon, Jupiter | ephemeris | lit sphere |
| Earth | `'earth'` | seed: Earth | — | textured sphere (atmosphere later) |

- **Source codes are appended, never renumbered** (the append-only rule in
  `sources.ts`). Three new codes for `star`/`planet`/`earth`.
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
  readonly positionMpc: Vec3;   // absolute heliocentric, f64-valued
  readonly absMag: number;      // drives point brightness/size + LOD
  readonly color: Vec3;         // B–V → rgb
  readonly radiusKm: number;    // used once resolved to a sphere (the Sun)
};

// src/@types/scene/PlanetBody.d.ts
export type PlanetBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;
  readonly albedo: Vec3;        // flat lit colour (no texture yet)
};

// src/@types/scene/EarthBody.d.ts
export type EarthBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;    // 6371
  readonly textureUrl: string;  // Blue Marble equirectangular
};
```

Positions are authored in human units via `SCALE_UNITS` (e.g.
`[1 * SCALE_UNITS.AU_TO_MPC, 0, 0]`) and stored canonically in Mpc — one
position unit across all bodies, no per-kind unit braid.

## 6. Renderers — shared sphere infrastructure, thin specializations

Per `renderers.md` and the `instancedQuadRenderer`-shared-by-three precedent:
share a **sphere infrastructure** (a generated UV-sphere mesh util + a
`sphere`/`camera` WESL lib that does the per-object transform), wrapped by thin
per-type renderers that differ only in fragment shading.

- `earthRenderer` — equirectangular texture sample (Blue Marble); atmosphere
  later.
- `planetRenderer` — flat lit albedo.
- `starRenderer` — emissive sphere (resolved stars: the Sun, or any star you
  fly up to).
- `starPointRenderer` — distant stars as points; reuses the point pipeline.

All follow the convention: factory taking a named bag, `satisfies Renderer`,
GPU resources in the closure, `draw(pass, viewProj, viewportPx, …)`, a nullable
slot on `EngineGpuHandles`, constructed in `initGpu.ts`. Shader code shares
`lib/` aggressively (the `package::lib::camera`/`package::lib::sphere` imports);
follow `wesl-shaders` conventions (no backticks in comments, literal
`package::` prefix, `?static` on the TS side).

Earth texture upload uses the existing `copyExternalImageToTexture` pattern
(`textureAtlas.ts`).

## 7. Camera

- **Lower `MIN_DISTANCE_MPC`** (currently `0.05`, `clampDistance.ts`) toward
  Earth-surface scale (~`1e-17` Mpc ≈ a few hundred km). Existing exponential
  wheel/pinch zoom already spans this.
- **Adaptive foreground near/far** computed from camera-distance-to-focus, so
  the foreground frustum stays precise at any scale. The galaxy backdrop keeps
  its existing wide frustum.
- **Extend the single viewProj chokepoint** (`frameContext.ts:142`); build on
  the existing camera driver/intent architecture rather than around it. The
  precision work only adds an `f64`-composed foreground viewProj alongside the
  existing backdrop one.
- **Fly-to-Earth** is a **debug key** for now (real UI control deferred).

## 8. New shared pieces

- **`src/data/scaleUnits.ts`** — `SCALE_UNITS` with `KM_TO_MPC`, `AU_TO_MPC`,
  `PC_TO_MPC`, `KPC_TO_MPC`, `MPC_TO_MPC`, `GPC_TO_MPC` (+ `LY_TO_MPC` for
  copy only). Single source of truth (ADR 0005 reserved this path; it does not
  exist yet — today only Hubble/`PC_TO_LY` constants live in
  `utils/math/constants.ts`).
- **`src/utils/math/*` f64 matrix helpers** (one function per file):
  `lookAt64`, `perspectiveZO64`, `multiply64`, `translate64`, `scale64`,
  `narrowMat4` (f64 → f32). Needed because gl-matrix is `f32`-only.

## 9. Testing

- **Unit:** f64 matrix round-trip + a **catastrophic-cancellation guard** (a
  point at Earth's radius placed at 1 AU survives compose-then-narrow with
  sub-metre error); `SCALE_UNITS` constants snapshot; UV-sphere mesh
  vertex/winding; foreground composite math.
- **Visual** (user-verified on the dev server): zoom galaxies → Earth; Earth
  resolves as a stable, round, textured sphere with no jitter / clipping /
  swim; anchors at believable relative sizes; backdrop intact.

## 10. Phasing

1. **Precision slice (kept if green).** `scaleUnits` + f64 matrix helpers +
   the opaque foreground depth pass + lowered min-distance clamp +
   `renderOrigin` + a **plain debug sphere** at Earth's true size/position.
   Acceptance: stable, jitter-free zoom from the galaxy view down to the
   sphere, galaxy backdrop intact. This is the de-risk; it stays.
2. **Earth.** `earth` type + `earthRenderer` + Blue Marble texture + Earth
   seed, on the shared sphere infrastructure.
3. **Anchors.** `star`/`planet` types + seed (Sun, Moon, Jupiter, Proxima) +
   `starRenderer` / `starPointRenderer` / `planetRenderer` on the shared lib.
4. **LOD + depth.** Adaptive foreground near/far; apparent-size point↔sphere
   promotion for stars; foreground/backdrop partition by apparent size.
5. **Polish.** Fly-to-Earth affordance, tests, docs, `entanglement-radar`
   pass, short ADR recording the ADR-0001 refinement.

## 11. File inventory (anticipated)

New:

```
docs/adrs/00NN-continuous-floating-origin-for-free-zoom.md   (refines ADR 0001)
src/data/scaleUnits.ts
src/data/bodies/sceneBodies.ts                seed: Sun, Earth, Moon, Jupiter, Proxima
src/@types/data/StarSourceEntry.d.ts          (+ Planet, Earth source entries)
src/@types/scene/StarBody.d.ts                (+ PlanetBody, EarthBody)
src/@types/rendering/EarthRenderer.d.ts        (+ Planet, Star, StarPoint renderer types)
src/utils/math/lookAt64.ts                     (+ perspectiveZO64, multiply64,
                                                translate64, scale64, narrowMat4)
src/utils/math/uvSphereMesh.ts
src/services/gpu/renderers/earthRenderer.ts    (+ planet/star/starPoint renderers)
src/services/gpu/shaders/lib/sphere.wesl
src/services/gpu/shaders/earth/*.wesl          (+ planet/star shader dirs)
src/services/engine/frame/encodeForegroundPass.ts
src/services/gpu/passes/foregroundOffscreen.ts (depth + colour target, initGpu)
src/services/engine/data/createBodyStore.ts
public/images/earth/blue-marble-4k.jpg
tests/** mirroring the above
```

Modified:

```
src/data/sources.ts + src/data/sources/{star,planet,earth}.ts   (append codes + entries)
src/@types/.../SourceEntry union
src/utils/camera/clampDistance.ts              (lower MIN_DISTANCE_MPC)
src/services/engine/frame/renderFrame.ts        (insert foreground pass)
src/services/engine/phases/initGpu.ts           (construct renderers + targets)
src/services/engine/frame/frameContext.ts       (foreground viewProj alongside backdrop)
src/@types/engine/EngineGpuHandles.d.ts         (new nullable renderer slots)
```

## 12. Open questions

- **Foreground depth format** — `depth24plus` (space) vs `depth32float`
  (precision across the adaptive near/far spread). Decide in the plan; lean
  `depth32float` for the wide range.
- **Composite path** — foreground into the HDR offscreen (then one tonemap) vs
  directly over the tone-mapped swap chain. The former keeps Earth inside the
  HDR/tonemap pipeline (preferable); confirm against the additive backdrop's
  blend.
- **Camera-intent-slice state** — the audit reports it largely landed on
  `main`; BACKLOG still lists it as a pickup-able plan. Verify before the plan
  leans on specifics. Our design depends only on the viewProj chokepoint, which
  exists either way.

## References

- [ADR 0001 — per-shell floating origin](../plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md) (refined here)
- [ADR 0005 — units and scale](../plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0005-units-and-scale.md)
- [ADR 0005 — engine data layer + asset loading](../../adrs/0005-engine-data-layer-and-asset-loading.md) (data-type vs presentation axis)
- [`renderers.md`](../conventions/renderers.md), [`simplicity.md`](../conventions/simplicity.md), [`intent.md`](../conventions/intent.md)
- Audit findings (this session): main scene is depthless/additive
  (`postProcess.ts:48–62`); gl-matrix is `f32`-only
  (`computeViewProj.ts`); `apparentSizePx` LOD precedent; volume-offscreen
  composite template (`volumeOffscreen.ts` / `volumeUpsamplePass.ts`).
