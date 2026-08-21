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
 *
 * Nothing camera-shaped lives here anymore.  The point pick pass rebuilds
 * its own uniform bytes from plain values at pick time (see
 * `pickUniformBytesOf`), and the Milky-Way pick gate reads the pick-time
 * camera directly through `milkyWayLayer.enabled(state, pickCtx)` — so no
 * frame→pick camera mirror is stashed on this bag.
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

import type { BodyId } from '../../data/body/BodyId';
import type { LonLatDeg } from '../../scene/LonLatDeg';

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
   * Where the cursor last hit the FOCUSED body's surface, in that body's
   * local lon/lat — or `null` before any hit has ever landed. Written by
   * `wireInput.ts`'s `onPointerMove` on a HIT only: a raycast miss (cursor
   * off-globe, or no body focused) leaves this at whatever it already was,
   * rather than being cleared to `null`. A stale entry from a
   * since-changed focus is harmless because the one consumer (the drag-grab
   * capture) gates on `bodyId` matching the CURRENTLY focused body before
   * reading `point` — so it is a read-time gate, not a write-time clear.
   * Zoom does NOT read this: it re-picks its own anchor every tick.
   */
  hoveredSurfacePoint: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null;
};
