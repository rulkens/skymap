// lib/horizonAngleMap.wesl — decode of a horizon tile's angle byte, and its sector count.
// Mirrors HORIZON_ANGLE_MAP and HORIZON_SECTORS in 'surfaceTiles/horizon/data/horizonAngleMap.ts'
// (a parity test pins the constants); 'horizonAngleOfByte.ts' is the TS twin of the decode.

const HORIZON_MIN_DEG: f32 = -3.0;
const HORIZON_KNEE_DEG: f32 = 27.0;
const HORIZON_KNEE_BYTE: f32 = 204.0;
const HORIZON_MAX_DEG: f32 = 90.0;
const HORIZON_SECTORS: f32 = 16.0;

// unorm·255 is the byte. Read texels with textureLoad and decode each post before
// interpolating (spec §5): a sampler would blend sectors across the 2×2 packing.
fn horizonAngleOfUnorm(stored: f32) -> f32 {
  let byte = stored * 255.0;
  let fine = HORIZON_MIN_DEG + byte / HORIZON_KNEE_BYTE * (HORIZON_KNEE_DEG - HORIZON_MIN_DEG);
  let steep = HORIZON_KNEE_DEG
    + (byte - HORIZON_KNEE_BYTE) / (255.0 - HORIZON_KNEE_BYTE) * (HORIZON_MAX_DEG - HORIZON_KNEE_DEG);
  return radians(select(steep, fine, byte <= HORIZON_KNEE_BYTE));
}
