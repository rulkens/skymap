/**
 * elevationFromQ — infer a disk's camera elevation (inclination) from its
 * apparent axis ratio q. Ported verbatim from the spike's `galaxy-matcher.js`.
 * Ellipticals and irregulars have no disk plane to tilt, so they return null;
 * every other category maps q through asin and clamps the result into
 * [0.05, 1.45] rad (never fully edge-on, never fully face-on).
 */
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';

export function elevationFromQ(q: number, category: GalaxyCategory): number | null {
  if (category === 'elliptical' || category === 'irregular') return null; // don't tilt
  return Math.max(0.05, Math.min(1.45, Math.asin(Math.max(0.05, Math.min(1, q)))));
}
