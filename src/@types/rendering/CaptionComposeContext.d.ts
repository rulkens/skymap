import type { Vec3 } from '../math/Vec3';
import type { EngineSettingsState } from '../settings/EngineSettingsState';
import type { FadeRegistry } from '../animation/FadeRegistry';
import type { FocusUniformsValue } from './FocusUniformsValue';

/** One frame's per-caption compose inputs — `composeForegroundCaption`'s
 *  shared half of `produceSceneBodyCaptions` and `produceStarCaptions`. */
export type CaptionComposeContext = {
  readonly settings: EngineSettingsState;
  readonly camPos: Readonly<Vec3>;
  /** The camera's own orbit distance, NOT `|camPos|` — see `CAPTION_FADE_RULES`. */
  readonly camOrbitDistanceMpc: number;
  readonly viewportShortSidePx: number;
  readonly drawPxPerRad: number;
  readonly fades: FadeRegistry;
  readonly nowMs: number;
  /** The focus sphere: captions recede with `focus.blend` like every other layer, and lose their pick id outside it. */
  readonly focus: FocusUniformsValue;
  readonly occluders: readonly { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }[];
};
