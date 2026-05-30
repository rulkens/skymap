# Famous-galaxy in-app thumbnail calibration — design

**Date:** 2026-05-31
**Status:** Design (awaiting plan)
**Backlog item:** "Famous-galaxy in-app calibration" (Issue #3 of the 2026-05-28
famous-galaxy thumbnail brainstorm). Follow-up to the completed
`2026-05-28-famous-galaxy-high-res-lod` work.

## Problem

Famous-galaxy thumbnails are square WebPs drawn on a quad whose world position,
size, and orientation come from the **catalog** (`diameterKpc`,
`positionAngleDeg`, `axisRatio`). The renderer *assumes* each image is centred
on the nucleus and that the disk fills the frame. Curated images rarely satisfy
that assumption, producing three independent artifacts:

1. **Off-centre** — the nucleus sits away from the image centre, so the galaxy
   renders offset from its true 3-D position.
2. **Wrong scale** — the disk is smaller or larger than the quad, so apparent
   size disagrees with `diameterKpc`.
3. **Wrong rotation** — the disk's major axis in the image doesn't match the
   catalog position angle.

There is also a **latent double-foreshortening bug**: the fetched photo already
has Earth's viewing-angle foreshortening baked into its pixels (a tilted disk is
an ellipse in the WebP), yet the 3-D quad *also* tilts by `axisRatio`. The two
squashes compound, and when the camera lines up with Earth's sightline the disk
gets foreshortened twice.

Two real galaxies bound the problem space:

- **M51** — a clean spiral. Footprint == disk; deprojectable to face-on.
- **Tadpole (UGC 10214 / Arp 188)** — a ~280k-ly tidal tail that lies in **no
  disk plane**. It cannot be deprojected, and a disk-sized quad clips the tail.
  Its footprint must be wide and **lopsided** (nucleus off to one side).

## Goal

Give the curator an in-app tool to pin each famous galaxy's thumbnail to its
true on-sky geometry — **centre, scale, rotation** — and to optionally
**deproject** a tilted disk back to face-on. Deprojection un-squashes the disk
so it fills the footprint, fixes the double-foreshortening bug (the runtime then
applies the single correct tilt for the current camera), and — because it runs
on the **hi-res source before downsizing** — recovers detail along the stretched
axis.

Calibration is opt-in per galaxy and fully backward-compatible: a galaxy with no
calibration renders exactly as it does today.

## Scope

In scope:

- Curator disk-geometry overlay (centre / major-axis edge / minor-axis handles)
  plus a per-galaxy deproject toggle with as-shot ⇄ deprojected live preview.
- A deprojected-output preview in the export/commit step.
- Build-time deprojection of the hi-res source (pure affine resample).
- Runtime placement in `TexturedDiskSubsystem` driven by derived calibration.
- A debug overlay drawing the procedural-disk radius ring for the selected
  galaxy (developer verification aid, behind the debug panel).
- A short ADR recording the storage choice.

Out of scope:

- No `famous.bin` format bump. No second sidecar file.
- No per-frame deprojection in the shader (baked once at build time).
- No new footprint primitive — the **existing crop box is the footprint**.
- No automated nucleus/disk detection — this is a manual curation tool.

## Key decisions

### 1. Two decoupled measurements, not one

The crop box and the disk overlay describe **different facts** and must move
independently:

- **Footprint** = the existing `RecipeCrop`. How much of the picture we render.
  For the Tadpole, the curator simply draws the box large enough to include the
  tail; the nucleus ends up off-centre *within* the box. No change to the crop
  tool.
- **Disk geometry** = a new overlay. Where the nucleus is, how big the disk is,
  its major-axis angle, and (optionally) its squash. Drives deprojection and the
  catalog-disk size match.

These are **decoupled**: moving the crop must not drag the disk markup, and
editing the disk must not touch the crop. (This corrects an earlier
footprint-relative model that would have coupled them.)

### 2. Disk geometry stored in source-image pixels; runtime calibration derived at export

This mirrors the convention `RecipeCrop` already uses (recipe geometry is in
source-image pixel space, independent of the curator window size).

- **Curator working state** (persisted in the Recipe) stores disk geometry in
  **source-image pixels**, anchored to the photo exactly like the crop. Re-crop
  a galaxy later and its disk calibration stays valid.
- **Runtime calibration** (written to `famous_meta.json`) is **derived at export
  time**, once the crop is final: the nucleus position is expressed normalized
  within the *final* WebP, and disk radius relative to that image. The runtime
  never sees source pixels; the curator never stores footprint-relative numbers.

Because the crop can be rotated, the export step rotates the disk PA into the
final image's frame (subtract the crop `rotationDeg`) — the same transform
`cropExtract` already applies to pixels.

### 3. Deproject at build time, on the hi-res source

Deprojection is a one-time affine stretch along the disk minor axis by
`1/axisRatio`, applied to the **hi-res source** *before* downsizing to the
thumbnail. This recovers resolution along the stretched axis (versus stretching
an already-downsized 128px image) and keeps the renderer simple. A deprojected
thumbnail is **face-on**, so the runtime applies the existing PA + `axisRatio`
tilt to foreshorten it correctly for the current camera — resolving the
double-squash bug.

Deprojection is **per-galaxy opt-in**, seeded from a default threshold of
**b/a ≥ 0.3** (galaxies more inclined than ~70° smear too badly to recover), but
overridable by the curator via a toggle, with both results previewed so the
choice is informed, not guessed. As-shot images (Tadpole, Sombrero, very
edge-on) ship unchanged and render flat (no extra tilt) so tails and edge-on
disks look right.

### 4. Storage: the existing `famous_meta.json` entry — no new file, no bin bump

`famous_meta.json` is already loaded into `state.sources.famousMeta` and routed
to `TexturedDiskSubsystem` (the very subsystem that places the quads). Adding one
optional `calibration` field puts the data exactly where it's consumed with zero
new plumbing. This supersedes the backlog's "new `famous_calibration.json`
sidecar" proposal — a separate file would duplicate the load/route path for no
benefit. Recorded in an ADR (famous-only, optional, variable-shape data does not
belong in the shared fixed-stride `famous.bin`, which would force a version bump
and a regenerate-all).

## Data model

```ts
// tools/famous-curator/plugin/recipe.ts — curator working state, SOURCE-image
// pixels, decoupled from the crop. Optional: absent for non-disk / uncalibrated
// galaxies.
export type RecipeDisk = {
  /** Nucleus position in SOURCE-image pixels. */
  centerPx: Vec2;
  /** Disk radius in SOURCE pixels (major-axis edge drag length). */
  radiusPx: number;
  /** Major-axis position angle in the SOURCE image, degrees [0,180). */
  paDeg: number;
  /** Minor-axis handle b/a; falls back to catalog axisRatio when absent. */
  axisRatio?: number;
  /** Deproject toggle, seeded from b/a >= DEPROJECT_MIN_AXIS_RATIO. */
  deproject: boolean;
};

export type Recipe = {
  // …existing fields (version, id, crop, starnet, alpha, metadata, processedAt)…
  /** Optional disk-geometry overlay for calibration + deprojection. */
  disk?: RecipeDisk;
};
```

```ts
// src/@types/loading/FamousMetaEntry.d.ts — runtime, DERIVED at export,
// expressed relative to the FINAL webp.
export type FamousCalibration = {
  /** Nucleus position normalized [0,1]^2 within the final webp (0.5,0.5 = centre). */
  center: Vec2;
  /** Disk radius as a fraction of the final image half-width. */
  diskRadiusFrac: number;
  /** Major-axis PA in the final image frame, degrees [0,180). */
  paDeg: number;
  /** Optional b/a override; falls back to catalog axisRatio. */
  axisRatio?: number;
  /** True when the shipped webp was deprojected to face-on. */
  deprojected: boolean;
};

export type FamousMetaEntry = {
  // …existing fields…
  /** Optional placement calibration. Absent → today's render path unchanged. */
  calibration?: FamousCalibration;
};
```

`DEPROJECT_MIN_AXIS_RATIO = 0.3` is a single named constant shared by the
threshold seed and any pipeline guard.

## Components & data flow

```
Curator UI (disk overlay + deproject toggle + preview)
   │  writes RecipeDisk (source px) into <id>.recipe.json
   ▼
famousImageProcessor / buildFamous  (build time)
   │  1. crop+rotate (existing) → final image geometry known
   │  2. if disk.deproject && axisRatio >= 0.3: affine-stretch hi-res
   │     source to face-on, then downsize
   │  3. derive FamousCalibration: nucleus → normalized centre in final
   │     webp; radiusPx → diskRadiusFrac; rotate paDeg by -crop.rotationDeg
   │  4. write calibration onto the famous_meta.json entry
   ▼
famous_meta.json  →  state.sources.famousMeta  →  TexturedDiskSubsystem (runtime)
   │  if calibration present:
   │    - offset quad so the NUCLEUS lands on the catalog 3-D position
   │    - size quad from diskRadiusFrac so the disk matches diameterKpc
   │    - deprojected → face-on texture + existing PA/axisRatio tilt path
   │    - as-shot     → render flat (no extra tilt)
   │  else: current behavior, unchanged
   ▼
quad billboard on the GPU (existing pointer)
```

### Three units (clear boundaries)

1. **Disk-geometry overlay** (curator, new) — an interaction layer on top of the
   crop canvas. Three handles: centre (nucleus), major-axis edge (one drag →
   centre + radius + PA), minor-axis (pre-filled from catalog b/a; the
   deproject override). A deproject toggle with as-shot ⇄ deprojected preview.
   Self-contained; only clean disks use it. Reads catalog `axisRatio` to seed.
2. **Build-time deprojection** (pipeline, new pure fn) — input: hi-res RGBA +
   disk geometry; output: face-on RGBA (or pass-through when off/too-edge-on).
   Pure and unit-testable. Also derives `FamousCalibration` from `RecipeDisk` +
   the final crop.
3. **Runtime placement** (renderer, extend `TexturedDiskSubsystem`) — consumes
   `calibration` to offset/size/tilt the quad. Falls back to today's path when
   absent.

## Error handling & edge cases

- **No calibration** → render exactly as today (the dominant case for existing
  curated galaxies).
- **Too edge-on** (b/a < 0.3) → deproject disabled by default; if forced on, the
  pipeline still ships as-shot and logs a skip (no silent 6× smear).
- **Disk geometry without deproject** → calibration still placed (centre/scale/
  rotation) but the texture is as-shot.
- **Rotated crop** → PA rotated into final-image frame at export; covered by a
  geometry unit test.
- **Disk overlay drawn but galaxy is irregular** → curator marks it as-shot;
  footprint (crop) carries the tail.

## Testing

- **Deprojection resample** (pure fn): identity at b/a = 1; expected output
  dimensions/sampling for a known b/a; pass-through past the 0.3 threshold.
- **Calibration derivation**: `RecipeDisk` (source px) + final crop →
  `FamousCalibration` (normalized); includes the rotated-crop PA case.
- **Round-trip**: a recipe with `disk` flows through the build into a
  `famous_meta.json` entry carrying `calibration` (fixture test).
- **Runtime placement math**: nucleus normalized centre → world offset onto the
  catalog 3-D position; `diskRadiusFrac` → quad size matching `diameterKpc`.
- **Backward-compat**: an entry without `calibration` renders identically to
  the pre-feature path.

## Debug ring overlay

To visually verify that a calibrated textured disk covers the same area as the
catalog's procedural disk, add a debug overlay that draws a **ring at the
procedural-disk radius** of the **currently selected** famous galaxy, in 3-D
world space (the ring tracks the galaxy as the camera moves). It sits next to
the existing pick-buffer debug view:

- **Toggle:** a new `debug.showDiskRadiusRing` setting + a "Show disk radius
  ring" checkbox in `DebugPanel`, mirroring the existing `showPickBuffer`
  plumbing (`PickDebugOverlay`, `DebugPanel.tsx:87-94`, the `debug.*` settings
  table and `EngineDebugHandle`).
- **Radius:** the procedural-disk footprint — `paddedRadiusMpc(diameterKpc)`
  (the same value the textured quad's `sizeWorldMpc` derives from). Drawing the
  ring at the *procedural* radius and comparing it against the *textured* quad's
  visible extent is the verification: if calibration scale is right, the disk
  fills the ring.
- **Scope:** selected galaxy only — reuses the existing selection plumbing
  (`getFamousMeta` / selection subsystem), so the view stays uncluttered while
  calibrating one galaxy at a time.
- **Implementation:** a small world-space line-loop overlay pass under
  `services/gpu/passes/`, following the `markerLines` / `pickDebugOverlay`
  factory shape (premultiplied-OVER blend, shares `CameraUniforms`). Off by
  default.

This is a developer aid, not a user feature; it ships behind the debug panel.

## ADR

One ADR: *"Famous-galaxy calibration data lives on the existing
`famous_meta.json` entry, not in `famous.bin`."* Rationale: famous-only,
optional, variable-shape; avoids a shared fixed-stride format version bump and a
regenerate-all of every tier; the meta sidecar is already loaded and routed to
the consuming subsystem.

## Open questions

None blocking. Threshold (0.3) and the exact handle ergonomics are tunable
during implementation against real images.
