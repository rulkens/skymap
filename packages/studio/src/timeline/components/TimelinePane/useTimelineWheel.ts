/**
 * The wheel over the timeline. ⌘/ctrl+wheel, and a trackpad pinch (which the browser sends as
 * ctrl+wheel), zooms about the time under the pointer; that needs a non-passive native listener to
 * keep the browser from zooming the page, which React's onWheel cannot be. A sideways swipe, or
 * shift+wheel, pans a zoomed timeline; a plain vertical wheel keeps scrolling the rows. The store is
 * read when the event lands, so the listener never holds a stale window.
 */
import { useEffect, type RefObject } from 'react';

import { selectPlayheadSec, selectViewport } from '../../../session/state/selectors';
import { viewportSet } from '../../../session/state/studioSlice';
import { selectTimeline } from '../../state/selectTimeline';
import { panWindow } from '../../utils/window/panWindow';
import { viewWindow } from '../../utils/window/viewWindow';
import { zoomedViewport } from '../../utils/window/zoomedViewport';
import { LINE_PX, WHEEL_PX_PER_ZOOM_STEP } from '../../data/zoom';
import { useAppStore } from '../../../../../../src/store/hooks';

export function useTimelineWheel(
  root: RefObject<HTMLElement | null>,
  track: RefObject<HTMLElement | null>,
  /** The pane renders nothing until the clip opens, so the listener attaches once it does. */
  mounted: boolean,
) {
  const store = useAppStore();
  useEffect(() => {
    const el = root.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent) => {
      const state = store.getState();
      const timeline = selectTimeline(state);
      const viewport = selectViewport(state);
      const width = track.current?.clientWidth ?? 0;
      if (timeline === null || width === 0) return;
      const lines = event.deltaMode === 1 ? LINE_PX : 1;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (timeline.durationSec === null) return;
        const shown = viewWindow(viewport, timeline);
        const x = (event.clientX - track.current!.getBoundingClientRect().left) / width;
        const anchor =
          x >= 0 && x <= 1
            ? shown.startSec + x * (shown.endSec - shown.startSec)
            : selectPlayheadSec(state);
        const factor = 2 ** ((event.deltaY * lines) / WHEEL_PX_PER_ZOOM_STEP);
        store.dispatch(viewportSet(zoomedViewport(viewport, timeline, factor, anchor)));
        return;
      }
      const delta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (viewport === null || delta === 0) return;
      const deltaSec = (delta * lines * (viewport.endSec - viewport.startSec)) / width;
      store.dispatch(viewportSet(panWindow(viewport, viewWindow(null, timeline), deltaSec)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [root, track, store, mounted]);
}
