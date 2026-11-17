import { describe, expect, it } from 'vitest';
import { galaxyEntryOf } from '../../../../../src/layers/galaxyCatalog/records/utils/galaxyEntryOf';

describe('galaxyEntryOf', () => {
  it('returns the Layer row for a galaxy source and undefined for another Layer’s source', () => {
    expect(galaxyEntryOf('sdss')?.type).toBe('galaxyCatalog');
    expect(galaxyEntryOf('gaiaStars')).toBeUndefined();
  });
});
