// outlineOverlay/fragment.wesl — flat colours for the outline's edges (fsEdge) and handles (fsHandle).

import package::outlineOverlay::io::HandleOut;

const EDGE_COLOUR = vec4<f32>(1.0, 0.8, 0.1, 1.0);

@fragment
fn fsEdge() -> @location(0) vec4<f32> {
  return EDGE_COLOUR;
}

@fragment
fn fsHandle(i: HandleOut) -> @location(0) vec4<f32> {
  return i.colour;
}
