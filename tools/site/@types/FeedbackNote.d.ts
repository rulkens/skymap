import type { FeedbackElement } from './FeedbackElement';
import type { FeedbackFlight } from './FeedbackFlight';
import type { FeedbackRect } from './FeedbackRect';

/** One note as the dev overlay posts it and the endpoint stores it, one JSON file per note. */
export type FeedbackNote = {
  text: string;
  timestamp: string;
  page: { url: string; path: string; title: string };
  viewport: { width: number; height: number; devicePixelRatio: number };
  scroll: { x: number; y: number };
  flight: FeedbackFlight | null;
  /** `element` when a click chose it; `rectangle` when a drag drew the area. */
  selection: 'element' | 'rectangle';
  rect: { page: FeedbackRect; viewport: FeedbackRect };
  element: FeedbackElement;
  userAgent: string;
};
