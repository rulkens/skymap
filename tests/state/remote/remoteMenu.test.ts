import { describe, expect, it } from 'vitest';

import { REMOTE_MENU } from '../../../src/state/remote/remoteMenu';
import { clipRegistry } from '../../../src/data/animation/clips/clipRegistry';
import { APP_TOUR_REGISTRY } from '../../../src/compositions/appTours';

describe('REMOTE_MENU', () => {
  it('leaves dev tours and dev clips off', () => {
    const devTours = Object.values(APP_TOUR_REGISTRY).filter((t) => t.dev);
    const devClips = Object.values(clipRegistry).filter((c) => c.dev);
    expect(devTours.length).toBeGreaterThan(0);
    expect(devClips.length).toBeGreaterThan(0);
    const listed = new Set([...REMOTE_MENU.tours, ...REMOTE_MENU.clips].map((r) => r.id as string));
    for (const row of [...devTours, ...devClips]) expect(listed.has(row.id)).toBe(false);
  });
});
