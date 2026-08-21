/**
 * Unit tests for `aladinLiteUrl` — pure URL builder for the Aladin Lite
 * external sky viewer.
 *
 * Validates URL shape, param values, and the arcmin→degree FOV conversion
 * that frames the viewer the same as the InfoCard thumbnail's field of view.
 */

import { describe, it, expect } from 'vitest';
import { aladinLiteUrl } from '../../../src/utils/math/aladinLiteUrl';

describe('aladinLiteUrl', () => {
  it('builds the canonical Aladin Lite URL', () => {
    // Pinning the exact URL guards against accidental param renames that
    // would silently break the external link.
    expect(aladinLiteUrl(180.5, 12.3, 60)).toBe(
      'https://aladin.cds.unistra.fr/AladinLite/' +
        '?target=180.5%2012.3&fov=1&survey=CDS%2FP%2FDSS2%2Fcolor',
    );
  });

  it('accepts negative declinations (southern hemisphere)', () => {
    const url = aladinLiteUrl(0, -45.5, 2);
    expect(url).toContain('target=0%20-45.5');
  });

  it('converts fovArcmin to degrees — 90 arcmin → fov=1.5 deg', () => {
    expect(aladinLiteUrl(0, 0, 90)).toContain('fov=1.5');
  });

  it('floors small FOVs so DSS2 imagery opens near native resolution', () => {
    // Thumbnail framings of a few arcmin would upscale DSS2 (~1"/px) into
    // mush in a full-screen viewport; the builder zooms those out to 30'.
    expect(aladinLiteUrl(0, 0, 2)).toContain(`fov=${30 / 60}`);
    expect(aladinLiteUrl(0, 0, 45)).toContain(`fov=${45 / 60}`);
  });

  it('uses the same DSS2 colour composite survey as the DSS thumbnails', () => {
    expect(aladinLiteUrl(0, 0, 2)).toContain('survey=CDS%2FP%2FDSS2%2Fcolor');
  });
});
