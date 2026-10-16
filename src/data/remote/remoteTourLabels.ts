/**
 * Tour labels for the remote's buttons, a copy for the same reason as `remoteExhibitLabels`
 * (`tourRegistry` reaches the engine). `null` marks the dev harness tour, which is not offered.
 */
import type { TourId } from '../../@types/animation/tour/TourId';

export const REMOTE_TOUR_LABELS: Record<TourId, string | null> = {
  demo: null,
  webShowcase: 'Named Cosmic Web',
  grandTour: 'The Long Way Out',
};
