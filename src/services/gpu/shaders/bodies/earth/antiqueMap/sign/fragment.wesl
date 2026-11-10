// earth/antiqueMap/sign/fragment.wesl — a sign's ink for the quad vertex.wesl placed.

import package::bodies::earth::antiqueMap::glyphs::signInk;
import package::bodies::earth::antiqueMap::sign::io::SignOut;

@fragment
fn fs(in: SignOut) -> @location(0) vec4<f32> {
  // Device px per unit of local space (local spans 2 across the sign).
  let pxPerLocal = 0.5 * in.params.x;
  let mark = signInk(in.local, in.kind, in.params.y, pxPerLocal);
  let value = 0.5 * (mark.x + max(mark.x, mark.y)) * in.params.z;
  if (value < 0.02) {
    discard;
  }
  return vec4<f32>(0.0, 0.0, 0.0, value);
}
