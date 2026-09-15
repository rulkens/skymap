import { describe, it, expect } from 'vitest';
import { Source } from '../src/data/sources';
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

describe('source mask helpers', () => {
  it('maskHas / maskWith / maskWithout flip individual bits', () => {
    let m = 0;
    expect(maskHas(m, Source.SDSS)).toBe(false);
    m = maskWith(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    m = maskWithout(m, Source.SDSS);
    expect(maskHas(m, Source.SDSS)).toBe(false);
  });
});
