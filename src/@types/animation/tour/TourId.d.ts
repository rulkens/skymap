/**
 * TourId — the stable string id of a tour, derived from the keys of `APP_TOUR_REGISTRY`.
 *
 * Adding a tour is one row in that registry; the id follows and `startTour(id)` accepts it.
 *
 * An id may be referenced from a persisted URL or a shared link, so renaming one silently breaks
 * those. Add new rows; retire old ones deliberately.
 */

import type { APP_TOUR_REGISTRY } from '../../../compositions/appTours';

export type TourId = keyof typeof APP_TOUR_REGISTRY;
