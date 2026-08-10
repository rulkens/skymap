// milkyWay/ismMap/ismMapShear.wesl — log-polar ring radius <-> per-ring shear
// (in texels). ismMapFluidVelocity.wesl reads ismMapShearTexels for its own
// shear velocity term. Restated from galaxyIsmMapArmForcing.ts's
// ismMapRingRadius on the TS side (WGSL cannot import TS); ringCount/azCount/
// rMin/rMax are params, not baked in, so this module owns no grid-size
// dependency.

const ISM_MAP_SHEAR_PI: f32 = 3.14159265358979;

fn ismMapRingRadius(ring: u32, ringCount: u32, rMin: f32, rMax: f32) -> f32 {
  let t = f32(ring) / f32(ringCount - 1u);
  return rMin * pow(rMax / rMin, t);
}

// Omega(r) - Omega_pattern, NOT bare Omega — zero at corotation, opposite
// sign either side of it (research doc's derivation).
fn ismMapShearTexels(
  ring: u32,
  ringCount: u32,
  azCount: u32,
  rMin: f32,
  rMax: f32,
  corotationRadius: f32,
  shearRate: f32,
) -> f32 {
  let r = max(ismMapRingRadius(ring, ringCount, rMin, rMax), 1e-4);
  let dTheta = (1.0 / r - 1.0 / corotationRadius) * shearRate;
  return dTheta * f32(azCount) / (2.0 * ISM_MAP_SHEAR_PI);
}
