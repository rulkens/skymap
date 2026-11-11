/**
 * Click-to-seek and drag-to-scrub on the ruler. The pointer time snaps to a cue within SNAP_PX
 * (snapTime); Alt turns snapping off, Shift scrubs at a tenth of the pointer speed (and does not snap).
 */
import { useRef, type PointerEvent } from 'react';

import { playheadSet } from '../../../session/state/studioSlice';
import { snapTime } from '../../utils/ruler/snapTime';
import { FINE_FACTOR } from './Ruler.constants';
import { useAppDispatch } from '../../../../../../src/store/hooks';
import type { TimeWindow } from '../../../@types/session/TimeWindow';

export function useRulerScrub(window: TimeWindow, cueSecs: readonly number[]) {
  const dispatch = useAppDispatch();
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
    dispatch(playheadSet(sec));
  };

  // A cancelled gesture (a system swipe, the capture taken away) ends the drag like a release.
  const stop = () => {
    dragging.current = false;
  };

  return {
    ref,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      last.current = null;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      seek(event);
    },
    onPointerMove: (event: PointerEvent) => dragging.current && seek(event),
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
  };
}
