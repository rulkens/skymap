# Move scaleFadeBands + its anchor constants to src/data

**Origin:** review of the GC approach-fade fix (worktree-tame-galactic-center-blowout). User ruling 2026-08-31: separate PR, after that branch merges.

`SCALE_FADE_BANDS` (src/services/engine/presentation/scaleFadeBands.ts) is a declarative table — "transitions AS DATA" per its own header — and belongs under `src/data/` (precedent: label configs → `src/data/labels/`). It can't move alone: several rows share a source with engine constants BY IMPORT so pop-free invariants can't drift, and `data/` must not import from `services/`. So the constants move with it.

## Scope (exactly these, no repo-wide constant hunt)

- `FOREGROUND_MAX_DISTANCE_MPC` (engine/frame/foregroundMaxDistance.ts) — declared regime threshold → data.
- `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (engine/frame/solarSystemLabelMaxDistance.ts) — layer gate distance → data.
- `BODY_GLINT_MAX_PX` (engine/frame/partitionBodiesByPresentation.ts) — partition threshold → data. The partition *function* stays in engine/frame; extracting the constant also fixes that file exporting both a function and a constant (one-symbol convention).
- `MILKY_WAY_RADIUS_MPC` (galaxyGenerator/v1/milkyWayCalibration.ts) — physical fact trapped in v1, which is slated for deletion; needs a real home regardless.
- Then `scaleFadeBands.ts` itself → e.g. `src/data/presentation/` (destination folder name open).

## How

`npm run move-files` / `npm run refactor -- move` per move (imports auto-rewritten, tests mirror dragged along); grep for `.wesl` `package::` and string-literal paths afterwards. Verify `src/data` ends up importing nothing from `src/services`.
