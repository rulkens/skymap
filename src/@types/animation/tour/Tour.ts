/**
 * Tour — a named, user-facing guided tour: an ordered beat sequence plus the
 * identity and label the registry and UI key off.
 *
 * `id` is the durable handle `startTour(id)` resolves against `tourRegistry`;
 * `label` is the human-readable name a launcher button shows. The `beats` are
 * the itinerary `guidedTourSaga` plays in order. Carrying `id` on the object
 * (redundant with the registry key) lets a whole `Tour` be passed around and
 * still know its own identity — the same shape as a `Clip`.
 *
 * Plain serializable data: no functions, no class instances. A beat's `focus`
 * is a durable `SelectionRef`, resolved to a world pose at playback time by
 * `visitBeatSaga`, so a tour authored against structure ids stays valid across
 * tier swaps and catalog rebuilds.
 */

import type { TourId } from './TourId';
import type { BeatData } from './BeatData';

export type Tour = {
  readonly id: TourId;
  readonly label: string;
  readonly beats: readonly BeatData[];
};
