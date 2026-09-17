// terrainPickMarker/fragment.wesl — ray-traces the marker sphere out of the
// proxy quad and writes its ANALYTIC depth, so the terrain drawn in the same
// render pass cuts it and the BURIED FRACTION is the reading.
//
// Two entry points, one sphere: 'fsOccluded' paints the whole silhouette in a
// dim, desaturated shade with the depth test off, then 'fs' repaints the part
// that survives the depth test in full colour. What is left dim is exactly
// what the terrain hides -- see 'terrainPickMarkerRenderer.ts' for the two
// pipelines. Two entry points rather than a uniform flag: 'writeBuffer' is
// queue-ordered ahead of the whole command buffer, so a per-draw uniform edit
// between two 'pass.draw' calls would leave both draws reading the last write.
//
// Depth is 'clip.z / clip.w' through the same 'u.vp' the surface tiles project
// through, with no reversed-Z flip: see 'lib/analyticSphere.wesl's depth
// section, which owns that argument. Writing '@builtin(frag_depth)' is
// mandatory here -- the rasterised depth belongs to the flat proxy quad, which
// bisects the sphere rather than hugging it.
//
// Shading is a headlight, not the scene's sun: this is an instrument, and a
// marker on the night side must still read as a sphere.

import package::devTools::terrainPickMarker::io::MarkerVSOut;
import package::devTools::terrainPickMarker::io::TerrainPickMarkerUniforms;
import package::lib::analyticSphere::fragDepthFromClip;

@group(0) @binding(0) var<uniform> u: TerrainPickMarkerUniforms;

const MARKER_COLOUR: vec3<f32> = vec3<f32>(1.0, 0.24, 0.05);
// Linear HDR, pre-tone-map: the same order as the lit terrain's own direct term
// ('EARTH_SURFACE_PARAMS.sunIrradiance' = 3.0 over a Lambert hemisphere), a
// touch above so the marker reads against sunlit ground without blowing out.
const MARKER_IRRADIANCE: f32 = 4.0;
// The buried shade. COOL and desaturated, not merely a darker orange: the lit
// sphere's own terminator already runs dark-orange at the silhouette, and a
// reading taken at a glance must not have to tell the two apart. Well under
// sunlit ground (~2.4 over snow) so the cut reads, well over unlit ground so a
// marker buried in night-side terrain is still findable.
const MARKER_OCCLUDED_COLOUR: vec3<f32> = vec3<f32>(0.55, 0.60, 0.72);
const MARKER_OCCLUDED_IRRADIANCE: f32 = 0.55;
// Floor so the sphere's terminator is shape, not silhouette-against-black.
const MARKER_AMBIENT: f32 = 0.25;

// Colour + analytic depth. No '@builtin(position)' in this struct -- the entry
// point's position arrives through 'MarkerVSOut', and a second
// position-bearing struct in one linked module is rejected at
// 'createShaderModule' having passed both the build and the WESL linker.
struct MarkerFSOut {
  @location(0) colour: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

// Scalars in, never the varying struct: a by-value struct argument is the shape
// Adreno has been caught misreading (see docs/RENDERER.md).
fn shadeMarker(rayM: vec3<f32>, tint: vec3<f32>, irradiance: f32) -> MarkerFSOut {
  // Eye-relative frame: the eye IS the origin, so the textbook 'ro - centre'
  // is just '-centre' and no large magnitude is ever subtracted in f32.
  let rd = normalize(rayM);
  let oc = -u.centreRelEyeM;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - u.radiusM * u.radiusM;
  let discr = b * b - c;
  let s = sqrt(max(discr, 0.0));
  let tNear = -b - s;
  let tFar = -b + s;
  // The near root in front of the eye; the exit root when the eye is inside.
  let t = select(tFar, tNear, tNear > 0.0);
  if (discr < 0.0 || t <= 0.0) {
    discard;
  }

  let hitRelEyeM = rd * t;
  let n = normalize(hitRelEyeM - u.centreRelEyeM);
  let key = clamp(dot(n, -rd), 0.0, 1.0);

  var out: MarkerFSOut;
  out.colour = vec4<f32>(
    tint * irradiance * (MARKER_AMBIENT + (1.0 - MARKER_AMBIENT) * key),
    1.0,
  );
  out.depth = fragDepthFromClip(u.vp, hitRelEyeM);
  return out;
}

@fragment
fn fs(in: MarkerVSOut) -> MarkerFSOut {
  return shadeMarker(in.rayM, MARKER_COLOUR, MARKER_IRRADIANCE);
}

@fragment
fn fsOccluded(in: MarkerVSOut) -> MarkerFSOut {
  return shadeMarker(in.rayM, MARKER_OCCLUDED_COLOUR, MARKER_OCCLUDED_IRRADIANCE);
}
