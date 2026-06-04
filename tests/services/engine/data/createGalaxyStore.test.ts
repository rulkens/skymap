import { describe, it, expect } from 'vitest';
import { createGalaxyStore } from '../../../../src/services/engine/data/createGalaxyStore';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

const fakeCatalog = (count: number) => ({ count }) as unknown as GalaxyCatalog;

describe('createGalaxyStore', () => {
  it('starts empty', () => {
    const s = createGalaxyStore();
    expect(s.catalogs.size).toBe(0);
    expect(s.famousMeta).toEqual([]);
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

  it('setFamousMeta replaces and exposes a readonly view', () => {
    const s = createGalaxyStore();
    s.setFamousMeta([{ id: 'm31' } as never]);
    expect(s.famousMeta.map((e) => e.id)).toEqual(['m31']);
  });

  it('famousLabelsVisible defaults true and the setter flips it', () => {
    const s = createGalaxyStore();
    expect(s.famousLabelsVisible).toBe(true);
    s.setFamousLabelsVisible(false);
    expect(s.famousLabelsVisible).toBe(false);
    s.setFamousLabelsVisible(true);
    expect(s.famousLabelsVisible).toBe(true);
  });
});
