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
 * `hovered` / `selected` (the user-facing `(source, localIdx)` pairs)
 * moved into `selectionSubsystem` (Spec D.3).  The subsystem owns the
 * truth — every read goes through `state.subsystems.selection.hovered()`
 * / `selected()` instead of poking this bag directly.  The migration
 * narrows this bag's responsibility to "the throttle for the GPU pick
 * pipeline" — a cleaner concept than the prior catch-all "anything
 * pick-adjacent".
 *
 * ### Why a separate type
 *
 * The picking pipeline crosses the engine, the click resolver, and the
 * input bindings.  Keeping the mutables in one named bag lets each of
 * those helpers accept exactly the slice they touch, without leaking
 * unrelated state.
 */

import type { MousePos } from './input/MousePos';
import type { Source } from '../data/sources';

/**
 * A (source, localIdx) selection — what the picker decodes from its
 * r32uint packed value, and what the engine forwards to React for
 * InfoCard rendering + halo shading.
 *
 * Re-exported here for backward compatibility with existing imports
 * (the pre-D.3 subsystems' API surface used this type name); the
 * canonical home in code is now `SelectionInput` on
 * `selectionSubsystem.ts`, which is structurally identical.
 */
export type Selection = { source: Source; localIdx: number };

export type EnginePickingState = {
  latestMouseCss: MousePos | null;
  lastPickedMouseCss: MousePos | null;
  pickInFlight: boolean;
  pointerDown: boolean;
};
