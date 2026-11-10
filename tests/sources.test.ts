import { describe, it, expect } from 'vitest';
import { Source } from '../src/data/source';

describe('Source enum', () => {
  it('values are the entries’ ids, which key every asset and ref', () => {
    expect(Source.SDSS).toBe('sdss');
    expect(Source.TwoMRS).toBe('2mrs');
    expect(Source.Glade).toBe('glade');
  });
});
