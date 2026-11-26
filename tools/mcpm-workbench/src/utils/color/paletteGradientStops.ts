import type { GradientStop } from '../../../@types/ui/GradientStop';

// u8 units. Above 1.5, so the LUT's own rounding never adds a stop.
const TOLERANCE = 2;

/**
 * paletteGradientStops — the renderer's RGBA8 LUT back as the few stops an SVG
 * gradient needs, linear between them as the LUT is. The LUT is piecewise linear
 * between the palette's anchors, so splitting at the entry farthest off the chord
 * (Douglas–Peucker) lands on those anchors at their own uneven positions, give or
 * take the few entries rounding allows; every entry stays within TOLERANCE. RGB
 * only: the alpha column is the opacity ramp, which would hide a ramp's low end.
 */
export function paletteGradientStops(lut: Uint8Array): readonly GradientStop[] {
  const last = lut.length / 4 - 1;
  const knots = [0, ...interiorKnots(lut, 0, last), last];
  return knots.map((i) => ({ offset: i / last, color: hexAt(lut, i) }));
}

function interiorKnots(lut: Uint8Array, start: number, end: number): number[] {
  let worst = 0;
  let split = -1;
  for (let i = start + 1; i < end; i++) {
    const u = (i - start) / (end - start);
    for (let c = 0; c < 3; c++) {
      const off = Math.abs(
        lut[i * 4 + c]! - (lut[start * 4 + c]! * (1 - u) + lut[end * 4 + c]! * u),
      );
      if (off > worst) [worst, split] = [off, i];
    }
  }
  if (worst <= TOLERANCE) return [];
  return [...interiorKnots(lut, start, split), split, ...interiorKnots(lut, split, end)];
}

function hexAt(lut: Uint8Array, i: number): string {
  return `#${Array.from(lut.subarray(i * 4, i * 4 + 3), (v) => v.toString(16).padStart(2, '0')).join('')}`;
}
