/**
 * resampleStrip — a lon/lat polyline as a map strip: each span cut into equal
 * great-circle pieces no longer than `maxKm` (a straight chord would sag under
 * the sphere and lift off a curved coast), with the running arc length the line
 * shader dots by and a width from `widthAt` (a river swelling from its source).
 */

import type { BakedStrip } from '../@types/BakedStrip';
import type { BakedStripPoint } from '../@types/BakedStripPoint';
import { lonLatDegToDirection } from '../../../../src/utils/geo/lonLatDegToDirection';
import { directionToLonLatDeg } from '../../../../src/utils/geo/directionToLonLatDeg';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { dot3 } from '../../../../src/utils/math/dot3';

export function resampleStrip(
  points: readonly (readonly [number, number])[],
  options: {
    readonly maxKm: number;
    readonly radiusKm: number;
    readonly kind: number;
    readonly level: number;
    /** Print-unit width at `arcKm` along a strip `totalKm` long. */
    readonly widthAt: (arcKm: number, totalKm: number) => number;
  },
): BakedStrip {
  const { maxKm, radiusKm, kind, level, widthAt } = options;
  const dirs = points.map(([lonDeg, latDeg]) => lonLatDegToDirection({ lonDeg, latDeg }));
  const samples: { lonDeg: number; latDeg: number; arcKm: number }[] = [
    { lonDeg: points[0]![0], latDeg: points[0]![1], arcKm: 0 },
  ];
  let arc = 0;
  for (let i = 0; i + 1 < dirs.length; i++) {
    const a = dirs[i]!;
    const b = dirs[i + 1]!;
    const angle = Math.acos(Math.min(1, Math.max(-1, dot3(a, b))));
    if (angle === 0) continue;
    const spanKm = angle * radiusKm;
    const n = Math.max(1, Math.ceil(spanKm / maxKm));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      // Slerp: equal arcs along the great circle.
      const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
      const wb = Math.sin(t * angle) / Math.sin(angle);
      const p = normalize3([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
      // The input's own vertices go through exactly.
      const at =
        k === n
          ? { lonDeg: points[i + 1]![0], latDeg: points[i + 1]![1] }
          : directionToLonLatDeg(p);
      samples.push({ lonDeg: at.lonDeg, latDeg: at.latDeg, arcKm: arc + spanKm * t });
    }
    arc += spanKm;
  }
  const strip: BakedStripPoint[] = samples.map((s) => ({
    ...s,
    widthUnits: widthAt(s.arcKm, arc),
  }));
  return { points: strip, kind, level };
}
