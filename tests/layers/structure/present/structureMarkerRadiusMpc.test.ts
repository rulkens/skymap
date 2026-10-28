import { describe, expect, it } from 'vitest';
import { structureMarkerRadiusMpc } from '../../../../src/layers/structure/present/structureMarkerRadiusMpc';
import { STRUCTURE_MARKER_STYLES } from '../../../../src/layers/structure/present/structureMarkerStyles';
import { buildStaticAnchorStructures } from '../../../../src/layers/structure/load/buildStaticAnchorStructures';

const byId = (id: string) => buildStaticAnchorStructures().find((s) => s.id === id)!;
const PX_PER_RAD = 1000;
const px = (radiusMpc: number, distanceMpc: number) => (radiusMpc / distanceMpc) * PX_PER_RAD;

describe('structureMarkerRadiusMpc', () => {
  it('holds a point at its pixel floor however far away it is', () => {
    const gw = byId('transient-gw170817');
    const style = STRUCTURE_MARKER_STYLES.transient;
    for (const distanceMpc of [100, 4000, 1e5]) {
      expect(
        px(structureMarkerRadiusMpc(gw, style, distanceMpc, PX_PER_RAD), distanceMpc),
      ).toBeCloseTo(style.pointRadiusPx!);
    }
  });

  it('draws a point at its own size once that is larger than the floor', () => {
    const gw = byId('transient-gw170817');
    expect(structureMarkerRadiusMpc(gw, STRUCTURE_MARKER_STYLES.transient, 0.01, PX_PER_RAD)).toBe(
      gw.apparentRadiusMpc,
    );
  });

  it('leaves a region unfloored, so it can fade out when tiny', () => {
    const coma = byId('galaxy-cluster-coma-a1656');
    expect(
      structureMarkerRadiusMpc(coma, STRUCTURE_MARKER_STYLES['galaxy-cluster'], 1e6, PX_PER_RAD),
    ).toBe(coma.apparentRadiusMpc);
  });
});
