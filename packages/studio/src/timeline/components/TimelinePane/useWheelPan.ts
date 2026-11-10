/**
 * Horizontal pan over a zoomed timeline (a viewport set; Fit has nothing to pan): a trackpad's
 * sideways swipe (deltaX), or shift+wheel where the browser leaves it in deltaY. A plain vertical
 * wheel keeps scrolling the rows. Pixels convert to seconds against `track`, the element spanning
 * the lanes' time axis.
 */
import type { RefObject, WheelEvent } from 'react';

import { viewportSet } from '../../../session/state/studioSlice';
import { panWindow } from '../../utils/window/panWindow';
import { viewWindow } from '../../utils/window/viewWindow';
import { useAppDispatch } from '../../../../../../src/store/hooks';
import { LINE_PX } from './useWheelPan.constants';
import type { Timeline } from '../../../@types/rows/Timeline';
import type { TimeWindow } from '../../../@types/session/TimeWindow';

export function useWheelPan(
  track: RefObject<HTMLElement | null>,
  viewport: TimeWindow | null,
  timeline: Timeline | null,
) {
  const dispatch = useAppDispatch();
  return (event: WheelEvent) => {
    const delta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const width = track.current?.clientWidth ?? 0;
    if (viewport === null || timeline === null || delta === 0 || width === 0) return;
    const px = event.deltaMode === 1 ? delta * LINE_PX : delta;
    const deltaSec = (px * (viewport.endSec - viewport.startSec)) / width;
    dispatch(viewportSet(panWindow(viewport, viewWindow(null, timeline), deltaSec)));
  };
}
