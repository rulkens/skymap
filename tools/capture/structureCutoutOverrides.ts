import type { StructureCutoutOverride } from './@types/StructureCutoutOverride';

/**
 * Anchors whose cutout the default survey cannot frame: DSS2 plates saturate
 * inside Carina, so Trumpler 14 comes out solid orange, while 2MASS (infrared)
 * sees through the nebulosity. Keyed by focus id.
 */
export const STRUCTURE_CUTOUT_OVERRIDES: Readonly<Record<string, StructureCutoutOverride>> = {
  'open-cluster-trumpler-14': { hips: 'CDS/P/2MASS/color', fovDeg: 0.15 },
};
