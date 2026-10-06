import { describe, expect, it } from 'vitest';

import { siteShot } from '../../../packages/website/src/data/siteShot';
import { docFigureWide } from '../../../packages/website/src/utils/docFigureWide';

describe('docFigureWide', () => {
  it.each([
    // The app's whole window with its interface.
    ['start-arrival', true],
    // A cut of the window still far wider than the text column.
    ['guide-controls', true],
    // A cut near the text column's own width: wide would draw it larger than the app does.
    ['guide-search-typed', false],
    // The scene alone.
    ['guide-surface', false],
    ['saturn', false],
  ])('%s: %s', (id, wide) => {
    expect(docFigureWide(siteShot(id))).toBe(wide);
  });
});
