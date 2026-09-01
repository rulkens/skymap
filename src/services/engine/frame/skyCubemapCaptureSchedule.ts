/**
 * skyCubemapCaptureSchedule — the black-hole sky cubemap's amortized capture
 * schedule: a full 6-face sweep on band ENTRY or pinned-eye movement, then
 * one face per frame in round-robin, with an escape valve for a stale face.
 * Pure — every input is a plain value — so it's testable headlessly.
 */

import type { CubeFace } from '../../../@types/rendering/CubeFace';

const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/** Escape-valve staleness threshold. Data tuning, sited beside the schedule it gates. */
export const SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS = 2000;

/**
 * Escape-valve movement threshold, as a FRACTION of the camera's current
 * distance to Sgr A* — not an absolute distance. The pinned capture eye
 * (fix round 3) only moves on a full sweep, so this measures how far the
 * LIVE camera has drifted from that pinned eye: a fixed AU threshold would
 * near-never fire during the descent to the event horizon (camera distance
 * ~0.17 AU at the 2·r_s floor) while under-firing nowhere else. See
 * `renderFrame.ts`'s `cameraMovedBeyondThreshold` derivation.
 */
export const SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION = 0.03;

export type SkyCubemapCaptureSchedule = {
  readonly facesToCapture: readonly CubeFace[]; // this frame's capture list
};

export function skyCubemapCaptureSchedule(input: {
  // Band just engaged OR the live camera drifted past the pinned-eye
  // threshold — either forces every face, so the caller pre-folds both
  // reasons into one flag rather than this function re-deriving them.
  readonly fullSweepTriggered: boolean;
  readonly frameIndex: number; // for round-robin
  readonly lastCapturedAtMs: ReadonlyMap<CubeFace, number>;
  readonly nowMs: number;
}): SkyCubemapCaptureSchedule {
  const { fullSweepTriggered, frameIndex, lastCapturedAtMs, nowMs } = input;

  if (fullSweepTriggered) {
    // A re-pinned eye invalidates every face at once — same as band entry,
    // no partial-sweep half-state to reason about.
    return { facesToCapture: ALL_CUBE_FACES };
  }

  const roundRobinFace = (frameIndex % 6) as CubeFace;
  const faces = new Set<CubeFace>([roundRobinFace]);
  for (const face of ALL_CUBE_FACES) {
    const lastCapturedAt = lastCapturedAtMs.get(face);
    // Absent ⇒ never captured, which is staler than any threshold — the
    // capacity row exists (Task 3) but no sweep has touched this face yet.
    const staleMs = lastCapturedAt === undefined ? Infinity : nowMs - lastCapturedAt;
    if (staleMs > SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS) faces.add(face);
  }
  return { facesToCapture: [...faces] };
}
