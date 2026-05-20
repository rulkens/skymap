import { describe, it, expect } from 'vitest';
import {
  Source,
  SOURCE_REGISTRY,
  sourceLabel,
  sourceIsAllSky,
  ALL_VISIBLE_MASK,
  maskHas,
  maskWith,
  maskWithout,
} from '../src/data/sources';

describe('Source enum', () => {
  it('has stable numeric values used in the binary format', () => {
    // These integers are baked into every `.bin` cloud file ever written, so
    // pinning them in a test guards against an accidental renumbering during
    // a refactor — see the rationale in the module's docstring.
    expect(Source.Synthetic).toBe(0);
    expect(Source.SDSS).toBe(1);
    expect(Source.TwoMRS).toBe(2);
    expect(Source.Glade).toBe(3);
  });
});

describe('sourceLabel', () => {
  it('returns human-readable names', () => {
    expect(sourceLabel(Source.SDSS)).toBe('SDSS');
    expect(sourceLabel(Source.TwoMRS)).toBe('2MRS');
    // GLADE is uppercase to match how the catalog team publishes it.
    expect(sourceLabel(Source.Glade)).toBe('GLADE');
    expect(sourceLabel(Source.Synthetic)).toBe('Synthetic');
  });
});

describe('source coverage metadata', () => {
  it('flags all-sky sources', () => {
    expect(sourceIsAllSky(Source.TwoMRS)).toBe(true);
    // GLADE is full-sky by design — it merges multiple all-sky parent
    // catalogs (HyperLEDA, 2MASS XSC, GWGC, 2MPZ, 6dFGS, SDSS-DR12Q).
    expect(sourceIsAllSky(Source.Glade)).toBe(true);
    expect(sourceIsAllSky(Source.SDSS)).toBe(false);
  });
  it('reports approximate maximum distance per survey in Mpc', () => {
    expect(SOURCE_REGISTRY[Source.TwoMRS].maxDistMpc).toBeLessThan(300);
    // GLADE's distance distribution has a long tail past 1 Gpc; we choose
    // a generous band-edge here so the auto-LOD heuristic includes it in
    // the mid-range view.
    expect(SOURCE_REGISTRY[Source.Glade].maxDistMpc).toBeGreaterThan(800);
    expect(SOURCE_REGISTRY[Source.SDSS].maxDistMpc).toBeGreaterThan(2000);
  });
});

describe('source mask helpers', () => {
  it('ALL_VISIBLE_MASK has every defined source bit set', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.SDSS)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Glade)).toBe(true);
  });
  it('maskHas / maskWith / maskWithout flip individual bits', () => {
    let m = 0;
    expect(maskHas(m, Source.SDSS)).toBe(false);
    m = maskWith(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    m = maskWithout(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(false);
  });
});
