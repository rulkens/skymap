/**
 * Tests for the pure POI-id URL codec.
 *
 * The codec encodes a POI selection (cluster / supercluster / void / wall)
 * into the `#poi=<id>` hash and decodes the inverse.  Sister test file to
 * `focusUrl.test.ts`; deliberately separate because the two URL schemes
 * (galaxy `#focus=…` and POI `#poi=…`) evolve independently.
 */

import { describe, it, expect } from 'vitest';
import { parsePoiHash, poiIdToHash } from '../../../src/services/url/poiUrl';

describe('parsePoiHash', () => {
  it('parses #poi=virgo-m87 → virgo-m87', () => {
    expect(parsePoiHash('#poi=virgo-m87')).toBe('virgo-m87');
  });

  it('accepts no leading #', () => {
    expect(parsePoiHash('poi=virgo-m87')).toBe('virgo-m87');
  });

  it('returns null for unrelated hashes', () => {
    expect(parsePoiHash('#focus=m31')).toBeNull();
    expect(parsePoiHash('#about')).toBeNull();
    expect(parsePoiHash('')).toBeNull();
  });

  it('rejects unsafe characters', () => {
    // Same character-class as focusUrl: letters / digits / underscore / dash.
    expect(parsePoiHash('#poi=virgo m87')).toBeNull();
    expect(parsePoiHash('#poi=<script>')).toBeNull();
  });
});

describe('poiIdToHash', () => {
  it('builds #poi=<id>', () => {
    expect(poiIdToHash('virgo-m87')).toBe('poi=virgo-m87');
  });
});
