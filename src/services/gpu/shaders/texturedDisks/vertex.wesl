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
// The first cut of this shader built a basis from 'camPos - center'
// and squashed it by axisRatio. That made the disk plane track the
// camera, so axisRatio became a 2D screen-space squash — visually
// identical to the points-shader's elliptical billboard mask, with
// no real 3D foreshortening. Worse, near the celestial poles the
// seed vector (used to break the up/right ambiguity) flipped
// abruptly when the camera-relative normal crossed a threshold,
// snapping the basis.
//
// Building in world space fixes both: the disk has ONE orientation
// in 3D regardless of camera, so orbiting reveals the true ellipse
// foreshortening; and the only singularity is now galaxies
// physically at the celestial poles (Dec ≈ ±90°), which is
// independent of camera motion and easily handled with a fallback
// seed.
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
// Same WESL no-global-state argument as elsewhere: 'Uniforms' is
// imported from io.wesl, the @group/@binding declaration lives in
// the consuming file, and the layout matches fragment.wesl's
// identical uniform declaration. Atlas-texture / sampler bindings
// are fragment-only and stay in fragment.wesl.

import package::texturedDisks::io::Uniforms;
import package::texturedDisks::io::InstanceIn;
import package::texturedDisks::io::VsOut;
import package::lib::camera::worldToClip;
// Shared unit-quad helpers from 'lib/billboard.wesl' — replace the
// inline 'CORNERS' const + '(corner + 1) * 0.5' UV remap that used to
// live in this file. The orientation-aligned disk-plane basis (PA +
// inclination → 'major' / 'minor_3d' in 3D world space) stays
// renderer-specific; only the vertex-index → corner / UV lookups are
// shared. See the docblock at the top of 'lib/billboard.wesl' for why
// the orientation math is intentionally NOT pulled into this lib.
import package::lib::billboard::quadCorner;
import package::lib::billboard::quadUv;
// Disk-plane axis math (PA + inclination → world-space major/minor basis)
// is shared with 'proceduralDisks.wesl' via 'lib/orientation.wesl'. The
// inline derivation that used to live in this file's vs() body — the
// los/north/east/major/minor chain — is now the lib's 'diskAxes' fn,
// byte-equivalent for disks since the lib standardised on the wider
// '|dot(north, los)| > 0.99' (~8°) pole-fallback threshold that disks
// already used. See 'lib/orientation.wesl' for the camera-independence
// invariant + the pole-degeneracy discussion.
import package::lib::orientation::DiskAxes;
import package::lib::orientation::diskAxes;

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  // Unit-square corner offset in [-1, +1]² for this triangle-list
  // vertex. Pulled from 'lib/billboard::quadCorner' so the (BL, BR,
  // TR, BL, TR, TL) ordering is shared across all four billboard
  // renderers — see the lib's docblock for the corner-ordering
  // discussion. The corner here is in the disk's LOCAL 2D frame; the
  // 3D placement happens via the (major, minor_3d) basis below.
  let corner = quadCorner(vid);
  let center = instance.posSize.xyz;
  let halfSize = instance.posSize.w * 0.5;
  // Clamp axisRatio so an edge-on disk still produces a thin sliver
  // rather than a degenerate zero-area quad (which would z-fight or
  // disappear entirely under sub-pixel rounding).
  let axisRatio = max(instance.orient.x, 0.05);
  let paDeg = instance.orient.y;
  let paRad = paDeg * 3.14159265 / 180.0;

  // ── Disk-plane basis (PA + inclination → world-space major / minor) ─
  //
  // The full derivation — line-of-sight from Earth-at-origin, sky-tangent
  // (north, east) frame with pole fallback, PA-east-of-north rotation,
  // and inclination tilt of the minor axis out of the sky plane — lives
  // in 'lib/orientation.wesl'. See its docblock for the camera-
  // independence invariant and the ~8°-from-pole degeneracy fallback.
  // 'axisRatio' is clamped at the call site (above) BEFORE we feed it
  // through as cosI, because the lib intentionally doesn't re-clamp.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let axes = diskAxes(center, paRad, cosI, sinI);
  let major = axes.major;
  let minor_3d = axes.minor;

  // Place the corner in world space using (major, minor_3d) as the
  // disk's basis.  No squash needed — the basis vectors are already
  // unit length, and the inclination foreshortening will appear
  // automatically when the camera projects them.
  let world = center + (major * corner.x + minor_3d * corner.y) * halfSize;
  var out: VsOut;
  out.clipPos = worldToClip(u.cam, world);

  // 'quadUv' returns the unit-square corner remapped to [0, 1]² (same
  // vertex-index ordering as 'quadCorner' above). We then flip V so
  // the texture isn't upside down — matches the atlas's top-down
  // 'flipY: false' upload convention used by 'quads.wesl'.
  let cornerUv = quadUv(vid);
  let uvLocal = vec2<f32>(cornerUv.x, cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  out.cornerUv = cornerUv;
  out.fadeAlpha = instance.orient.z;
  return out;
}
