import { describe, it, expect } from 'vitest';
import { dssThumbnailUrl } from '../../../src/utils/math/dssThumbnailUrl';

describe('dssThumbnailUrl', () => {
  it('builds the CDS hips2fits endpoint with default 2-arcmin field', () => {
    // 2 arcmin = 1/30 degrees ≈ 0.03333…  Expressed exactly as `2 / 60` for
    // the toString() representation that `template-literal interpolation`
    // produces — match the `Number.toString()` shape `0.03333333333333333`.
    expect(dssThumbnailUrl(180, 0)).toBe(
      'https://alasky.cds.unistra.fr/hips-image-services/hips2fits' +
        '?hips=CDS%2FP%2FDSS2%2Fred' +
        '&ra=180&dec=0' +
        `&fov=${2 / 60}&width=128&height=128&format=jpg`,
    );
  });

  it('respects a custom arcmin field — 4 arcmin → fov=0.0666… deg', () => {
    expect(dssThumbnailUrl(180, 0, 4)).toContain(`fov=${4 / 60}`);
  });

  it('renders width and height at the atlas slot size (128 px)', () => {
    const url = dssThumbnailUrl(12.345, -45.678);
    expect(url).toContain('width=128&height=128');
  });

  it('uses the URL-encoded HiPS path for DSS2 red', () => {
    // hips2fits requires the slashes in the HiPS path to be percent-
    // encoded — `CDS/P/DSS2/red` → `CDS%2FP%2FDSS2%2Fred`.
    expect(dssThumbnailUrl(0, 0)).toContain('hips=CDS%2FP%2FDSS2%2Fred');
  });
});
