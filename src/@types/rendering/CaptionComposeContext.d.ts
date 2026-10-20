import type { Vec3 } from '../math/Vec3';
import type { FocusUniformsValue } from './FocusUniformsValue';

/** One frame's per-caption compose inputs — `composeForegroundCaption`'s
 *  shared half, built by `captionComposeContextOf` for every NEAR0 caption producer. */
export type CaptionComposeContext = {
  readonly camPos: Readonly<Vec3>;
  /** The camera's own orbit distance, NOT `|camPos|` — see `CAPTION_FADE_RULES`. */
  readonly camOrbitDistanceMpc: number;
  readonly viewportShortSidePx: number;
  readonly drawPxPerRad: number;
  /** The focus sphere: captions lose their pick id outside it. */
  readonly focus: FocusUniformsValue;
  readonly occluders: readonly { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }[];
};
