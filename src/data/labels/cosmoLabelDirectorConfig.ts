import type { Label2DDirectorConfig } from '../../@types/engine/subsystems/Label2DDirectorConfig';
import { cosmoLabelProjection } from '../../services/engine/frame/cosmoLabelProjection';
import { COSMO } from '../../services/engine/frame/slabs';

/**
 * The COSMO slab's `Label2DDirector` config — today's hard-wiring restated
 * as data (`Label2DDirectorConfig`, spec §4.3). `declutterPadPx: 8` is breathing
 * margin around every label's measured text rect before the padded-rect
 * overlap test — see `declutterByBboxOverlap`'s docblock for why padded
 * rects rather than anchor distance. `durationMs: 300` is the appear/
 * disappear ramp: long enough to read as a fade rather than a flicker,
 * short enough that a focus handoff (outgoing label ramping down while the
 * incoming ramps up) completes within a single tour beat's attention span.
 * `lift` sets a name off its subject's rim only under the antique look: COSMO's
 * producers place their own names otherwise and carry no `lift` (`antiqueLabel`'s
 * type is only measured here). Its vp is absolute and every anchor sits far inside
 * the far plane, so the anchor clamp is off.
 */
export const COSMO_LABEL_DIRECTOR: Label2DDirectorConfig = {
  project: cosmoLabelProjection,
  declutterPadPx: 8,
  envelope: { mode: 'smoothstepRamp', durationMs: 300 },
  lift: { slab: COSMO, farClampFraction: Number.POSITIVE_INFINITY },
};
