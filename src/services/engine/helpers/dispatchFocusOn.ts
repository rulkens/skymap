import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { isPoi } from '../isPoi';
import { commitFocus } from './commitFocus';
import { commitPoiFocus } from './commitPoiFocus';

/**
 * dispatchFocusOn — the union-aware entry point for the public
 * `camera.focusOn(target)` handle method.
 *
 * The public surface accepts `GalaxyInfo | PointOfInterest`, but the two
 * commit paths stay separate inside the engine: `commitFocus` handles the
 * galaxy tween + `onFocusChange` fan-out (with a top-level cam-null
 * guard enforced by the calling `focusOn` wrapper in `engine.ts`), while
 * `commitPoiFocus` handles the POI tween + framing-distance derivation +
 * `onPoiFocusChange` (absorbing cam-null internally so deep-link drains
 * can establish selected state pre-bootstrap).
 *
 * Discrimination uses `isPoi` so a single predicate decides for every
 * dispatch site (the InfoCard renderer uses the same predicate).
 *
 * Pre-bootstrap behaviour preserved: when `state.cam` is null, the
 * galaxy branch's cam-null guard in `focusOn` (engine.ts) returns before
 * this helper is reached; the POI branch fires its subsystem flag +
 * callback unconditionally as before.  This helper itself does no
 * cam-null gating — that is a caller-level concern enforced by the
 * `focusOn` wrapper.
 */
export function dispatchFocusOn(
  state: EngineState,
  cb: EngineCallbacks,
  target: FocusableTarget,
): void {
  if (isPoi(target)) {
    commitPoiFocus(state, cb, target, { tween: true });
  } else {
    commitFocus(state, cb, target);
  }
}
