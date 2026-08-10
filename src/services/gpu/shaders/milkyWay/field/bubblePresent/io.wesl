// bubblePresent/io.wesl — VsOut, the vertex-to-fragment interface for the
// bubble/cavity debug overlay: debug overlay for the SF-event catalog's own
// bubble/cavity placements (dustBubblePlacements.ts), a SECOND, independent
// star-formation model drawn as its own layer to compare directly against
// the fluid generator's ismMap view (ismMapPresent.wesl). One instanced
// camera-facing quad per placement; createGalaxyEngine.ts's
// 'rebuildBubblePlacements' is the only producer of the instance buffer
// vertex.wesl reads (center.xyz, radius, kind).

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) kind: f32,
}
