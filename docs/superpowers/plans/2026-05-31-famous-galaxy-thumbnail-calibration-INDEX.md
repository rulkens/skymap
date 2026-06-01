# Famous-galaxy Thumbnail Calibration — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the curator an in-app tool to pin each famous galaxy's thumbnail to its true on-sky geometry (centre / scale / rotation) and optionally deproject a tilted disk to face-on, with the runtime placing the quad from derived calibration — backward-compatible for every uncalibrated galaxy.
**Architecture:** Disk geometry is captured in the curator in **source-image pixels** (decoupled from the crop), persisted on the Recipe, and at export time **derived** into a normalized `FamousCalibration` written onto the existing `famous_meta.json` entry. Build-time deprojection is a one-time affine minor-axis stretch on the hi-res source before downsizing. `texturedDiskSubsystem` reads `calibration` to offset/size/tilt the quad, falling back to today's path when absent. A debug ring overlay aids visual verification.
**Tech Stack:** TS + Vite + React (curator UI), `sharp` (build-pipeline image ops), raw WebGPU + the existing disk renderer (runtime), Vitest.

---

Source of truth is the approved spec:
[`docs/superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md`](../specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md).
Read the spec in full before starting any sub-plan.

Six executable sub-plans. Each is independently runnable by a subagent, but they
share a dependency order (below).

## Sub-plans

| # | File | Scope |
|---|------|-------|
| 1 | [`…-1-data-and-deproject.md`](2026-05-31-famous-galaxy-thumbnail-calibration-1-data-and-deproject.md) | Pure/foundational layer: `RecipeDisk` type + parse/serialise/validate; `FamousCalibration` + `calibration?` on `FamousMetaEntry`; `DEPROJECT_MIN_AXIS_RATIO`; pure `deprojectDisk` resample; pure `deriveFamousCalibration`. |
| 2 | [`…-2-build-pipeline.md`](2026-05-31-famous-galaxy-thumbnail-calibration-2-build-pipeline.md) | Wire deprojection + derivation into the build: export route (persist `disk`, deproject hi-res, return calibration), `buildFamous` (thread calibration onto `metaByIdx`). Round-trip fixture test. |
| 3 | [`…-3-curator-ui.md`](2026-05-31-famous-galaxy-thumbnail-calibration-3-curator-ui.md) | Disk-geometry overlay on `CropCanvas`, reducer `disk` slice, three handles, deproject toggle, as-shot⇄deprojected preview, API plumbing. |
| 4 | [`…-4-runtime-placement.md`](2026-05-31-famous-galaxy-thumbnail-calibration-4-runtime-placement.md) | Extend `texturedDiskSubsystem` to consume `calibration` (offset / size / tilt). Pure placement helpers + tests. Fixes the latent double-foreshortening bug. |
| 5 | [`…-5-debug-ring.md`](2026-05-31-famous-galaxy-thumbnail-calibration-5-debug-ring.md) | Procedural-disk radius ring debug overlay for the selected galaxy (verification aid). |
| 6 | [`…-6-adr.md`](2026-05-31-famous-galaxy-thumbnail-calibration-6-adr.md) | ADR: calibration lives on `famous_meta.json`, not `famous.bin`. |

## File-structure map (what each sub-plan creates / modifies)

**Plan 1 — data + pure functions**

- modify `tools/famous-curator/plugin/recipe.ts` — add `RecipeDisk` type, `disk?` on `Recipe`, parse/serialise/validate.
- modify `src/@types/loading/FamousMetaEntry.d.ts` — add `FamousCalibration` type + `calibration?`.
- create `src/data/famousCalibration.ts` — `DEPROJECT_MIN_AXIS_RATIO` constant (shared by curator-seed, pipeline guard, build).
- create `tools/famous/deprojectDisk.ts` — pure resample fn.
- create `tools/famous/deriveFamousCalibration.ts` — pure derivation fn.
- create/extend tests: `tests/famous-curator/recipe.test.ts`, `tools/famous/deprojectDisk.test.ts`, `tools/famous/deriveFamousCalibration.test.ts`, `tests/data/famousCalibration.test.ts`.

**Plan 2 — build pipeline**

- modify `tools/famous-curator/plugin/routes/export.ts` — persist `disk` on the recipe; deproject hi-res source when `disk.deproject`; derive + return calibration.
- modify `tools/famous/buildFamous.ts` — load each curated recipe, `deriveFamousCalibration`, attach to `metaByIdx` (`buildFamous.ts:124-137`).
- create/extend tests: `tools/famous-curator/export.*.test.ts`, `tools/famous/buildFamous.calibration.test.ts`, `calibration.roundtrip.test.ts`.

**Plan 3 — curator UI**

- modify `tools/famous-curator/ui/state.ts` — `disk` slice + actions + deproject seed.
- create `tools/famous-curator/ui/diskOverlay.ts` — pure overlay geometry helpers (`diskFromDrag`, `minorAxisHandle`, `axisRatioFromMinorDrag`).
- modify `tools/famous-curator/ui/components/CropCanvas.tsx` — new overlay layer + three handles.
- modify `tools/famous-curator/ui/components/{PreviewPane,MetadataForm}.tsx` — deproject toggle + face-on preview.
- modify `tools/famous-curator/ui/api.ts`, `tools/famous-curator/ui/App.tsx` — thread `disk` on process/export + re-hydrate on resume.
- create/extend tests: `tests/famous-curator/state.test.ts`, `tests/famous-curator/diskOverlay.test.ts`.

**Plan 4 — runtime placement**

- create `src/services/engine/subsystems/famousPlacement.ts` — pure placement helpers (`calibratedDiskSizeWorld`, `nucleusOffsetWorld`, `effectiveTilt`).
- modify `src/services/engine/subsystems/texturedDiskSubsystem.ts` — apply calibration in the per-row planner (`:169-275`).
- create `tests/services/engine/subsystems/famousPlacement.test.ts`; create `tests/services/engine/subsystems/texturedDiskSubsystem.calibration.test.ts`.

**Plan 5 — debug ring**

- modify debug settings plumbing (`src/data/defaults.ts`, settings type/table, `DebugPanel.tsx`, `App.tsx`) — mirror `showPickBuffer`.
- create `src/services/gpu/passes/diskRadiusRing.ts` + `src/services/gpu/shaders/diskRadiusRing/*.wesl` + `src/@types/rendering/DiskRadiusRing.d.ts`.
- modify `src/services/engine/frame/runFrame.ts`, `src/services/engine/phases/initGpu.ts`.

**Plan 6 — ADR**

- create `docs/adrs/0004-famous-calibration-on-meta-not-bin.md` (auto-numbered via the `/adr` skill; next free number is 0004).

## Execution order & dependencies

```
Plan 1  (types + pure fns)         ── foundation, no deps
   ├──► Plan 2  (build pipeline)   ── needs RecipeDisk, FamousCalibration,
   │                                   deprojectDisk, deriveFamousCalibration
   ├──► Plan 3  (curator UI)       ── needs RecipeDisk + DEPROJECT_MIN_AXIS_RATIO
   │                                   (writes the disk the pipeline consumes)
   └──► Plan 4  (runtime)          ── needs FamousCalibration + the meta field
Plan 5  (debug ring)               ── independent; pair with Plan 4 for verification
Plan 6  (ADR)                      ── independent; do last
```

- **Plan 1 must land first.** Everything else imports its types / constants / pure functions.
- **Plans 2, 3, 4 are mutually independent in code** once Plan 1 is in — they can run in parallel subagents. Plan 2 consumes what Plan 3 *writes at curator runtime*, but Plan 2's build tests use fixture recipes, so there is no compile-time dependency between them.
- **Plan 2 and Plan 3 both touch `export.ts` / `api.ts`.** If run in parallel, sequence Plan 3 after Plan 2 (or merge carefully): Plan 2 owns the `disk?` field on `ExportBody`/`ExportParams` + the export deproject + derive logic; Plan 3 adds the process-route `disk` body + the deprojected preview wiring.
- **Plan 4 is testable with fixture meta entries** and does not depend on Plans 2/3 in code. End-to-end visual verification (a real deprojected webp placed correctly) needs Plans 2+3 to have produced data.
- **Plan 5 (debug ring)** is a standalone dev aid; no code dependency, but most useful executed alongside Plan 4 for visual verification.
- **Plan 6 (ADR)** has no code dependency.

## Cross-plan type/name consistency (do not diverge)

Fixed by the spec; must match across all plans:

- `RecipeDisk` — curator working state, source-image pixels (Plan 1; consumed Plans 2+3).
- `FamousCalibration` — runtime derived, normalized to the final webp (Plan 1; written Plan 2; read Plan 4).
- `DEPROJECT_MIN_AXIS_RATIO = 0.3` — single named constant in `src/data/famousCalibration.ts` (Plan 1; used Plans 2+3).
- `deprojectDisk` — `tools/famous/deprojectDisk.ts`, pure resample (Plan 1; used Plan 2).
- `deriveFamousCalibration` — `tools/famous/deriveFamousCalibration.ts`, object-arg signature `{ disk, crop, catalogAxisRatio, deprojected }` (Plan 1; used Plan 2).
- `calibratedDiskSizeWorld` / `nucleusOffsetWorld` / `effectiveTilt` — `src/services/engine/subsystems/famousPlacement.ts` (Plan 4).
- `diskRadiusFrac` — field on `FamousCalibration`: disk radius as a fraction of the final image **half-width**.
- `deprojected` — boolean on `FamousCalibration`: true when the shipped webp was stretched to face-on.
- All 2-element coordinates use `Vec2` from `src/@types/math/Vec2.d.ts`; 3-element use `Vec3`. Never raw tuples.
- `type` aliases, never `interface`. Deep relative imports, no barrels. Didactic comments are the house style.

## Status

- [x] Plan 1 — data & deprojection
- [x] Plan 2 — build pipeline
- [x] Plan 3 — curator UI (code complete; visual verification pending)
- [x] Plan 4 — runtime placement (code complete; visual verification pending)
- [x] Plan 5 — debug ring (code complete; visual verification pending)
- [x] Plan 6 — ADR
