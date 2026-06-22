/**
 * EnginePickingState — pointer-event-throttle sub-bag of the canonical
 * `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `latestMouseCss` — last position from `pointermove`; the per-frame
 *                         loop runs a fresh pick if it differs from
 *                         `lastPickedMouseCss`.
 *   - `lastPickedMouseCss` — the position the engine actually issued a
 *                              GPU pick for.  Used as a dedup key to skip
 *                              redundant picks when the cursor sits still.
 *   - `pickInFlight` — gate against issuing a new pick before the
 *                       previous `copyTextureToBuffer` readback resolves;
 *                       the readback is async and stacking picks would
 *                       waste GPU work and risk reading stale results.
 *   - `pointerDown` — true while the user is dragging to orbit the
 *                      camera; suppresses hover picks so the drag motion
 *                      doesn't generate a pick storm.
 *
 * ### What used to live here but doesn't anymore
 *
 * `hovered` / `selected` (the user-facing identity refs) moved into the
 * RTK `selection` store slice.  The store is the truth — per-frame readers
 * go through `state.selection.*` (refs) or `state.selectionRows.*` (resolved
 * display rows) instead of this bag.  This narrows the bag's responsibility
 * to "the throttle for the GPU pick pipeline" — a cleaner concept than the
 * prior catch-all "anything pick-adjacent".
 *
 * ### Why a separate type
 *
 * The picking pipeline crosses the engine, the click resolver, and the
 * input bindings.  Keeping the mutables in one named bag lets each of
 * those helpers accept exactly the slice they touch, without leaking
 * unrelated state.
 */

import type { MousePos } from '../../input/MousePos';

export type EnginePickingState = {
  latestMouseCss: MousePos | null;
  lastPickedMouseCss: MousePos | null;
  pickInFlight: boolean;
  pointerDown: boolean;
  /**
   * Packed PointUniforms image from the last visual frame (see
   * packPointUniforms). The pick paths upload this to the pick renderer's
   * own buffer so a pick reproduces the last frame's camera without
   * re-running the per-frame camera drivers. Null until the first frame.
   */
  lastFrameUniformBytes: ArrayBuffer | null;
};
