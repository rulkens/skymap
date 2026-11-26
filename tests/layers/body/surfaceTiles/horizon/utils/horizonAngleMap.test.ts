import { describe, expect, it } from 'vitest';

import { horizonAngleOfByte } from '../../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonAngleOfByte';
import { horizonByteOfAngle } from '../../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonByteOfAngle';
import { horizonTexelOf } from '../../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf';

describe('horizon angle map', () => {
  it('the byte map round-trips every byte within half a step', () => {
    for (let byte = 0; byte <= 255; byte++) {
      expect(horizonByteOfAngle(horizonAngleOfByte(byte))).toBe(byte);
    }
    for (let deg = -3; deg <= 90; deg += 0.01) {
      const byte = horizonByteOfAngle(deg);
      const halfStep = deg < 27 ? 30 / 204 / 2 : 63 / 51 / 2;
      expect(Math.abs(horizonAngleOfByte(byte) - deg)).toBeLessThanOrEqual(halfStep + 1e-9);
    }
  });

  it('−3° → 0, 27° → 204, 90° → 255', () => {
    expect(horizonByteOfAngle(-3)).toBe(0);
    expect(horizonByteOfAngle(27)).toBe(204);
    expect(horizonByteOfAngle(90)).toBe(255);
  });

  it('angles below −3° clamp to 0', () => {
    expect(horizonByteOfAngle(-10)).toBe(0);
  });
});

describe('horizonTexelOf', () => {
  it('sector 13 lives in texel (1,1), channel G', () => {
    expect(horizonTexelOf(13)).toEqual({ dx: 1, dy: 1, channel: 1 });
  });

  it('sector 4 starts the east texel and sector 8 the south one, both in R', () => {
    expect(horizonTexelOf(4)).toEqual({ dx: 1, dy: 0, channel: 0 });
    expect(horizonTexelOf(8)).toEqual({ dx: 0, dy: 1, channel: 0 });
  });

  it('gives each of the 16 sectors its own texel channel', () => {
    const slots = new Set<string>();
    for (let sector = 0; sector < 16; sector++) {
      const { dx, dy, channel } = horizonTexelOf(sector);
      slots.add(`${dx}${dy}${channel}`);
    }
    expect(slots.size).toBe(16);
  });
});
