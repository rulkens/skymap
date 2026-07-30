// cloudShell/io.wesl — shared inter-stage struct for the translucent cloud
// shell. Imported by cloudShell/vertex.wesl and cloudShell/fragment.wesl.
//
// The shell renders as a single closed unit-sphere mesh drawn just above the
// body's surface: the vertex stage projects each local vertex through the body
// MVP and forwards two things the fragment needs -- the mesh's equirectangular
// uv (for the cloud colour+coverage sample) and the local-space normal (for the
// sun-relative Lambert term that dims clouds on the night side). 'VSOut' is the
// contract between those two stages.
//
// ## Why one authoritative inter-stage struct
//
// A single imported declaration makes vertex/fragment @location drift
// structurally impossible: if each stage declared its own copy, a field reorder
// or a changed @location on one side would silently mis-wire the interpolants.
// This is the same reasoning 'earth/io.wesl' states -- the shell mirrors it,
// minus the tangent (clouds carry no normal map, so no tangent-space basis).
//
// ## Why forward the local normal at all
//
// On a UNIT sphere the local-space position IS the outward surface normal, so
// the vertex stage forwards 'position' unchanged as 'normalLocal'. The fragment
// renormalizes it before the Lambert dot -- linear interpolation across a
// triangle face shortens the interpolated vector, which would otherwise band the
// terminator.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Equirectangular uv passed straight through for the cloud-map sample in the
  // fragment stage. Same v-orientation as the surface (both uploaded flipY:true).
  @location(0) uv: vec2<f32>,
  // Unit-sphere local-space normal (== the local vertex position). The fragment
  // renormalizes this before lighting.
  @location(1) normalLocal: vec3<f32>,
};
