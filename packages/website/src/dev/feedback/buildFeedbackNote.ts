import type { FeedbackNote } from '../../../../../tools/site/@types/FeedbackNote';
import type { FeedbackSelection } from './@types/FeedbackSelection';
import { describeElement } from './describeElement';
import { flightState } from './flightState';
import { viewRect } from './viewRect';

/** The note as the endpoint stores it: the words, the area, and enough of the page to find it again. */
export function buildFeedbackNote(
  { kind, rect, element }: FeedbackSelection,
  text: string,
): FeedbackNote {
  return {
    text: text.trim(),
    timestamp: new Date().toISOString(),
    page: { url: location.href, path: location.pathname, title: document.title },
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
    flight: flightState(),
    selection: kind,
    rect: { page: rect, viewport: viewRect(rect, window) },
    element: describeElement(element),
    userAgent: navigator.userAgent,
  };
}
