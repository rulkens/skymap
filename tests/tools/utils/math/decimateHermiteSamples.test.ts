import { describe, expect, it } from 'vitest';

import { decimateHermiteSamples } from '../../../../tools/utils/math/decimateHermiteSamples';
import { hermitePositionKm } from '../../../../tools/utils/math/hermitePositionKm';

const V = 15; // km/s
const D = 6000; // km, closest-approach distance
const N = 5761; // 1-min samples over +-2 d

function flyby() {
  const t = new Float64Array(N);
  const pos = new Float64Array(3 * N);
  const vel = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    const s = (i - (N - 1) / 2) * 60; // seconds from closest approach
    const y = Math.sqrt(D * D + (V * s) ** 2 / 4);
    t[i] = 2444000.5 + s / 86400;
    pos.set([V * s, y, 0], 3 * i);
    vel.set([V, (V * V * s) / 4 / y, 0], 3 * i);
  }
  return { t, pos, vel };
}

describe('decimateHermiteSamples', () => {
  it('keeps the reconstruction within tolerance', () => {
    const { t, pos, vel } = flyby();
    const tolKm = 1;
    const kept = Array.from(decimateHermiteSamples(t, pos, vel, tolKm));
    expect(kept.length).toBeLessThan(N);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(N - 1);

    const thinT = Float64Array.from(kept, (i) => t[i]!);
    const thinPos = Float64Array.from(
      kept.flatMap((i) => [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!]),
    );
    const thinVel = Float32Array.from(
      kept.flatMap((i) => [vel[3 * i]!, vel[3 * i + 1]!, vel[3 * i + 2]!]),
    );
    let worst = 0;
    for (let seg = 0; seg < kept.length - 1; seg++) {
      for (let i = kept[seg]! + 1; i < kept[seg + 1]!; i++) {
        const [x, y, z] = hermitePositionKm(thinT, thinPos, thinVel, seg, seg + 1, t[i]!);
        worst = Math.max(
          worst,
          Math.hypot(x - pos[3 * i]!, y - pos[3 * i + 1]!, z - pos[3 * i + 2]!),
        );
      }
    }
    expect(worst).toBeLessThanOrEqual(tolKm);
  });
});
