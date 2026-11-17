# ADR 0015 — The Camera Is Organised by Concern Modules; `utils/camera` Holds Only What Others Read

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decision-makers:** project owner, Claude
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 0014, `tests/conventions/concernFolderShape.test.ts`

## Context

The camera lived in three flat homes: `src/services/engine/camera/` (47 files plus 19 in `rungs/`),
`src/utils/camera/` (125 one-function files) and `src/services/camera/` (2 files). Following one camera
arm meant opening all three: the site arm's row sat in `rungs/`, its pose conversions, floors and
gesture register in `utils/camera/`, beside frustum maths the renderers read. Nothing in the tree said
which helpers belonged to which arm, which were the camera's internals, and which were a library
twenty Layers import.

ADR 0014 solved the same problem for Layers, and explicitly left core's `utils/` grouped by kind. The
camera is the case that rule did not foresee: most of `utils/camera` was never a shared library. An
import scan at `74d019346` found 53 of its 125 files read only from inside the camera trees, and two
that imported `services/` (a layering inversion).

## Decision

**The camera is a set of concern modules under `src/services/engine/camera/`, and `src/utils/camera/`
keeps only what code outside the camera reads.** One fact places every file: does anything outside the
camera trees import it (directly, or through a shared util that does)?

- **Yes** → `src/utils/camera/<area>/`, an area named for what it computes (`projection/`, `frustum/`,
  `orbitPose/`, `bodyCompose/`, `viewRig/`, `terrain/`, …). These stay one function per file.
- **No** → the camera module that owns it, in that module's `utils/`. A helper several modules share gets
  a module of its own (`orientation/`), never a bag.

The engine tree reads like a Layer: root files the engine calls (`stepCameraRuntime`,
`seedCameraRuntime`, `composeControlSchemes`, `assembleOrbitCamera`), then one folder per concern —
`arms/` (the arm table, with `world/`, `body/`, `site/`, `sky/` sub-modules), `orientation/`, `input/`,
`drivers/`, `clips/`, `framing/`, `bodyFrame/`, `lens/`, `debug/`.

ADR 0014's cap and bag-name ban apply to both trees: no folder holds more than 15 files directly, and
none is named `helpers`, `misc`, `common`, `shared` or `other`. Layer role-folder rules do not apply.

**Not decided here:** `src/@types/camera/` (68 files) and `src/data/camera/` (20) — a follow-up applies
the same placement rule to them.

## Consequences

### Positive
- One arm, one folder: `arms/site/` holds the site arm's row, guard and every helper only it uses.
- `utils/camera` is an honest library: everything in it has a reader outside the camera.
- The one `utils → services` inversion (`linkedPoseToWorld`) is gone; it lives in `arms/utils/`.

### Negative
- A helper that gains its first outside reader moves from its module to `utils/camera/<area>/`.
- Paths grow (`arms/body/gesture/utils/surfaceZoomStep.ts`).

### Neutral / forward-looking
- A new arm is a new `arms/<kind>/` folder plus its row in `CAMERA_ARMS`.

## References

- ADR 0014 (Layers organised by concern modules)
- The re-org PR and its move manifest (177 moves, `npm run move-files`)
