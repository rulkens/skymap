import { describe, expect, it } from 'vitest';
import { POI_STYLES } from '../../src/services/engine/subsystems/poiSubsystem';
import type { PoiCategory } from '../../src/services/engine/subsystems/poiSubsystem';

describe('POI category registry', () => {
  it('exposes the four expected category keys', () => {
    expect(Object.keys(POI_STYLES).sort()).toEqual(
      ['cluster', 'famousGalaxy', 'supercluster', 'void'].sort(),
    );
  });

  it('every style entry has the four required fields', () => {
    for (const [key, style] of Object.entries(POI_STYLES)) {
      expect(style.labelColor, `${key}.labelColor`).toHaveLength(4);
      expect(style.lineColor, `${key}.lineColor`).toHaveLength(4);
      expect(style.pixelSize, `${key}.pixelSize`).toBeGreaterThan(0);
      expect(style.worldEmMpc, `${key}.worldEmMpc`).toBeGreaterThan(0);
      expect(style.pixelWidth, `${key}.pixelWidth`).toBeGreaterThan(0);
    }
  });

  it('PoiCategory is the literal union of POI_STYLES keys (compile-time check)', () => {
    const c1: PoiCategory = 'cluster';
    const c2: PoiCategory = 'supercluster';
    const c3: PoiCategory = 'famousGalaxy';
    const c4: PoiCategory = 'void';
    expect([c1, c2, c3, c4]).toEqual(['cluster', 'supercluster', 'famousGalaxy', 'void']);
  });
});
