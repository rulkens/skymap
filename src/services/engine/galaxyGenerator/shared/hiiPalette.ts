/**
 * hiiPalette — the metallicity-driven HII (ionized hydrogen) emission
 * palette. Real HII colour is set by metallicity/ionization state:
 * low-metallicity regions run teal ([OIII]-strong), typical ones pink
 * (H-alpha plus blue cluster light), metal-rich ones deep red. The extended
 * halo is red-dominant (diffuse H-alpha) and tracks metallicity across the
 * full range in one lerp, independent of the core's two-segment path.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { HiiPalette } from '../../../../@types/galaxy/HiiPalette';

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const TEAL: Vec3 = [0.4, 0.85, 0.8];
const PINK: Vec3 = [1.0, 0.42, 0.56];
const DEEP_RED: Vec3 = [1.0, 0.3, 0.32];
const HALO_LOW: Vec3 = [0.42, 0.78, 0.72];
const HALO_HIGH: Vec3 = [1.0, 0.26, 0.3];

/** @param metallicity 0..1. Core lerps teal->pink->deep red over two segments; halo lerps teal->red over the full range in one. */
export function hiiPalette(metallicity: number): HiiPalette {
  const core =
    metallicity < 0.5
      ? lerp3(TEAL, PINK, metallicity * 2)
      : lerp3(PINK, DEEP_RED, (metallicity - 0.5) * 2);
  const halo = lerp3(HALO_LOW, HALO_HIGH, metallicity);
  return { core, halo };
}
