// lib/horizonAngleMap.wesl — decode of a horizon tile's angle byte, and its sector count.
// Mirrors HORIZON_ANGLE_MAP and HORIZON_SECTORS in 'surfaceTiles/horizon/data/horizonAngleMap.ts'
// (a parity test pins the constants); 'horizonAngleOfByte.ts' is the TS twin of the decode.

const HORIZON_MIN_DEG: f32 = -3.0;
const HORIZON_KNEE_DEG: f32 = 27.0;
const HORIZON_KNEE_BYTE: f32 = 204.0;
const HORIZON_MAX_DEG: f32 = 90.0;
const HORIZON_SECTORS: f32 = 16.0;

// The map per unorm (byte / 255) in radians, folded so each segment decodes in one FMA.
const HORIZON_KNEE_UNORM: f32 = HORIZON_KNEE_BYTE / 255.0;
const HORIZON_FINE_SLOPE: f32 = radians(HORIZON_KNEE_DEG - HORIZON_MIN_DEG) / HORIZON_KNEE_UNORM;
const HORIZON_STEEP_SLOPE: f32 = radians(HORIZON_MAX_DEG - HORIZON_KNEE_DEG) / (1.0 - HORIZON_KNEE_UNORM);
const HORIZON_STEEP_ORIGIN: f32 = radians(HORIZON_KNEE_DEG) - HORIZON_KNEE_UNORM * HORIZON_STEEP_SLOPE;

// Four sectors at a time. Read texels with textureLoad and decode each post before
// interpolating (spec §5): a sampler would blend sectors across the 2×2 packing.
fn horizonAnglesOfUnorm(stored: vec4<f32>) -> vec4<f32> {
  let fine = radians(HORIZON_MIN_DEG) + stored * HORIZON_FINE_SLOPE;
  let steep = HORIZON_STEEP_ORIGIN + stored * HORIZON_STEEP_SLOPE;
  return select(steep, fine, stored <= vec4<f32>(HORIZON_KNEE_UNORM));
}
