import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { nearTrailPiece } from '../../../src/utils/trails/nearTrailPiece';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

// The body circles the Sun at 1.5e8 km; the craft keeps a fixed offset from it.
const ORBIT_KM = 1.5e8;
const OFFSET_KM: Vec3 = [1e6, 0, 0];
const T0 = 2460000;
const PERIOD_DAYS = 365;
const W = (2 * Math.PI) / (PERIOD_DAYS * 86400);

const bodyKm = (t: number): Vec3 => {
  const a = (2 * Math.PI * (t - T0)) / PERIOD_DAYS;
  return [ORBIT_KM * Math.cos(a), ORBIT_KM * Math.sin(a), 0];
};
const positionAt = (id: string, t: number): Vec3 => {
  const p = id === 'sun' ? ([0, 0, 0] as Vec3) : bodyKm(t);
  return [p[0] * SCALE_UNITS.KM_TO_MPC, p[1] * SCALE_UNITS.KM_TO_MPC, p[2] * SCALE_UNITS.KM_TO_MPC];
};

function craft(): SampledTrack {
  const n = 11;
  const tDays = new Float64Array(n);
  const posKm = new Float64Array(3 * n);
  const velKmS = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const t = T0 + 10 + i * 2;
    const a = W * (t - T0) * 86400;
    tDays[i] = t;
    const b = bodyKm(t);
    posKm.set([b[0] + OFFSET_KM[0], b[1] + OFFSET_KM[1], b[2]], 3 * i);
    velKmS.set([-ORBIT_KM * W * Math.sin(a), ORBIT_KM * W * Math.cos(a), 0], 3 * i);
  }
  return { id: 'c', tDays, posKm, velKmS };
}

describe('nearTrailPiece', () => {
  it('holds a craft at a fixed offset from its centre at the offset, ends on the stay', () => {
    const stay = { centreId: asSceneBodyId('earth'), t0Days: T0 + 11.3, t1Days: T0 + 27.9 };
    const piece = nearTrailPiece(craft(), stay, positionAt);
    expect(piece.centreId).toBe('earth');
    expect(piece.tDays[0]).toBe(stay.t0Days);
    expect(piece.tDays[piece.tDays.length - 1]).toBe(stay.t1Days);
    for (let i = 0; i < piece.tDays.length; i++) {
      for (let k = 0; k < 3; k++) {
        const km = piece.relMpc[3 * i + k]! / SCALE_UNITS.KM_TO_MPC;
        expect(Math.abs(km - OFFSET_KM[k]!)).toBeLessThan(1);
      }
    }
  });
});
