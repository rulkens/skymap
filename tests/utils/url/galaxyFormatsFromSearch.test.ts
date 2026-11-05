import { describe, it, expect } from 'vitest';
import { galaxyFormatsFromSearch } from '../../../src/utils/url/galaxyFormatsFromSearch';
import { Source } from '../../../src/data/source';

describe('galaxyFormatsFromSearch', () => {
  it('reads pairs and drops unknown sources, unknown formats and octree on a flat-only row', () => {
    expect(galaxyFormatsFromSearch('?galaxyFormat=glade:skmp')).toEqual({ [Source.Glade]: 'skmp' });
    expect(galaxyFormatsFromSearch('?galaxyFormat=glade:octree,sdss:skmp')).toEqual({
      [Source.Glade]: 'octree',
      [Source.SDSS]: 'skmp',
    });
    expect(galaxyFormatsFromSearch('?galaxyFormat=nope:skmp,glade:flat,glade')).toEqual({});
    expect(galaxyFormatsFromSearch('?galaxyFormat=sdss:octree')).toEqual({});
    expect(galaxyFormatsFromSearch('')).toEqual({});
  });
});
