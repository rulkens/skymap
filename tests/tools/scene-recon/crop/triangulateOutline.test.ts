import { describe, expect, it } from 'vitest';

import { insideRing } from '../../../../tools/scene-recon/crop/insideRing';
import { triangulateOutline } from '../../../../tools/scene-recon/crop/triangulateOutline';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const L: Vec2[] = [
  [0, 0],
  [4, 0],
  [4, 1],
  [1, 1],
  [1, 3],
  [0, 3],
];

function distanceToSegment([px, py]: Vec2, [ax, ay]: Vec2, [bx, by]: Vec2): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

describe('triangulateOutline', () => {
  it('triangulateOutline covers an L-shape without its notch', () => {
    const pieces = triangulateOutline(L);
    let checked = 0;
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        const p: Vec2 = [(4 * (i + 0.37)) / 20, (3 * (j + 0.61)) / 20];
        const nearEdge = L.some((a, k) => distanceToSegment(p, a, L[(k + 1) % L.length]!) < 1e-6);
        if (nearEdge) continue;
        const inPiece = pieces.some((planes) =>
          planes.every(
            ({ normal, offset }) => normal[0] * p[0] + normal[1] * p[1] - offset >= -1e-9,
          ),
        );
        expect(inPiece, `sample ${p}`).toBe(insideRing(p, L));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});
