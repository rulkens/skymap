import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { Mat3 } from '../math/Mat3';

/**
 * What `evaluateFramedClip` needs beyond the clip itself. Every field is
 * optional because a clip with no frame-tagged endpoint never reads them; a
 * frame change with any of them missing throws rather than guessing.
 */
export type ClipFrameOptions = {
  /** The STEADY orientation basis the clip's absolute angles encode through. */
  readonly frameBasis?: Mat3;
  /**
   * Body states as of THIS call. A leg's start converts on the first call that
   * reaches it, so the conversion stands at the leg-open instant.
   */
  readonly bodies?: ReadonlyMap<BodyId, BodyState>;
  /**
   * This playback's identity (the `camera.clip` / `camera.tween` object): a
   * leg's start converts once per playback. Absent ⇒ keyed on the compiled
   * clip, so a replay would reuse the first playback's capture.
   */
  readonly playback?: object;
};
