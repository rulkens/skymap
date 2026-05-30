/**
 * inputBindings — collects the engine's pointer / keyboard / resize
 * listener attachments into one place, plus the listener-bookkeeping
 * helpers that were previously inline in engine.ts.
 *
 * Before this module existed engine.ts had:
 *
 *   - two arrays (`windowListeners` / `canvasListeners`) for cleanup,
 *   - two helpers (`addWindowListener` / `addCanvasListener`) that
 *     pushed onto those arrays,
 *   - five separate sections of `addCanvasListener(...)` /
 *     `addWindowListener(...)` calls scattered across ~140 lines of
 *     the IIFE body, each pulling on closure variables for
 *     pointerDown / latestMouseCss / setHovered etc.,
 *   - and a `destroy()` block that walked both arrays detaching.
 *
 * Pulling all of that into a single module gives us:
 *
 *   1. A single place to read what events the engine listens to and
 *      what they do.  Previously you had to grep for `addCanvasListener`
 *      and `addWindowListener` to find the full surface area.
 *
 *   2. A single `destroy()` cleanup the engine's `destroy()` calls
 *      once.  No more two-array dance.
 *
 *   3. Easier unit testing: each callback in the input bag is the
 *      semantic action ("pointer moved to (x, y) in CSS px"), not a
 *      DOM event detail, so tests fire DOM events on a canvas mock
 *      and assert on the callback fan-out without needing to pluck
 *      `e.clientX` etc. out of an event object.
 *
 * ### Why not include attachOrbitControls?
 *
 * The orbit-controls attachment fits the "input plumbing" theme
 * thematically, but it requires a fully-constructed `OrbitCamera` —
 * which the engine doesn't have at `createEngine()` time (the camera
 * is built inside the async IIFE after the first cloud lands).  Two
 * options were considered:
 *
 *   a. Pass a lazy `() => cam | null` accessor through this module.
 *   b. Leave orbit-controls attachment in engine.ts where the cam
 *      reference is in scope, and have this module own only the
 *      listeners that *can* be attached at engine startup.
 *
 * (b) keeps this module's contract tight and avoids the lazy-accessor
 * indirection at every event-handler edge.  Engine.ts's orbit-controls
 * call still pulls its detach into the engine's `destroy()` directly,
 * which is fine — it's already a single-call cleanup, not a list.
 *
 * ### What gets wired here
 *
 *   - canvas pointermove / pointerleave / pointerdown — semantic
 *     callbacks (onPointerMove / onPointerLeave / onPointerDown).
 *   - window  pointerup / pointercancel              — onPointerUp
 *     (both fire the same callback because the engine treats
 *      pointercancel as "OS cancelled the gesture; release suppress").
 *   - window  keydown (Escape only)                  — onEscape.
 *   - window  resize                                 — onResize.
 *
 * Each listener also calls `scheduler.requestRender()` after
 * dispatching so the engine's render-on-demand loop wakes for the
 * next frame.  Centralising the wake-up calls here means engine.ts's
 * setters / per-frame body don't have to think about it.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { AttachEngineInputsOptions } from '../../../@types/input/AttachEngineInputsOptions';
import type { InputBindings } from '../../../@types/input/InputBindings';

export function attachEngineInputs(options: AttachEngineInputsOptions): InputBindings {
  const {
    canvas,
    scheduler,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onEscape,
    onResize,
  } = options;

  // Listener bookkeeping — same pattern as the pre-extraction engine,
  // collected here so `detach()` can walk both arrays in one place.
  const windowListeners: Array<[keyof WindowEventMap, EventListener]> = [];
  const canvasListeners: Array<[string, EventListener]> = [];

  function addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    handler: (e: WindowEventMap[K]) => void,
  ): void {
    window.addEventListener(type, handler as EventListener);
    windowListeners.push([type, handler as EventListener]);
  }

  function addCanvasListener(type: string, handler: EventListener): void {
    canvas.addEventListener(type, handler);
    canvasListeners.push([type, handler]);
  }

  // ── Canvas pointer events ────────────────────────────────────────────
  //
  // We track the latest mouse position via `onPointerMove`'s callback;
  // engine uses this to drive the per-frame throttled hover pick.  The
  // pick itself is async (1-2 frames later) and its `.then` calls
  // `requestRender` again so the selection halo updates as soon as the
  // readback lands.

  addCanvasListener('pointermove', (e) => {
    const pe = e as PointerEvent;
    // Touch and pen have no hover state — a finger tap emits a synthetic
    // pointermove that would otherwise drive the hover-pick and pop the
    // InfoCard on tap.  Gating on the moving pointer being a mouse is
    // per-event, so a hybrid device (touchscreen laptop, iPad + trackpad)
    // still gets hover from its mouse and never from a finger.  We skip the
    // requestRender too: this listener exists only to feed the hover-pick,
    // so a touch move has nothing here to wake the loop for.
    if (pe.pointerType !== 'mouse') return;
    onPointerMove({ x: pe.clientX, y: pe.clientY });
    scheduler.requestRender();
  });

  // When the pointer leaves the canvas the engine clears hover state.
  // If a point is selected the card stays visible (showing the pinned
  // point) — that's an engine concern, not ours.
  addCanvasListener('pointerleave', () => {
    onPointerLeave();
    scheduler.requestRender();
  });

  // ── Drag detection (pointerdown + window pointerup/pointercancel) ────
  //
  // We listen on `window` for pointerup so we still see the release
  // even when `setPointerCapture` has routed events back to the canvas
  // via the orbit-controls module.

  addCanvasListener('pointerdown', () => {
    onPointerDown();
    scheduler.requestRender();
  });
  addWindowListener('pointerup', () => {
    onPointerUp();
  });
  // Defensive: if the OS cancels the gesture (e.g. focus loss), release
  // the suppression flag too — same effect as pointerup.
  addWindowListener('pointercancel', () => {
    onPointerUp();
  });

  // ── Esc → clear selection ────────────────────────────────────────────
  //
  // The engine owns this because Esc acts on engine state
  // (`selectedIndex`).  App.tsx also has a `useEffect` that forwards
  // Esc through the engine handle's `clearSelection()` method — same
  // result, both paths are fine.
  addWindowListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onEscape();
      scheduler.requestRender();
    }
  });

  // ── Window resize ────────────────────────────────────────────────────
  //
  // Schedule one render so resizeCanvasToDisplay() (which runs at the
  // top of the next frame body) sees the new size and recreates the
  // HDR target.  Without this wake-up the canvas would stay at its
  // old backing-store resolution until some other event happened to
  // schedule a frame.
  addWindowListener('resize', () => {
    onResize();
    scheduler.requestRender();
  });

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the bindings handle is one of
  // ~13 subsystems the engine tears down, and the shared shape lets
  // engine.destroy() iterate uniformly instead of remembering each
  // subsystem's bespoke teardown method name.
  const bindings: InputBindings = {
    destroy(): void {
      for (const [type, handler] of canvasListeners) {
        canvas.removeEventListener(type, handler);
      }
      canvasListeners.length = 0;
      for (const [type, handler] of windowListeners) {
        window.removeEventListener(type, handler as EventListener);
      }
      windowListeners.length = 0;
    },
  };
  bindings satisfies Destroyable;
  return bindings;
}
