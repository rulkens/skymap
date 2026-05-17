# Unified Procedural Galaxy Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `proceduralDiskRenderer` (flat disk-only impostor) with a single unified `proceduralGalaxyRenderer` that draws a volumetric **bulge for every galaxy**, plus a thin **disc-halo only for non-red (blue / green / unknown) galaxies**. Red galaxies render as bulge-only and read as ellipticals; spirals get bulge + thin haze for the "S0/Sa" silhouette. No spiral arms (too expensive for thousands of impostors). The replacement is a strict superset of today's disk pass — no API surface grows; the disk renderer file, shader, type, and tests are deleted.

**Architecture:** One renderer, one shader, one per-instance type. Per-instance ABI stays at 48 bytes / 3× `vec4<f32>` (identical to today's `ProceduralDiskInstance`). One spare scalar in the `extras` vec4 carries a `hasDisc` flag (1.0 for non-red, 0.0 for red) so the fragment stage can skip the 16-step disc-halo raymarch on ellipticals — important when thousands of red galaxies are on screen. Bulge fragment math is a literal copy-and-adapt from `milkyWayImpostor.wgsl`'s `renderGalaxy` (Gaussian density σ²=0.5·R², 16-step midpoint Beer-Lambert, BULGE_OPACITY=6.0, BULGE_BRIGHTNESS=1.7) plus a soft outer halo. Disc-halo math is the anisotropic-Gaussian disc-halo from the same shader (DISC_HALO_SIGMA_R_SQ=0.25, DISC_HALO_SIGMA_Y_SQ=0.0025, 16 steps), oriented by per-instance `axisRatio` + `positionAngleDeg` using the existing `proceduralDisks.wgsl` vertex-stage tilted-billboard math. The vertex stage is structurally identical to today's `proceduralDisks.wgsl`; the fragment stage is what fundamentally changes.

**Tech Stack:** WebGPU + WGSL, TypeScript, Vitest. No new runtime dependencies.

**Locked design decisions** (settled with user before plan-write):

| #   | Question                         | Decision                                                                                                                                                                                      |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sibling renderer or replacement? | REPLACEMENT. Old `proceduralDiskRenderer` + `proceduralDisks.wgsl` get `git rm`-deleted. The new renderer is a strict superset.                                                               |
| 2   | Per-instance attribute layout    | Same 3× `vec4<f32>` (48 bytes) ABI as `ProceduralDiskInstance`. New `hasDisc` boolean packed into `extras.z` (was zero-padding).                                                              |
| 3   | Pipeline state                   | Pure additive blend (`srcFactor: 'one'`, `dstFactor: 'one'`). NO `depthStencil` block — the HDR pass has no depth attachment as of `d69ab75`.                                                 |
| 4   | Where category is computed       | JS-side at frame time via `galaxyType(source, mags).category`. No `galaxyCatalog.bin` format bump.                                                                                               |
| 5   | Bulge fragment math source       | Copy-and-adapt from `milkyWayImpostor.wgsl`'s `renderGalaxy` (bulge raymarch + soft outer halo). `milkyWayImpostor.wgsl` itself stays unchanged.                                              |
| 6   | Disc-halo fragment math source   | Copy-and-adapt from `milkyWayImpostor.wgsl`'s thin-disc-halo raymarch (anisotropic Gaussian). Conditional on per-instance `hasDisc > 0.5`.                                                    |
| 7   | Spiral arms                      | NOT included. The Milky Way's noise/star-cell math is per-fragment trig and unsuitable for thousands of impostors.                                                                            |
| 8   | Color tinting                    | `bulgeRamp(colourIndex)` biased warm yellow/red for the passive old-stellar-population bulge; the existing `ramp(colourIndex)` (cool / blue) reused for the disc-halo's tint.                 |
| 9   | Fade-band constants              | Renamed `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` → `PROCEDURAL_GALAXY_FADE_START_PX` / `_END_PX`. Same numeric values (8, 14). All consumers (engine.ts, pointRenderer.ts callers) follow. |

**Out of scope:**

- Format-version bump for `galaxyCatalog.bin` (decision 4).
- A user-facing toggle.
- Texture-based / Sersic-from-texture ellipticals.
- Modifying `milkyWayImpostor.wgsl`.

---

## File Structure

**Create:**

- `src/services/gpu/proceduralGalaxyRenderer.ts` — unified render pipeline + draw method.
- `src/services/gpu/shaders/proceduralGalaxy.wgsl` — vertex (tilted-billboard) + fragment (bulge always, disc-halo conditional).
- `src/@types/ProceduralGalaxyInstance.d.ts` — per-instance vertex-buffer record type.
- `tests/services/gpu/proceduralGalaxyRenderer.test.ts` — smoke test (class shape + prototype methods).
- `tests/services/engine/proceduralGalaxyEmission.test.ts` — pure-helper tests for `maybeEmitProceduralGalaxy` (gate, NaN guard, smoothstep, hasDisc routing).

**Modify:**

- `src/services/engine/thumbnailSubsystem.ts` — replace `maybeEmitProceduralDisk` with `maybeEmitProceduralGalaxy` (computes `hasDisc` from `galaxyType(...).category`); rename closure refs; rename exported constants.
- `src/services/engine/engine.ts` — instantiate `ProceduralGalaxyRenderer` in place of `ProceduralDiskRenderer`; update import + binding call; rename constants in the points-pass uniform setup.
- `src/services/gpu/pointRenderer.ts` — comment text update only (the JS API uses `pxFadeStart` / `pxFadeEnd` parameters, but the doc-comment names the source-of-truth constants — rename in the comment).
- `src/services/engine/renderFrame.ts` — comment text update only (mentions the constants).
- `tests/services/engine/thumbnailSubsystem.test.ts` — rename mock factory `makeMockProceduralDiskRenderer` → `makeMockProceduralGalaxyRenderer`; update `bindToRenderers` calls.

**Delete (`git rm`):**

- `src/services/gpu/proceduralDiskRenderer.ts`
- `src/services/gpu/shaders/proceduralDisks.wgsl`
- `src/@types/ProceduralDiskInstance.d.ts`
- `tests/services/gpu/proceduralDiskRenderer.test.ts`
- `tests/services/engine/proceduralDiskEmission.test.ts`

---

## Conventions

- Didactic comments throughout — match the existing project style. Multi-paragraph module headers explaining WHY (replacement vs. extension, ABI symmetry, why per-instance `hasDisc` over a uniform branch).
- `type` aliases not interfaces.
- Tests under `tests/` mirror the src tree.
- All shell commands assume the working directory is `/Users/rulkens/Development/js/skymap`.
- Vitest. `npx vitest run <path>` for one file; `npm test` for the whole suite (currently 590+ passing — keep green).
- WGSL: `SCREAMING_SNAKE` for module constants, `camelCase` for locals.
- Commits use the user's git identity (rulkens@gmail.com) — no `--author=Claude...`. The `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer goes in the message body only.

---

## Task 0: Pre-flight — confirm clean baseline

**Files:** none.

- [ ] **Step 1: Confirm working tree is clean (or only carries unrelated WIP)**

Run: `git -C /Users/rulkens/Development/js/skymap status`

Expected: any pending changes are clearly unrelated to procedural galaxies. If anything in `src/services/gpu/` or `src/services/engine/` is uncommitted, commit or stash before starting — those are the surfaces this plan will touch.

- [ ] **Step 2: Confirm tests are green**

Run: `npm test`

Expected: 590+ passing across 76+ files. If anything is red, fix before starting.

- [ ] **Step 3: Confirm dev server is running**

Per `CLAUDE.md`, `npm run dev` is left running. Open the canvas in a browser; a galaxy field should be visible (every galaxy ≥8 px shows a flat disk impostor today). This is the visual baseline you'll compare against in Task 8.

---

## Task 1: Per-instance type — `ProceduralGalaxyInstance`

**Files:**

- Create: `src/@types/ProceduralGalaxyInstance.d.ts`

ABI symmetry with the old disk record matters: the host-side packing loop is structurally a near-copy of the old disk pack, and the renderer's vertex-attribute layout is the same `[float32x4, float32x4, float32x4]` shape. The only change is `extras.z`: it used to be unused padding; it now carries `hasDisc` (1.0 = render thin disc-halo, 0.0 = bulge only).

- [ ] **Step 1: Create the type file**

Create `src/@types/ProceduralGalaxyInstance.d.ts`:

```ts
/**
 * ProceduralGalaxyInstance — one entry in the unified procedural-galaxy
 * pass's per-instance vertex buffer.  Replaces the now-deleted
 * ProceduralDiskInstance: the pass renders a volumetric bulge for EVERY
 * galaxy and a thin disc-halo only for non-red galaxies.  Red galaxies
 * (passive / likely-elliptical) get bulge-only — the absence of a disc
 * is the whole reason "ellipticals look like ellipticals".
 *
 * Each instance describes one galaxy as a 3D-oriented quad in world
 * space:
 *
 *   - `(x, y, z)` is the galaxy's world-space centre in Mpc, identical
 *     to the position used by the points pass and the textured-disk pass.
 *   - `sizeWorldMpc` is the FULL extent of the impostor quad in Mpc (i.e.
 *     the diameter of the rendered quad along its major axis).  This
 *     matches `DiskInstance.sizeWorld` for the textured-thumbnail pass —
 *     the emission site sets the same value for both renderers.  Per the
 *     convention shared with `points.wgsl`'s `GALAXY_RADIUS_MPC` formula,
 *     this is `(diameterKpc/1000) * 4`.
 *   - `axisRatio` is `b/a` ∈ (0.05, 1].  Used by the vertex stage to
 *     foreshorten the in-plane axis so the projected disc-halo (when
 *     rendered) appears at the catalogued inclination.  For bulge-only
 *     red galaxies the value is still emitted (the vertex stage uses it
 *     for the billboard tilt), but it has no visible effect on a
 *     spherically-symmetric bulge.
 *   - `positionAngleDeg` is the east-of-north position angle of the
 *     major axis in degrees, [0, 180).  Same convention as the deleted
 *     disk renderer.
 *   - `colourIndex` is the per-row colour-index value (already
 *     normalised 0..2 by the engine — same scalar that drives the
 *     points-pass colour ramp).  Both `bulgeRamp` and `ramp` in the
 *     fragment stage are evaluated at this value.
 *   - `crossfadeAlpha` is the [0, 1] fade-in coefficient computed by
 *     the engine each frame from `apparentSizePx`: 0 below 8 px, 1
 *     above 14 px, smoothstep in between.  The fragment stage
 *     multiplies the final RGBA by this so the impostor fades in as the
 *     companion point sprite fades out.
 *   - `hasDisc` is 1.0 for non-red galaxies (blue / green / unknown) and
 *     0.0 for red.  Packed into a former-padding slot in `extras.z`.
 *     The fragment stage reads it via a flat-interpolated `f32` and
 *     skips the 16-step disc-halo raymarch when it's < 0.5.  Threshold
 *     comparison rather than equality because flat interpolation
 *     guarantees the value but a strict `== 1.0` invites a future
 *     "encode with finer granularity than 0/1" footgun.  See the
 *     fragment stage's commentary for why we don't use a
 *     uniform-driven branch instead (per-instance is the right grain).
 *
 * Layout: 12 floats = 48 bytes per instance; the orientation / extras
 * vec4 each have remaining padding f32(s) to keep WGSL's 16-byte
 * alignment for instance attributes.  Vertex buffer stride is
 * therefore 48 bytes; the renderer's pipeline descriptor declares
 * `stepMode: 'instance'` so each draw-call vertex sees the same record
 * for all six corner vertices.
 */
export type ProceduralGalaxyInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorldMpc: number;
  axisRatio: number;
  positionAngleDeg: number;
  colourIndex: number;
  crossfadeAlpha: number;
  /** 1.0 = render thin disc-halo (non-red); 0.0 = bulge only (red). */
  hasDisc: number;
};
```

- [ ] **Step 2: Run typecheck — verify the file parses**

Run: `npm run typecheck`

Expected: passes with no new errors. There will still be errors elsewhere referencing `ProceduralDiskInstance` (deleted in Task 7), but for this isolated step the new type-file alone must compile.

> If typecheck reports errors NOT involving `ProceduralDisk*`, address them before continuing.

- [ ] **Step 3: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap add src/@types/ProceduralGalaxyInstance.d.ts
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
feat(types): add ProceduralGalaxyInstance per-instance record

Replaces ProceduralDiskInstance (deletion follows in a later task) for
the unified procedural-galaxy pass.  Adds a `hasDisc` flag so the
fragment stage can skip the 16-step disc-halo raymarch on red /
elliptical galaxies.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: WGSL shader — `proceduralGalaxy.wgsl`

**Files:**

- Create: `src/services/gpu/shaders/proceduralGalaxy.wgsl`

This is the heart of the change. The vertex stage is a near-verbatim port of the deleted `proceduralDisks.wgsl` vertex stage (tilted-billboard from `axisRatio` + `positionAngleDeg`, world-fixed line-of-sight, sky-tangent basis). The fragment stage is rewritten: it always raymarches a Gaussian-density bulge, and conditionally raymarches a thin anisotropic disc-halo when `hasDisc > 0.5`. Both raymarches are copy-and-adapt from `milkyWayImpostor.wgsl`'s `renderGalaxy`. Pure additive blend; no depth.

The shader's "1 unit" = the impostor's half-extent in world Mpc. Because the impostor is sized to the galaxy (unlike the Milky Way impostor, which is a fixed 25 kpc), `BULGE_INTEGRATION_RADIUS = 0.20` and the disc-halo extent constants are intrinsic to the impostor's size in shader units — same scaling math as the milky way, but applied per-galaxy.

- [ ] **Step 1: Write the shader file**

Create `src/services/gpu/shaders/proceduralGalaxy.wgsl`:

```wgsl
// proceduralGalaxy.wgsl — unified 3D-oriented procedural galaxy impostors.
//
// Replaces the deleted proceduralDisks.wgsl as the per-galaxy procedural
// impostor pass.  Activates for galaxies in the apparent-size band 8..∞ px,
// with a crossfade against the points pass across 8..14 px.
//
// ── What changed vs. the deleted disk shader
//
// 1. The fragment stage is volumetric, not flat-2D.  Every galaxy gets a
//    raymarched Gaussian-density bulge (16-step midpoint, Beer-Lambert).
//    Non-red galaxies additionally get a thin anisotropic-Gaussian disc-
//    halo (also 16 steps).  Both are direct ports of the math already
//    proven in milkyWayImpostor.wgsl; spiral arms are intentionally
//    omitted because their per-fragment noise/star-cell math is too
//    expensive at thousands of impostors / frame.
// 2. A new per-instance `hasDisc` flag (extras.z) gates the disc-halo
//    raymarch.  Red galaxies render as bulge-only and read as
//    ellipticals.
// 3. The vertex stage is a verbatim copy of the deleted disk shader's
//    vertex stage — see disks.wgsl (still in the repo, the textured-
//    thumbnail pass) for the full derivation; we re-use the math
//    unchanged so the procedural galaxy's tilt agrees with the textured
//    pass at the crossfade boundary.
//
// ── Why per-instance hasDisc, not a uniform branch
//
// A uniform-driven branch would require two draw calls (one for red, one
// for non-red), doubling the per-frame draw-call count.  With per-instance
// hasDisc the GPU still pays for the divergent fragment path within a
// warp — but at large pixel coverage the warp is dominated by one or the
// other anyway, and the saved draw-call cost is real.  The earlier
// versions of this engine learned that "writeBuffer race" the hard way
// (CLAUDE.md's "things that have bitten us": interleaving writeBuffer
// with submit doesn't preserve order — bake per-instance data into the
// vertex buffer instead of a uniform you mutate per draw).

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  // (unused in this shader; preserved for ABI continuity with the disk
  // pass — see disks.wgsl line 62-69 for the same pattern.)
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,         // x, y, z, sizeWorldMpc
  @location(1) orientation: vec4<f32>,     // axisRatio, positionAngleDeg, _, _
  @location(2) extras: vec4<f32>,          // colourIndex, crossfadeAlpha, hasDisc, _
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Disk-local UV in [-1, 1]² — the fragment stage uses this for ray
  // construction in the impostor's intrinsic frame.
  @location(0) uv: vec2<f32>,
  // Per-instance colour-index value (forwarded for both ramps).
  @location(1) @interpolate(flat) colourIndex: f32,
  // Per-instance crossfade alpha (0..1).
  @location(2) @interpolate(flat) crossfadeAlpha: f32,
  // Per-instance hasDisc flag (0.0 or 1.0).
  @location(3) @interpolate(flat) hasDisc: f32,
  // World-space position of this fragment's corresponding vertex —
  // interpolated across the quad and used by the fragment stage to
  // reconstruct a per-pixel world-space ray.
  @location(4) worldPos: vec3<f32>,
  // World-space orientation basis at this instance (constant across the
  // six corners — flat-interpolated).  We need these in the fragment
  // stage to convert the world-space ray into the impostor's intrinsic
  // (major, minor, normal) frame for the volumetric raymarches.
  @location(5) @interpolate(flat) majorAxis: vec3<f32>,
  @location(6) @interpolate(flat) minorAxis: vec3<f32>,
  @location(7) @interpolate(flat) discNormal: vec3<f32>,
  // World-space centre of this instance, flat-interpolated.  The
  // fragment stage rebuilds the ray with this as the impostor origin.
  @location(8) @interpolate(flat) center: vec3<f32>,
  // Half-extent of the impostor in world Mpc (= 1 shader unit), flat-
  // interpolated.  The fragment stage divides world distances by this
  // to convert into the shader's intrinsic length system.
  @location(9) @interpolate(flat) halfExtent: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];

  // ── Disk-plane basis construction ────────────────────────────────────
  //
  // Verbatim copy of the deleted proceduralDisks.wgsl vertex stage.  See
  // disks.wgsl (the textured-thumbnail pass) for the full derivation —
  // the two passes MUST share basis math, otherwise their on-screen
  // ellipses disagree at the crossfade boundary.
  let pos = instance.posSize.xyz;
  let halfWorld = instance.posSize.w * 0.5;
  let axisRatio = max(instance.orientation.x, 0.05);
  let paRad = instance.orientation.y * 3.14159265 / 180.0;

  let los = normalize(pos);

  let CELESTIAL_NORTH = vec3<f32>(0.0, 0.0, 1.0);
  let northTangentRaw = CELESTIAL_NORTH - los * dot(CELESTIAL_NORTH, los);
  let northLen = length(northTangentRaw);
  let northTangent = select(
    northTangentRaw / northLen,
    vec3<f32>(0.0, 1.0, 0.0),
    northLen < 1e-4,
  );
  let eastTangent = cross(northTangent, los);

  let majorSky = northTangent * cos(paRad) + eastTangent * sin(paRad);
  let perpMajorSky = cross(los, majorSky);

  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let majorAxis = majorSky;
  let minorAxis = perpMajorSky * cosI + los * sinI;
  // Disc normal — the third axis of the disc's intrinsic frame, used by
  // the fragment stage to evaluate the anisotropic Gaussian's "narrow"
  // axis.  cross(major, minor) is the disc normal in the disc's
  // right-handed (major, minor, normal) frame.
  let discNormal = normalize(cross(majorAxis, minorAxis));

  let worldOffset = corner.x * majorAxis * halfWorld + corner.y * minorAxis * halfWorld;
  let worldPos = pos + worldOffset;

  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv = corner;
  out.colourIndex = instance.extras.x;
  out.crossfadeAlpha = instance.extras.y;
  out.hasDisc = instance.extras.z;
  out.worldPos = worldPos;
  out.majorAxis = majorAxis;
  out.minorAxis = minorAxis;
  out.discNormal = discNormal;
  out.center = pos;
  out.halfExtent = halfWorld;
  return out;
}

// ── Fragment stage — bulge always, disc-halo conditionally ─────────────

// Bulge — Gaussian density centred at the impostor centre.
// SIGMA² is the variance of the Gaussian; INTEGRATION_RADIUS is the
// bounding sphere used for ray entry/exit.  Same values as
// milkyWayImpostor.wgsl — the impostor's "1 unit" (= halfExtent world Mpc)
// makes these scale-invariant across galaxy sizes.
const BULGE_RADIUS: f32              = 0.125;
const BULGE_INTEGRATION_RADIUS: f32  = 0.20;
const BULGE_SIGMA_SQ: f32            = 0.0078125;  // 0.5 · BULGE_RADIUS²
const BULGE_STEPS: i32               = 16;
const BULGE_OPACITY: f32             = 6.0;
const BULGE_BRIGHTNESS: f32          = 1.7;

// Outer bulge halo — a soft Gaussian with σ ≈ 0.5 (in shader units),
// providing the diffuse glow around the bright core that makes the
// impostor look like a real galaxy and not just a hard sphere.  Pure
// additive on top of the raymarched bulge core; no integration loop
// needed because we evaluate the closest-approach density of the ray to
// the impostor centre.
const BULGE_HALO_SIGMA_SQ: f32       = 0.25;       // (0.5)²
const BULGE_HALO_BRIGHTNESS: f32     = 0.35;

// Disc-halo — anisotropic Gaussian.  WIDE in-plane (σ_r ~ half the disk
// extent), NARROW along the disc normal (σ_y is ~5% of σ_r).  Same
// values as milkyWayImpostor.wgsl.
const DISC_HALO_INTEGRATION_RADIUS: f32 = 1.0;
const DISC_HALO_SIGMA_R_SQ: f32         = 0.25;     // (0.5)²  — in-plane
const DISC_HALO_SIGMA_Y_SQ: f32         = 0.0025;   // (0.05)² — disc-normal
const DISC_HALO_STEPS: i32              = 16;
const DISC_HALO_OPACITY: f32            = 4.0;
const DISC_HALO_BRIGHTNESS: f32         = 0.45;

// ── Colour ramps ──────────────────────────────────────────────────────
//
// `ramp(colourIndex)` mirrors points.wgsl exactly so the procedural
// disc-halo's hue matches the companion point's hue at the crossfade
// boundary.  `bulgeRamp(colourIndex)` is narrower and biased toward warm
// yellow / red — the passive old-stellar-population colour of an
// elliptical's bulge.  Both ramps are evaluated per-fragment from the
// flat-interpolated colourIndex, so there is no per-pixel divergence.
fn ramp(t: f32) -> vec3<f32> {
  let s = clamp(t * 0.5, 0.0, 1.0);
  let blueWhite = mix(vec3<f32>(0.4, 0.6, 1.0), vec3<f32>(1.0, 0.95, 0.8), s);
  let whiteRed  = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.5, 0.3), s);
  return select(blueWhite, whiteRed, t > 1.0);
}

fn bulgeRamp(t: f32) -> vec3<f32> {
  // Narrower hue range than `ramp`: passive bulges are uniformly warm.
  // At t = 0 (bluest galaxy in the catalog) we still bias yellow-warm
  // because even spiral bulges are old-stellar-population.  At t = 2
  // (reddest) we deepen toward orange-red.  No blue end at all.
  let s = clamp(t * 0.5, 0.0, 1.0);
  return mix(vec3<f32>(1.0, 0.85, 0.55), vec3<f32>(1.0, 0.55, 0.30), s);
}

// raySphere — same helper as milkyWayImpostor.wgsl.  Returns
// (tEnter, tExit), or (-1, -1) on miss.
fn raySphere(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32) -> vec2<f32> {
  let m = ro - center;
  let b = dot(m, rd);
  let c = dot(m, m) - radius * radius;
  if (c > 0.0 && b > 0.0) { return vec2<f32>(-1.0, -1.0); }
  let discr = b * b - c;
  if (discr < 0.0) { return vec2<f32>(-1.0, -1.0); }
  let s = sqrt(discr);
  return vec2<f32>(-b - s, -b + s);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  // ── Ray reconstruction in the impostor's intrinsic frame ──────────
  //
  // The fragment is on the impostor's billboard quad in world space.
  // We reconstruct the per-pixel world ray as `worldPos -
  // cameraPosWorld`, then transform both the camera origin and the ray
  // direction into the impostor's (major, minor, normal) frame so the
  // raymarch operates in the simple x/y/z axis-aligned convention the
  // bulge and disc-halo math both assume.  Length scaling: divide world
  // distances by `halfExtent` so 1 shader unit = the impostor's half-
  // size in Mpc — matches how milkyWayImpostor.wgsl handles its
  // intrinsic scale.
  let camToCenter = u.camPosWorld - in.center;
  // Project camera-relative position onto the impostor's three axes.
  let roShader = vec3<f32>(
    dot(camToCenter, in.majorAxis),
    dot(camToCenter, in.discNormal),
    dot(camToCenter, in.minorAxis),
  ) / in.halfExtent;
  // Per-fragment ray direction in world, then projected onto the same
  // three axes.  No length scaling for direction (rotation is
  // length-preserving and we want a unit vector).
  let rdWorld = normalize(in.worldPos - u.camPosWorld);
  let rdShader = vec3<f32>(
    dot(rdWorld, in.majorAxis),
    dot(rdWorld, in.discNormal),
    dot(rdWorld, in.minorAxis),
  );

  // ── Bulge raymarch (always) ──
  //
  // Bounding-sphere entry/exit, midpoint Gaussian density, Beer-Lambert
  // composite.  Math identical to milkyWayImpostor.wgsl's bulge block.
  var col = vec3<f32>(0.0);

  let bulgeHits = raySphere(roShader, rdShader, vec3<f32>(0.0), BULGE_INTEGRATION_RADIUS);
  var bulgeOpticalDepth: f32 = 0.0;
  if (bulgeHits.x < bulgeHits.y) {
    let bulgeEntryT = max(bulgeHits.x, 0.0);
    let bulgeChordLen = max(0.0, bulgeHits.y - bulgeEntryT);
    let bulgeStep = bulgeChordLen / f32(BULGE_STEPS);
    for (var i: i32 = 0; i < BULGE_STEPS; i = i + 1) {
      let sampleT = bulgeEntryT + (f32(i) + 0.5) * bulgeStep;
      let samplePos = roShader + sampleT * rdShader;
      let densityHere = exp(-dot(samplePos, samplePos) / BULGE_SIGMA_SQ);
      bulgeOpticalDepth = bulgeOpticalDepth + densityHere * bulgeStep;
    }
  }
  let bulgeTint = bulgeRamp(in.colourIndex);
  col = col + BULGE_BRIGHTNESS * bulgeTint
            * (1.0 - exp(-bulgeOpticalDepth * BULGE_OPACITY));

  // ── Bulge outer halo ──
  //
  // Soft Gaussian glow centred at the impostor centre.  We evaluate the
  // closest-approach density of the world ray to the impostor centre —
  // analytic rather than ray-marched, so there's no integration loop.
  // `closestApproachSq` is the squared distance from the impostor
  // centre to the ray's nearest point, in shader units.
  let projOnRay = dot(-roShader, rdShader);
  let closestPoint = roShader + projOnRay * rdShader;
  let closestApproachSq = dot(closestPoint, closestPoint);
  let bulgeHaloDensity = exp(-closestApproachSq / BULGE_HALO_SIGMA_SQ);
  col = col + BULGE_HALO_BRIGHTNESS * bulgeTint * bulgeHaloDensity;

  // ── Disc-halo raymarch (only when hasDisc > 0.5) ──
  //
  // Anisotropic Gaussian: WIDE in-plane (samplePos.x² + samplePos.z²),
  // NARROW along the disc normal (samplePos.y²).  Note the axis
  // convention: we packed the disc-normal into shader-y at the basis
  // construction above (rdShader.y = dot(rdWorld, discNormal)), so
  // samplePos.y is the disc-normal coordinate and samplePos.xz is the
  // in-plane radial coordinate — same convention milkyWayImpostor.wgsl
  // establishes via `galacticToShader`.
  if (in.hasDisc > 0.5) {
    let discHits = raySphere(roShader, rdShader, vec3<f32>(0.0), DISC_HALO_INTEGRATION_RADIUS);
    var discOpticalDepth: f32 = 0.0;
    if (discHits.x < discHits.y) {
      let discEntryT = max(discHits.x, 0.0);
      let discChordLen = max(0.0, discHits.y - discEntryT);
      let discStep = discChordLen / f32(DISC_HALO_STEPS);
      for (var i: i32 = 0; i < DISC_HALO_STEPS; i = i + 1) {
        let sampleT = discEntryT + (f32(i) + 0.5) * discStep;
        let samplePos = roShader + sampleT * rdShader;
        let inPlaneRsq = samplePos.x * samplePos.x + samplePos.z * samplePos.z;
        let normalSq = samplePos.y * samplePos.y;
        let densityHere = exp(-inPlaneRsq / DISC_HALO_SIGMA_R_SQ)
                        * exp(-normalSq / DISC_HALO_SIGMA_Y_SQ);
        discOpticalDepth = discOpticalDepth + densityHere * discStep;
      }
    }
    let discTint = ramp(in.colourIndex);
    col = col + DISC_HALO_BRIGHTNESS * discTint
              * (1.0 - exp(-discOpticalDepth * DISC_HALO_OPACITY));
  }

  // ── Crossfade alpha + NaN sanitisation ──
  //
  // The blend mode is pure additive (srcFactor = one, dstFactor = one),
  // so the fragment's contribution to the HDR target is `col * alpha +
  // dst`.  We multiply col by crossfadeAlpha so the fade-in across
  // [8, 14] px is smooth.
  //
  // NaN/Inf masking — additive blending poisons forever, see
  // milkyWayImpostor.wgsl's commentary.
  let isFinite = (col == col) & (abs(col) < vec3<f32>(1e30));
  let safeCol = select(vec3<f32>(0.0), col, isFinite);
  let alpha = in.crossfadeAlpha;
  return vec4<f32>(safeCol * alpha, alpha);
}
```

- [ ] **Step 2: Verify the WGSL parses (no isolated test runner — checked indirectly via the renderer test in Task 3)**

No standalone WGSL parser is wired up; the shader's parse-time errors will surface in Task 3 when the renderer is instantiated under typecheck + the smoke test. Move on.

- [ ] **Step 3: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap add src/services/gpu/shaders/proceduralGalaxy.wgsl
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
feat(shader): add proceduralGalaxy.wgsl unified bulge + disc-halo shader

Replaces proceduralDisks.wgsl (deletion follows in a later task).  The
fragment stage always renders a 16-step Gaussian-density bulge raymarch
plus a soft outer halo, and conditionally renders the 16-step
anisotropic disc-halo raymarch when extras.z (hasDisc) > 0.5.

Both raymarches are direct ports of milkyWayImpostor.wgsl's renderGalaxy
math.  No spiral arms — too expensive at thousands of impostors / frame.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Renderer class — `proceduralGalaxyRenderer.ts`

**Files:**

- Create: `src/services/gpu/proceduralGalaxyRenderer.ts`
- Create: `tests/services/gpu/proceduralGalaxyRenderer.test.ts`

The renderer is structurally a copy of the deleted `proceduralDiskRenderer`. The differences:

- Imports `proceduralGalaxy.wgsl` (Task 2's file) instead of `proceduralDisks.wgsl`.
- The packing loop writes `extras.z = ins.hasDisc` instead of `0`.
- Pipeline descriptor has NO `depthStencil` block (the HDR pass uses no depth attachment as of `d69ab75` — same convention as `quadRenderer.ts` / `diskRenderer.ts`).
- Class is `ProceduralGalaxyRenderer`, type import is `ProceduralGalaxyInstance`.

- [ ] **Step 1: Create the renderer file**

Create `src/services/gpu/proceduralGalaxyRenderer.ts`:

```ts
/**
 * proceduralGalaxyRenderer — unified 3D-oriented procedural galaxy impostors.
 *
 * Replaces the deleted proceduralDiskRenderer as the per-galaxy procedural
 * impostor pass.  Activates for galaxies in the apparent-size band 8..∞ px,
 * with a crossfade against the points pass across 8..14 px.  See the plan
 * `docs/superpowers/plans/2026-05-05-elliptical-bulge-renderer.md` for the
 * full design rationale.
 *
 * The shader (proceduralGalaxy.wgsl) is documented in detail; this file
 * is just the JS-side pipeline wiring.  Per-instance ABI is identical to
 * the deleted disk renderer's: 3× vec4<f32> = 48 bytes, attribute
 * locations 0/1/2.  The only functional change at the pipeline level is
 * that `extras.z` now carries `hasDisc` rather than zero-padding.
 */

import wgsl from './shaders/proceduralGalaxy.wgsl?raw';
import type { ProceduralGalaxyInstance } from '../../@types/ProceduralGalaxyInstance';

const STRIDE_FLOATS = 12; // 3 vec4<f32> per instance
const STRIDE_BYTES = STRIDE_FLOATS * 4;

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export class ProceduralGalaxyRenderer {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferCapacity = 0; // in instances

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = device.createShaderModule({ code: wgsl });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Uniform layout matches diskRenderer / quadRenderer (mat4 + vec2 +
    // 2 padding f32 + vec3 + f32) — 96 bytes.
    this.uniformBuffer = device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' }, // posSize
              { shaderLocation: 1, offset: 16, format: 'float32x4' }, // orientation
              { shaderLocation: 2, offset: 32, format: 'float32x4' }, // extras (incl. hasDisc)
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Pure additive — galaxy procedural impostors are EMISSIVE.
            // See `quadRenderer.ts` for the full rationale; siblings
            // in the layered HDR render (quads, disks, this) all use
            // additive so they compose cleanly with each other and
            // with the Milky Way impostor underneath.
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add',
              },
            },
          },
        ],
      },
      // No depthStencil — the HDR pass has no depth attachment as of
      // commit d69ab75.  Pure additive in HDR space is order-independent
      // for a sufficiently dim fragment, so the missing depth test is
      // visually fine; the back-to-front sort in thumbnailSubsystem
      // handles the cases where order would matter.
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Issue one draw call for the given list of instances.  Packs the
   * instance data into the GPU vertex buffer (re-allocating if it grew),
   * writes the uniform buffer, and emits `draw(6, instances.length)`.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: [number, number, number],
    pxPerRad: number,
    instances: ReadonlyArray<ProceduralGalaxyInstance>,
  ): void {
    if (instances.length === 0) return;

    // Grow vertex buffer if needed.
    if (this.vertexBuffer === null || this.vertexBufferCapacity < instances.length) {
      this.vertexBuffer?.destroy();
      const cap = Math.max(instances.length, 64);
      this.vertexBuffer = this.device.createBuffer({
        size: cap * STRIDE_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.vertexBufferCapacity = cap;
    }

    // Pack instances.  Same memory layout as the deleted disk
    // renderer's pack — the only semantic change is that extras.z now
    // carries hasDisc instead of zero-padding.
    const packed = new Float32Array(instances.length * STRIDE_FLOATS);
    for (let i = 0; i < instances.length; i++) {
      const o = i * STRIDE_FLOATS;
      const ins = instances[i]!;
      packed[o + 0] = ins.x;
      packed[o + 1] = ins.y;
      packed[o + 2] = ins.z;
      packed[o + 3] = ins.sizeWorldMpc;
      packed[o + 4] = ins.axisRatio;
      packed[o + 5] = ins.positionAngleDeg;
      packed[o + 6] = 0;
      packed[o + 7] = 0;
      packed[o + 8] = ins.colourIndex;
      packed[o + 9] = ins.crossfadeAlpha;
      packed[o + 10] = ins.hasDisc;
      packed[o + 11] = 0;
    }
    this.device.queue.writeBuffer(this.vertexBuffer!, 0, packed);

    // Pack uniforms (mat4 + vec2 + 2*f32 + vec3 + f32 = 96 bytes).
    const uniforms = new ArrayBuffer(96);
    const u32f = new Float32Array(uniforms);
    u32f.set(viewProj, 0); // 0..63
    u32f[16] = viewport[0]; // 64..67
    u32f[17] = viewport[1]; // 68..71
    // 72..79 padding
    u32f[20] = camPosWorld[0]; // 80..83
    u32f[21] = camPosWorld[1]; // 84..87
    u32f[22] = camPosWorld[2]; // 88..91
    u32f[23] = pxPerRad; // 92..95
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer!);
    pass.draw(6, instances.length);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.vertexBuffer?.destroy();
    this.vertexBuffer = null;
  }
}
```

- [ ] **Step 2: Write the smoke test**

Create `tests/services/gpu/proceduralGalaxyRenderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProceduralGalaxyRenderer } from '../../../src/services/gpu/proceduralGalaxyRenderer';

describe('ProceduralGalaxyRenderer', () => {
  it('exports the class as a value', () => {
    // Full instantiation requires a GPUDevice which we can't easily
    // mock without pulling a WebGPU-shim dependency.  Visual correctness
    // is verified manually in the final visual-verification task.  This
    // test exists so the file gets type-checked + ensures the export
    // shape doesn't drift.
    expect(typeof ProceduralGalaxyRenderer).toBe('function');
    expect(ProceduralGalaxyRenderer.prototype.draw).toBeTypeOf('function');
    expect(ProceduralGalaxyRenderer.prototype.destroy).toBeTypeOf('function');
  });
});
```

- [ ] **Step 3: Run the smoke test to confirm it passes**

Run: `npx vitest run tests/services/gpu/proceduralGalaxyRenderer.test.ts`

Expected:

```
✓ tests/services/gpu/proceduralGalaxyRenderer.test.ts (1)
  ✓ ProceduralGalaxyRenderer (1)
    ✓ exports the class as a value
```

If the test fails on import (e.g. because the `?raw` import path resolves differently), check the path matches the existing `proceduralDiskRenderer.ts` style exactly: `import wgsl from './shaders/proceduralGalaxy.wgsl?raw';` — that's the working idiom in this repo.

- [ ] **Step 4: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap add src/services/gpu/proceduralGalaxyRenderer.ts tests/services/gpu/proceduralGalaxyRenderer.test.ts
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
feat(gpu): add ProceduralGalaxyRenderer pipeline class

Replaces the soon-to-be-deleted ProceduralDiskRenderer.  Same per-
instance ABI (48 bytes / 3 vec4) — `extras.z` now carries the new
`hasDisc` flag so the fragment stage can skip the disc-halo raymarch on
red galaxies.  Pure additive blend, no depth attachment (consistent with
the rest of the HDR pass post-d69ab75).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Per-galaxy emission helper — `maybeEmitProceduralGalaxy`

**Files:**

- Modify: `src/services/engine/thumbnailSubsystem.ts`
- Create: `tests/services/engine/proceduralGalaxyEmission.test.ts`

We replace the existing `maybeEmitProceduralDisk` with `maybeEmitProceduralGalaxy`. Same gate semantics (apparent-size threshold, crossfade smoothstep, NaN guards). The new helper additionally takes the galaxy's `category` (a `'red' | 'green' | 'blue' | 'unknown'` string from `galaxyType(...).category`) and produces `hasDisc = category !== 'red' ? 1 : 0`.

We also rename the two exported constants `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` → `PROCEDURAL_GALAXY_FADE_START_PX` / `_END_PX` to reflect that the unified pass is no longer just "the disk pass". The numeric values (8 and 14) are unchanged. Renames cascade in Task 6 across the call sites in `engine.ts` + `pointRenderer.ts` (doc-comment only).

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/proceduralGalaxyEmission.test.ts`:

```ts
/*
 * Sanity tests for `maybeEmitProceduralGalaxy` — Task 4 of the unified
 * procedural-galaxy plan.
 *
 * The runtime call lives inside `thumbnailSubsystem.runFrame`'s per-galaxy
 * loop, which can't be reached without a full WebGPU device + bootstrapped
 * engine.  Pulling the per-galaxy emission decision into a pure function
 * lets us pin its branches — apparent-size gate, NaN orientation guard,
 * smoothstep crossfade math, and the new `hasDisc` routing — directly.
 *
 * NOTE on smoothstep boundaries:  the inline runtime check is `px >
 * fadeStart` (strict).  These tests pin that boundary with `8.0001` vs.
 * `8.0` — flipping to `>=` would silently emit a zero-alpha instance at
 * exactly `px === 8`, which adds no pixels but does waste a quad and a
 * z-sort slot.
 */

import { describe, it, expect } from 'vitest';
import { maybeEmitProceduralGalaxy } from '../../../src/services/engine/thumbnailSubsystem';

describe('maybeEmitProceduralGalaxy', () => {
  // Fixture values used across most cases.  Distinct primes so a swap-
  // bug between x/y/z would be obvious; tiny-but-non-zero sizeWorldMpc
  // matches the "few-Mpc nearby galaxy" regime where procedural
  // galaxies actually emit.
  const base = {
    x: 1,
    y: 2,
    z: 3,
    sizeWorldMpc: 0.03,
    colourIndex: 1.0,
    fadeStartPx: 8,
    fadeEndPx: 14,
  };

  it('returns null below the fade start (strictly-greater gate)', () => {
    const r = maybeEmitProceduralGalaxy(
      7,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('returns null exactly at the fade-start edge', () => {
    const r = maybeEmitProceduralGalaxy(
      8,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('returns null when axisRatio is NaN', () => {
    const r = maybeEmitProceduralGalaxy(
      10,
      NaN,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('returns null when positionAngleDeg is NaN', () => {
    const r = maybeEmitProceduralGalaxy(
      10,
      0.7,
      NaN,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('emits with crossfadeAlpha ≈ 0 just above the fade-start edge', () => {
    const r = maybeEmitProceduralGalaxy(
      8.0001,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).not.toBeNull();
    expect(r!.crossfadeAlpha).toBeCloseTo(0, 3);
  });

  it('emits with crossfadeAlpha ≈ 1 at and beyond fadeEnd', () => {
    const atEnd = maybeEmitProceduralGalaxy(
      14,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(atEnd!.crossfadeAlpha).toBeCloseTo(1, 6);

    const farPast = maybeEmitProceduralGalaxy(
      50,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(farPast!.crossfadeAlpha).toBeCloseTo(1, 6);
  });

  it('smoothstep crossfade hits 0.5 at the band midpoint', () => {
    const r = maybeEmitProceduralGalaxy(
      11,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.crossfadeAlpha).toBeCloseTo(0.5, 6);
  });

  it('smoothstep crossfade matches the cubic at t = 0.25', () => {
    const r = maybeEmitProceduralGalaxy(
      9.5,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.crossfadeAlpha).toBeCloseTo(0.15625, 6);
  });

  it('forwards positional + orientation fields verbatim onto the instance', () => {
    const r = maybeEmitProceduralGalaxy(
      11,
      0.42,
      137,
      11,
      22,
      33,
      0.05,
      1.7,
      'green',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).not.toBeNull();
    expect(r!.x).toBe(11);
    expect(r!.y).toBe(22);
    expect(r!.z).toBe(33);
    expect(r!.sizeWorldMpc).toBe(0.05);
    expect(r!.axisRatio).toBe(0.42);
    expect(r!.positionAngleDeg).toBe(137);
    expect(r!.colourIndex).toBe(1.7);
  });

  // ── hasDisc routing pins ────────────────────────────────────────────

  it('hasDisc = 0 for category "red" (bulge-only / elliptical look)', () => {
    const r = maybeEmitProceduralGalaxy(
      10,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'red',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.hasDisc).toBe(0);
  });

  it('hasDisc = 1 for category "blue"', () => {
    const r = maybeEmitProceduralGalaxy(
      10,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'blue',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.hasDisc).toBe(1);
  });

  it('hasDisc = 1 for category "green"', () => {
    const r = maybeEmitProceduralGalaxy(
      10,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'green',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.hasDisc).toBe(1);
  });

  it('hasDisc = 1 for category "unknown" (fallback to disc render)', () => {
    const r = maybeEmitProceduralGalaxy(
      10,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      'unknown',
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.hasDisc).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (function not exported yet)**

Run: `npx vitest run tests/services/engine/proceduralGalaxyEmission.test.ts`

Expected: FAIL with an import error like `No matching export in "src/services/engine/thumbnailSubsystem.ts" for import "maybeEmitProceduralGalaxy"`. This is the expected pre-implementation state.

- [ ] **Step 3: Replace `maybeEmitProceduralDisk` with `maybeEmitProceduralGalaxy` in `thumbnailSubsystem.ts`**

In `src/services/engine/thumbnailSubsystem.ts`:

1. Find the import block at the top:

```ts
import { ProceduralDiskRenderer } from '../gpu/proceduralDiskRenderer';
import type { ProceduralDiskInstance } from '../../@types/ProceduralDiskInstance';
```

Replace with:

```ts
import { ProceduralGalaxyRenderer } from '../gpu/proceduralGalaxyRenderer';
import type { ProceduralGalaxyInstance } from '../../@types/ProceduralGalaxyInstance';
import type { GalaxyTypeInfo } from '../../@types/GalaxyTypeInfo';
```

2. Find the two exported constants:

```ts
export const PROCEDURAL_DISK_FADE_START_PX = 8;
export const PROCEDURAL_DISK_FADE_END_PX = 14;
```

Replace with:

```ts
export const PROCEDURAL_GALAXY_FADE_START_PX = 8;
export const PROCEDURAL_GALAXY_FADE_END_PX = 14;
```

(Update the surrounding doc-comment block from "Procedural-disk crossfade band" to "Procedural-galaxy crossfade band" — the band semantics are unchanged but the consumer is now the unified pass.)

3. Replace the entire `maybeEmitProceduralDisk` function (signature, doc-comment, body) with `maybeEmitProceduralGalaxy`:

```ts
/**
 * Decide whether (and how) to emit a per-frame ProceduralGalaxyInstance for
 * a single galaxy.  Returns the populated instance, or `null` when the
 * galaxy fails any of the gates: too small on screen, or missing the
 * orientation data the procedural-galaxy shader needs.
 *
 * ### Why a pure helper rather than inline branching
 *
 * The runtime call lives deep inside `runFrame`'s per-galaxy loop, which
 * isn't directly reachable from a unit test (it requires a full WebGPU
 * device, an engine bootstrap, and a pre-loaded cloud).  Lifting the
 * decision into a pure function lets the test suite exercise the branch
 * boundaries — the `px > fadeStart` gate, the `Number.isFinite`
 * orientation guard, the smoothstep crossfade math, the `hasDisc`
 * routing — without standing up the whole engine.  The runtime path then
 * calls this same helper inside the loop, so anything proved by the test
 * holds for the live frame too.
 *
 * ### Why the smoothstep shape matches WGSL `smoothstep`
 *
 * The points-pass fragment shader fades the screen-aligned billboard
 * out across the same `[fadeStart, fadeEnd]` band using WGSL's built-in
 * `smoothstep(start, end, x)` — which is exactly `t * t * (3 - 2 * t)`
 * for `t = clamp((x - start) / (end - start), 0, 1)`.  We reproduce that
 * cubic bit-for-bit here so the procedural-galaxy fade-IN and the
 * points-pass fade-OUT sum to identically 1.0 across the band.
 *
 * ### `category` and the `hasDisc` flag
 *
 * `category` is the coarse classification from `galaxyType(...).category`
 * — `'red' | 'green' | 'blue' | 'unknown'`.  Red galaxies render as
 * bulge-only (the disc-halo raymarch is skipped in the fragment stage),
 * which gives them the smooth-spheroid silhouette of an elliptical.
 * Everything else gets `hasDisc = 1` and renders bulge + thin disc-halo.
 * The decision is made here on the host side rather than in the fragment
 * shader because (a) the classification needs the per-row mag columns
 * which are JS-side state, and (b) doing it here lets the `hasDisc`
 * value be a per-instance flag rather than a uniform — see the shader's
 * own commentary for why per-instance is the right grain.
 */
export function maybeEmitProceduralGalaxy(
  px: number,
  ar: number,
  pa: number,
  x: number,
  y: number,
  z: number,
  sizeWorldMpc: number,
  colourIndex: number,
  category: GalaxyTypeInfo['category'],
  fadeStartPx: number,
  fadeEndPx: number,
): ProceduralGalaxyInstance | null {
  // Apparent-size gate.  Strictly `>` so the band lower edge is exclusive,
  // matching the original inline check; tests pin this with `8.0001` vs.
  // `8.0` to catch a future flip to `>=`.
  if (px <= fadeStartPx) return null;
  // Orientation guard.  GalaxyCatalog columns can carry NaN sentinels for
  // sources without orientation data (synthetic, partial 2MRS rows); we
  // can't render an oriented disc-halo without both, so skip rather
  // than emitting a shader-NaN.  Note: even bulge-only red galaxies
  // need a finite orientation for the vertex stage's billboard tilt
  // basis; we apply the same guard for both routes for consistency.
  if (!Number.isFinite(ar) || !Number.isFinite(pa)) return null;

  // Smoothstep over the [fadeStartPx, fadeEndPx] band — see the
  // doc-comment above for why this exact cubic.
  const t = Math.min(1, Math.max(0, (px - fadeStartPx) / (fadeEndPx - fadeStartPx)));
  const crossfadeAlpha = t * t * (3 - 2 * t);
  // Red galaxies render as bulge-only — that's the whole point of this
  // refactor.  Everything else (blue / green / unknown) gets the disc-
  // halo layered over the bulge.
  const hasDisc = category === 'red' ? 0 : 1;
  return {
    x,
    y,
    z,
    sizeWorldMpc,
    axisRatio: ar,
    positionAngleDeg: pa,
    colourIndex,
    crossfadeAlpha,
    hasDisc,
  };
}
```

> Note: this step replaces only the helper function and its imports/constants; the per-frame loop body still references `maybeEmitProceduralDisk` and `PROCEDURAL_DISK_FADE_*` and won't yet typecheck. That's fine — Task 5 fixes the loop. We keep the helper change separate so the test in this task can run against a clean isolated unit.

- [ ] **Step 4: Run the new emission test to verify it passes**

Run: `npx vitest run tests/services/engine/proceduralGalaxyEmission.test.ts`

Expected: 13 tests pass (3 null-return cases, 5 numeric/forwarding cases, 4 hasDisc-routing cases — but the `forwards positional + orientation fields verbatim` test counts once for a total of 13).

If a test fails on the smoothstep cubic at t=0.25 (`expected 0.15625, got 0.25`), that means `crossfadeAlpha = t` was used instead of `t * t * (3 - 2 * t)`. Restore the cubic.

- [ ] **Step 5: Commit (intermediate — full subsystem won't typecheck yet, that's Task 5)**

Don't run `npm run typecheck` between this commit and the next — the subsystem's loop body still references the old `maybeEmitProceduralDisk`. The next task fixes it in one go.

```bash
git -C /Users/rulkens/Development/js/skymap add src/services/engine/thumbnailSubsystem.ts tests/services/engine/proceduralGalaxyEmission.test.ts
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
feat(engine): replace maybeEmitProceduralDisk with maybeEmitProceduralGalaxy

Adds a `category` parameter (from galaxyType(...).category) and produces
a `hasDisc` flag on the returned instance: 0 for red (bulge-only / look-
like-elliptical), 1 for everything else.  Renames the exported fade-band
constants to PROCEDURAL_GALAXY_FADE_*.

Tests pin the gate boundary, NaN orientation guard, smoothstep cubic,
and the four hasDisc-routing branches.  The subsystem's per-frame loop
body still references the old helper — that's fixed in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Per-frame loop wiring in `thumbnailSubsystem.ts`

**Files:**

- Modify: `src/services/engine/thumbnailSubsystem.ts`
- Modify: `tests/services/engine/thumbnailSubsystem.test.ts`

We update the `runFrame` body to: use the new constants (`PROCEDURAL_GALAXY_FADE_START_PX` / `_END_PX`), accumulate `proceduralGalaxies: ProceduralGalaxyInstance[]` (renamed from the local `proceduralDisks`), call `maybeEmitProceduralGalaxy` (with the new `category` argument computed from `galaxyType(source, mags)`), and call the renamed `proceduralGalaxyRendererRef.draw(...)`. The closure-stash variable + `bindToRenderers` parameter both rename. The exported public type `ThumbnailSubsystem`'s `bindToRenderers` parameter renames too.

We also update the existing test file's mock factory (`makeMockProceduralDiskRenderer` → `makeMockProceduralGalaxyRenderer`) and all its call sites.

- [ ] **Step 1: Update `thumbnailSubsystem.ts` per-frame loop**

In `src/services/engine/thumbnailSubsystem.ts`:

1. Find the `galaxyType` import — likely missing. Add to the import block at the top:

```ts
import { galaxyType } from '../../utils/math/galaxyType';
```

2. Find the closure-stash variable declaration:

```ts
let proceduralDiskRendererRef: ProceduralDiskRenderer | null = null;
```

Replace with:

```ts
let proceduralGalaxyRendererRef: ProceduralGalaxyRenderer | null = null;
```

3. Find the `bindToRenderers` function:

```ts
function bindToRenderers(
  quadRenderer: QuadRenderer,
  diskRenderer: DiskRenderer,
  proceduralDiskRenderer: ProceduralDiskRenderer,
): void {
  quadRenderer.bindAtlas(atlas.getTextureView());
  diskRenderer.bindAtlas(atlas.getTextureView());
  proceduralDiskRendererRef = proceduralDiskRenderer;
  bound = true;
}
```

Replace with:

```ts
function bindToRenderers(
  quadRenderer: QuadRenderer,
  diskRenderer: DiskRenderer,
  proceduralGalaxyRenderer: ProceduralGalaxyRenderer,
): void {
  quadRenderer.bindAtlas(atlas.getTextureView());
  diskRenderer.bindAtlas(atlas.getTextureView());
  proceduralGalaxyRendererRef = proceduralGalaxyRenderer;
  bound = true;
}
```

4. Find the `ThumbnailSubsystem` public type's `bindToRenderers` declaration:

```ts
bindToRenderers(
  quadRenderer: QuadRenderer,
  diskRenderer: DiskRenderer,
  proceduralDiskRenderer: ProceduralDiskRenderer,
): void;
```

Replace with:

```ts
bindToRenderers(
  quadRenderer: QuadRenderer,
  diskRenderer: DiskRenderer,
  proceduralGalaxyRenderer: ProceduralGalaxyRenderer,
): void;
```

5. Find the `proceduralDisks` local-array declaration in `runFrame`:

```ts
const proceduralDisks: ProceduralDiskInstance[] = [];
```

Replace with:

```ts
const proceduralGalaxies: ProceduralGalaxyInstance[] = [];
```

(Update the surrounding multi-line comment block — replace "ProceduralDiskInstances" with "ProceduralGalaxyInstances" / "procedural-galaxy" wherever it appears.)

6. Find the `minPxForLoopEntry` line that references the old constant:

```ts
const minPxForLoopEntry = Math.min(APPARENT_SIZE_THRESHOLD_PX, PROCEDURAL_DISK_FADE_START_PX);
```

Replace with:

```ts
const minPxForLoopEntry = Math.min(APPARENT_SIZE_THRESHOLD_PX, PROCEDURAL_GALAXY_FADE_START_PX);
```

7. Find the procedural-disk emission block at the tail of the per-galaxy loop body (the `if (px > PROCEDURAL_DISK_FADE_START_PX) { ... }` block). Replace the whole block with the version below:

```ts
// ── Procedural-galaxy emission ─────────────────────────────────
//
// Above PROCEDURAL_GALAXY_FADE_START_PX (8 px), emit a procedural-
// galaxy instance with a smoothstep crossfade alpha that ramps
// 0 → 1 across the [8, 14] band.  The points pass uses the
// *same* smoothstep shape on the same px values to fade out, so
// the two passes crossfade exactly.
//
// The unified procedural-galaxy pass renders a bulge for every
// galaxy + a thin disc-halo for non-red galaxies.  The category
// (`red` / `green` / `blue` / `unknown`) is computed JS-side at
// frame time via `galaxyType(source, mags)` and forwarded to
// the helper, which packs `hasDisc` into the per-instance vec4.
// Red galaxies get bulge-only and look like ellipticals; spirals
// get the layered look.  No `galaxyCatalog.bin` format bump
// required — the classification runs every frame, but the loop
// already runs once per galaxy and `galaxyType` is a cheap
// float-compare dispatch.
if (px > PROCEDURAL_GALAXY_FADE_START_PX) {
  const ci = pickColourIndex(
    cloudSource,
    cloud.magU[i] ?? NaN,
    cloud.magG[i] ?? NaN,
    cloud.magR[i] ?? NaN,
    cloud.magI[i] ?? NaN,
    cloud.magZ[i] ?? NaN,
  );
  const colourIndex = ci !== null ? ci.colourIndex : 1.0;
  const cat = galaxyType(cloudSource, {
    magU: cloud.magU[i] ?? NaN,
    magG: cloud.magG[i] ?? NaN,
    magR: cloud.magR[i] ?? NaN,
    magI: cloud.magI[i] ?? NaN,
    magZ: cloud.magZ[i] ?? NaN,
  }).category;
  const emitted = maybeEmitProceduralGalaxy(
    px,
    ar,
    pa,
    x,
    y,
    z,
    sizeWorldMpc,
    colourIndex,
    cat,
    PROCEDURAL_GALAXY_FADE_START_PX,
    PROCEDURAL_GALAXY_FADE_END_PX,
  );
  if (emitted) proceduralGalaxies.push(emitted);
}
```

8. Find the back-to-front sort + draw block at the bottom of `runFrame`:

```ts
quads.sort(cmpFar);
disks.sort(cmpFar);
proceduralDisks.sort(cmpFar);
```

Replace with:

```ts
quads.sort(cmpFar);
disks.sort(cmpFar);
proceduralGalaxies.sort(cmpFar);
```

9. Find the `if (proceduralDisks.length > 0 && ...)` draw block:

```ts
if (proceduralDisks.length > 0 && proceduralDiskRendererRef !== null) {
  // mat4 from gl-matrix is a Float32Array at runtime, but TS sees a
  // distinct branded type — cast through `Float32Array` so the
  // renderer's parameter type matches without changing its public
  // signature (other call-sites in the repo pass Float32Array
  // directly).
  proceduralDiskRendererRef.draw(
    pass,
    viewProj as Float32Array,
    [canvasSize.width, canvasSize.height],
    [camPos[0], camPos[1], camPos[2]],
    pxPerRad,
    proceduralDisks,
  );
}
```

Replace with:

```ts
if (proceduralGalaxies.length > 0 && proceduralGalaxyRendererRef !== null) {
  // mat4 from gl-matrix is a Float32Array at runtime, but TS sees a
  // distinct branded type — cast through `Float32Array` so the
  // renderer's parameter type matches without changing its public
  // signature (other call-sites in the repo pass Float32Array
  // directly).
  proceduralGalaxyRendererRef.draw(
    pass,
    viewProj as Float32Array,
    [canvasSize.width, canvasSize.height],
    [camPos[0], camPos[1], camPos[2]],
    pxPerRad,
    proceduralGalaxies,
  );
}
```

10. Find the multi-line comment block describing "ProceduralDiskInstances accumulate independently — unlike the quad/disk dichotomy..." and re-word it to refer to "procedural-galaxy" wherever it says "procedural-disk", keeping the substantive guidance intact. Same treatment for the comment near the bottom describing the "steady-state crossfade band" draw ordering.

- [ ] **Step 2: Update the existing thumbnailSubsystem test file**

In `tests/services/engine/thumbnailSubsystem.test.ts`:

1. Find:

```ts
function makeMockProceduralDiskRenderer() {
  return {
    draw: vi.fn(),
  } as any;
}
```

Replace with:

```ts
function makeMockProceduralGalaxyRenderer() {
  return {
    draw: vi.fn(),
  } as any;
}
```

2. Replace ALL occurrences of `makeMockProceduralDiskRenderer()` in the file with `makeMockProceduralGalaxyRenderer()`. (There are seven sites in the existing file, all inside `bindToRenderers(...)` calls — `replace_all` is fine.)

3. Update the doc-comment above the mock factory. The existing comment reads `Mock ProceduralDiskRenderer.  Unlike Quad/DiskRenderer it doesn't ...` — replace each `ProceduralDiskRenderer` with `ProceduralGalaxyRenderer` and update the "stash-step" prose to match the new variable names.

- [ ] **Step 3: Run the existing subsystem test to verify it still passes**

Run: `npx vitest run tests/services/engine/thumbnailSubsystem.test.ts`

Expected: all existing tests still pass (the renames don't change behaviour). If a test fails because the mock renderer lacks a method the unified renderer's `draw` signature expects — it shouldn't, since the existing mock is `{ draw: vi.fn() }` which matches both old and new — examine the failure and adjust the mock to track the expected arguments.

- [ ] **Step 4: Run the per-galaxy emission test to verify it still passes**

Run: `npx vitest run tests/services/engine/proceduralGalaxyEmission.test.ts`

Expected: 13 tests pass (unchanged from Task 4).

- [ ] **Step 5: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap add src/services/engine/thumbnailSubsystem.ts tests/services/engine/thumbnailSubsystem.test.ts
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
feat(engine): rewire per-frame loop for unified procedural-galaxy pass

The runFrame loop now accumulates ProceduralGalaxyInstance[] (renamed
from proceduralDisks), computes the per-galaxy `category` via
galaxyType(...) and forwards it to maybeEmitProceduralGalaxy.  All
references to PROCEDURAL_DISK_FADE_* renamed to PROCEDURAL_GALAXY_FADE_*.
The closure-stashed renderer ref is now ProceduralGalaxyRenderer.

Tests file's mock factory and seven bindToRenderers call sites updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Engine wiring + downstream comment renames

**Files:**

- Modify: `src/services/engine/engine.ts`
- Modify: `src/services/gpu/pointRenderer.ts` (doc-comment only)
- Modify: `src/services/engine/renderFrame.ts` (doc-comment only)

We replace `ProceduralDiskRenderer` with `ProceduralGalaxyRenderer` at the engine's import + instantiation sites, rename the imported constants, and chase the constant-rename through the points-pass uniform setup. Then we update two comment-only references in pointRenderer.ts and renderFrame.ts to keep the source-of-truth grep clean.

- [ ] **Step 1: Update `engine.ts` imports**

In `src/services/engine/engine.ts`, find:

```ts
import { ProceduralDiskRenderer } from '../gpu/proceduralDiskRenderer';
```

Replace with:

```ts
import { ProceduralGalaxyRenderer } from '../gpu/proceduralGalaxyRenderer';
```

Find:

```ts
import {
  createThumbnailSubsystem,
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
```

Replace with:

```ts
import {
  createThumbnailSubsystem,
  PROCEDURAL_GALAXY_FADE_START_PX,
  PROCEDURAL_GALAXY_FADE_END_PX,
```

(The rest of that named-import group stays unchanged.)

- [ ] **Step 2: Update `engine.ts` renderer instantiation + bindToRenderers call**

Find the comment block + instantiation:

```ts
// ProceduralDiskRenderer fills the visibility gap between the
// screen-aligned point glow (which goes pixelated above ~8 px) and
// the textured-disk pass (which only kicks in at 24 px).  In the
// 8-14 px band both the points pass and this renderer are active,
// crossfading via complementary smoothstep alphas (see
// PROCEDURAL_DISK_FADE_START_PX / _END_PX in thumbnailSubsystem.ts).
// Same HDR target as the other thumbnail-pass renderers so the
// procedural disk composites into the same linear-light buffer.
const proceduralDiskRenderer = new ProceduralDiskRenderer({
  device,
  context,
  format: 'rgba16float',
  canvas,
});
```

Replace with:

```ts
// ProceduralGalaxyRenderer fills the visibility gap between the
// screen-aligned point glow (which goes pixelated above ~8 px) and
// the textured-disk pass (which only kicks in at 24 px).  In the
// 8-14 px band both the points pass and this renderer are active,
// crossfading via complementary smoothstep alphas (see
// PROCEDURAL_GALAXY_FADE_START_PX / _END_PX in thumbnailSubsystem.ts).
// Renders a volumetric bulge for every galaxy + a thin disc-halo
// for non-red galaxies — red galaxies (passive / likely-elliptical)
// get bulge-only.  Same HDR target as the other thumbnail-pass
// renderers so the procedural galaxy composites into the same
// linear-light buffer.
const proceduralGalaxyRenderer = new ProceduralGalaxyRenderer({
  device,
  context,
  format: 'rgba16float',
  canvas,
});
```

Find the `bindToRenderers` call:

```ts
thumbnails.bindToRenderers(quadRenderer, diskRenderer, proceduralDiskRenderer);
```

Replace with:

```ts
thumbnails.bindToRenderers(quadRenderer, diskRenderer, proceduralGalaxyRenderer);
```

- [ ] **Step 3: Update `engine.ts` points-pass uniform fields**

Find the points-pass uniform binding (around line 1255 — the only other site that reads the constants):

```ts
            pxFadeStartPoints: PROCEDURAL_DISK_FADE_START_PX,
            pxFadeEndPoints: PROCEDURAL_DISK_FADE_END_PX,
```

Replace with:

```ts
            pxFadeStartPoints: PROCEDURAL_GALAXY_FADE_START_PX,
            pxFadeEndPoints: PROCEDURAL_GALAXY_FADE_END_PX,
```

- [ ] **Step 4: Update doc-comment in `pointRenderer.ts`**

In `src/services/gpu/pointRenderer.ts`, find:

```ts
     * The engine should pass `PROCEDURAL_DISK_FADE_START_PX` and
     * `PROCEDURAL_DISK_FADE_END_PX` from `./engine/thumbnailSubsystem`
     * so both passes share a single source of truth — drift between
     * them would re-introduce the double-bright donut on one side and
     * a hard gap on the other.
```

Replace with:

```ts
     * The engine should pass `PROCEDURAL_GALAXY_FADE_START_PX` and
     * `PROCEDURAL_GALAXY_FADE_END_PX` from `./engine/thumbnailSubsystem`
     * so both passes share a single source of truth — drift between
     * them would re-introduce the double-bright donut on one side and
     * a hard gap on the other.
```

- [ ] **Step 5: Update doc-comment in `renderFrame.ts`**

In `src/services/engine/renderFrame.ts`, find any reference to `PROCEDURAL_DISK_FADE_START_PX` (at line 133 per the pre-flight grep) and replace with `PROCEDURAL_GALAXY_FADE_START_PX`. If the surrounding comment names "disk" / "procedural disk" in a way that reads odd post-rename, gently update to "procedural galaxy".

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: passes. Both src and tools tsconfigs must be clean.

If typecheck fails on `ProceduralDiskRenderer` references, search the codebase: `grep -rn "ProceduralDisk\|proceduralDisk\|PROCEDURAL_DISK" src/ tests/` and chase each one to the matching rename. Likely culprits: a stray test fixture, a leftover import in `index.ts` of one of the engine subdirectories.

- [ ] **Step 7: Run the whole test suite**

Run: `npm test`

Expected: 590+ passing across all files. The two old test files (`proceduralDiskRenderer.test.ts`, `proceduralDiskEmission.test.ts`) have NOT yet been deleted at this point — they will fail with import errors. That's expected; Task 7 deletes them.

Acceptance: the test count should be (previous count − the two failing files' test counts + the new file's tests). Specifically:

- `proceduralDiskRenderer.test.ts` had 1 test → now broken / fails import
- `proceduralDiskEmission.test.ts` had 9 tests → now broken / fails import
- `proceduralGalaxyRenderer.test.ts` adds 1 test
- `proceduralGalaxyEmission.test.ts` adds 13 tests

So typecheck passes, but test run shows 2 file-level import-error failures plus an overall count higher than baseline. We accept that interim state because the deletions are a single coherent commit in Task 7.

- [ ] **Step 8: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap add src/services/engine/engine.ts src/services/gpu/pointRenderer.ts src/services/engine/renderFrame.ts
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
feat(engine): wire ProceduralGalaxyRenderer into the engine

Engine now constructs ProceduralGalaxyRenderer in place of the soon-to-
be-deleted ProceduralDiskRenderer, and passes PROCEDURAL_GALAXY_FADE_*
to the points-pass uniforms so the unified pass crossfades against the
points pass on the same band [8, 14] px.  Two doc-only comment renames
in pointRenderer.ts and renderFrame.ts to keep grep results clean.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Delete the old disk renderer + tests

**Files:**

- Delete: `src/services/gpu/proceduralDiskRenderer.ts`
- Delete: `src/services/gpu/shaders/proceduralDisks.wgsl`
- Delete: `src/@types/ProceduralDiskInstance.d.ts`
- Delete: `tests/services/gpu/proceduralDiskRenderer.test.ts`
- Delete: `tests/services/engine/proceduralDiskEmission.test.ts`

The unified renderer is now plumbed end-to-end. The disk-only renderer's source files are dead code, and its two test files no longer compile (their imports from the deleted source files fail). We remove all five at once.

- [ ] **Step 1: Confirm there are no remaining references to the disk-only files**

Run: `grep -rn "proceduralDiskRenderer\|ProceduralDiskRenderer\|proceduralDisks\.wgsl\|ProceduralDiskInstance\|maybeEmitProceduralDisk" src/ tests/`

Expected: NO matches. Each grep token corresponds to a name in one of the to-be-deleted files. If anything matches, that's a missed rename from Task 5 or 6 — chase it before deleting.

(We deliberately leave the milkyWayImpostor.wgsl source-of-truth comment that mentions "proceduralDisks.wgsl" in its module header — it's a historical pointer to where the math came from, and updating it would be misleading once the file is deleted. Open `src/services/gpu/shaders/milkyWayImpostor.wgsl` and change "used by `proceduralDisks.wgsl`" → "used by `proceduralGalaxy.wgsl`" in the comment block around line 194 if a clean grep matters more than the historical pointer; otherwise leave it.)

If you decided to update the milkyWayImpostor.wgsl comment, stage that change with the rest of the deletions in step 3.

- [ ] **Step 2: Delete the five files via git**

Run:

```bash
git -C /Users/rulkens/Development/js/skymap rm \
  src/services/gpu/proceduralDiskRenderer.ts \
  src/services/gpu/shaders/proceduralDisks.wgsl \
  src/@types/ProceduralDiskInstance.d.ts \
  tests/services/gpu/proceduralDiskRenderer.test.ts \
  tests/services/engine/proceduralDiskEmission.test.ts
```

Expected: all five are staged for deletion.

- [ ] **Step 3: Run typecheck + tests**

Run:

```bash
npm run typecheck && npm test
```

Expected:

- typecheck passes.
- `npm test` reports the new total: starting from a 590+ baseline, − 1 (proceduralDiskRenderer.test) − 9 (proceduralDiskEmission.test) + 1 (proceduralGalaxyRenderer.test) + 13 (proceduralGalaxyEmission.test) = baseline + 4 tests, all green.

If typecheck fails on a reference you missed, the grep in Step 1 didn't catch it — possibly because of unusual casing (e.g. an `as` rename). Search again with `grep -rni "proceduraldisk"` and clean it up.

- [ ] **Step 4: Commit the deletion**

```bash
git -C /Users/rulkens/Development/js/skymap commit -m "$(cat <<'EOF'
chore(gpu): remove ProceduralDiskRenderer + tests

Replaced by the unified ProceduralGalaxyRenderer (bulge for every
galaxy, conditional disc-halo for non-red galaxies) added in earlier
commits.  The disk-only renderer's source files and tests are dead
code now that the unified pass is plumbed end-to-end.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Visual verification (no test code — eyes on canvas)

**Files:** none.

The renderer's correctness is asserted by tests at the unit level, but the visual look is the actual deliverable. We compare the dev-server canvas before vs. after on two known galaxies:

- **M87** (Famous-source row): a giant elliptical at RA ≈ 187.706, Dec ≈ +12.391. Expectation: a soft warm spheroidal glow with no disc tilt — the bulge-only render path. Pre-refactor, M87 rendered as a flat disk impostor; post-refactor it should look like a 3D ball.
- **M101** (Famous-source row, "Pinwheel Galaxy"): a face-on spiral at RA ≈ 210.802, Dec ≈ +54.349. Expectation: a bright bulge core with a thin smooth disc-halo extending outward — the bulge + disc-halo render path. Pre-refactor, M101 rendered as a flat blue disk; post-refactor it should look like a layered "bulge + thin haze" with the bulge slightly warmer than the disc-halo.

- [ ] **Step 1: Confirm dev server hot-reloaded the new shader/renderer**

Per CLAUDE.md, `npm run dev` is left running. Open the browser tab; if HMR didn't pick up the new files, hard-reload (Cmd-Shift-R). Confirm no console errors mentioning `proceduralGalaxy.wgsl` parse failures or `ProceduralGalaxyRenderer` runtime errors. If a shader-parse error fires, the WGSL has a typo — re-read Task 2's shader file against your version.

- [ ] **Step 2: Frame M87 (bulge-only / red galaxy)**

In the UI's Famous-galaxies dropdown (or the InfoCard search), navigate to M87. Zoom until the impostor's apparent size is ~80–150 px on screen.

Visual checklist:

- [ ] Spheroidal warm-yellow glow centred on the M87 row's position.
- [ ] No disc tilt, no thin halo extending sideways — just a smooth ball.
- [ ] Edges fade smoothly to zero (no hard square / no NaN-ring artefacts at corners).
- [ ] The companion point sprite has fully crossfaded out (alpha ≈ 0 at this px size).

If the impostor looks like a flat disk (the old look), `hasDisc` is being packed wrong. Add a temporary `console.log` in the per-galaxy emission block in `thumbnailSubsystem.ts` for the M87 row — it should print `category: 'red'` and `hasDisc: 0`. If it prints `'unknown'`, the Famous-source classifier fell through to UNKNOWN (which sets category `'green'`). M87's photometry may need to be re-checked, but the practical fix for visual verification is to test against another known elliptical (e.g. M49, M59, M60) whose mag columns are populated.

- [ ] **Step 3: Frame M101 (bulge + disc-halo / blue galaxy)**

Navigate to M101. Zoom until apparent size is ~80–150 px.

Visual checklist:

- [ ] Bright warm bulge core in the centre.
- [ ] Thin softer-blue / cooler disc-halo extending in the direction of the catalogued position angle, foreshortened by the catalogued axis ratio.
- [ ] Bulge tint visibly warmer than disc-halo tint (the `bulgeRamp` vs. `ramp` divergence).
- [ ] Edges fade smoothly; no hard square; no NaN-ring artefacts.

If the bulge looks "swallowed" by the disc-halo (hard to see distinct from the disc), tune `BULGE_BRIGHTNESS` upward or `DISC_HALO_BRIGHTNESS` downward in `proceduralGalaxy.wgsl` and HMR-reload. The values borrowed from milkyWayImpostor.wgsl (1.7 / 0.45) are a reasonable starting point but may need ±20% per the visual feel of these specific impostor sizes.

- [ ] **Step 4: Stress-test — orbit and zoom across ~10 galaxies of mixed type**

With a modest sky region in view (mostly nearby SDSS / 2MRS galaxies above the 8 px threshold), orbit the camera. Visual checklist:

- [ ] No "tilted black rectangle" artefacts (the milky-way impostor's old bug — solved there but worth confirming hasn't appeared here).
- [ ] No flickering at the 8 px crossfade boundary as galaxies move in and out of the band.
- [ ] No "double bright donut" of overlapping pass alphas — the points-pass fade-out and the procedural-galaxy fade-in still sum to ≈1.

If any of these appear, file a follow-up note in the plan's "open issues" section (append to this document), but don't block the merge — these are tunable, the architectural change is the deliverable.

- [ ] **Step 5: Final test sweep + commit-clean confirmation**

Run:

```bash
npm test
npm run typecheck
git -C /Users/rulkens/Development/js/skymap status
```

Expected:

- All tests green (the new total is baseline + 4 per Task 7 step 3).
- typecheck passes.
- working tree is clean (no stray uncommitted changes from the visual-verify session).

If everything passes, the plan is done.

---

## Self-review — each architecture decision has at least one task

(For the writer's pre-save sanity check.)

| Decision                                     | Task(s) implementing it                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1: Replace, not add a sibling                | Tasks 7 (delete) + 3 (the new renderer takes over the slot)                                                           |
| 2: Same 48-byte ABI; `hasDisc` in `extras.z` | Task 1 (type), Task 2 (shader vertex `extras.z`), Task 3 (renderer pack), Task 4 (helper sets `hasDisc`)              |
| 3: Pure additive blend, no depthStencil      | Task 3 (pipeline descriptor)                                                                                          |
| 4: Category at frame time (no .bin bump)     | Task 5 (loop calls `galaxyType(...)`), Task 4 (helper takes `category`)                                               |
| 5: Bulge math copied from milkyWayImpostor   | Task 2 (BULGE_RADIUS, BULGE_SIGMA_SQ, BULGE_STEPS, BULGE_OPACITY, BULGE_BRIGHTNESS literals + raymarch loop verbatim) |
| 6: Disc-halo math copied; gated by hasDisc   | Task 2 (DISC*HALO*\* constants + raymarch loop, wrapped in `if (in.hasDisc > 0.5)`)                                   |
| 7: No spiral arms                            | Task 2 (no noise/star/galaxy() helpers ported)                                                                        |
| 8: bulgeRamp() warm, ramp() reused for disc  | Task 2 (both ramp functions defined, applied to bulge vs. disc-halo respectively)                                     |
| 9: Constants renamed                         | Task 4 (definition), Task 5 (loop call sites), Task 6 (engine + pointRenderer + renderFrame)                          |
| Visual verification                          | Task 8 (M87 + M101 spot-check)                                                                                        |
| Old files deleted, not stranded              | Task 7 (`git rm` of all 5 files)                                                                                      |
| Cross-codebase rename                        | Tasks 5 + 6 (subsystem + tests + engine + pointRenderer + renderFrame)                                                |
