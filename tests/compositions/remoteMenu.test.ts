import { describe, expect, it } from 'vitest';

import { REMOTE_MENU } from '../../src/compositions/remoteMenu';
import { clipRegistry } from '../../src/data/animation/clips/clipRegistry';
import { tourRegistry } from '../../src/data/animation/tours/tourRegistry';

describe('REMOTE_MENU', () => {
  it('leaves dev tours and dev clips off', () => {
    const devTours = Object.values(tourRegistry).filter((t) => t.dev);
    const devClips = Object.values(clipRegistry).filter((c) => c.dev);
    expect(devTours.length).toBeGreaterThan(0);
    expect(devClips.length).toBeGreaterThan(0);
    const listed = new Set([...REMOTE_MENU.tours, ...REMOTE_MENU.clips].map((r) => r.id as string));
    for (const row of [...devTours, ...devClips]) expect(listed.has(row.id)).toBe(false);
  });
});
