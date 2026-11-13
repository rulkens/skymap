// antiqueLook/bodySigns/fragment.wesl — the ring about a centre dot, in the star-ink row (vertex.wesl).

import package::antiqueLook::bodySigns::io::SignOut;

const RING_WIDTH: f32 = 0.22; // of the radius
const DOT_RADIUS: f32 = 0.24; // of the radius

@fragment
fn fs(in: SignOut) -> @location(0) vec4<f32> {
  let d = length(in.pos.xy - in.centre);
  let r = in.r;
  let outer = 1.0 - smoothstep(r - 0.45, r + 0.45, d);
  let inner = r * (1.0 - RING_WIDTH);
  let ring = outer * smoothstep(inner - 0.45, inner + 0.45, d);
  let core = 1.0 - smoothstep(r * DOT_RADIUS - 0.45, r * DOT_RADIUS + 0.45, d);
  let knock = 1.0 - smoothstep(1.3 * r, 1.3 * r + 1.0, d);
  return vec4<f32>(max(ring, core), knock, 0.0, 0.0);
}
