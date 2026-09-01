/**
 * skyCubemapCaptureSchedule — the black-hole sky cubemap's amortized capture
 * schedule, as a pure function. A full 6-face capture (re-drawing the roster
 * from a fixed eye) is too costly every frame, so this spreads the cost: one
 * full sweep on band ENTRY, then one face per frame in round-robin, with an
 * escape valve that pulls a face out of turn once it's gone stale (by age,
 * or because a camera move invalidates the whole cubemap at once).
 *
 * No GPU/engine state: every input is a plain value (`renderFrame.ts`'s call
 * site derives `bandJustEngaged`/`cameraMovedBeyondThreshold`), so this is
 * testable headlessly.
 */

import type { CubeFace } from '../../../@types/rendering/CubeFace';

const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/**
 * How long a face may go without a recapture before the escape valve pulls
 * it back into the schedule out of turn, regardless of the round-robin's own
 * pick this frame. Data tuning, not architecture — sited beside the schedule
 * function it gates.
 */
export const SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS = 2000;

/**
 * How far the camera may drift from its position at the last full sweep
 * (band entry or a prior escape-valve sweep) before `renderFrame` derives
 * `cameraMovedBeyondThreshold: true` — every face's captured content (which
 * galaxies/stars are visible, their backdrop-fade alpha) is keyed on the
 * PLAYER's camera position, not the fixed capture eye at Sgr A*, so a big
 * enough move stales the whole cubemap at once. Sited here (not in
 * `renderFrame.ts`, the actual comparison site) beside its sibling time
 * threshold — both are this feature's data-tuning knobs. Roughly a tenth of
 * the lensing band's `fullAt` edge (100 AU, `scaleFadeBands.ts`), eye-tuned.
 */
export const SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_AU = 10;

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
