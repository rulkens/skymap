/**
 * focusRecession — the pure recession strand of the focus-fade interface: how far a
 * visibility entry that declares a `recession` strength dims at full focus.
 *
 * NOT folded into FadeRegistry (no `setFocusBlend`): the blend's home is
 * `structureFocusSubsystem`; caching it here is the stale-mirror bug class.
 */

import { lerp } from '../../../utils/math/lerp';

// The opacity a receding entry settles to at full focus (blend = 1). Two strengths,
// named for the strength and not for a layer, since unrelated layers share each.
// Eye-tuned.
export const STRONG_RECESSION = 0.15;
export const MILD_RECESSION = 0.25;

const RECESSION_BY_STRENGTH = { strong: STRONG_RECESSION, mild: MILD_RECESSION } as const;

// `blend` is 0 = no focus, 1 = full focus; an entry with no strength stays at 1.0 throughout.
export function recessionFactor(strength: 'strong' | 'mild' | undefined, blend: number): number {
  return strength === undefined ? 1 : lerp(1, RECESSION_BY_STRENGTH[strength], blend);
}
