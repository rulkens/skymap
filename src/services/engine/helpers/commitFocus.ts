import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
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
 *   - galaxy → `commitGalaxyFocus`: tween via `tweenToGalaxy`,
 *     `onFocusChange` fan-out, optional selection update.  Cam-null
 *     gating happens at the calling `focusOn` wrapper in `engine.ts`.
 *   - POI    → `commitPoiFocus`: framing-distance derivation via
 *     `poiFocusDistanceMpc`, `onFocusChange` fan-out, selection update.
 *     Absorbs cam-null internally so deep-link drains establish
 *     selected state pre-bootstrap.
 *
 * Same `isPoi` predicate the InfoCard renderer uses, so dispatch is
 * consistent across the surface.
 */
export function commitFocus(
  state: EngineState,
  cb: EngineCallbacks,
  target: FocusableTarget,
): void {
  if (isPoi(target)) {
    commitPoiFocus(state, cb, target, { tween: true });
  } else {
    commitGalaxyFocus(state, cb, target);
  }
}
