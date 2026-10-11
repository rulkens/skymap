const MARGIN = 1.3;
const MIN_FOV_DEG = 0.1;
const MAX_FOV_DEG = 8;

/**
 * Field of view, in degrees, for a sky cutout framing a structure: its angular
 * diameter plus a margin, clamped so a tiny cluster still shows some sky and a
 * huge nebula stays within what the survey service will resample.
 */
export function structureCutoutFovDeg(physicalRadiusMpc: number, distanceMpc: number): number {
  const diameterDeg = (2 * Math.atan(physicalRadiusMpc / distanceMpc) * 180) / Math.PI;
  return Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, MARGIN * diameterDeg));
}
