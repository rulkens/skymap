// earth/antiqueMap/glyphs.wesl — the map's signs, each drawn analytically in a
// local square ([-1, 1]², y up), returning (ink, paper): towns (`townSigns.wesl`,
// kinds 0–5 with see flags 16/32) and molehills (kind 8). A sign stands on its
// anchor: `signFoot` is the local y of the point that sits on the lon/lat.

import package::bodies::earth::antiqueMap::townSigns::townSign;
import package::bodies::earth::antiqueMap::molehill::molehill;

const SIGN_MOLEHILL: u32 = 8u;

fn signFoot(kind: u32) -> f32 {
  let base = kind & 15u;
  if (base == SIGN_MOLEHILL) {
    return -0.8;
  }
  if (base == 0u || base == 3u) {
    return -0.66;
  }
  if (base == 4u) {
    return -0.5;
  }
  return 0.0;
}

fn signInk(p: vec2<f32>, kind: u32, seed: f32, pxPerLocal: f32) -> vec2<f32> {
  if ((kind & 15u) == SIGN_MOLEHILL) {
    return molehill(p, seed * 97.0, pxPerLocal);
  }
  return townSign(p, kind, pxPerLocal);
}
