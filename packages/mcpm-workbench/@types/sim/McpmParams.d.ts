/**
 * McpmParams — the MCPM simulation knobs in HUMAN units (degrees, Mpc), as the
 * UI carries them. `encodeStep` converts to the shader's units (radians,
 * voxels) at the uniform-write boundary; nothing downstream of that sees Mpc.
 * Defaults noted per field are the SDSS-VAC preset the fork shipped.
 */
export type McpmParams = {
  readonly senseSpreadDeg: number; // SDSS-VAC preset: 20
  readonly senseDistanceMpc: number; // 4.6
  readonly turnAngleDeg: number; // 10
  readonly moveDistanceMpc: number; // 0.1
  readonly depositValue: number; // 0 — data-driven
  readonly persistence: number; // 0.8 (the fork's decay_factor)
  readonly sharpness: number; // 2.5
  readonly normalizationFactor: number; // 1.0
};
