/**
 * Click-to-seek and drag-to-scrub on the ruler. The pointer time snaps to a cue within SNAP_PX
 * (snapTime); Alt turns snapping off, Shift scrubs at a tenth of the pointer speed (and does not snap).
 * A press while playing pauses for the gesture, so the clip never plays on under a held pointer, and
 * the release resumes from where the head was left (Q-D).
 */
import { useRef, type PointerEvent } from 'react';

import { paused, played, playheadSet } from '../../../session/state/studioSlice';
import { selectPlayheadSec, selectTransport } from '../../../session/state/selectors';
import { snapTime } from '../../utils/ruler/snapTime';
import { FINE_FACTOR } from './Ruler.constants';
import { useAppStore } from '../../../../../../src/store/hooks';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import type { ClipSpan } from '../../../../../../src/@types/animation/ClipSpan';

export function useRulerScrub(window: TimeWindow, cueSecs: readonly number[]) {
  const store = useAppStore();
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // The loop of a play this gesture paused; undefined when it paused nothing. Gesture-local.
  const resume = useRef<ClipSpan | null | undefined>(undefined);
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
    store.dispatch(playheadSet(sec));
  };

  // A cancelled gesture (a system swipe, the capture taken away) ends the drag like a release.
  const stop = () => {
    dragging.current = false;
    const loop = resume.current;
    resume.current = undefined;
    if (loop !== undefined) {
      store.dispatch(played({ fromSec: selectPlayheadSec(store.getState()), loop }));
    }
  };

  return {
    ref,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      last.current = null;
      const transport = selectTransport(store.getState());
      if (transport.kind === 'running') {
        resume.current = transport.loop;
        store.dispatch(paused());
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
      seek(event);
    },
    onPointerMove: (event: PointerEvent) => dragging.current && seek(event),
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
  };
}
