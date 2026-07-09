/**
 * tourRegistry — the id → `Tour` lookup `startTour(id)` resolves against.
 *
 * Typed `Record<TourId, Tour>`, so the registry must cover every `TourId` and
 * may use no key outside the union — adding a tour is a two-line change (its id
 * in `TourId`, its entry here) that the compiler enforces in both directions. A
 * data table, not a switch: `watchTourSaga` indexes it with the dispatched id,
 * no control-flow edit per tour.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import type { TourId } from '../../../@types/animation/tour/TourId';
import { demoTour } from './demoTour';
import { webShowcase } from './webShowcase';
import { grandTour } from './grandTour';

export const tourRegistry: Record<TourId, Tour> = {
  demo: demoTour,
  webShowcase,
  grandTour,
};
