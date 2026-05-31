# Famous-galaxy Calibration — Plan 1: Data Model + Pure Deproject/Derive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the calibration data model (`RecipeDisk` on the Recipe, `FamousCalibration` on `FamousMetaEntry`, the `DEPROJECT_MIN_AXIS_RATIO` constant) plus the two pure functions every other plan depends on: the deprojection resample and the calibration derivation.
**Architecture:** All new code here is pure and node-side (no React, no GPU). Recipe parse/validate follows the existing `parseRecipe` pattern. The derivation function takes `RecipeDisk` (source px) + the final `RecipeCrop` and returns a normalized `FamousCalibration`, rotating PA by `-crop.rotationDeg` with the same transform `cropExtract` uses. The deprojection function is a `sharp` affine minor-axis stretch on hi-res RGBA — identity at b/a = 1, pass-through past the threshold.
**Tech Stack:** TS, `sharp`, Vitest.

---

Read first: the spec (`Data model`, `Key decisions §2/§3`, `Testing`),
[`recipe.ts`](../../../tools/famous-curator/plugin/recipe.ts) (the `parseRecipe` shape at `recipe.ts:72-145`, optional-field pattern at `:87-93`),
[`cropExtract.ts`](../../../tools/famous-curator/plugin/cropExtract.ts) (the source→rotated point/PA transform at `cropExtract.ts:66-88`),
[`FamousMetaEntry.d.ts`](../../../src/@types/loading/FamousMetaEntry.d.ts),
[`Vec2.d.ts`](../../../src/@types/math/Vec2.d.ts).

---

## Task 1: `RecipeDisk` type + `disk?` on `Recipe`

**Files:** `tools/famous-curator/plugin/recipe.ts` (modify), `tests/famous-curator/recipe.test.ts` (create or extend — run `find tests -name 'recipe*'` first).

**Contract (add to `recipe.ts`, importing `Vec2` from `src/@types/math/Vec2`):**

```ts
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
```

Add `disk?: RecipeDisk;` to the `Recipe` type. Do **not** bump
`Recipe.version` — `disk` is optional and absent recipes round-trip
unchanged (same backward-compat rationale as `crop.rotationDeg` at
`recipe.ts:87-93`).

- [x] Add test `parseRecipe round-trips a recipe with no disk block (disk stays undefined)` — `parseRecipe(serialiseRecipe(r)).disk === undefined` for a recipe built without `disk`.
- [x] Add test `parseRecipe parses a valid disk block` — JSON with `disk: { centerPx: [120, 80], radiusPx: 64, paDeg: 30, deproject: true }`; assert every field round-trips and `centerPx` is a fresh array (not aliased to input).
- [x] Add test `parseRecipe parses disk.axisRatio when present and leaves it undefined when absent`.
- [x] Add test `parseRecipe throws when disk.centerPx is not a 2-number tuple` (e.g. `centerPx: [1]` or `centerPx: 5`).
- [x] Add test `parseRecipe throws when disk.radiusPx or disk.paDeg is non-finite`.
- [x] Add test `parseRecipe throws when disk.deproject is not a boolean`.
- [x] Run `npm test -- recipe` → new tests FAIL.
- [x] Implement: extend `parseRecipe` (validate `disk` only when present — mirror the `crop.rotationDeg` optional-when-absent guard at `recipe.ts:89-93`); `serialiseRecipe` already carries `disk` through via `JSON.stringify`. Validate `centerPx` is a finite-number tuple of length 2; `radiusPx`/`paDeg` finite; `axisRatio` finite when present; `deproject` boolean. Return a fresh `disk` with a fresh `centerPx` tuple (no aliasing — matches the `parseRecipe` docstring contract at `recipe.ts:66-71`).
- [x] Run `npm test -- recipe` → PASS. `npm run typecheck` → clean.
- [x] Commit.

## Task 2: `FamousCalibration` type + `calibration?` on `FamousMetaEntry`

**Files:** `src/@types/loading/FamousMetaEntry.d.ts` (modify).

**Contract (add, importing `Vec2` from `../math/Vec2`):**

```ts
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
```

Add `calibration?: FamousCalibration;` to `FamousMetaEntry`. Didactic
comment: absent → today's render path unchanged (the dominant case).

- [x] Add `FamousCalibration` + the optional field with house-style doc comments.
- [x] Run `npm run typecheck` → clean (`.d.ts`-only; confirm no consumer breaks).
- [x] Commit.

## Task 3: `DEPROJECT_MIN_AXIS_RATIO` constant

**Files:** `src/data/famousCalibration.ts` (create), `tests/data/famousCalibration.test.ts` (create).

Single source of truth shared by the curator-seed, the pipeline guard, and
the build (per project memory `feedback_single_source_of_truth`).

**Contract:**

```ts
/**
 * Below this b/a (more inclined than ~70°) a deproject stretch smears the
 * disk too badly to recover, so the curator seeds the toggle off and the
 * pipeline refuses to stretch even when forced. Tunable against real images.
 */
export const DEPROJECT_MIN_AXIS_RATIO = 0.3;
```

- [x] Add test `DEPROJECT_MIN_AXIS_RATIO is 0.3`.
- [x] Run `npm test -- famousCalibration` → FAIL.
- [x] Implement the constant module.
- [x] Run `npm test -- famousCalibration` → PASS.
- [x] Commit. _(co-located test at `src/data/famousCalibration.test.ts`, matching the `src/data` neighbour convention rather than the plan's `tests/data/` path)_

## Task 4: Pure deprojection resample — `deprojectDisk`

**Files:** `tools/famous/deprojectDisk.ts` (create), `tools/famous/deprojectDisk.test.ts` (create).

A one-time affine stretch along the disk **minor** axis by `1/axisRatio`,
applied to hi-res RGBA so a tilted (foreshortened) disk becomes face-on.
Pure: takes a `sharp` pipeline + the disk geometry, returns a new `sharp`
pipeline. Runs on the hi-res source **before** the thumbnail downsize so it
recovers detail along the stretched axis (spec §3).

**Signature:**

```ts
import type { Sharp } from 'sharp';

export type DeprojectInput = {
  /** Major-axis PA of the disk in the IMAGE frame, degrees. */
  paDeg: number;
  /** Disk b/a in [0,1]. 1 = face-on (no stretch). */
  axisRatio: number;
};

/**
 * Returns a sharp pipeline affine-stretched to face-on, or the input
 * unchanged when no stretch applies. Pure w.r.t. the geometry; the caller
 * chains `.resize()/.webp()`.
 *
 * Stretch factor = 1 / axisRatio along the MINOR axis (perpendicular to
 * paDeg). At axisRatio >= 1 returns the input untouched. At axisRatio <
 * DEPROJECT_MIN_AXIS_RATIO returns the input untouched (pass-through;
 * caller logs the skip) — never a silent 6x smear.
 */
export function deprojectDisk(src: Sharp, input: DeprojectInput): Sharp;
```

Implementation notes (do NOT paste a body — read `sharp`'s `.affine()`
docs and the rotation-matrix convention at `cropExtract.ts:77-84`). The
affine maps source pixels so the minor axis (perpendicular to `paDeg`) is
scaled by `1/axisRatio`. Threshold guard uses `DEPROJECT_MIN_AXIS_RATIO`
from `src/data/famousCalibration.ts`. Keep it pure: no file I/O — tests
build the input `Sharp` from an in-memory RGBA buffer.

- [x] Add test `deprojectDisk is identity at axisRatio = 1` — output buffer byte-length + a sampled pixel equal the input for a small fixture (`.raw().toBuffer()` both sides).
- [x] Add test `deprojectDisk stretches the minor axis for a known b/a` — 100×100 source, axisRatio = 0.5, paDeg = 0 (major = image X, minor = image Y): output height ≈ 2× input, width unchanged (within rounding).
- [x] Add test `deprojectDisk stretches along the rotated minor axis for paDeg = 90` — minor = image X: output width ≈ 2× input.
- [x] Add test `deprojectDisk passes through (identity dimensions) when axisRatio < DEPROJECT_MIN_AXIS_RATIO` — axisRatio = 0.2: output dimensions == input dimensions.
- [x] Run `npm test -- deprojectDisk` → FAIL.
- [x] Implement against `sharp().affine(...)`.
- [x] Run `npm test -- deprojectDisk` → PASS. `npm run typecheck` → clean.
- [x] Commit.

## Task 5: Pure calibration derivation — `deriveFamousCalibration`

**Files:** `tools/famous/deriveFamousCalibration.ts` (create), `tools/famous/deriveFamousCalibration.test.ts` (create).

Takes the source-px `RecipeDisk` + the final `RecipeCrop` (the crop the
export applied) + the catalog axisRatio fallback, and returns the
normalized runtime `FamousCalibration`. This is where source px →
final-webp normalized coords happens, and where PA is rotated into the
final-image frame (`paDeg - crop.rotationDeg`, the same sense `cropExtract`
uses at `cropExtract.ts:77-84`).

**Signature:**

```ts
import type { RecipeCrop, RecipeDisk } from '../famous-curator/plugin/recipe';
import type { FamousCalibration } from '../../src/@types/loading/FamousMetaEntry';

export type DeriveCalibrationInput = {
  disk: RecipeDisk;
  crop: RecipeCrop;
  /** Catalog axisRatio fallback when disk.axisRatio is absent. */
  catalogAxisRatio: number;
  /** True when the shipped webp was deprojected (texture is face-on). */
  deprojected: boolean;
};

/** Pure. Source-px disk + final crop → normalized final-webp calibration. */
export function deriveFamousCalibration(input: DeriveCalibrationInput): FamousCalibration;
```

Geometry contract (the tests pin these — read `cropExtract.ts:66-88` for
the rotation transform and `RecipeCrop` at `recipe.ts:14-25`). The crop is
square (see invariant note), so half-width == half-height.

- **center**: map `disk.centerPx` (source px) into the crop's local frame
  using the same `R(-rotationDeg) · (P - cropCenter)` transform
  `cropExtract` applies (`cropExtract.ts:77-84`), then normalize to
  `[0,1]^2` within the crop rect: `u = (localX + width/2) / width`,
  `v = (localY + height/2) / height`. A nucleus at the crop centre → `[0.5, 0.5]`.
- **diskRadiusFrac**: `disk.radiusPx / (crop.width / 2)` — radius as a
  fraction of the final-image **half-width**.
- **paDeg**: `normalizePa(disk.paDeg - crop.rotationDeg)` into `[0,180)`.
  PA is the major-axis angle the runtime needs for the single correct tilt,
  whether or not the texture was deprojected.
- **axisRatio**: `disk.axisRatio ?? catalogAxisRatio`.
- **deprojected**: pass-through from input.

> Square-invariant: `RecipeCrop` enforces `width === height` (the curator
> footprint stays square). Derivation may assume it; do not add a separate
> half-height term.

- [ ] Add test `deriveFamousCalibration: centred nucleus, unrotated crop → center [0.5,0.5]`.
- [ ] Add test `deriveFamousCalibration: off-centre nucleus → expected normalized center` — a crop + a `centerPx` half-way to an edge; assert exact `[u,v]`.
- [ ] Add test `deriveFamousCalibration: diskRadiusFrac = radiusPx / (width/2)` — radiusPx 64 on a 256-wide crop → 0.5.
- [ ] Add test `deriveFamousCalibration: paDeg rotated into final frame` — `disk.paDeg = 40`, `crop.rotationDeg = 10` → 30; plus a wraparound (`disk.paDeg = 10`, `crop.rotationDeg = 30` → 160) to pin `[0,180)` normalization.
- [ ] Add test `deriveFamousCalibration: rotated crop maps the nucleus through R(-rotationDeg)` — non-zero `rotationDeg` + off-centre nucleus; assert the exact normalized center (compute the expected value by hand from `cropExtract.ts:77-84`).
- [ ] Add test `deriveFamousCalibration: axisRatio falls back to catalogAxisRatio when disk.axisRatio absent`.
- [ ] Add test `deriveFamousCalibration: deprojected flag passes through`.
- [ ] Run `npm test -- deriveFamousCalibration` → FAIL.
- [ ] Implement. Reuse the rotation math from `cropExtract.ts:77-84` (extract a tiny shared `rotateSourcePointIntoCrop` helper if the duplication is clean — otherwise inline with a citing comment; do not copy-paste the whole block). Add a local `normalizePa(deg)` that wraps into `[0,180)`.
- [ ] Run `npm test -- deriveFamousCalibration` → PASS. `npm run typecheck` → clean.
- [ ] Commit.

## Done-when

- `RecipeDisk` parses/serialises/validates; absent `disk` round-trips unchanged.
- `FamousCalibration` + `calibration?` compile and break no consumer.
- `DEPROJECT_MIN_AXIS_RATIO` is a single exported constant.
- `deprojectDisk` and `deriveFamousCalibration` are pure, fully tested, typecheck clean.
- No TODO/placeholder left in any new file.
