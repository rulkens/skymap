import { describe, expect, it } from 'vitest';

import { clipPolygonByHalfPlane } from '../../../../tools/scene-recon/crop/clipPolygonByHalfPlane';
import type { ClipVertex } from '../../../../tools/scene-recon/@types/ClipVertex';
import type { HalfPlane2 } from '../../../../tools/scene-recon/@types/HalfPlane2';

const X_NON_NEGATIVE: HalfPlane2 = { normal: [1, 0], offset: 0 };

describe('clipPolygonByHalfPlane', () => {
  it('clipPolygonByHalfPlane cuts a vertical triangle and interpolates Z and UV', () => {
    const triangle: ClipVertex[] = [
      { positionM: [-1, 0, 0], uv: [0, 0], key: 'v0' },
      { positionM: [1, 0, 0], uv: [1, 0], key: 'v1' },
      { positionM: [1, 0, 10], uv: [1, 1], key: 'v2' },
    ];

    const cuts = clipPolygonByHalfPlane(triangle, X_NON_NEGATIVE, 'p').filter((v) =>
      v.key.includes('|'),
    );

    expect(cuts.map(({ positionM, uv }) => ({ positionM, uv }))).toEqual(
      expect.arrayContaining([
        { positionM: [0, 0, 0], uv: [0.5, 0] },
        { positionM: [0, 0, 5], uv: [0.5, 0.5] },
      ]),
    );
    expect(cuts).toHaveLength(2);
  });

  it('clipPolygonByHalfPlane gives a shared edge the same cut key from either winding', () => {
    const a: ClipVertex = { positionM: [-1, 0, 0], uv: [0, 0], key: 'v0' };
    const b: ClipVertex = { positionM: [1, 0, 0], uv: [1, 0], key: 'v1' };
    const c: ClipVertex = { positionM: [0, 1, 0], uv: [0, 1], key: 'v2' };
    const d: ClipVertex = { positionM: [0, -1, 0], uv: [0, 1], key: 'v3' };

    const cutOnAb = (polygon: ClipVertex[]) =>
      clipPolygonByHalfPlane(polygon, X_NON_NEGATIVE, 'p').filter(
        (v) => v.positionM[0] === 0 && v.positionM[1] === 0,
      );

    const [first] = cutOnAb([a, b, c]);
    const [second] = cutOnAb([b, a, d]);
    expect(first!.key).toBe(second!.key);
  });
});
