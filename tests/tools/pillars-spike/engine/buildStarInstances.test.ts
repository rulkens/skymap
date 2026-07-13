import { describe, expect, it } from 'vitest';

import { buildStarInstances } from '../../../../tools/pillars-spike/src/engine/buildStarInstances';
import { LIGHT_STARS } from '../../../../tools/pillars-spike/src/data/lightStars';

describe('buildStarInstances', () => {
  // Three protostars are appended after the light/cluster/pillar stars
  // (one per pillar head — see buildStarInstances' PROTOSTARS).
  const PROTOSTARS = 3;

  it('emits 32-byte-stride instances: light stars first, at their catalog positions', () => {
    const out = buildStarInstances(LIGHT_STARS, 5, 0, 42);
    expect(out.length).toBe((3 + 5 + 0 + PROTOSTARS) * 8);
    // The billboards for the 3 LIGHTING stars must sit exactly at the
    // positions the bake lights from — a drift here shows a glow point
    // detached from its own shadows.
    LIGHT_STARS.forEach((s, i) => {
      expect(out[i * 8 + 0]).toBeCloseTo(s.position[0]);
      expect(out[i * 8 + 1]).toBeCloseTo(s.position[1]);
      expect(out[i * 8 + 2]).toBeCloseTo(s.position[2]);
      expect(out[i * 8 + 4]).toBeCloseTo(s.color[0]);
    });
  });

  it('is deterministic per seed and varies across seeds', () => {
    const a1 = buildStarInstances(LIGHT_STARS, 8, 0, 7);
    const a2 = buildStarInstances(LIGHT_STARS, 8, 0, 7);
    const b = buildStarInstances(LIGHT_STARS, 8, 0, 8);
    expect(Array.from(a1)).toEqual(Array.from(a2));
    expect(Array.from(a1)).not.toEqual(Array.from(b));
  });

  it('embeds pillar stars near the pillar spines, not in the overhead cluster', () => {
    // The three base→tip segments mirror generateField.wesl's sdPillar
    // calls — a pillar star must sit within a column's reach of one of
    // them, otherwise it renders as a stray point floating in the cavity
    // (the bug this population fixes was ALL stars sitting in the
    // overhead cluster, none inside the dust).
    type P3 = readonly [number, number, number];
    const spines: readonly (readonly [P3, P3])[] = [
      [
        [-0.62, -1.55, 0.08],
        [-0.3, 1.02, -0.1],
      ],
      [
        [0.1, -1.55, -0.24],
        [0.34, 0.4, -0.16],
      ],
      [
        [0.62, -1.55, 0.16],
        [0.8, 0.02, 0.3],
      ],
    ];
    const distToSegment = (p: P3, a: P3, b: P3): number => {
      const ab: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ap: P3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const t = Math.max(
        0,
        Math.min(
          1,
          (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) /
            (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]),
        ),
      );
      return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
    };

    const cluster = 4;
    const pillar = 16;
    const out = buildStarInstances(LIGHT_STARS, cluster, pillar, 42);
    expect(out.length).toBe((3 + cluster + pillar + PROTOSTARS) * 8);
    for (let i = 3 + cluster; i < 3 + cluster + pillar; i++) {
      const p: P3 = [out[i * 8 + 0]!, out[i * 8 + 1]!, out[i * 8 + 2]!];
      const d = Math.min(...spines.map(([a, b]) => distToSegment(p, a, b)));
      expect(d).toBeLessThan(0.55); // widest column radius + jitter margin
    }
  });
});
