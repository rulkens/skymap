# Famous-galaxy Thumbnail Calibration — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the curator an in-app tool to pin each famous galaxy's thumbnail to its true on-sky geometry (centre / scale / rotation) and optionally deproject a tilted disk to face-on, with the runtime placing the quad from derived calibration — backward-compatible for every uncalibrated galaxy.
**Architecture:** Disk geometry is captured in the curator in **source-image pixels** (decoupled from the crop), persisted on the Recipe, and at export time **derived** into a normalized `FamousCalibration` written onto the existing `famous_meta.json` entry. Build-time deprojection is a one-time affine minor-axis stretch on the hi-res source before downsizing. `TexturedDiskSubsystem` reads `calibration` to offset/size/tilt the quad, falling back to today's path when absent.
**Tech Stack:** TS + Vite + React (curator UI), `sharp` (build pipeline image ops), raw WebGPU + the existing disk renderer (runtime), Vitest.

---

Master index for the **famous-galaxy thumbnail calibration** feature.
Source of truth is the approved spec:
[`docs/superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md`](../specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md).
Read the spec in full before starting any sub-plan.

Five executable sub-plans plus an ADR. Each is independently runnable by a
subagent, but they share a dependency order (below).

## Sub-plans

| # | File | Scope |
|---|------|-------|
| 1 | [`…-1-data-and-deproject.md`](2026-05-31-famous-galaxy-thumbnail-calibration-1-data-and-deproject.md) | Pure/foundational layer: `RecipeDisk` type + parse/serialise/validate; `FamousCalibration` + `calibration?` on `FamousMetaEntry`; `DEPROJECT_MIN_AXIS_RATIO`; pure deprojection-resample fn; pure calibration-derivation fn. |
| 2 | [`…-2-build-pipeline.md`](2026-05-31-famous-galaxy-thumbnail-calibration-2-build-pipeline.md) | Wire deprojection + derivation into the build: export route, `famousImageProcessor`, `buildFamous` (thread calibration onto `metaByIdx`). Round-trip fixture test. |
| 3 | [`…-3-curator-ui.md`](2026-05-31-famous-galaxy-thumbnail-calibration-3-curator-ui.md) | Disk-geometry overlay on `CropCanvas`, reducer state, three handles, deproject toggle, as-shot⇄deprojected preview, API plumbing. |
| 4 | [`…-4-runtime-placement.md`](2026-05-31-famous-galaxy-thumbnail-calibration-4-runtime-placement.md) | Extend `TexturedDiskSubsystem` to consume `calibration` (offset / size / tilt). Unit-test placement math. Fixes the latent double-foreshortening bug. |
| 5 | [`…-5-adr.md`](2026-05-31-famous-galaxy-thumbnail-calibration-5-adr.md) | One ADR: calibration lives on `famous_meta.json`, not `famous.bin`. |

## File-structure map (what each sub-plan creates / modifies)

**Plan 1 — data + pure functions**

- modify `tools/famous-curator/plugin/recipe.ts` — add `RecipeDisk` type, `disk?` on `Recipe`, parse/serialise/validate.
- modify `src/@types/loading/FamousMetaEntry.d.ts` — add `FamousCalibration` type + `calibration?`.
- create `src/data/famousCalibration.ts` — `DEPROJECT_MIN_AXIS_RATIO` constant (shared by curator-seed, pipeline guard, build).
- create `tools/famous/deprojectDisk.ts` — pure resample fn.
- create `tools/famous/deriveFamousCalibration.ts` — pure derivation fn.
- create/extend tests: `tests/famous-curator/recipe.test.ts`, `tools/famous/deprojectDisk.test.ts`, `tools/famous/deriveFamousCalibration.test.ts`, `tests/data/famousCalibration.test.ts`.

**Plan 2 — build pipeline**

- modify `tools/famous-curator/plugin/routes/export.ts` — deproject hi-res source when `disk.deproject`; derive + return calibration.
- modify `tools/famous/famousImageProcessor.ts` — document the no-double-stretch contract (read `disk`; do not re-stretch a canonical source).
- modify `tools/famous/buildFamous.ts` — load each curated recipe via `loadCuratedOverrides`, derive calibration, attach to `metaByIdx`.
- create/extend tests: `tools/famous/buildFamous.test.ts` (round-trip), `tools/famous/famousImageProcessor.test.ts`.

**Plan 3 — curator UI**

- modify `tools/famous-curator/ui/components/CropCanvas.tsx` — new overlay layer + three handles.
- modify `tools/famous-curator/ui/state.ts` — disk state + actions + deproject seed.
- modify `tools/famous-curator/ui/api.ts` — thread `disk` + `catalogAxisRatio` through `ProcessParams`/`ExportParams`; add deprojected-preview + calibration return shapes.
- modify `tools/famous-curator/ui/components/PreviewPane.tsx` — deprojected preview slot.
- modify `tools/famous-curator/ui/App.tsx` — wire disk state ↔ CropCanvas ↔ api.
- modify `tools/famous-curator/plugin/routes/export.ts` + `…/routes/process.ts` — accept `disk` in the body (export deproject behaviour is Plan 2; process deprojected-preview is Plan 3).
- modify `tools/famous-curator/ui/styles.css` — disk-handle styling.
- create/extend tests mirroring the above under `tests/famous-curator/`.

**Plan 4 — runtime placement**

- modify `src/services/engine/subsystems/texturedDiskSubsystem.ts` — read `calibration`, offset/size/tilt the quad.
- create `src/utils/galaxy/calibratedDiskPlacement.ts` — pure placement-math helpers.
- create `tests/utils/galaxy/calibratedDiskPlacement.test.ts`; extend `tests/services/engine/subsystems/texturedDiskSubsystem.test.ts`.

**Plan 5 — ADR**

- create `docs/adrs/0004-famous-calibration-on-meta-not-bin.md` (auto-numbered via the `/adr` skill; next free number is 0004).

## Execution order & dependencies

```
Plan 1  (types + pure fns)         ── foundation, no deps
   ├──► Plan 2  (build pipeline)   ── needs RecipeDisk, FamousCalibration,
   │                                   deprojectDisk, deriveFamousCalibration
   ├──► Plan 3  (curator UI)       ── needs RecipeDisk + DEPROJECT_MIN_AXIS_RATIO
   │                                   (writes the disk the pipeline consumes)
   └──► Plan 4  (runtime)          ── needs FamousCalibration + the meta field
Plan 5  (ADR)                      ── independent; do first or last
```

- **Plan 1 must land first.** Everything else imports its types / constants / pure functions.
- **Plans 2, 3, 4 are mutually independent in code** once Plan 1 is in — they can run in parallel subagents. Plan 2 consumes what Plan 3 *writes at curator runtime*, but Plan 2's build tests use fixture recipes, so there is no compile-time dependency between them.
- **Plan 2 and Plan 3 both touch `export.ts`.** If run in parallel, coordinate: Plan 3 owns the `disk` body field on `export.ts`/`process.ts` and the `process.ts` deprojected-preview; Plan 2 owns the export route's deproject + derive logic. Sequencing Plan 3 before Plan 2 avoids the collision; otherwise merge carefully.
- **Plan 4 is testable with fixture meta entries** and does not depend on Plans 2/3 in code. End-to-end visual verification (a real deprojected webp placed correctly) needs Plans 2+3 to have produced data.
- **Plan 5 (ADR)** has no code dependency.

## Cross-plan type/name consistency (do not diverge)

Fixed by the spec; must match byte-for-byte across all plans:

- `RecipeDisk` — curator working state, source-image pixels (Plan 1; consumed Plans 2+3).
- `FamousCalibration` — runtime derived, normalized to the final webp (Plan 1; written Plan 2; read Plan 4).
- `DEPROJECT_MIN_AXIS_RATIO = 0.3` — single named constant in `src/data/famousCalibration.ts` (Plan 1; used Plans 2+3+4).
- `diskRadiusFrac` — field on `FamousCalibration`: disk radius as a fraction of the final image **half-width**.
- `deprojected` — boolean on `FamousCalibration`: true when the shipped webp was stretched to face-on.
- All 2-element coordinates use `Vec2` from `src/@types/math/Vec2.d.ts` — never raw `[number, number]`.
- `type` aliases, never `interface`. Deep relative imports, no barrels. Didactic comments are the house style.
