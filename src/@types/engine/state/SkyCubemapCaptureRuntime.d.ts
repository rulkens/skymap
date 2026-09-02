/**
 * SkyCubemapCaptureRuntime — cross-frame memory for the black-hole lens's
 * amortized sky-cubemap capture. `skyCubemapCaptureSchedule` is
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
  /**
   * The lensing band's state as of the last rendered frame. `renderFrame`
   * reads it for the `bandJustEngaged` edge before overwriting it, and the
   * `sky-cubemap` render-target row's `allocateWhen` reads it to decide
   * whether its texture exists at all (`renderTargets.ts`).
   */
  bandActive: boolean;
  /**
   * The camera's distance from the galactic-centre anchor as of the last
   * rendered frame, Mpc — updated every frame regardless of `bandActive`.
   * The `sky-cubemap` row's `allocateWhen` reads it to decide whether an
   * already-allocated row should survive a bit past band close (hysteresis
   * margin — see `renderTargets.ts`).
   */
  gcDistanceMpc: number;
  /**
   * The eye EVERY face was captured from at the last full sweep. Round-robin
   * refreshes reuse this same pinned eye rather than the live camera each
   * frame — a per-frame live eye made adjacent faces disagree at their
   * shared border and the whole cubemap flicker as the camera moved.
   * Re-pinned to the live camera on each full sweep (band entry, or camera
   * displacement past the movement threshold). `null` before the first sweep.
   */
  pinnedEyeMpc: Readonly<Vec3> | null;
};
