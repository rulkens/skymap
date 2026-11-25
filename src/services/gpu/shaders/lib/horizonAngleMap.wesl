// lib/horizonAngleMap.wesl — decode of a horizon tile's angle byte. Mirrors
// HORIZON_ANGLE_MAP in 'surfaceTiles/horizon/data/horizonAngleMap.ts' (a parity
// test pins the constants); 'horizonAngleOfByte.ts' is the TS twin of the decode.

const HORIZON_MIN_DEG: f32 = -3.0;
const HORIZON_KNEE_DEG: f32 = 27.0;
const HORIZON_KNEE_BYTE: f32 = 204.0;
const HORIZON_MAX_DEG: f32 = 90.0;

// unorm·255 is the byte. A filtered read lands between bytes, which is safe:
// the map is continuous at the knee.
fn horizonAngleOfUnorm(unorm: f32) -> f32 {
  let byte = unorm * 255.0;
  let fine = HORIZON_MIN_DEG + byte / HORIZON_KNEE_BYTE * (HORIZON_KNEE_DEG - HORIZON_MIN_DEG);
  let steep = HORIZON_KNEE_DEG
    + (byte - HORIZON_KNEE_BYTE) / (255.0 - HORIZON_KNEE_BYTE) * (HORIZON_MAX_DEG - HORIZON_KNEE_DEG);
  return radians(select(steep, fine, byte <= HORIZON_KNEE_BYTE));
}
