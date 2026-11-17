import type { Vec3 } from '../math/Vec3';
import type { FocusUniformsValue } from './FocusUniformsValue';
import type { OccluderBody } from '../scene/OccluderBody';

/** One frame's per-caption compose inputs — `composeForegroundCaption`'s
 *  shared half, built by `captionComposeContextOf` for every NEAR0 caption producer. */
export type CaptionComposeContext = {
  readonly camPos: Readonly<Vec3>;
  readonly viewportShortSidePx: number;
  readonly drawPxPerRad: number;
  /** `ReadyFrameContext.devicePixelRatio`: the leader's CSS-px gap becomes device px by it. */
  readonly devicePixelRatio: number;
  /** The focus sphere: captions lose their pick id outside it. */
  readonly focus: FocusUniformsValue;
  readonly occluders: readonly OccluderBody[];
};
