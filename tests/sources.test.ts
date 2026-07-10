import { describe, it, expect } from 'vitest';
import { Source, SOURCE_REGISTRY } from '../src/data/sources';
import { ALL_VISIBLE_MASK } from '../src/utils/allVisibleMask';
import { maskHas } from '../src/utils/maskHas';
import { maskWith } from '../src/utils/maskWith';
import { maskWithout } from '../src/utils/maskWithout';

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

describe('source coverage metadata', () => {
  it('reports approximate maximum distance per galaxy catalog in Mpc', () => {
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
