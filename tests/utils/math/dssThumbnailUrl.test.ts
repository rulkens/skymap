import { describe, it, expect } from 'vitest';
import { dssThumbnailUrl } from '../../../src/utils/math/dssThumbnailUrl';

describe('dssThumbnailUrl', () => {
  it('respects a custom arcmin field — 4 arcmin → fov=0.0666… deg', () => {
    expect(dssThumbnailUrl(180, 0, 4)).toContain(`fov=${4 / 60}`);
  });

  it('renders width and height at the atlas slot size (128 px)', () => {
    const url = dssThumbnailUrl(12.345, -45.678);
    expect(url).toContain('width=128&height=128');
  });

  it('uses the URL-encoded HiPS path for the DSS2 colour composite', () => {
    // hips2fits requires the slashes in the HiPS path to be percent-
    // encoded — `CDS/P/DSS2/color` → `CDS%2FP%2FDSS2%2Fcolor`.
    expect(dssThumbnailUrl(0, 0)).toContain('hips=CDS%2FP%2FDSS2%2Fcolor');
  });
});
