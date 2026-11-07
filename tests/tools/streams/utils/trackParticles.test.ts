import { describe, expect, it } from 'vitest';

import { trackParticles } from '../../../../tools/streams/utils/trackParticles';
import { trackPositionsKpc } from '../../../../tools/streams/utils/trackPositionsKpc';
import { cumulativeLengths } from '../../../../tools/utils/math/cumulativeLengths';
import { splitmix64Rng } from '../../../../tools/utils/random/splitmix64Rng';
import { galstreamsTrackFixture as track } from '../../../helpers/streams/galstreamsTrackFixture';

const lengthKpc = (t: ReturnType<typeof track>) => cumulativeLengths(trackPositionsKpc(t)).at(-1)!;

describe('trackParticles', () => {
  it('trackParticles spreads particles evenly with only the end fade varying luminosity along the track', () => {
    const t = track({ spanDeg: 90, points: 91 });
    const p = trackParticles(t, -1.5, splitmix64Rng(1n));
    const n = p.luminosity.length;
    const bins = 8;
    const count = new Array<number>(bins).fill(0);
    const lum = new Array<number>(bins).fill(0);
    for (let i = 0; i < n; i++) {
      const raDeg =
        (Math.atan2(p.positionsMpc[i * 3 + 1]!, p.positionsMpc[i * 3]!) * 180) / Math.PI;
      const b = Math.min(bins - 1, Math.max(0, Math.floor((raDeg / 90) * bins)));
      count[b]! += 1;
      lum[b]! += p.luminosity[i]!;
    }
    for (const c of count) expect(Math.abs(c - n / bins) / (n / bins)).toBeLessThan(0.05);
    const middle = lum.slice(1, -1).map((l, i) => l / count[i + 1]!);
    expect(Math.max(...middle) / Math.min(...middle)).toBeLessThan(1.1);
    expect(lum[0]! / count[0]!).toBeLessThan(0.75 * Math.min(...middle));
  });

  it('trackParticles count follows L·60·max(1, w/0.3), clipped to [300, 30000]', () => {
    const narrow = track({ spanDeg: 100 }); // w = 0.3° at 10 kpc ≈ 0.05 kpc → factor 1
    const wide = track({ spanDeg: 100, widthDeg: 3 }); // ≈ 0.52 kpc → factor 1.745
    const short = track({ spanDeg: 3, points: 4 });
    const long = track({ spanDeg: 350, points: 351, distanceKpc: Array(351).fill(100) });
    const rng = splitmix64Rng(1n);
    const count = (t: ReturnType<typeof track>) => trackParticles(t, -1.5, rng).luminosity.length;
    const wKpc = ((3 * Math.PI) / 180) * 10;
    expect(count(narrow)).toBe(Math.floor(lengthKpc(narrow) * 60));
    expect(count(wide)).toBe(Math.floor(lengthKpc(wide) * 60 * (wKpc / 0.3)));
    expect(count(short)).toBe(300);
    expect(count(long)).toBe(30_000);
  });
});
