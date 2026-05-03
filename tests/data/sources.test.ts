import { describe, it, expect } from 'vitest';
import {
  Source,
  ALL_SOURCES,
  ALL_VISIBLE_MASK,
  sourceLabel,
  sourceIsAllSky,
  sourceMaxDistanceMpc,
  bandLabels,
  maskHas,
} from '../../src/data/sources';

describe('Source.Famous', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.Famous).toBe(4);
  });

  it('appears in ALL_SOURCES', () => {
    expect(ALL_SOURCES).toContain(Source.Famous);
  });

  it('is included in ALL_VISIBLE_MASK', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.Famous)).toBe(true);
  });

  it('has a non-empty display label', () => {
    expect(sourceLabel(Source.Famous).length).toBeGreaterThan(0);
  });

  it('is treated as all-sky (cherry-picked entries from anywhere)', () => {
    expect(sourceIsAllSky(Source.Famous)).toBe(true);
  });

  it('has a sensible default max-distance for camera framing', () => {
    // Famous nearby galaxies span M31 (0.78 Mpc) to NGC 4889 (~94 Mpc);
    // pad to 200 Mpc so the camera frames the whole catalog comfortably.
    expect(sourceMaxDistanceMpc(Source.Famous)).toBeGreaterThanOrEqual(200);
  });

  it('exposes the SDSS-like band layout (curated metadata uses optical bands)', () => {
    // Curated entries don't carry photometry; the band layout is cosmetic
    // — InfoCard uses it to label colour rows. We mirror SDSS so the
    // existing FullCard markup renders cleanly without a new branch.
    const bands = bandLabels(Source.Famous);
    expect(bands.g).toBeTruthy();
  });
});
