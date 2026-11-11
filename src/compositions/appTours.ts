/**
 * APP_TOUR_REGISTRY — the id → `Tour` lookup `startTour(id)` resolves against.
 *
 * Adding a tour is one row here: `TourId` is `keyof` this table, so the id follows from the row
 * and `startTour(id)` accepts it. `satisfies` still checks every value is a `Tour` without
 * widening the keys. A data table, not a switch: `watchTourSaga` indexes it with the dispatched id.
 */

import type { Tour } from '../@types/animation/tour/Tour';
import { demoTour } from '../data/animation/tours/demoTour';
import { webShowcase } from '../data/animation/tours/webShowcase';
import { grandTour } from '../data/animation/tours/grandTour';

export const APP_TOUR_REGISTRY = {
  demo: demoTour,
  webShowcase,
  grandTour,
} satisfies Record<string, Tour>;
