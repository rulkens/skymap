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
 * (`src/services/gpu/galaxy/milkyWayCalibration.ts`) minus two knobs that live
 * elsewhere: `lodApparent`, which lives in `DEFAULT_LOD_SETTINGS` instead, and
 * `starCount`, which feeds generation rather than compositing and so lives on
 * `DEFAULT_GALAXY_PARAMS` (the re-exported `MILKY_WAY_GALAXY_PARAMS`) instead.
 * Since the tool's boot state became the app's actual Milky Way
 * (`defaultGalaxyParams.ts`) and its star path became the app's star path
 * (the shared `milkyWayCloud/` shaders, the reduced-resolution star target),
 * those are not merely similar knobs — they are the same knobs, so every one
 * is seeded rather than hand-copied.
 *
 * `starIntensity` is seeded from `MILKY_WAY_TUNING_DEFAULTS.exposure`, which is
 * a DIFFERENT quantity from `DEFAULT_EXPOSURE` above despite the shared word:
 * `DEFAULT_EXPOSURE` is the post-chain linear multiplier applied to the whole
 * composited frame before the tone curve (this file's `exposure` field), while
 * the tuning `exposure` is the Milky Way star sprite's own emission factor.
 * Two knobs, two stages of the pipeline, one shared English word — conflating
 * them would point `starIntensity` at the wrong constant.
 *
 * The fade block seeds from the app's own band edges for the same reason: the
 * tool is only useful while "leave the sliders alone" means "what the app does".
 */

import type { RenderSettings } from '../../@types/engine/RenderSettings';
import {
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_TONE_MAP_CURVE,
} from '../../../../src/data/defaults';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_MODEL_SCALE,
  MILKY_WAY_TUNING_DEFAULTS,
} from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';

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
  // The analytic field's own target divisor, coarser than the sprites' because
  // the field is FILL-bound and a sum of wide Gaussians survives it: measured
  // 2.5-3 ms at the sprite divisor against under 1 ms at 5, with no visible
  // difference. The ceiling is not blur but bloom FIREFLIES zoomed far out —
  // the closed-form integral point-samples the ray with no pixel-footprint
  // filtering, so once the bulge core is narrower than a texel it aliases into
  // a value that trips the bloom threshold and pops as the camera moves. No
  // `MILKY_WAY_TUNING_DEFAULTS` counterpart yet — the runtime has no analytic
  // field to size a target for.
  fieldDivisor: 6,
  // Analytic-field spike: both halves visible at boot, because the question it
  // exists to answer is how they compare. 1.0 is not a taste setting — the
  // mixture is calibrated so that exposure emits the sprite field's own total
  // flux (see `emissionScale`), so boot draws the two at parity and each
  // toggle alone shows the same amount of light.
  spriteField: true,
  analyticField: true,
  analyticExposure: 1.0,
  // Off at boot: the JWST view replaces the emission draw with a debug
  // presentation of the dust map, which is not the default look.
  dustView: false,
  legacyDustEnabled: true,
  dustCloudEnabled: true,
  // ON at boot, which costs nothing: at the boot camera both bands read 1, so
  // the first frame is the same frame it always was. A fade that had to be
  // found and switched on would leave the tool tuning a regime the app never
  // shows, which is what this port exists to stop.
  fadeEnabled: true,
  // The app's own keying quantity, bug included — see `FadeAnchor`.
  fadeAnchor: 'sun',
  // The app's band, converted Mpc → generator units, because that is the unit
  // the tool's camera and its readout speak. 1.2 / 0.12 units at the current
  // model scale.
  fadeApproachFullAt: SCALE_FADE_BANDS.milkyWayApproach.fullAt / MILKY_WAY_MODEL_SCALE,
  fadeApproachGoneAt: SCALE_FADE_BANDS.milkyWayApproach.goneAt / MILKY_WAY_MODEL_SCALE,
  fadeFullPx: MILKY_WAY_FADE_FULL_PX,
  fadeGonePx: MILKY_WAY_FADE_GONE_PX,
};
