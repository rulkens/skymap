# Famous-galaxy thumbnail calibration — Plan 4: runtime placement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `texturedDiskSubsystem` to consume the optional `calibration` on each `FamousMetaEntry`: offset the disk so the **nucleus** lands on the catalog 3-D position, size it from `diskRadiusFrac` so the disk matches `diameterKpc`, and route deprojected textures through the existing PA/axisRatio tilt while rendering as-shot textures flat. Absent calibration → today's render path, bit-identical. This also resolves the latent double-foreshortening bug.
**Architecture:** Placement math is extracted into a pure, GPUDevice-free helper module so it's unit-testable; the subsystem's per-row planner calls it when emitting each `DiskInstance` for `Source.Famous` rows that carry calibration. The per-frame loop is otherwise unchanged except for the position/size/tilt values it feeds the disk.
**Tech Stack:** TypeScript, WebGPU runtime, Vitest.

---

## Read first

- Spec: "Problem" (the double-foreshortening explanation), "Components & data flow — unit 3", "Error/edge: no calibration / disk-without-deproject", "Testing — Runtime placement math / Backward-compat".
- Plan 1 — `FamousCalibration` shape (`center` normalized, `diskRadiusFrac`, `paDeg`, `axisRatio?`, `deprojected`).
- `src/services/engine/subsystems/texturedDiskSubsystem.ts` — full file (337 lines). The per-row planner loop (texturedDiskSubsystem.ts:169-275), the size/orientation reads (`sizeWorldMpc` from `paddedRadiusMpc`, texturedDiskSubsystem.ts:190; `ar`/`pa` from the catalog arrays, texturedDiskSubsystem.ts:191-192), the disks-only finite-orientation gate (texturedDiskSubsystem.ts:238-241), and the `stickyDisks.set(i, {...})` emission (texturedDiskSubsystem.ts:259-273). `famousMeta` arrives on the frame input and is already used for fetch ids (texturedDiskSubsystem.ts:126, 209).
- `src/@types/rendering/DiskInstance` — the emitted instance shape; this is what the disk renderer consumes (`x,y,z,sizeWorld,u0..v1,axisRatio,positionAngleDeg,fadeAlpha,hiResLayerIdx,hiResCrossfadeAlpha`). Read it; the calibrated offset must be applied to `x,y,z` (world position) and the size to `sizeWorld`, and tilt to `axisRatio`/`positionAngleDeg`.
- `src/@types/math/Vec3.d.ts` and `Vec2.d.ts` — vector aliases.

## Critical: the fallback-orientation exact-equality detector

`buildFamous.ts:94-115`'s comment documents that the renderer detects fallback (unknown) orientation by **exact float equality** with `fallbackOrientation()` output, and the subsystem's disks-only gate relies on finite `ar`/`pa` (texturedDiskSubsystem.ts:238-241). Do **not** change how catalog `ar`/`pa`/`diameterKpc` flow for uncalibrated rows, and do **not** perturb them by float math. The calibration path is **additive**: when `calibration` is present it overrides position/size/tilt; when absent, the catalog values must reach the `DiskInstance` byte-for-byte as they do today. Add a test asserting the no-calibration path is unchanged.

## The double-foreshortening fix (why deprojected → tilt, as-shot → flat)

- A **deprojected** texture is face-on (the Earth-viewing squash was removed at build time). The runtime must apply the **single** correct tilt = the existing PA + `axisRatio` path. One squash, correct.
- An **as-shot** texture already has the squash baked into its pixels. The runtime must render it **flat** (axisRatio 1, no PA tilt) so it isn't squashed twice. This is the fix.
- **No calibration** → unchanged from today (catalog PA/axisRatio tilt) — the current, slightly-wrong-but-backward-compatible behaviour we must not regress.

---

## Task 1: pure placement-math helpers

**Files:** `src/services/engine/subsystems/famousPlacement.ts` (create), `tests/services/engine/subsystems/famousPlacement.test.ts` (create)

**Signatures (confirm the world frame against `DiskInstance` + the disk shader while implementing):**

```ts
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FamousCalibration } from '../../../@types/loading/FamousMetaEntry';

// Disk world size so the DISK (not the framed image) spans diameterKpc.
// diskRadiusFrac == 1 (disk fills the frame) → size == catalog size.
// diskRadiusFrac == 0.5 (disk half-fills) → size must be 2× so the disk
// itself spans diameterKpc.
export function calibratedDiskSizeWorld(catalogSizeWorld: number, diskRadiusFrac: number): number;

// World offset that moves the disk so its NUCLEUS (calibration.center,
// normalized in the final webp) lands on the catalog 3-D position, given the
// disk's screen-aligned basis (right/up) and the full disk extent in world
// units.  center [0.5,0.5] → zero offset.
export function nucleusOffsetWorld(
  center: Vec2,
  diskSizeWorld: number,
  right: Readonly<Vec3>,
  up: Readonly<Vec3>,
): Vec3;

// Effective tilt the disk should render with.
//   deprojected → catalog/calibration PA + axisRatio (one correct squash)
//   as-shot     → flat (axisRatio 1, PA 0)
export function effectiveTilt(
  calibration: FamousCalibration,
  catalogAxisRatio: number,
): { positionAngleDeg: number; axisRatio: number };
```

**Behaviour:**
- `calibratedDiskSizeWorld`: `catalogSizeWorld / diskRadiusFrac`. Guard `diskRadiusFrac > 0` (return `catalogSizeWorld` or throw on 0 — document the choice; `deriveCalibration` never produces 0, but the guard documents intent).
- `nucleusOffsetWorld`: the normalized centre delta `(center - [0.5,0.5])` scaled by `diskSizeWorld` (the disk spans `±diskSizeWorld/2`, so a full half-frame delta of 0.5 maps to `diskSizeWorld/2`), projected onto `right`/`up`, **negated** so the nucleus moves onto the catalog point. `[0.5,0.5]` → `[0,0,0]`. Confirm sign against the shader's UV→corner convention.
- `effectiveTilt`: `deprojected` → `{ positionAngleDeg: calibration.paDeg, axisRatio: calibration.axisRatio ?? catalogAxisRatio }`; `!deprojected` → `{ positionAngleDeg: 0, axisRatio: 1 }`.

- [ ] Write failing test `calibratedDiskSizeWorld keeps a full-frame disk at catalog size` — `diskRadiusFrac 1` → returns `catalogSizeWorld`.
- [ ] Write failing test `calibratedDiskSizeWorld doubles a half-frame disk` — `diskRadiusFrac 0.5` → `2 * catalogSizeWorld`.
- [ ] Write failing test `nucleusOffsetWorld is zero for a centred nucleus` — `center [0.5,0.5]` → `[0,0,0]`.
- [ ] Write failing test `nucleusOffsetWorld moves an off-centre nucleus along the basis` — `center [0.25,0.5]`, `right=[1,0,0]`, `up=[0,1,0]`, known `diskSizeWorld` → a hand-computed offset along `right` (sign matches "nucleus onto catalog point").
- [ ] Write failing test `effectiveTilt applies PA+axisRatio for a deprojected texture`.
- [ ] Write failing test `effectiveTilt renders an as-shot texture flat` — `deprojected false` → `axisRatio 1`, `positionAngleDeg 0`.
- [ ] Write failing test `effectiveTilt falls back to catalog axisRatio when calibration.axisRatio absent` (deprojected case).
- [ ] `npm test -- famousPlacement` → all FAIL.
- [ ] Implement. Import `Vec2`, `Vec3`, `FamousCalibration` deep-relative.
- [ ] `npm test -- famousPlacement` → all PASS. `npm run typecheck` → clean. Commit.

## Task 2: wire placement helpers into texturedDiskSubsystem

**Files:** `src/services/engine/subsystems/texturedDiskSubsystem.ts` (modify), `tests/services/engine/subsystems/texturedDiskSubsystem.calibration.test.ts` (create)

**Behaviour:** In the per-row planner (texturedDiskSubsystem.ts:169-275), for `Source.Famous` rows read `famousMeta[i]?.calibration`. When present:
- size: `calibratedDiskSizeWorld(sizeWorldMpc, calibration.diskRadiusFrac)` instead of the raw `sizeWorldMpc` (texturedDiskSubsystem.ts:190).
- position: add `nucleusOffsetWorld(...)` to `x,y,z`. The `right`/`up` basis is screen-aligned and camera-dependent; the disk shader builds the billboard each frame, so the offset that moves the *nucleus* onto the catalog point must use the same basis the shader uses. **Confirm** whether the basis is available CPU-side in the planner or whether the offset must instead be passed as a UV/local-space nucleus offset that the shader applies. Document the decision; if shader-side is required, that is a new `DiskInstance` field + a small shader change (call it out as a sub-step and keep it minimal — see the "pause before implementing" memory: prefer the simplest correct placement).
- tilt: `effectiveTilt(calibration, ar)` → feeds `axisRatio` + `positionAngleDeg` on the emitted `DiskInstance` (texturedDiskSubsystem.ts:268-269) instead of the raw catalog `ar`/`pa`.

When `calibration` is absent, the existing catalog-driven path runs unchanged.

- [ ] Write failing test `calibrated size scales the emitted disk` — a `famousMeta` entry with `calibration.diskRadiusFrac 0.5` on a `Source.Famous` row → the emitted `DiskInstance.sizeWorld` is 2× the uncalibrated value.
- [ ] Write failing test `uncalibrated rows use catalog size and orientation` — entry without `calibration` → `sizeWorld == paddedRadiusMpc(dKpc)*2`, `axisRatio == catalog ar`, `positionAngleDeg == catalog pa` (backward-compat / exact-equality guard).
- [ ] Write failing test `a deprojected entry keeps PA+axisRatio tilt` — emitted `axisRatio`/`positionAngleDeg` match `effectiveTilt` for the deprojected case.
- [ ] Write failing test `an as-shot entry renders flat` — emitted `axisRatio === 1`, `positionAngleDeg === 0`.
- [ ] Write failing test `calibration only affects Source.Famous rows` — a non-Famous source is never offset/resized by calibration even if a same-index meta entry exists.
- [ ] `npm test -- texturedDiskSubsystem.calibration` → FAIL. (Drive `runFrame` with a stub `atlas` + `famousMeta`, as existing texturedDiskSubsystem tests do — read them for the harness shape.)
- [ ] Implement, reusing Task 1 helpers. Do not disturb the catalog-value flow for uncalibrated entries or the finite-orientation gate.
- [ ] `npm test -- texturedDiskSubsystem.calibration` → PASS. Confirm existing `npm test -- texturedDiskSubsystem` stays green. `npm run typecheck` → clean. Commit.

## Task 3: backward-compat regression guard

**Files:** `tests/services/engine/subsystems/texturedDiskSubsystem.calibration.test.ts` (extend)

**Behaviour (spec "Testing — Backward-compat"):** A meta set with no `calibration` produces `DiskInstance`s identical to the pre-feature path — including the exact-float catalog `ar`/`pa` the fallback-orientation detector depends on.

- [ ] Write failing test `no-calibration disks are identical to the pre-feature path` — run `runFrame` over a Famous cloud whose `famousMeta` entries have no `calibration`; assert each emitted disk's `x,y,z,sizeWorld,axisRatio,positionAngleDeg` equal the values computed directly from the catalog arrays (no float perturbation). Include a row carrying fallback-sentinel `ar`/`pa` and assert exact equality survives.
- [ ] `npm test -- texturedDiskSubsystem.calibration` → PASS (confirms no regression).
- [ ] `npm run typecheck` → clean. Full `npm test` green. Commit.

## Manual verification (renderer)

After tests pass, ask the user to confirm visually with the dev server (already running): a calibrated galaxy (M51) sits with its nucleus on the catalog point at the right size; a deprojected disk no longer double-squashes when the camera lines up with Earth's sightline; an as-shot galaxy (Tadpole) renders flat with its tail intact; an uncalibrated galaxy is unchanged.

## Definition of done for Plan 4

- [ ] Pure placement helpers (`calibratedDiskSizeWorld`, `nucleusOffsetWorld`, `effectiveTilt`) unit-tested.
- [ ] `texturedDiskSubsystem` offsets/sizes/tilts from `calibration` on Famous rows; deprojected → tilt, as-shot → flat.
- [ ] No-calibration path is provably unchanged (regression test + exact-equality preserved).
- [ ] `npm run typecheck` clean; full `npm test` green.
