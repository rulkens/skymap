/**
 * Click-to-seek and drag-to-scrub on the ruler. The pointer time snaps to a cue within SNAP_PX
 * (snapTime); Alt turns snapping off, Shift scrubs at a tenth of the pointer speed (and does not snap).
 * The transport hears the gesture's start and end through `scrub`, to pause a play under the pointer.
 */
import { useRef, type PointerEvent } from 'react';

import { snapTime } from '../../utils/ruler/snapTime';
import { FINE_FACTOR } from './Ruler.constants';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import type { RulerScrub } from '../../@types/RulerScrub';

export function useRulerScrub(window: TimeWindow, cueSecs: readonly number[], scrub: RulerScrub) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const last = useRef<{ x: number; sec: number } | null>(null);

  const seek = (event: PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    if (rect.width === 0) return;
    const secPerPx = (window.endSec - window.startSec) / rect.width;
    const pointerSec = window.startSec + (event.clientX - rect.left) * secPerPx;
    const from = last.current;
    const fine = event.shiftKey && from !== null;
    const raw = fine ? from.sec + (event.clientX - from.x) * secPerPx * FINE_FACTOR : pointerSec;
    const sec = event.altKey || event.shiftKey ? raw : snapTime(raw, cueSecs, secPerPx);
    last.current = { x: event.clientX, sec };
    scrub.onSeek(sec);
  };

  // A cancelled gesture (a system swipe, the capture taken away) ends the drag like a release.
  const stop = () => {
    dragging.current = false;
    scrub.onEnd();
  };

  return {
    ref,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      last.current = null;
      scrub.onStart();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      seek(event);
    },
    onPointerMove: (event: PointerEvent) => dragging.current && seek(event),
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
  };
}
