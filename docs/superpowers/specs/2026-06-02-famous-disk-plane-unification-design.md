# Famous-galaxy disk-plane unification — design

**Date:** 2026-06-02
**Status:** Design (awaiting review)
**Follow-up to:** `2026-05-31-famous-galaxy-thumbnail-calibration-design.md` (runtime
calibration placement, landed in #235) and the orientation-data fix in #239.

## Problem

Famous-galaxy thumbnail calibration (#235) promised that a **deprojected** WebP —
a galaxy warped to face-on at curation time — would be re-tilted at runtime by
"the single correct tilt" so the double-foreshortening bug is fixed and the disk
sits in its true 3-D plane. The runtime never delivered that. `effectiveTilt`
returns, for a deprojected calibration:

- `positionAngleDeg = calibration.frameMajorAxisDeg`, which is ≡ 0 (the deproject
  crop is rotated to axis-align the disk), and
- `axisRatio = calibration.axisRatio`, which `deriveFamousCalibration` sets to 1
  for deprojected output.

So a deprojected disk renders **face-on at PA 0** — flat, with no inclination and
no on-sky rotation. Meanwhile:

- the **procedural** disk (LOD-1 impostor) uses the catalog's real `axisRatio`/
  `positionAngleDeg` → the correct world-fixed plane;
- the **uncalibrated** textured disk (every non-curated galaxy) also uses catalog
  `ar`/`pa`;
- only the handful of **deprojected calibrated** disks (today: M101, C101) are the
  odd ones out.

The debug **disk-radius ring** shares `effectiveTilt`, so it is mis-tilted in the
same way. The visible symptom (confirmed on M101): the curated photo's rotation
is "somewhat off" and the procedural→textured crossfade shows a small orientation
pop, because the two passes resolve to different planes.

## The invariant

> **The catalog owns how a disk sits in 3-D — its on-sky position angle and its
> inclination (from `axisRatio` = cos *i*). The calibration owns only where the
> disk sits *within its image*: the nucleus `center` and `diskRadiusFrac`, plus
> the `deprojected` flag. Orientation never comes from the image frame.**

This holds because the disk quad is a **unit square** placed by `diskAxes`
(`lib/orientation.wesl`): `positionAngleDeg` rotates the major axis on-sky and
`axisRatio` tilts the *plane* out of the sky plane. The basis is
camera-independent and world-fixed. A deprojected (face-on) texture mapped onto
the real inclined plane therefore re-projects correctly for the viewer with no
separate texture squash — exactly the "single correct tilt" the calibration
design assumed.

## Goal

Make the deprojected textured disk render in the galaxy's real 3-D plane —
identical to the procedural disk and the uncalibrated path — and route the
textured disk, the debug ring, and (by construction) the procedural disk through
one orientation rule. Resolve the now-dead calibration fields.

## Scope

In scope:

- Rewrite `effectiveTilt` so a deprojected (and any uncalibrated) row resolves to
  catalog `ar`/`pa`; the as-shot case stays face-on.
- Plumb the catalog `positionAngleDeg` into the two `effectiveTilt` call sites
  (`texturedDiskSubsystem`, `diskRadiusRingPass`).
- Remove `axisRatio` and `frameMajorAxisDeg` from `FamousCalibration`, stop
  emitting them in `deriveFamousCalibration`, and drop them from the curator
  `export`/`process` route payloads.
- Tests: tilt unit behavior, the textured-disk calibration suite, a
  procedural↔textured convergence regression, the `deriveFamousCalibration` suite,
  and a fixture sweep for the two removed keys.

Out of scope (and why):

- **Disk size / `diskRadiusFrac`** — unchanged. The debug ring marks
  `paddedRadiusMpc(diameterKpc)` and the quad is scaled by `1/diskRadiusFrac` so
  the disk inside the crop lands exactly on the ring; the full crop extends past
  it by `1/diskRadiusFrac`. This fix makes that ring↔disk comparison *co-planar*
  (apples-to-apples) but does not change any sizes. See "Ring/disk co-extent".
- **As-shot textured projection** — an as-shot cutout already carries Earth's
  projection, so it renders face-on to the sky plane (`ar 1`, `pa 0`). No curated
  thumbnail is as-shot today (both M101 and C101 are `deproject: true`); the
  branch is retained only for forward-compat.
- **Uncalibrated as-shot cutouts** (SDSS/DSS) double-projecting on the catalog
  plane — pre-existing behavior, not introduced or addressed here.

## Design

### Orientation rule (`effectiveTilt`)

New signature — it now needs the catalog on-sky PA, not just the axis ratio:

```ts
export function effectiveTilt(
  calibration: FamousCalibration,
  catalogAxisRatio: number,
  catalogPaDeg: number,
): { positionAngleDeg: number; axisRatio: number } {
  // As-shot: the image already carries Earth's projection, so face the
  // sky-tangent plane (no inclination tilt, no on-sky rotation).
  if (!calibration.deprojected) return { positionAngleDeg: 0, axisRatio: 1 };
  // Deprojected: the face-on texture re-projects correctly on the galaxy's
  // real world-fixed plane — identical to the procedural and uncalibrated paths.
  return { positionAngleDeg: catalogPaDeg, axisRatio: catalogAxisRatio };
}
```

The deprojected branch is now byte-identical to the uncalibrated path, so the
function's only remaining job is the as-shot exception. The calibration no longer
contributes any orientation input.

### Call sites

- `texturedDiskSubsystem.runFrame` already reads catalog `pa` (line ~198); pass
  it as the third argument. Deprojected disks then emit catalog `ar`/`pa` into the
  `DiskInstance`.
- `diskRadiusRingPass.draw` already reads `catalog.positionAngleDeg[i]`; pass it
  through the same way so the ring matches.
- `proceduralDiskSubsystem` is unchanged — it already emits catalog `ar`/`pa`.

### Single orientation source (#7)

The tilt rule lives in one function consumed by the two calibration-aware
consumers (textured disk, ring). The procedural disk produces the same `(ar, pa)`
for all real data, which a regression test pins: for a deprojected row, the
textured disk's emitted `(axisRatio, positionAngleDeg)` equals the procedural
disk's, which equals the catalog values. We deliberately do **not** plumb
`famousMeta` into the procedural planner — no as-shot data exists, and the test
proves convergence without the extra coupling.

### Field removal (#5)

`FamousCalibration` becomes:

```ts
export type FamousCalibration = {
  center: Vec2;          // nucleus, normalised [0,1]^2 within the WebP
  diskRadiusFrac: number; // disk radius as a fraction of the image half-width
  deprojected: boolean;   // true when the shipped WebP was warped to face-on
};
```

`deriveFamousCalibration` stops computing `frameMajorAxisDeg` and the calibration
`axisRatio`; the curator `export`/`process` routes drop both keys from their
emitted calibration. `famous_meta.json` regenerates without them (build artifact,
not committed).

### Ring/disk co-extent (preserved, on the record)

With `frac = diskRadiusFrac = radiusPx / (cropWidth/2)`:

- debug ring radius = `paddedRadiusMpc(dKpc)` (half-extent);
- textured quad half-size = `paddedRadiusMpc(dKpc) / frac`;
- the galaxy disk occupies fraction `frac` of that half-width → its rendered edge
  sits at `paddedRadiusMpc(dKpc)` — exactly on the ring;
- the full crop extends to `(1/frac) ×` the ring radius.

So a larger crop (smaller `frac`) extends past the disk/ring, with the disk
landing on the ring — the intended behavior, governed by `diskRadiusFrac`, which
this change does not touch. The 4× footprint padding is in both the ring and the
quad and cancels in the disk-lands-on-ring relationship. This fix only makes the
two co-planar; if a disk still doesn't fill the ring afterward, that is a **size**
data issue (re-measure the disk radius in the curator, or a wrong catalog
`diameterKpc`), tracked separately.

## Testing

- **`effectiveTilt` unit** — deprojected → catalog `ar`/`pa`; as-shot → `1`/`0`;
  no dependency on any removed field.
- **`texturedDiskSubsystem.calibration`** — rewrite the "a deprojected entry keeps
  PA + axisRatio tilt" case (currently expects `0.6`/`37`) to expect the catalog
  `ar`/`pa` of the row; the as-shot case is unchanged.
- **Regression (convergence)** — for one deprojected row, assert the textured
  disk's `(axisRatio, positionAngleDeg)` equals the procedural disk's and equals
  the catalog values.
- **`deriveFamousCalibration`** — drop the `frameMajorAxisDeg` and calibration
  `axisRatio` assertions and the deprojected-branch field tests.
- **Fixture sweep** — remove the two keys from `FamousCalibration` fixtures across
  the test tree (`famousPlacement.test.ts`, the export route test, any others).

## Risks / notes

- The curator export schema changes (two keys dropped) right after #239 renamed
  one of them. This is intentional: #239 made the field's meaning honest; this
  change removes it once the render path no longer needs it.
- Visual verification is the real gate for a render-model change. After
  implementation, confirm on M101/C101 that the deprojected photo sits in the same
  plane as the procedural disk and the debug ring (no crossfade rotation pop), and
  re-check the inclined backfilled galaxies (M85, M100, M99).
- In-plane texture alignment of a deprojected disk is correct only when the
  catalog PA equals the PA the image was deprojected against. Residual twist after
  this fix is a curation-data issue (deproject against the catalog PA), not a
  render-model bug.
