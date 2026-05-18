import { describe, expect, it } from 'vitest';
import { POI_STYLES } from '../../src/services/engine/subsystems/poiSubsystem';
import type { PoiCategory } from '../../src/services/engine/subsystems/poiSubsystem';

describe('POI category registry', () => {
  it('exposes the four expected category keys', () => {
    expect(Object.keys(POI_STYLES).sort()).toEqual(
      ['cluster', 'famousGalaxy', 'supercluster', 'void'].sort(),
    );
  });

  it('every style entry has the required fields', () => {
    for (const [key, style] of Object.entries(POI_STYLES)) {
      expect(style.labelColor, `${key}.labelColor`).toHaveLength(4);
      expect(style.minPixelSize, `${key}.minPixelSize`).toBeGreaterThan(0);
      expect(style.maxPixelSize, `${key}.maxPixelSize`).toBeGreaterThan(style.minPixelSize);
      expect(style.worldEmMpc, `${key}.worldEmMpc`).toBeGreaterThan(0);
      expect(style.pixelWidth, `${key}.pixelWidth`).toBeGreaterThan(0);
    }
  });

  it('famousGalaxy is the only category with lineColor (label anchor-line)', () => {
    // lineColor is consumed only inside the `labelAnchorOffsetMpc`
    // branch in produceLabels; only famous-galaxy POIs set that field.
    // Cluster / SC / void omit lineColor to make the dead surface
    // structurally absent rather than silently no-op.  The union-typed
    // Object.entries view loses per-key narrowing, so we cast each
    // value to a structural shape to read the optional slot.
    for (const [key, style] of Object.entries(POI_STYLES)) {
      const lineColor = (style as { lineColor?: readonly number[] }).lineColor;
      if (key === 'famousGalaxy') {
        expect(lineColor, `${key}.lineColor`).toHaveLength(4);
      } else {
        expect(lineColor, `${key}.lineColor`).toBeUndefined();
      }
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
