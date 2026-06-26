/**
 * dwellDrift — builds the perpetual ambient-motion clip played DURING a beat's
 * dwell phase.
 *
 * ### Why perpetual?
 *
 * The tour saga races `dwellDrift` against the beat's dwell timer inside
 * `visitBeatSaga`. A clip that NEVER completes on its own always loses that race —
 * the timer fires first, the beat advances, and the clip is torn down. If
 * `dwellDrift` were finite it would WIN the race on short beats and advance the
 * tour prematurely. Perpetual-by-construction is the correctness invariant, not
 * an optimisation.
 *
 * ### Structure
 *
 * The `spin` is the awaited element: `loop: true` makes it perpetual. The
 * `oscillate` is `fork`ed so it runs under the spin without contributing to the
 * timeline's duration (a forked perpetual cannot stall an awaited timeline).
 *
 * `beat` is accepted but unused — the dwell motion is intentionally
 * beat-independent. The parameter is kept for call-site symmetry with
 * `visitBeatSaga`'s `dwellDrift(beat)` and to allow per-beat tuning in future
 * without a signature change.
 */

import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { ClipData } from '../../@types/animation/ClipData';
import { fork, oscillate, spin } from '../../services/engine/animation/effectHelpers';

export function dwellDrift(_beat: BeatData): ClipData {
  return {
    start: 'live',
    timeline: [
      fork(oscillate('pitch', { amp: 0.04, period: 14 })), // gentle bob
      // Linear ease: constant angular velocity from t=0. The default 'inOut'
      // ramps the orbit up from a standstill over the first `over` seconds —
      // and since that window (45s) is far longer than any dwell, every beat
      // would only ever show the slow-start ramp. Linear orbits at a steady
      // rate immediately and joins the post-window linear continuation seamlessly.
      spin('yaw', { by: Math.PI * 2, over: 45, ease: 'linear', loop: true }), // slow orbit — perpetual
    ],
  };
}
