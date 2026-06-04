import { describe, expect, it } from 'vitest';
import { STRUCTURE_POI_STYLES } from '../../src/services/engine/presentation/structurePoiStyles';
import { FAMOUS_LABEL_STYLE } from '../../src/services/engine/presentation/famousLabelStyle';
import type { PoiCategory } from '../../src/@types/engine/data/PoiCategory';

describe('POI category styles (split into structure + famous tables)', () => {
  it('STRUCTURE_POI_STYLES exposes the three structure category keys', () => {
    expect(Object.keys(STRUCTURE_POI_STYLES).sort()).toEqual(
      ['cluster', 'supercluster', 'void'].sort(),
    );
  });

  it('every structure style entry has the required fields', () => {
    for (const [key, style] of Object.entries(STRUCTURE_POI_STYLES)) {
      expect(style.labelColor, `${key}.labelColor`).toHaveLength(4);
      expect(style.minPixelSize, `${key}.minPixelSize`).toBeGreaterThan(0);
      expect(style.maxPixelSize, `${key}.maxPixelSize`).toBeGreaterThan(style.minPixelSize);
      expect(style.worldEmMpc, `${key}.worldEmMpc`).toBeGreaterThan(0);
      expect(style.pixelWidth, `${key}.pixelWidth`).toBeGreaterThan(0);
      // Structures always set a halo + ring tint (no nullable opt-out).
      expect(style.haloColor, `${key}.haloColor`).toHaveLength(4);
      expect(style.ringColor, `${key}.ringColor`).toHaveLength(4);
    }
  });

  it('the famous label style carries the anchor-line colour (lifted label)', () => {
    // Famous galaxies lift their label off the dot with a connecting line;
    // lineColor drives that anchor. Structures anchor at the ring centre and
    // have no lineColor field at all (it lives only on the famous style).
    expect(FAMOUS_LABEL_STYLE.lineColor).toHaveLength(4);
    expect(FAMOUS_LABEL_STYLE.labelColor).toHaveLength(4);
    expect(FAMOUS_LABEL_STYLE.minPixelSize).toBeGreaterThan(0);
    expect(FAMOUS_LABEL_STYLE.fadeBandPx).toBeGreaterThan(0);
  });

  it('PoiCategory is the four-category union (compile-time check)', () => {
    const c1: PoiCategory = 'cluster';
    const c2: PoiCategory = 'supercluster';
    const c3: PoiCategory = 'famousGalaxy';
    const c4: PoiCategory = 'void';
    expect([c1, c2, c3, c4]).toEqual(['cluster', 'supercluster', 'famousGalaxy', 'void']);
  });
});
