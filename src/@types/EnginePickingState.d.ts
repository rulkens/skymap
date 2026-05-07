/**
 * EnginePickingState — hover / click / drag mutables sub-bag of the
 * canonical `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `hovered` / `selected` — `(source, localIdx)` pairs decoded from
 *                                the picker's packed value, or `null`
 *                                when none.  Two distinct slots because
 *                                hover and selection track independently
 *                                (the user can hover one galaxy while
 *                                another stays pinned).
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
 *
 * ### Shape note (post (source, localIdx) packing refactor)
 *
 * Earlier revisions stored both `hoveredIndex` and `selectedIndex` as
 * single `number | null` global instance IDs (a baked running-sum
 * across all loaded surveys).  Both are now `(source, localIdx)` pairs
 * matching what `pickRenderer.pick` returns directly.  Decoding lives
 * inside the picker's r32uint readback; engine state holds the
 * structured form.
 */

import type { MousePos } from './MousePos';
import type { Source } from '../data/sources';

/**
 * A (source, localIdx) selection — what the picker decodes from its
 * r32uint packed value, and what the engine forwards to React for
 * InfoCard rendering + halo shading.
 */
export type Selection = { source: Source; localIdx: number };

export type EnginePickingState = {
  hovered: Selection | null;
  selected: Selection | null;
  latestMouseCss: MousePos | null;
  lastPickedMouseCss: MousePos | null;
  pickInFlight: boolean;
  pointerDown: boolean;
};
