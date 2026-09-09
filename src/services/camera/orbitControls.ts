/**
 * Orbit controls — the DOM gesture recognizer. Recognizes what the pointer /
 * wheel stream means and emits `InputGestureEvent`s, touching no camera and no
 * engine state: `inputAggregator` folds a frame's events and `drainInput`
 * applies them. One apply per frame rather than one per event is what keeps a
 * second controller from becoming a second writer of the same register.
 *
 * Pointer events, not mouse events: `mousedown`/`mousemove` are never dispatched
 * for touch at all.
 */

import type { InputGestureEvent } from '../../@types/camera/InputGestureEvent';
import type { OrbitControlsOptions } from '../../@types/camera/OrbitControlsOptions';

export function attachOrbitControls(
  canvas: HTMLCanvasElement,
  emit: (event: InputGestureEvent) => void,
  options?: OrbitControlsOptions,
): () => void {
  type DragMode = 'orbit' | 'pan' | 'pinch';
  let dragMode: DragMode | null = null;

  // Contacts other than `dragPointerId` are tracked only so they tear down
  // cleanly; they never drive a single-pointer gesture.
  const activePointers = new Map<number, { x: number; y: number }>();
  let dragPointerId: number | null = null;

  /** Euclidean distance between the first two active pointers, or 0 if <2. */
  const currentPinchDistance = (): number => {
    const ptrs = Array.from(activePointers.values());
    if (ptrs.length < 2) return 0;
    const dx = ptrs[0]!.x - ptrs[1]!.x;
    const dy = ptrs[0]!.y - ptrs[1]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Click = pointerup within 4 CSS px of pointerdown, compared squared.
  let downX = 0;
  let downY = 0;
  const CLICK_THRESHOLD_SQ = 4 * 4;

  const onDown = (e: PointerEvent) => {
    // A mouse is strictly single-pointer, so clearing heals state stranded by a
    // `pointerup` never seen: with no pointer capture (the iOS fix below), a button
    // released outside the viewport fires no `window` pointerup, and the stale entry
    // would promote the next click to a bogus two-pointer pinch. Touch reaches the
    // window listeners via implicit capture, so it is left alone.
    if (e.pointerType === 'mouse') {
      activePointers.clear();
      dragMode = null;
      dragPointerId = null;
    }

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1) {
      // Middle / right mouse → pan; everything else → orbit (touch and pen
      // never report buttons 1 / 2).
      dragMode = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2) ? 'pan' : 'orbit';
      dragPointerId = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;

      // First contact only — a second finger promoting to pinch does NOT start
      // a new gesture. And no `setPointerCapture` (see the listeners below).
      emit({ kind: 'gestureStart' });
      emit({ kind: 'dragAnchor', xPx: e.clientX, yPx: e.clientY });
    } else if (activePointers.size === 2) {
      // `dragPointerId` stays intact; `dragMode` is what gates `onMove`.
      dragMode = 'pinch';
      emit({ kind: 'pinchAnchor', distPx: currentPinchDistance() });
    }
    // 3+ pointers change nothing — pinch stays a two-finger gesture.
  };

  const onUp = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);

    if (activePointers.size === 0) {
      const endedMode = dragMode;
      dragMode = null;
      dragPointerId = null;

      // Click only on an ORBIT release: a pan release (right/middle mouse) must
      // not pick a galaxy, and the second finger of a pinch is not a tap.
      if (options?.onClick && endedMode === 'orbit') {
        const dx = e.clientX - downX;
        const dy = e.clientY - downY;
        if (dx * dx + dy * dy < CLICK_THRESHOLD_SQ) {
          options.onClick(e.clientX, e.clientY);
        }
      }

      emit({ kind: 'gestureEnd' });
    } else if (dragMode === 'pinch') {
      // Pinch broken (one finger lifted, others down) — end the gesture rather
      // than promote the survivor to orbit, which snaps on a grip readjust.
      dragMode = null;
      dragPointerId = null;
    }
  };

  const onMove = (e: PointerEvent) => {
    // Fires for ALL active pointers: update the map first, decide after.
    const ptr = activePointers.get(e.pointerId);
    if (!ptr) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;

    if (dragMode === 'pinch') {
      if (activePointers.size < 2) return;
      const dist = currentPinchDistance();
      if (dist > 0) emit({ kind: 'pinchMove', distPx: dist });
      return;
    }

    if (dragMode === null) return;
    // Only the driving pointer drives: otherwise a second contact yanks the
    // baseline back and forth and the orbit jitters.
    if (e.pointerId !== dragPointerId) return;

    // Client (viewport-relative) coords survive a scrolled/transformed canvas.
    emit({ kind: 'dragMove', mode: dragMode, xPx: e.clientX, yPx: e.clientY });
  };

  const onWheel = (e: WheelEvent) => {
    // Suppresses page scroll, which needs `{ passive: false }` below: a passive
    // listener may not call preventDefault.
    e.preventDefault();
    // With a pointer down the gesture register is what renders, so the zoom folds
    // into it; at rest the store `base` renders instead. Client coords match the
    // drag arms, so the pick ray is built from one pixel space either way.
    emit({
      kind: 'wheel',
      deltaY: e.deltaY,
      duringGesture: activePointers.size > 0,
      xPx: e.clientX,
      yPx: e.clientY,
    });
  };

  // `pointerdown` on the canvas (a gesture must START on the drawing surface), but
  // move / up / cancel on `window`, so a drag that leaves the canvas keeps orbiting
  // — and, load-bearing on iOS, NEVER call `setPointerCapture`: touch pointers get
  // IMPLICIT capture on pointerdown, and WebKit mishandles an explicit capture
  // layered on top, silently killing `pointermove`/`pointerup` for single-finger
  // orbit and pinch while desktop mouse stays fine.
  // https://github.com/openseadragon/openseadragon/issues/1962
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointermove', onMove);
  // `pointercancel` = the system pre-empted the gesture, with no meaningful end
  // coordinate — routing it through the shared teardown skips the click branch.
  window.addEventListener('pointercancel', onUp);

  // The browser's own detection follows the OS threshold and the user's
  // accessibility settings, and fires for a touch double-tap.
  const onDblClick = (e: MouseEvent) => {
    options?.onDoubleClick?.(e.clientX, e.clientY);
  };
  canvas.addEventListener('dblclick', onDblClick);

  // Pan uses the right/middle button. Canvas only, so right-click still works
  // everywhere else on the page.
  const onContextMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('contextmenu', onContextMenu);

  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
  };
}
