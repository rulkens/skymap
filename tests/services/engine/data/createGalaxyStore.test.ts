import { describe, it, expect } from 'vitest';
import { createGalaxyStore } from '../../../../src/services/engine/data/createGalaxyStore';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

const fakeCatalog = (count: number) => ({ count }) as unknown as GalaxyCatalog;

describe('createGalaxyStore', () => {
  it('starts empty', () => {
    const s = createGalaxyStore();
    expect(s.catalogs.size).toBe(0);
    expect(s.get(Source.Glade)).toBeUndefined();
  });

  it('setCatalog / get / removeCatalog round-trip', () => {
    const s = createGalaxyStore();
    const c = fakeCatalog(3);
    s.setCatalog(Source.Glade, c);
    expect(s.get(Source.Glade)).toBe(c);
    expect(s.catalogs.get(Source.Glade)).toBe(c);
    s.removeCatalog(Source.Glade);
    expect(s.get(Source.Glade)).toBeUndefined();
  });
});
