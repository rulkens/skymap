// antiqueLook/bodySigns/fragment.wesl — the ring about a centre dot, in the star-ink row (vertex.wesl).

import package::antiqueLook::bodySigns::io::SignOut;

const RING_WIDTH: f32 = 0.22; // of the radius
const DOT_RADIUS: f32 = 0.24; // of the radius

@fragment
fn fs(in: SignOut) -> @location(0) vec4<f32> {
  let dist = length(in.pos.xy - in.centre);
  let radius = in.r;
  let outer = 1.0 - smoothstep(radius - 0.45, radius + 0.45, dist);
  let inner = radius * (1.0 - RING_WIDTH);
  let ring = outer * smoothstep(inner - 0.45, inner + 0.45, dist);
  let core = 1.0 - smoothstep(radius * DOT_RADIUS - 0.45, radius * DOT_RADIUS + 0.45, dist);
  let knock = 1.0 - smoothstep(1.3 * radius, 1.3 * radius + 1.0, dist);
  return vec4<f32>(max(ring, core), knock, 0.0, 0.0);
}
