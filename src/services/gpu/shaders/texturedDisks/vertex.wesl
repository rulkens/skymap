// texturedDisks/vertex.wesl — oriented textured galaxy-disk vertex
// stage (astronomically correct).
//
// Each instance is a 3D disk fixed in WORLD space. The galaxy's true
// orientation is derived from its on-sky position angle (PA, east of
// north) and its inclination i where cos(i) = axisRatio (b/a). These
// are intrinsic properties of the galaxy in 3D space — they do NOT
// depend on the camera position. Foreshortening then falls out of
// the perspective projection naturally: tilt the camera and the
// disk's projected ellipse changes accordingly.
//
// ### Why this approach instead of 'always face the camera'
//
// A camera-aligned basis would make axisRatio a 2D screen-space squash
// (visually identical to the points-shader's elliptical mask) with no
// real 3D foreshortening, and would flip abruptly near the celestial
// poles when the camera-relative normal crossed the seed-fallback
// threshold.
//
// Building in world space fixes both: the disk has ONE orientation in
// 3D regardless of camera, so orbiting reveals true ellipse
// foreshortening; the only singularity is now galaxies physically at
// the celestial poles (Dec ≈ ±90°), camera-independent and handled
// with a fallback seed.
//
// ### Frame construction
//
// The disk-plane axis math (line-of-sight from Earth-at-origin →
// sky-tangent (north, east) frame with pole fallback → PA-east-of-
// north rotation → inclination tilt of the minor axis out of the
// sky plane) lives in 'lib/orientation::diskAxes'. See that lib's
// docblock for the camera-independence invariant and the ~8°-from-
// pole degeneracy fallback.
//
// ## Why bindings are declared here, not in io.wesl
//
// WESL has no global state — 'Uniforms' is imported from io.wesl, but
// the @group/@binding declaration lives in the consuming file. Atlas
// texture / sampler bindings are fragment-only and stay in fragment.wesl.

import package::texturedDisks::io::Uniforms;
import package::texturedDisks::io::InstanceIn;
import package::texturedDisks::io::VsOut;
import package::lib::camera::worldToClip;
// Shared unit-quad helpers from 'lib/billboard.wesl' — the orientation-
// aligned disk-plane basis (PA + inclination → 'major' / 'minor_3d' in
// 3D world space) stays renderer-specific; only the vertex-index →
// corner / UV lookups are shared. See 'lib/billboard.wesl' for why the
// orientation math is intentionally NOT pulled into this lib.
import package::lib::billboard::quadCorner;
import package::lib::billboard::quadUv;
// Disk-plane axis math (PA + inclination → world-space major/minor basis)
// is shared with 'proceduralDisks.wesl' via 'lib/orientation.wesl'. See
// that lib for the camera-independence invariant and the pole-degeneracy
// fallback (|dot(north, los)| > 0.99, ~8° from pole).
import package::lib::orientation::DiskAxes;
import package::lib::orientation::diskAxes;

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  // Unit-square corner offset in [-1, +1]² for this triangle-list
  // vertex. The (BL, BR, TR, BL, TR, TL) ordering is shared across all
  // four billboard renderers via 'lib/billboard::quadCorner'. The corner
  // here is in the disk's LOCAL 2D frame; the 3D placement happens via
  // the (major, minor_3d) basis below.
  let corner = quadCorner(vid);
  let center = instance.posSize.xyz;
  let halfSize = instance.posSize.w * 0.5;
  // Clamp axisRatio so an edge-on disk still produces a thin sliver
  // rather than a degenerate zero-area quad (which would z-fight or
  // disappear entirely under sub-pixel rounding).
  let axisRatio = max(instance.orient.x, 0.05);
  let paDeg = instance.orient.y;
  let paRad = paDeg * 3.14159265 / 180.0;

  // Disk-plane basis (PA + inclination → world-space major / minor).
  // Full derivation lives in 'lib/orientation::diskAxes'. 'axisRatio'
  // is clamped at the call site above BEFORE we feed it through as
  // cosI — the lib intentionally doesn't re-clamp.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let axes = diskAxes(center, paRad, cosI, sinI);
  let major = axes.major;
  let minor_3d = axes.minor;

  // Place the corner in world space using (major, minor_3d) as the
  // disk's basis. No squash needed — the basis vectors are unit length;
  // inclination foreshortening falls out of the projection.
  let world = center + (major * corner.x + minor_3d * corner.y) * halfSize;
  var out: VsOut;
  out.clipPos = worldToClip(u.cam, world);

  // 'quadUv' returns the unit-square corner remapped to [0, 1]² (same
  // vertex-index ordering as 'quadCorner'). Matches the atlas's
  // top-down 'flipY: false' upload convention used by 'quads.wesl'.
  let cornerUv = quadUv(vid);
  let uvLocal = vec2<f32>(cornerUv.x, cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  out.cornerUv = cornerUv;
  out.fadeAlpha = instance.orient.z;
  // Hi-res LOD pass-through. The renderer packs the layer index as a
  // float in 'instance.hiRes.x'; cast to i32 so the fragment-stage
  // 'textureSampleLevel(hiResTex, ..., layerIdx)' gets the integer
  // type the texture_2d_array overload requires. A value of -1 means
  // 'no hi-res slot bound'; the fragment branches on '>= 0' for the
  // crossfade.
  out.hiResLayerIdx = i32(instance.hiRes.x);
  out.hiResCrossfadeAlpha = instance.hiRes.y;
  return out;
}
