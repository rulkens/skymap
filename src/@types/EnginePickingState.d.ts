/**
 * EnginePickingState — hover / click / drag mutables sub-bag of the
 * canonical `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `hoveredIndex` / `selectedIndex` — global instance IDs (already
 *                                          resolved through `resolveGlobalIdx`
 *                                          in reverse).  `null` means none.
 *                                          Two distinct slots because hover
 *                                          and selection track independently
 *                                          (the user can hover one galaxy
 *                                          while another stays pinned).
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
 * ### Why a separate type
 *
 * The picking pipeline crosses the engine, the click resolver, and the
 * input bindings.  Keeping the mutables in one named bag lets each of
 * those helpers accept exactly the slice they touch, without leaking
 * unrelated state.
 */

import type { MousePos } from './MousePos';

export type EnginePickingState = {
  hoveredIndex: number | null;
  selectedIndex: number | null;
  latestMouseCss: MousePos | null;
  lastPickedMouseCss: MousePos | null;
  pickInFlight: boolean;
  pointerDown: boolean;
};
