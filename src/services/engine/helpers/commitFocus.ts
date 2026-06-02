import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { isPoi } from '../isPoi';
import { commitGalaxyFocus } from './commitGalaxyFocus';
import { commitPoiFocus } from './commitPoiFocus';

/**
 * commitFocus — the union-aware entry point for the public
 * `camera.focusOn(target)` handle method.
 *
 * Branches on `isPoi(target)` and delegates to the right per-kind
 * helper:
 *   - galaxy → `commitGalaxyFocus`: selection + focus updates, tween
 *     via `tweenToGalaxy`.  Cam-null gating happens at the calling
 *     `focusOn` wrapper in `engine.ts`.
 *   - POI    → `commitPoiFocus`: framing-distance derivation via
 *     `poiFocusDistance`, selection + focus updates.  Absorbs cam-null
 *     internally so deep-link drains establish state pre-bootstrap.
 *
 * Both helpers route every callback (`onSelectChange`, `onFocusChange`)
 * through the selection subsystem's setters, so `commitFocus` needs no
 * `cb` — it's pure dispatch.  Same `isPoi` predicate the InfoCard
 * renderer uses, so dispatch is consistent across the surface.
 */
export function commitFocus(state: EngineState, target: FocusableTarget): void {
  if (isPoi(target)) {
    commitPoiFocus(state, target);
  } else {
    commitGalaxyFocus(state, target);
  }
}
