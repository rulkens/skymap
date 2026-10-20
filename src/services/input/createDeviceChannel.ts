/**
 * createDeviceChannel — an element as an input source: DOM pointer, wheel and
 * resize events become `DeviceEvent`s in unit space, measured against the
 * element's own rect (so an offset canvas, the dome's squared one, gets correct
 * rays; the remote's trackpad reads the same way). Recognition lives in
 * `recognize`; this file only translates.
 *
 * Expanding buffer: no event may drop while the source saga is busy putting.
 */

import { buffers, eventChannel, type EventChannel } from 'redux-saga';

import { PINCH_WHEEL_GAIN } from '../../data/camera/pinchWheelGain';
import { WHEEL_ZOOM_K } from '../../data/input/wheelZoomK';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { Modifiers } from '../../@types/input/Modifiers';
import type { UnitPoint } from '../../@types/input/UnitPoint';

const modsOf = (e: MouseEvent): Modifiers => ({
  shift: e.shiftKey,
  ctrl: e.ctrlKey,
  alt: e.altKey,
  meta: e.metaKey,
});

export function createDeviceChannel(element: HTMLElement): EventChannel<DeviceEvent> {
  return eventChannel<DeviceEvent>((emit) => {
    const unitAt = (e: MouseEvent): UnitPoint => {
      const r = element.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    // Pointers pressed on the element. A window move from any other pointer over
    // another element (a panel above the canvas) is not this surface's hover.
    const pressed = new Set<number>();

    const pointer =
      (kind: 'down' | 'move' | 'up' | 'cancel') =>
      (e: PointerEvent): void => {
        if (kind === 'down') pressed.add(e.pointerId);
        if (kind === 'move' && e.target !== element && !pressed.has(e.pointerId)) return;
        if (kind === 'up' || kind === 'cancel') pressed.delete(e.pointerId);
        emit({
          kind,
          t: e.timeStamp,
          pointer: e.pointerId,
          pointerType:
            e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse',
          button: e.button === 1 || e.button === 2 ? e.button : 0,
          at: unitAt(e),
          mods: modsOf(e),
        });
      };
    const onDown = pointer('down');
    const onMove = pointer('move');
    const onUp = pointer('up');
    const onCancel = pointer('cancel');
    const onLeave = (e: PointerEvent): void => emit({ kind: 'leave', t: e.timeStamp });
    const onContextMenu = (e: Event): void => e.preventDefault();
    const onWheel = (e: WheelEvent): void => {
      // Suppresses page scroll, which needs `{ passive: false }` below.
      e.preventDefault();
      const deltaY = e.ctrlKey ? e.deltaY * PINCH_WHEEL_GAIN : e.deltaY;
      emit({
        kind: 'wheel',
        t: e.timeStamp,
        ratio: Math.exp(deltaY * WHEEL_ZOOM_K),
        at: unitAt(e),
        mods: modsOf(e),
      });
    };
    const observer = new ResizeObserver(() =>
      emit({
        kind: 'resize',
        t: performance.now(),
        widthPx: element.clientWidth,
        heightPx: element.clientHeight,
      }),
    );

    // `pointerdown` on the element (a gesture must START on the drawing surface), but
    // move / up / cancel on `window`, so a drag that leaves the element keeps orbiting
    // — and, load-bearing on iOS, NEVER call `setPointerCapture`: touch pointers get
    // IMPLICIT capture on pointerdown, and WebKit mishandles an explicit capture
    // layered on top, silently killing `pointermove`/`pointerup` for single-finger
    // orbit and pinch while desktop mouse stays fine.
    // https://github.com/openseadragon/openseadragon/issues/1962
    element.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    element.addEventListener('pointerleave', onLeave);
    // Pan uses the right/middle button. Element only, so right-click still works
    // everywhere else on the page.
    element.addEventListener('contextmenu', onContextMenu);
    element.addEventListener('wheel', onWheel, { passive: false });
    observer.observe(element);

    return () => {
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('contextmenu', onContextMenu);
      element.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  }, buffers.expanding());
}
