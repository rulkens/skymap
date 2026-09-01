/**
 * The black-hole sky cubemap's amortized capture schedule: a full 6-face
 * sweep on band entry or pinned-eye movement, then one face per frame in
 * round-robin, with an escape valve for a stale face.
 */

import type { CubeFace } from '../../../@types/rendering/CubeFace';

const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

export const SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS = 2000; // escape-valve staleness

/**
 * Escape-valve movement threshold, as a FRACTION of the camera's distance to
 * Sgr A*: a fixed AU threshold would near-never fire during the descent to
 * the horizon (camera distance ~0.17 AU at the 2·r_s floor).
 */
export const SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION = 0.03;

export type SkyCubemapCaptureSchedule = {
  readonly facesToCapture: readonly CubeFace[]; // this frame's capture list
};

export function skyCubemapCaptureSchedule(input: {
  /** Band entry OR pinned-eye drift; the caller pre-folds both. */
  readonly fullSweepTriggered: boolean;
  readonly frameIndex: number; // for round-robin
  readonly lastCapturedAtMs: ReadonlyMap<CubeFace, number>;
  readonly nowMs: number;
}): SkyCubemapCaptureSchedule {
  const { fullSweepTriggered, frameIndex, lastCapturedAtMs, nowMs } = input;

  if (fullSweepTriggered) return { facesToCapture: ALL_CUBE_FACES };

  const roundRobinFace = (frameIndex % 6) as CubeFace;
  const faces = new Set<CubeFace>([roundRobinFace]);
  for (const face of ALL_CUBE_FACES) {
    const lastCapturedAt = lastCapturedAtMs.get(face);
    // Absent ⇒ never captured, staler than any threshold.
    const staleMs = lastCapturedAt === undefined ? Infinity : nowMs - lastCapturedAt;
    if (staleMs > SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS) faces.add(face);
  }
  return { facesToCapture: [...faces] };
}
