/**
 * SkyCubemapCaptureRuntime — cross-frame memory for the black-hole lens's
 * amortized sky-cubemap capture (Task 12). `skyCubemapCaptureSchedule` is
 * pure, but its inputs (`lastCapturedAtMs`, the round-robin `frameIndex`, the
 * `bandJustEngaged` edge) need somewhere to live between frames —
 * `renderFrame` "owns no cross-frame state" by design (see its module
 * header), so this rides in `cameraRuntime` alongside the same
 * amortized-Resources pattern its sibling fields (`lastPose`,
 * `lastRenderedSimDays`, …) already follow. Single-writer: only
 * `renderFrame` reads or writes it.
 */

import type { CubeFace } from '../../rendering/CubeFace';
import type { Vec3 } from '../../math/Vec3';

export type SkyCubemapCaptureRuntime = {
  /** Wall-clock ms each face was last captured, for the schedule's staleness check. */
  lastCapturedAtMs: Map<CubeFace, number>;
  /** Monotonic per-frame counter driving the round-robin (`frameIndex % 6`). */
  frameIndex: number;
  /** The lensing band's active/inactive state last frame — `bandJustEngaged`'s edge. */
  wasBandActive: boolean;
  /** Camera position at the last FULL sweep (band entry or escape valve), for the movement check. `null` before the first sweep. */
  lastSweepCamPosMpc: Readonly<Vec3> | null;
};
