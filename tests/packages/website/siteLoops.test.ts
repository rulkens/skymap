/**
 * The loop manifest against the shot manifest, the places and the committed
 * files. A film that starts from another picture than the one it lies over
 * would jump when it appears; a file over the cap is weight every visitor who
 * points at that place pays.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLACES } from '../../../packages/website/src/data/places';
import { SITE_LOOPS } from '../../../packages/website/src/data/siteLoops';
import { siteShot } from '../../../packages/website/src/data/siteShot';
import { SITE_LOOP_PLAN } from '../../../tools/site/siteLoopPlan';

const LOOPS_DIR = resolve(import.meta.dirname, '../../../packages/website/src/assets/loops');

describe.each(SITE_LOOPS)('loop $id', (loop) => {
  it('starts from a row of the shot manifest', () => {
    expect(() => siteShot(loop.shot)).not.toThrow();
  });

  it('has both files, each within the cap', () => {
    for (const ext of ['webm', 'mp4']) {
      const file = resolve(LOOPS_DIR, `${loop.id}.${ext}`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size / 1024, file).toBeLessThanOrEqual(SITE_LOOP_PLAN.maxKb);
    }
  });
});

it('a place plays the film that starts from its own picture', () => {
  for (const place of PLACES.filter((p) => p.loop)) {
    const loop = SITE_LOOPS.find((row) => row.id === place.loop);
    expect(loop?.shot, place.id).toBe(place.shot);
  }
});
