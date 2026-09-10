import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { Mat3 } from '../math/Mat3';

/**
 * What `evaluateFramedClip` needs beyond the clip itself. Every field is
 * optional because a clip with no frame-tagged endpoint never reads them; a
 * frame change without `bodies` throws rather than guessing a body's place.
 */
export type ClipFrameOptions = {
  /** The STEADY orientation basis the clip's absolute angles encode through. */
  readonly frameBasis?: Mat3;
  /** Body states at the clip-start instant — the leg-start conversion's frame. */
  readonly bodies?: ReadonlyMap<BodyId, BodyState>;
  /**
   * This playback's identity (the `camera.clip` / `camera.tween` object): a
   * leg's start converts once per playback. Absent ⇒ keyed on the compiled
   * clip, so a replay would reuse the first playback's capture.
   */
  readonly playback?: object;
};
