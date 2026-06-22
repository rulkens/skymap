/**
 * EnginePickingState — pointer-event-throttle sub-bag of the canonical
 * `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `pickInFlight` — gate against issuing a new pick before the
 *                       previous `copyTextureToBuffer` readback resolves;
 *                       the readback is async and stacking picks would
 *                       waste GPU work and risk reading stale results.
 *   - `pointerDown` — true while the user is dragging to orbit the
 *                      camera; the `hoverPickDriver` skips picks while
 *                      dragging to avoid a pick storm.
 *   - `lastFrameUniformBytes` — packed camera + settings snapshot from the
 *                       last visual frame; the hover-pick driver and the
 *                       click resolver both upload this to the pick
 *                       renderer's own buffer so a pick reproduces the
 *                       last frame's camera state without re-running the
 *                       per-frame camera drivers.  Null until the first
 *                       frame.
 *
 * ### What used to live here but doesn't anymore
 *
 * `hovered` / `selected` (the user-facing identity refs) moved into the
 * RTK `selection` store slice.  The store is the truth — per-frame readers
 * go through `state.selection.*` (refs) or `state.selectionRows.*` (resolved
 * display rows) instead of this bag.
 *
 * `latestMouseCss` / `lastPickedMouseCss` (the per-frame hover throttle
 * dedup keys) were removed when the in-frame hover-pick block was deleted.
 * Hover picking is now fully pointer-driven via `hoverPickDriver`
 * (see `wireInput.ts`), which maintains its own `latest` / `picked`
 * locals — they never needed to live on engine state.
 *
 * ### Why a separate type
 *
 * The picking pipeline crosses the engine, the click resolver, and the
 * input bindings.  Keeping the mutables in one named bag lets each of
 * those helpers accept exactly the slice they touch, without leaking
 * unrelated state.
 */

export type EnginePickingState = {
  pickInFlight: boolean;
  /**
   * True while the user holds the pointer button down to orbit the camera.
   * `hoverPickDriver` returns early in `maybeFire()` when this is true so
   * orbit drags do not trigger hover picks — a drag is not a hover, and
   * firing picks every readback cycle mid-drag causes a pick-per-readback
   * storm and spurious `updateSelectionHover` dispatches.
   * Written by `wireInput.ts`; read by `hoverPickDriver.ts`.
   */
  pointerDown: boolean;
  /**
   * Packed PointUniforms image from the last visual frame (see
   * packPointUniforms). The pick paths upload this to the pick renderer's
   * own buffer so a pick reproduces the last frame's camera without
   * re-running the per-frame camera drivers. Null until the first frame.
   */
  lastFrameUniformBytes: ArrayBuffer | null;
};
