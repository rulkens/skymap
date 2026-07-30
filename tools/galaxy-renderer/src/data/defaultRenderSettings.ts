/**
 * DEFAULT_RENDER_SETTINGS — the tool's boot compositing knobs.
 *
 * Every knob the app also has is seeded from the app's OWN default constant
 * rather than a hand-copied number, so the tool's out-of-the-box image is the
 * app's image and a retune in `src/data/defaults.ts` follows automatically.
 * That is the point of the tool: a look tuned here has to transfer.
 *
 * The three knobs with no app counterpart — `saturation`, `vignette`,
 * `gammaEncode` — default to IDENTITY. They drive the tool-only `grade.wesl`
 * trailer, which the engine skips entirely while all three are at identity, so
 * the default pass chain is the app's pass chain exactly. They stay available
 * because matching a piece of reference astrophotography sometimes wants them;
 * moving one is then a visible, deliberate departure from app parity.
 *
 * The star-pass block is the whole of `MILKY_WAY_TUNING_DEFAULTS`
 * (`src/services/gpu/galaxy/milkyWayCalibration.ts`) minus `lodApparent`,
 * which lives in `DEFAULT_LOD_SETTINGS` instead. Since the tool's boot state
 * became the app's actual Milky Way (`defaultGalaxyParams.ts`) and its star
 * path became the app's star path (the shared `milkyWayCloud/` shaders, the
 * reduced-resolution star target), those are not merely similar knobs — they
 * are the same knobs, so every one is seeded rather than hand-copied.
 *
 * `starIntensity` is seeded from `MILKY_WAY_TUNING_DEFAULTS.exposure`, which is
 * a DIFFERENT quantity from `DEFAULT_EXPOSURE` above despite the shared word:
 * `DEFAULT_EXPOSURE` is the post-chain linear multiplier applied to the whole
 * composited frame before the tone curve (this file's `exposure` field), while
 * the tuning `exposure` is the Milky Way star sprite's own emission factor.
 * Two knobs, two stages of the pipeline, one shared English word — conflating
 * them would point `starIntensity` at the wrong constant.
 */

import type { RenderSettings } from '../../@types/engine/RenderSettings';
import {
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_TONE_MAP_CURVE,
} from '../../../../src/data/defaults';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../../src/services/gpu/galaxy/milkyWayCalibration';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  exposure: DEFAULT_EXPOSURE,
  bloom: DEFAULT_BLOOM_STRENGTH,
  bloomThreshold: DEFAULT_BLOOM_THRESHOLD,
  saturation: 1,
  vignette: 0,
  gammaEncode: false,
  tonemap: DEFAULT_TONE_MAP_CURVE,
  sizeScale: MILKY_WAY_TUNING_DEFAULTS.starSizeScale,
  starIntensity: MILKY_WAY_TUNING_DEFAULTS.exposure,
  starPxMin: MILKY_WAY_TUNING_DEFAULTS.starPxMin,
  starPxMax: MILKY_WAY_TUNING_DEFAULTS.starPxMax,
  softness: MILKY_WAY_TUNING_DEFAULTS.softness,
  aggregateDivisor: MILKY_WAY_TUNING_DEFAULTS.aggregateDivisor,
};
