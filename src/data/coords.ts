const C_KM_S = 299792.458;
const H0_KM_S_MPC = 70;
const HUBBLE_DISTANCE_MPC = C_KM_S / H0_KM_S_MPC;

export function redshiftToDistanceMpc(z: number): number {
  return HUBBLE_DISTANCE_MPC * z;
}

export function raDecZToCartesian(
  raDeg: number,
  decDeg: number,
  z: number
): [number, number, number] {
  const d = redshiftToDistanceMpc(z);
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  return [d * cosDec * Math.cos(ra), d * cosDec * Math.sin(ra), d * Math.sin(dec)];
}
