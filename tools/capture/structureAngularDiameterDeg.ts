/** Angular diameter in degrees of a sphere of `radiusMpc` seen from `distanceMpc`. */
export function structureAngularDiameterDeg(radiusMpc: number, distanceMpc: number): number {
  return (2 * Math.atan(radiusMpc / distanceMpc) * 180) / Math.PI;
}
