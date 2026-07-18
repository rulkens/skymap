/**
 * tourRegistry tests — freeze the registry contract: every entry's `id` matches
 * its key, and every registered tour carries a non-empty label and at least one
 * beat.
 *
 * The `Record<TourId, Tour>` typing already proves at compile time that the
 * registry covers exactly the `TourId` union; these runtime checks catch an
 * id/key mismatch tsc cannot see, and confirm each tour is launchable.
 */

import { describe, it, expect } from 'vitest';
import { tourRegistry } from '../../../../src/data/animation/tours/tourRegistry';

describe('tourRegistry', () => {
  it('keys each tour under its own id', () => {
    for (const [key, tour] of Object.entries(tourRegistry)) {
      expect(tour.id).toBe(key);
    }
  });

  it('gives every tour a non-empty label and at least one beat', () => {
    for (const tour of Object.values(tourRegistry)) {
      expect(tour.label.length).toBeGreaterThan(0);
      expect(tour.beats.length).toBeGreaterThan(0);
    }
  });
});
