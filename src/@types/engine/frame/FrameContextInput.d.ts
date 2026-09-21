/**
 * FrameContextInput — everything `deriveFrameContext` needs that is not the
 * store: ONE bag in place of twelve positionals. No pose-shaped type is minted
 * — `OrbitCamera` already carries pose, projection, both bases and `position`,
 * and the CALLER assembles it (`assembleOrbitCamera`), so the frame context's
 * `cam` is this `cam`, by reference.
 */

import type { AssembledOrbitCamera } from '../../camera/AssembledOrbitCamera';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';

export type FrameContextInput = {
  /** The frame's one camera, pose-true — see `assembleOrbitCamera` for the
   *  `poseBasis`/`upBasis` split. */
  readonly cam: AssembledOrbitCamera;
  /**
   * The SAME framed pose `cam`'s pose was folded from (`foldToWorld`, called
   * once by the caller) — it serves the pose-provider seam only (spec §5.2).
   */
  readonly arm: FramedCameraPose;
  /**
   * Eye→pivot-surface range NEAR0's bracket is sized from. REQUIRED, not
   * optional: `runFrame` already computes it for the scale bar and passes that
   * one, `pickFrameContext` computes the same line, and a capture passes its
   * `nearMpc` — a synthetic pose orbits no pivot, and the real focus's radius
   * taken off a metre-scale probe distance goes hugely negative.
   */
  readonly altitudeMpc: number;
  /** Wall-clock ms and scene time (Julian days) — decouple under pause/scrub;
   *  see `ReadyFrameContext.nowMs`/`.simDays` for how each is read. */
  readonly nowMs: number;
  readonly simDays: number;
  /** Galaxy-catalog draw mask (`deriveSourceMasks(state).draw`), this frame. */
  readonly visibleSourceMask: number;
};
