import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { walkFiles } from '../../helpers/conventions/walkFiles';

// Bug caught: a pass or present helper comparing the eye to the cutoff by hand again, so it
// measures from somewhere other than its own region and outlives the band it should yield to.
describe('FOREGROUND_MAX_DISTANCE_MPC importers', () => {
  it('only bands and slab rows import FOREGROUND_MAX_DISTANCE_MPC', () => {
    const importers = walkFiles('src', ['.ts', '.tsx'])
      .filter((file) => /from\s+['"][^'"]*\/foregroundMaxDistance['"]/.test(readFileSync(file, 'utf8')))
      .sort();
    expect(importers).toEqual([
      'src/data/bands/foregroundRecede.ts',
      'src/data/bands/surveyDeepZoom.ts',
      'src/layers/structure/visibility.ts',
    ]);
  });
});
