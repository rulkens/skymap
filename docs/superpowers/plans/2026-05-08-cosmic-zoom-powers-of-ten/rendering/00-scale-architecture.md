# Scale Architecture — multi-shell coordinate systems

**Status:** Foundational design. Most other rendering specs depend on this.
**Required for:** Every shell.

## The problem in one paragraph

Skymap today uses **megaparsecs (Mpc)** as its single world-space unit, with all positions stored as `f32` in Cartesian coordinates. The largest catalog object is at ~5 Gpc; the smallest meaningful spatial feature is a galaxy at ~30 kpc diameter; the smallest currently-rendered structural feature is a galaxy thumbnail of ~10 kpc apparent diameter. That is **~10⁵.5 dynamic range in length**, which `f32` (~7 decimal digits of precision) handles comfortably.

The cosmic zoom asks the renderer to span from **the Sun's photosphere (~700,000 km = 2.3 × 10⁻¹⁴ Mpc)** to the **edge of the observable universe (~4.4 × 10³ Mpc)**. That's **~17 orders of magnitude** in one coordinate space. `f32` falls apart catastrophically at that range; `f64` is unavailable in WGSL; even with `f64`, depth-buffer precision craters at the inner-shell scales because the projection matrix has to handle near-plane = 1 km and far-plane = 14 Gpc simultaneously.

This document is the design for how to span 17 orders of magnitude **without** rewriting the entire renderer.

## Constraints

- **WebGPU only.** No `f64` in shaders. We have `f32` everywhere on the GPU.
- **Existing renderers must keep working.** The point cloud, filament, quad, and label renderers all assume Mpc coordinates throughout. We cannot break them.
- **Render-on-demand must keep working.** Frame scheduling assumes the engine knows when state changes. The shell architecture must integrate with `requestRender()`, not bypass it.
- **The user can pause anywhere.** Free-fly within any shell must work. We can't gate on "shell N is fully loaded" — graceful fallback to the nearest available data is required.
- **No regressions in the existing wide view.** Today's "fly around 2.5M galaxies" experience is excellent. Whatever we do for inner shells must not slow down or visually degrade the wide view.

## The solution: nested camera-relative frames + per-shell render passes

Three pieces:

1. A **scale-aware camera state** that knows what shell it's currently in and what the camera-relative origin is.
2. **Per-shell coordinate systems**, each with their own native unit and origin offset, with deterministic mapping back to a shared "absolute" reference (heliocentric Mpc, for math purposes).
3. **Per-shell render passes** that consume only the shell's own data, in its own coordinates, and composite onto the same backbuffer.

### Piece 1 — Scale-aware camera

The camera has, in addition to its existing position/orientation:

```ts
type CameraScale = {
  shell: ShellId;          // which shell the camera is currently inside
  absolutePos: Float64Array; // [x, y, z] in heliocentric Mpc, f64 — used for math, never sent to GPU
  shellOrigin: Float64Array; // [x, y, z] in heliocentric Mpc, the origin the current shell renders relative to
  shellUnit: number;        // multiplier from shell-units to Mpc (e.g., AU shell: 1 AU = 4.848e-12 Mpc)
};
```

**Invariants:**
- `absolutePos` is always the truth. Every other position derives from it.
- `shellOrigin` changes only at shell transitions, and only by snapping to a known landmark (Sun position for inner shells, Local Group barycenter for shell 4, Virgo cluster center for shell 6, etc.).
- `shellUnit` is constant per shell and chosen so that typical positions in that shell have magnitudes between 0.001 and 1000 in shell-units (keeping `f32` happy on the GPU).

When the engine wants to know the camera-relative position of a world object for a given shell:

```ts
function shellRelative(absolutePos: Vec3F64, cam: CameraScale): Vec3F32 {
  const dx = absolutePos[0] - cam.shellOrigin[0];
  const dy = absolutePos[1] - cam.shellOrigin[1];
  const dz = absolutePos[2] - cam.shellOrigin[2];
  // The subtraction happens in f64 — the f32 narrowing only loses precision
  // for differences > ~10^7 shell-units, which would mean we're rendering
  // something outside the shell's visible volume anyway.
  return [
    Math.fround(dx / cam.shellUnit),
    Math.fround(dy / cam.shellUnit),
    Math.fround(dz / cam.shellUnit),
  ];
}
```

This is the **floating-origin** technique used in space games (Kerbal Space Program, Elite: Dangerous, Star Citizen). The trick is that `f32` is *fine* for nearby objects in any reasonable unit; it only loses precision when the magnitude grows. By keeping the origin near the camera and rescaling per-shell, we always sit in the sweet spot.

### Piece 2 — Per-shell coordinates

We define nine shells. Each has a native unit, a typical origin, and a typical visible volume. (Detailed in `shells/0N-*.md`.)

| # | Shell | Native unit | Origin | Visible volume |
|---|-------|-------------|--------|----------------|
| 1 | Solar System | AU | Sun | 0.01–100 AU |
| 2 | Stellar Neighborhood | parsec (pc) | Sun | 0.1–100 pc |
| 3 | Milky Way | kpc | Galactic center | 0.1–100 kpc |
| 4 | Local Group | Mpc | Local Group barycenter | 0.01–10 Mpc |
| 5 | Local Sheet | Mpc | Local Group barycenter | 1–100 Mpc |
| 6 | Virgo Supercluster | Mpc | M87 (or origin) | 10–500 Mpc |
| 7 | Laniakea | Mpc | Great Attractor direction | 100–1000 Mpc |
| 8 | Cosmic Web | Gpc | origin (heliocentric) | 1–10 Gpc |
| 9 | Observable Universe | Gpc | origin (heliocentric) | 13.8 Gpc shell |

**Why different units?** Pure aesthetics for the GPU. Storing Solar System positions in Mpc means every value is around `10⁻¹³`, which `f32` represents perfectly *but* is awkward for everything that touches it (shader constants like 30 kpc become `9.7e-7`, and you start caring about denormals). Storing in AU means everything is in the [0.01, 100] range — clean.

Conversions between units are constants in `src/data/scaleUnits.ts`:

```ts
export const SCALE_UNITS = {
  AU_TO_MPC: 4.84813681e-12,
  PC_TO_MPC: 3.24077929e-7,
  KPC_TO_MPC: 3.24077929e-4,
  MPC_TO_MPC: 1,
  GPC_TO_MPC: 1000,
  LY_TO_MPC: 9.4607e-12 * 3.24077929e-7,  // for copywriting — not a render unit
} as const;
```

### Piece 3 — Per-shell render passes

Each shell has its own render pass. The pass is **dormant** when the camera is far from its scale, **active** when in-shell, and **fading in/out** during transitions.

```ts
type ShellRenderer = {
  id: ShellId;
  isActiveAt(scale: CameraScale): boolean;  // returns true when camera is in this shell's volume
  fadeAlphaAt(scale: CameraScale): number;  // 0 to 1, smooth crossfade in transitions
  render(pass: GPURenderPassEncoder, ctx: RenderContext): void;
};
```

The orchestrator (in `engine.runFrame.ts`) computes which shells are active or fading at the current camera position, then runs each one's render in order from outermost-first (back) to innermost-last (front). This is a depth-sorted painter's-algorithm composite.

**Crossfades.** When the camera transitions from shell 3 to shell 4, both renderers run for 1-2 seconds with their respective fade alphas summing to 1. This gives the visual continuity Principle 3 requires.

**Lazy activation.** Shell N's render pass only runs if `fadeAlphaAt > 0.001`. When you're in shell 4 looking at the Local Group, shells 7–9 don't render at all; their data may not even be loaded.

## Floating origin in detail

The single biggest precision win comes from **moving the world to the camera, not the camera to the world.** Two consequences:

### Consequence 1 — Camera position is not what you think

The "view matrix" sent to the GPU is built **as if the camera were at the shell origin.** The camera's actual position is encoded in the *world* matrix of every renderable, by subtracting the camera's shell-relative position from the renderable's shell-relative position before upload.

```ts
// Wrong (the naive way):
const view = lookAt(cameraPos, cameraTarget, cameraUp);
const mvp = projection * view * modelMatrix;
// → GPU sees camera at cameraPos (large number), object at modelMatrix (large number),
//   subtracted in the view matrix multiply. f32 loses precision at the subtraction.

// Right (floating-origin):
const renderableLocal = subtractF64(renderable.absolutePos, cam.shellOrigin);
const cameraLocal = subtractF64(cam.absolutePos, cam.shellOrigin);
const view = lookAt(cameraLocal, cameraLocal + cameraForward, cameraUp);
const mvp = projection * view * modelMatrix(renderableLocal);
// → GPU sees camera at small offset from shell origin, object at small offset, both f32-friendly.
```

This is non-negotiable: it's the standard fix for "spaceflight game with planet-scale precision," and we need it.

### Consequence 2 — Per-frame origin shifts during fast camera moves

When the camera is moving fast (e.g., during the cosmic-zoom tour where the camera pulls back at hundreds of Mpc per second), the camera-relative coordinates of everything rebase every frame. This can cause numerical jitter on objects that are moving slowly relative to the absolute frame but fast relative to the (moving) shell origin.

**Fix:** snap the shell origin to a stable anchor (the Sun, or M87, or the Local Group barycenter — depending on the shell). The camera moves relative to the *anchor*, and the world moves relative to the *anchor*; the anchor itself does not move within a shell. The origin only re-anchors at shell transitions.

This means in shell 4 (Local Group), the camera can be 5 Mpc from the LG barycenter; we still subtract LG barycenter to get camera-local coordinates. No jitter.

## Depth precision: per-shell projection matrices

The other half of the problem is the depth buffer. A single perspective matrix with `near = 1km` and `far = 14 Gpc` has a depth-buffer ratio of ~10²², far beyond what 24-bit depth can resolve.

**Solution: per-shell near/far planes.**

Each shell defines its own `near`/`far` for its render pass. The plane values are chosen so:
- `near` is just inside the smallest object the shell is expected to render (e.g., shell 1 has `near = 0.01 AU` so we don't clip the Sun's surface).
- `far` is just outside the shell's largest visible volume (e.g., shell 1 has `far = 200 AU`).
- The ratio `far/near` is at most ~10⁵, which gives reasonable depth precision for that pass.

| # | Shell | Near | Far | far/near |
|---|-------|------|-----|----------|
| 1 | Solar System | 0.01 AU | 200 AU | 2 × 10⁴ |
| 2 | Stellar Neighborhood | 0.001 pc | 200 pc | 2 × 10⁵ |
| 3 | Milky Way | 0.01 kpc | 200 kpc | 2 × 10⁴ |
| 4 | Local Group | 0.001 Mpc | 20 Mpc | 2 × 10⁴ |
| 5 | Local Sheet | 0.1 Mpc | 200 Mpc | 2 × 10³ |
| 6 | Virgo Supercluster | 1 Mpc | 1000 Mpc | 10³ |
| 7 | Laniakea | 10 Mpc | 2000 Mpc | 200 |
| 8 | Cosmic Web | 100 Mpc | 20 Gpc | 200 |
| 9 | Observable Universe | 1 Gpc | 30 Gpc | 30 |

Each shell's render pass uses its own depth attachment; when shells crossfade during transitions, both depths are valid because they are independent.

**Reverse-Z optimization** ([`decisions/0006-information-pacing.md`](../decisions/0006-information-pacing.md) does NOT cover this; it's a pure rendering decision): for each shell's projection matrix, we use a reverse-Z depth (far → 0, near → 1) which gives substantially better precision distribution because of how floating-point exponents map. This is standard practice and adds no complexity.

## Shell composition order

Per-frame composition order:

1. Compute current shell + active neighbors based on camera position.
2. For each active shell, in **outermost-first** order (CMB → cosmic web → Laniakea → ... → Solar System):
   - Bind its depth attachment (cleared per-shell to far-z).
   - Bind its projection matrix.
   - Run its render pass.
   - Composite to the shared color attachment with the shell's fadeAlpha.
3. Run the post-process pass (tonemap, bloom).
4. Run the label pass (MSDF) — labels can attach to any shell's coordinates and are projected with the appropriate matrix at render time.

The "depth attachment per shell" is wasteful in VRAM. A pragmatic compromise: only the **two currently-active shells** (current + nearest neighbor for crossfade) get depth attachments. As shells transition, the attachments are reused.

## The transition from "today" to "this"

The current renderer assumes one Mpc world space. Migrating to the multi-shell model is a refactor, not a rewrite:

**Step 1 — Introduce `CameraScale` alongside the existing camera.** Default values: `shell = COSMIC_WEB`, `shellOrigin = (0,0,0)`, `shellUnit = 1` (Mpc). All existing code paths use `shellRelative()` with this default, which is identity. **Zero behavior change.**

**Step 2 — Lift the projection matrix from a single global to a per-shell one, keyed by current shell.** Initially only one shell exists; the matrix is the same as today.

**Step 3 — Add the render-pass orchestrator (the loop in step 2 above).** Initially only one shell renders; the orchestrator is a one-iteration loop.

**Step 4 — Add per-shell renderers, one at a time, behind a feature flag.** Each new shell:
  - Defines its `CameraScale` parameters.
  - Implements its `ShellRenderer`.
  - Loads its data via the asset-slot primitive.

The wide-view experience never breaks because the existing renderer is "shell 8" (cosmic web) and is untouched.

**Step 5 — Wire up the tour engine** to drive `CameraScale` through scripted transitions.

## Performance budget

Each shell's render pass has a per-frame budget:

- **Inner shells (1-3):** sparse data, simple visuals. Target: ≤2 ms total per frame.
- **Middle shells (4-6):** point cloud + maybe disks/halos. Target: ≤4 ms.
- **Outer shells (7-9):** volumetric, large point cloud, CMB sphere. Target: ≤8 ms.
- **Total frame budget at 60 fps:** 16 ms. Even with two shells active during a transition, we stay under budget.

Performance details in `rendering/07-performance.md`.

## Open questions

1. **Inter-shell occlusion.** When shells cross-fade, the inner shell's geometry should occlude the outer shell's geometry (e.g., the Milky Way disk should occlude the cosmic web behind it during the shell-3-to-shell-4 transition). With per-shell depth attachments this requires a manual depth-resolve at composite time. **RECOMMENDATION:** skip in v1; rely on alpha to imply ordering. Revisit if it looks wrong.
2. **Sub-frame interpolation during fast camera moves.** During the cosmic zoom, the camera traverses orders of magnitude in seconds. With render-on-demand, we draw frames at variable cadence based on visible motion. Need to confirm that 60 fps is achievable at the fastest transition points, or budget for adaptive quality.
3. **F64 emulation in WGSL.** WGSL has no `f64`. For shell positions deep in (e.g., a planet's instantaneous position computed via Kepler in shader), we may need split-precision tricks (high + low f32). Probably not needed for v1 — Solar System is small enough that f32 with a snapped origin works. Defer.
4. **Coordinate system handedness across shells.** Skymap today uses right-handed RA/Dec → Cartesian per `src/utils/math/raDecZToCartesian.ts`. Solar System ephemerides typically use the J2000 ecliptic frame, which is also right-handed but tilted ~23.4° from equatorial. Does each shell get its own frame, or do we transform all data to a common frame at build time? **RECOMMENDATION:** build-time transform to equatorial J2000 (skymap's existing convention) for all shells. The Solar System is then "tilted" by the obliquity of the ecliptic, which is also visually correct.

## What this enables

Once this architecture is in place:
- Every shell can be rendered with optimal precision for its scale.
- Adding a new shell is a self-contained piece of work.
- The tour engine just drives the `CameraScale` state machine; everything downstream follows automatically.
- The existing wide-view experience is byte-equivalent — same frame, same precision, same performance.

## Files this design touches

New:
```
src/services/engine/scale/
  cameraScale.ts          — CameraScale type, shellRelative()
  scaleUnits.ts            — unit constants (also re-exported from src/data/)
  shellTransitions.ts      — fadeAlphaAt logic
  shellRendererRegistry.ts — registers per-shell renderers
  perShellProjection.ts    — projection matrix per shell

src/data/
  shellDefinitions.ts      — the table of shells (id, name, unit, near, far, origin anchor)
```

Modified:
```
src/services/engine/runFrame.ts — multi-shell orchestration loop
src/services/camera/orbitCamera.ts — augmented with CameraScale
src/services/gpu/pointRenderer.ts — accepts shell-relative coordinates
src/services/gpu/filamentRenderer.ts — accepts shell-relative coordinates
src/services/gpu/quadRenderer.ts — accepts shell-relative coordinates
src/services/gpu/labelRenderer.ts — projects via per-shell matrix
src/@types/ — CameraScale, ShellId, ShellRenderer types
```

The existing renderers' upload/render APIs grow a `shellId` parameter. They keep their current Mpc-based internals; the orchestrator passes them shell-relative coordinates that have already been transformed.
