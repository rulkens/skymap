/**
 * skyCubemapCaptureSchedule — the black-hole sky cubemap's amortized capture
 * schedule: a full 6-face sweep on band ENTRY, then one face per frame in
 * round-robin, with an escape valve for a stale or camera-moved face. Pure —
 * every input is a plain value — so it's testable headlessly.
 */

import type { CubeFace } from '../../../@types/rendering/CubeFace';

const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/** Escape-valve staleness threshold. Data tuning, sited beside the schedule it gates. */
export const SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS = 2000;

/**
 * Escape-valve camera-movement threshold, as a FRACTION of the camera's
 * current distance to Sgr A* — not an absolute distance. The capture eye is
 * now the camera itself (fix round 2), so the parallax a given displacement
 * introduces scales with displacement/distance, not displacement alone: a
 * fixed AU threshold would near-never fire during the descent to the event
 * horizon (camera distance ~0.17 AU at the 2·r_s floor) while under-firing
 * nowhere else. See `renderFrame.ts`'s `cameraMovedBeyondThreshold` derivation.
 */
export const SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION = 0.03;

export type SkyCubemapCaptureSchedule = {
  readonly facesToCapture: readonly CubeFace[]; // this frame's capture list
};

export function skyCubemapCaptureSchedule(input: {
  readonly bandJustEngaged: boolean; // band alpha crossed 0→positive this frame
  readonly frameIndex: number; // for round-robin
  readonly lastCapturedAtMs: ReadonlyMap<CubeFace, number>;
  readonly nowMs: number;
  readonly cameraMovedBeyondThreshold: boolean;
}): SkyCubemapCaptureSchedule {
  const { bandJustEngaged, frameIndex, lastCapturedAtMs, nowMs, cameraMovedBeyondThreshold } =
    input;

  if (bandJustEngaged || cameraMovedBeyondThreshold) {
    // A moved eye invalidates every face at once — same as band entry, no
    // partial-sweep half-state to reason about.
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
