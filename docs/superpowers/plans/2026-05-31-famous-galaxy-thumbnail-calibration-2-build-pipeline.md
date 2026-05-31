# Famous-galaxy thumbnail calibration — Plan 2: build pipeline wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the pure deprojection + calibration-derivation functions from Plan 1 into the build: the export route deprojects the hi-res source when requested and derives `FamousCalibration`; `buildFamous` threads the derived calibration onto each `famous_meta.json` entry. A round-trip fixture test proves a recipe with `disk` flows end-to-end into a meta entry carrying `calibration`.
**Architecture:** The export route already runs crop+rotate → webp and writes `<id>/recipe.json`. We extend it to (a) persist `disk` on the recipe, (b) optionally affine-stretch the hi-res cropped source to face-on before the final downsize (Plan 1 `deprojectDisk`), and (c) derive `FamousCalibration` (Plan 1 `deriveFamousCalibration`) from the disk + final crop. `buildFamous` reads each galaxy's recipe and derives its calibration onto the meta entry it already writes.
**Tech Stack:** TypeScript, Vite curator plugin (Node + sharp), Vitest.

---

## Read first

- Spec: "Components & data flow" diagram, "Error handling & edge cases", "Testing — Round-trip".
- Plan 1 — the contracts for `deprojectDisk`, `deriveFamousCalibration`, `RecipeDisk`, `FamousCalibration`, `DEPROJECT_MIN_AXIS_RATIO`.
- `tools/famous-curator/plugin/routes/export.ts` — full file (204 lines). `ExportBody` (export.ts:48-55), `ExportResult` (export.ts:57-66), `handleExport` (export.ts:68-204). The hi-res crop stage is `rotatedExtract(sourcePath, body.crop)` → `sourcePipeline` (export.ts:95), then the lossless downsize `.resize(FULL_PX, FULL_PX, { fit: 'inside' })` (export.ts:96-99). The recipe is built + written at export.ts:144-154 via `serialiseRecipe`. Note there is no `starnet`-as-function in this route — star removal happens upstream in `/api/process`; this route works off `source.png` + `starless.png` in the session dir.
- `tools/famous-curator/plugin/cropExtract.ts` — `rotatedExtract` produces the hi-res crop in the disk's source-pixel frame; deprojection runs on that crop **before** the `.resize` downsize.
- `tools/famous/famousImageProcessor.ts` (180 lines) — the standalone (non-curator) DESI-cutout processor (`sampleCornerColor` / `applyTransparency` / `applyRadialFade`). It is **pure pixel ops, not the curator export path**. Deprojection does **not** belong here; the calibrated thumbnails flow through the curator export route. Confirm and leave this file untouched unless a shared deproject helper is genuinely reused (it isn't expected to be).
- `tools/famous/buildFamous.ts` — full file (154 lines). The `metaByIdx` element type (buildFamous.ts:73-79), the `metaByIdx.push({...})` block (buildFamous.ts:124-130), and the `famous_meta.json` write (buildFamous.ts:137). Curated recipes live under `public/images/famous-curated/<id>/recipe.json` (see export.ts:79 `curatedGalaxyDir`).

## Where deprojection slots in (pipeline order)

```
source.png (hi-res)
  → rotatedExtract(body.crop)                      (existing, export.ts:95)
  → if effective calibration.deprojected:
        deprojectDisk(...)                       (NEW — on the hi-res crop, before resize)
  → .resize(FULL_PX, FULL_PX, {fit:'inside'})      (existing downsize, export.ts:96-99)
  → webp                                           (existing)
derive FamousCalibration from RecipeDisk + body.crop   (NEW)
  → returned in the ExportResult
recipe.json carries `disk`                         (NEW — so re-load restores the overlay)
```

> The spec says deproject "on the hi-res source before downsizing". `rotatedExtract` produces the hi-res crop already in the disk's frame; running `deprojectDisk` on that crop (not the whole untouched source) keeps the stretch axis aligned with the extracted disk and avoids re-cropping. The disk geometry handed to `deprojectDisk` must be expressed in the **post-crop** frame — either map `disk.centerPx`/`paDeg` through the crop transform first (reuse the cropExtract map at cropExtract.ts:66-88) or pass the crop so the fn can. The implementer must verify the frame and document the choice in a comment. Note the deproject path stretches `source.png`; whether `starless.png` (export.ts:103-119) must be stretched in lockstep is a sub-decision — confirm and document (the safe answer: deproject both with identical parameters so source/starless/alpha stay registered).

---

## Task 1: accept `disk` in the export request + persist it on the recipe

**Files:** `tools/famous-curator/plugin/routes/export.ts` (modify), `tests/tools/famous-curator/export.disk.test.ts` (create)

**Contract:** `ExportBody` (export.ts:48-55) gains `disk?: RecipeDisk` and `catalogAxisRatio?: number` (the latter for derivation in Task 3). The recipe built at export.ts:145-153 carries `disk` so a re-load restores the overlay. Validate `disk` when present (delegate to the same field checks `parseRecipe` uses — Plan 1 Task 2).

- [x] Write failing test `handleExport persists disk onto the recipe` — call `handleExport` with a `sessionDirOverride` (the route's existing test hook, export.ts:71-72) + a body carrying a `disk`; parse the written `recipe.json` via `parseRecipe` and assert its `disk` matches. (Mirror any existing export route test for the fixture/session setup; the route already supports a tmp session dir.)
- [x] Write failing test `handleExport omits disk from the recipe when absent` — body without `disk` → recipe `disk === undefined`.
- [x] `npm test -- export.disk` → FAIL.
- [x] Add `disk?: RecipeDisk` + `catalogAxisRatio?: number` to `ExportBody`; include `disk` in the `Recipe` object built at export.ts:145-153. _(validation extracted to shared `validateRecipeDisk`; test isolation via tmp `repoRoot`, not a new override)_
- [x] `npm test -- export.disk` → PASS.
- [x] `npm run typecheck` → clean. Commit.

## Task 2: deproject the hi-res crop when requested

**Files:** `tools/famous-curator/plugin/routes/export.ts` (modify), `tests/tools/famous-curator/export.deproject.test.ts` (create)

**Behaviour:** When the effective calibration is `deprojected` (`disk.deproject && effectiveAxisRatio >= DEPROJECT_MIN_AXIS_RATIO`, where `effectiveAxisRatio = disk.axisRatio ?? body.catalogAxisRatio`), insert `deprojectDisk` between `rotatedExtract` (export.ts:95) and the `.resize` downsize (export.ts:96-99). When `disk` is absent or `deproject` is false, the produced webps are byte-identical to today. When **forced on but too edge-on**, ship as-shot and **log a skip** (spec edge case — "no silent 6× smear").

- [x] Write failing test `handleExport deprojects a clean tilted disk` — a fixture `source.png` with a known tilted feature, `disk.deproject = true`, effective `axisRatio = 0.5`; assert the output `source.webp`'s decoded aspect reflects the face-on stretch (decode with sharp in the test). Prefer asserting observable output over spying on internals.
- [x] Write failing test `handleExport ships as-shot and logs a skip when forced on but too edge-on` — `disk.deproject = true`, effective `axisRatio = 0.2`; assert the output equals the non-deprojected pipeline output AND a skip is surfaced (capture console or assert the derived calibration `deprojected === false`). _(asserts the `console.warn` threshold skip fires, and does NOT fire when the toggle is off)_
- [x] Write failing test `handleExport is unchanged when deproject is off` — `disk.deproject = false` → output equals today's pipeline.
- [x] `npm test -- export.deproject` → FAIL.
- [x] Wire `deprojectDisk` (Plan 1) into the pipeline guarded by the same `deprojected` predicate. Import `DEPROJECT_MIN_AXIS_RATIO`. Apply identically to `source` (and `starless` per the frame note above). _(starless verified in-crop-frame via process.ts; both share `effectivePaDeg`. Band single-sourced via `willDeproject`.)_
- [x] `npm test -- export.deproject` → PASS.
- [x] `npm run typecheck` → clean. Commit.

## Task 3: derive + return `FamousCalibration` from the export route

**Files:** `tools/famous-curator/plugin/routes/export.ts` (modify), `tests/tools/famous-curator/export.calibration.test.ts` (create)

**Behaviour:** After the final crop is known, call `deriveFamousCalibration(disk, body.crop, body.catalogAxisRatio)` and add the result to `ExportResult` (export.ts:57-66). When `disk` is absent, `calibration` is absent on the result.

> `deriveFamousCalibration` needs `catalogAxisRatio` for the fallback. The route doesn't otherwise read the catalog row, so `catalogAxisRatio` comes in via the request body (Task 1). The curator already has the catalog b/a (Plan 3 threads it). Document this.

- [x] Write failing test `handleExport returns derived calibration for a disk` — body with `disk` + `crop` + `catalogAxisRatio`; assert `result.calibration` deep-equals `deriveFamousCalibration({ disk, crop, catalogAxisRatio, deprojected })` (the object-arg signature from Plan 1; centre normalized, `diskRadiusFrac`, PA rotated, `deprojected`).
- [x] Write failing test `handleExport returns no calibration without a disk` → `result.calibration === undefined`.
- [x] `npm test -- export.calibration` → FAIL.
- [x] Add `calibration?: FamousCalibration` to `ExportResult`; call `deriveFamousCalibration` and populate it. (Decision: the build re-derives from the recipe `disk` rather than reading a persisted calibration, so the recipe stays the single source of truth — see Task 4.) _(catalogAxisRatio = `body.catalogAxisRatio ?? disk.axisRatio`; derives only when defined.)_
- [x] `npm test -- export.calibration` → PASS.
- [x] `npm run typecheck` → clean. Commit.

## Task 4: thread `calibration` onto `famous_meta.json` in `buildFamous`

**Files:** `tools/famous/buildFamous.ts` (modify), `tests/tools/famous/buildFamous.calibration.test.ts` (create)

**Behaviour:** For each entry, if a recipe with a `disk` exists at `public/images/famous-curated/<id>/recipe.json`, derive its `FamousCalibration` (Plan 1 `deriveFamousCalibration`, using the recipe's `crop` + `disk` + the entry's resolved `axisRatio`) and attach it as `calibration` on the object pushed at buildFamous.ts:124-130. The `metaByIdx` element type (buildFamous.ts:73-79) gains `calibration?: FamousCalibration`. Entries with no recipe `disk` get no `calibration` (current behaviour). The `famous.bin` encode/write (buildFamous.ts:134-135) is untouched — **no format bump**.

> A missing recipe file is the common case (most famous galaxies are uncalibrated) and must not throw. Guard the read; an unreadable/legacy recipe → no calibration, not a crash. For the `axisRatio` fallback use the value already computed for the row (`cloud.axisRatio[i]`, baked at buildFamous.ts:108-115).

- [x] Write failing test `buildFamous attaches calibration when a recipe has a disk` — fixture: one entry whose recipe (written to a tmp famous-curated dir) carries a `disk`; run the meta-assembly path; assert the meta object has `calibration` deep-equal to the derived value. (Extract the meta-assembly into a pure helper, e.g. `assembleFamousMeta(entries, axisRatios, readRecipe)`, if `main()` is awkward to drive — document the extraction.) _(extracted exported `assembleFamousMeta` + crash-proof `readCuratedRecipe`; meta typed as canonical `FamousMetaEntry[]`)_
- [x] Write failing test `buildFamous omits calibration when no recipe disk` — entry with no recipe / no `disk` → `calibration === undefined`.
- [x] Write failing test `buildFamous does not throw on a missing recipe file` — entry whose recipe path doesn't exist → no calibration, no throw. _(plus a corrupt-JSON case → undefined + console.warn)_
- [x] `npm test -- buildFamous.calibration` → FAIL.
- [x] Implement: locate each recipe via the curated path helper, parse with `parseRecipe`, derive with `deriveFamousCalibration`, attach. Use existing path helpers; do not hard-code `data/raw/...` or `public/...` strings where a helper exists (registry/path-helper rule). _(re-derives `deprojected` via the shared `willDeproject` band so the meta flag matches the shipped webp)_
- [x] `npm test -- buildFamous.calibration` → PASS.
- [x] `npm run typecheck` → clean. Commit.

## Task 5: end-to-end round-trip fixture test

**Files:** `tests/tools/famous-curator/calibration.roundtrip.test.ts` (create)

**Behaviour (spec "Testing — Round-trip"):** A recipe with a `disk` → `buildFamous` meta assembly → a meta entry carrying `calibration` whose values match `deriveFamousCalibration` of the original disk + crop. The integration test the per-stage unit tests don't cover end-to-end.

- [x] Write failing test `a disk recipe round-trips into famous_meta calibration` — construct a recipe with a `disk`, serialise it (Plan 1 `serialiseRecipe`) to a tmp curated dir, run the Task 4 meta-assembly helper, assert the resulting entry's `calibration` equals `deriveFamousCalibration(disk, crop, axisRatio)`. _(plus an absent-disk round-trip → calibration undefined; exercises the REAL `readCuratedRecipe`, not an injected fake)_
- [x] `npm test -- calibration.roundtrip` → FAIL then PASS once Tasks 1-4 are in.
- [x] `npm run typecheck` → clean. Full `npm test` green. Commit.

## Definition of done for Plan 2

- [x] Export route accepts + persists `disk`, deprojects when (and only when) appropriate, logs a skip for forced-but-too-edge-on, and returns derived `calibration`.
- [x] `buildFamous` attaches `calibration` to meta entries from recipe disks; no `famous.bin` format change; resilient to missing recipes.
- [x] Round-trip fixture green.
- [x] `npm run typecheck` clean; full `npm test` green (1872 tests / 293 files).
