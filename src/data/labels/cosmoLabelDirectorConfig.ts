import type { Label2DDirectorConfig } from '../../@types/engine/subsystems/Label2DDirectorConfig';
import { cosmoLabelProjection } from '../../services/engine/frame/cosmoLabelProjection';

/**
 * The COSMO slab's `Label2DDirector` config — today's hard-wiring restated
 * as data (`Label2DDirectorConfig`, spec §4.3). `padPx: 8` is breathing
 * margin around every label's measured text rect before the padded-rect
 * overlap test — see `declutterByBboxOverlap`'s docblock for why padded
 * rects rather than anchor distance. `durationMs: 300` is the appear/
 * disappear ramp: long enough to read as a fade rather than a flicker,
 * short enough that a focus handoff (outgoing label ramping down while the
 * incoming ramps up) completes within a single tour beat's attention span.
 * `lift: null` states COSMO's stance explicitly — it has none.
 */
export const COSMO_LABEL_DIRECTOR: Label2DDirectorConfig = {
  id: 'labels',
  project: cosmoLabelProjection,
  declutter: { mode: 'bboxOverlap', padPx: 8 },
  envelope: { mode: 'smoothstepRamp', durationMs: 300 },
  lift: null,
};
