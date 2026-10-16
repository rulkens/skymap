import { describe, it, expect } from 'vitest';
import { pastTextureReleaseRadius } from '../../../../src/services/engine/frame/pastTextureReleaseRadius';
import { loadRadiusMpc } from '../../../../src/services/engine/frame/bodyTextureLoadRadius';

// The band between the load radius and twice it is the hysteresis: release there
// and a camera parked at the load edge frees and refetches ~135 MB every frame.
describe('pastTextureReleaseRadius', () => {
  const body = [1, 2, 3] as const;
  const at = (d: number) => [1 + d, 2, 3] as const;
  const r = loadRadiusMpc('mars');

  it('holds inside twice the load radius, past the load radius itself', () => {
    expect(pastTextureReleaseRadius('mars', at(1.5 * r), body)).toBe(false);
    expect(pastTextureReleaseRadius('mars', at(1.999 * r), body)).toBe(false);
  });

  it('releases past twice the load radius', () => {
    expect(pastTextureReleaseRadius('mars', at(2.001 * r), body)).toBe(true);
  });
});
