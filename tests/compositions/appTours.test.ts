/**
 * APP_TOUR_REGISTRY tests — every entry's `id` matches its key, and every registered tour
 * carries a non-empty label and at least one beat.
 *
 * `TourId` derives from the registry keys, so no union/registry check is needed; these runtime
 * checks catch an id/key mismatch tsc cannot see, and confirm each tour is launchable.
 */

import { describe, it, expect } from 'vitest';
import { APP_TOUR_REGISTRY } from '../../src/compositions/appTours';

describe('APP_TOUR_REGISTRY', () => {
  it('keys each tour under its own id', () => {
    for (const [key, tour] of Object.entries(APP_TOUR_REGISTRY)) {
      expect(tour.id).toBe(key);
    }
  });

  it('gives every tour a non-empty label and at least one beat', () => {
    for (const tour of Object.values(APP_TOUR_REGISTRY)) {
      expect(tour.label.length).toBeGreaterThan(0);
      expect(tour.beats.length).toBeGreaterThan(0);
    }
  });
});
