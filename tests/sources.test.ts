import { describe, it, expect } from 'vitest';
import { Source } from '../src/data/source';

describe('Source enum', () => {
  it('has stable numeric values used in the binary format', () => {
    // These integers are baked into every `.bin` cloud file ever written, so
    // pinning them in a test guards against an accidental renumbering during
    // a refactor — see the rationale in the module's docstring.
    expect(Source.SDSS).toBe(1);
    expect(Source.TwoMRS).toBe(2);
    expect(Source.Glade).toBe(3);
  });
});
