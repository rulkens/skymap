// milkyWay/pick/pick.wesl — offscreen r32uint picking fragment for the
// Milky-Way hit billboard.
//
// Sister to points/pickFragment.wesl and structureMarker/ringPick.wesl:
// it writes the packed Milky-Way identity into the integer pick texture.
// The identity was composed in the vertex stage (milkyWay/pick/vertex.wesl)
// as '(sourceCode << 26) | (0 + PICK_SENTINEL_OFFSET)' and forwarded
// flat-interpolated, so the fragment only has to clip the billboard to a
// round hit area and emit the value.
//
// ## Hit-target shape: inscribed disk
//
// The billboard is a square quad in [-1, +1]² UV.  Clipping to the
// inscribed unit disk ('dot(uv, uv) <= 1') makes the click target read
// as a round dot rather than a square — matching how the galactic centre
// looks on screen.  Outside the disk we 'discard' rather than write 0:
// the pick texture is cleared to 0 (the 'no hit' sentinel), so writing 0
// from a depth-passing fragment is indistinguishable from the clear and
// would block a galaxy behind the billboard from claiming the pixel.

import package::milkyWay::pick::io::VsOut;

@fragment
fn fsPick(in: VsOut) -> @location(0) vec4<u32> {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  return vec4<u32>(in.packedPick, 0u, 0u, 0u);
}
