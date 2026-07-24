// proceduralDisks/vertex.wesl — disk-plane-oriented procedural galaxy
// impostor vertex stage.
//
// Structurally identical to 'disks/vertex.wesl': we construct an
// in-plane orthonormal basis from 'axisRatio' (which encodes
// inclination via 'cos(i) = axisRatio' for thin disks) and
// 'positionAngleDeg' (east-of-north major-axis direction on the
// sky), then offset the corner vertices into world space. See
// 'disks/vertex.wesl' (and 'lib/orientation.wesl') for the full
// derivation; we trust that derivation here and re-use the math.
//
// The only distinguishing detail vs the textured disk pass is that
// we pass the raw [-1, +1]² corner directly into VsOut.uv (instead
// of remapping to [0, 1]² as 'quadUv' would do); the fragment stage
// then reads 'length(in.uv)' as the radial distance r ∈ [0, sqrt(2)]
// for the procedural brightness profile.
//
// ## Why bindings are declared here, not in io.wesl
//
// Same WESL no-global-state argument as elsewhere: 'Uniforms' is
// imported from io.wesl, the @group/@binding declaration lives in
// the consuming file, and the layout matches what the renderer
// builds. The fragment stage doesn't declare the binding because it
// doesn't read 'u' — only the vertex stage consumes 'cam.viewProj'.

import package::galaxyCatalog::proceduralDisks::io::Uniforms;
import package::galaxyCatalog::proceduralDisks::io::InstanceIn;
import package::galaxyCatalog::proceduralDisks::io::VsOut;
import package::lib::camera::worldToClip;
// Shared unit-quad helper from 'lib/billboard.wesl' — replaces the
// inline 'CORNERS' const that used to live in this file. The
// orientation-aligned disk-plane basis (PA + inclination →
// 'majorAxis' / 'minorAxis' in 3D world space) stays renderer-
// specific; only the vertex-index → corner lookup is shared. We
// don't import 'quadUv' here: this pass uses the raw [-1, +1]²
// corner directly as the fragment's radial coordinate (see 'out.uv
// = corner' below + the 'length(in.uv)' read in 'fs'), so the [0,
// 1]² remap that 'quadUv' performs would be wrong. See the docblock
// at the top of 'lib/billboard.wesl' for why the orientation math
// is intentionally NOT pulled into this lib.
import package::lib::billboard::quadCorner;
// Disk-plane axis math (PA + inclination → world-space major/minor basis)
// is shared with 'texturedDisks/vertex.wesl' via 'lib/orientation.wesl'. The inline
// derivation that used to live in this file's vs() body — the
// los/north/east/major/minor chain plus the inclination tilt of the
// minor axis out of the sky plane — is now the lib's 'diskAxes' fn,
// byte-equivalent for proceduralDisks since the lib standardised on
// the tight 'northLen < 1e-4' post-projection pole-fallback that
// proceduralDisks already used. See 'lib/orientation.wesl' for the
// camera-independence invariant + the pole-degeneracy discussion.
import package::lib::orientation::DiskAxes;
import package::lib::orientation::diskAxes;
// Shared cluster-focus dim — same lib the points pass uses, so disks fade
// in lockstep with their companion point sprites. The membership test is
// per-galaxy (constant across a quad's corners), so we evaluate it once
// here in the vertex stage and forward the scalar via VsOut.focusDim.
import package::lib::focusUniforms::FocusUniforms;
import package::lib::focusUniforms::focusAlphaMultiplier;

@group(0) @binding(0) var<uniform> u: Uniforms;
// @group(1) cluster-focus uniform — the impostor pipelines have no fade /
// source groups, so focus takes the first free slot (the points pipeline
// parks it at @group(3)). Single shared binding: one structure focused at a time.
@group(1) @binding(0) var<uniform> focus: FocusUniforms;

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  // Unit-square corner offset in [-1, +1]² for this triangle-list
  // vertex. Pulled from 'lib/billboard::quadCorner' so the (BL, BR,
  // TR, BL, TR, TL) ordering is shared across all four billboard
  // renderers — see the lib's docblock for the corner-ordering
  // discussion. The corner here is in the disk's LOCAL 2D frame; the
  // 3D placement happens via the (majorAxis, minorAxis) basis below,
  // and 'out.uv = corner' forwards it unchanged so the fragment can
  // use 'length(in.uv)' as the radial distance for the brightness
  // profile.
  let corner = quadCorner(vid);

  // ── Disk-plane basis construction ────────────────────────────────────
  //
  // The galaxy's *major axis* direction on the sky is given by PA (east
  // of north).  In skymap world coords (+Z = celestial north), the
  // local sky-tangent at the galaxy's position has +Y as celestial north
  // and -X as east (after we factor out the line-of-sight).  We build
  // the major-axis world direction by rotating the local sky-north
  // vector by PA toward east, projected into the sky-tangent plane.
  //
  // Then the minor axis is perpendicular to the major axis IN THE
  // GALAXY'S DISK PLANE — which is *not* the sky-tangent plane.  The
  // disk is tilted by inclination i = acos(axisRatio).  We compute the
  // disk normal as the line-of-sight direction rotated by (90° - i)
  // toward the perpendicular-to-major-axis sky direction.  The minor
  // axis then lies in the plane perpendicular to (major × normal).
  //
  // Implementation reuses the same algebra as texturedDisks/vertex.wesl — see that
  // file for the full step-by-step derivation including the sign
  // conventions for sky-east vs world-X.
  let pos = instance.posSize.xyz;
  // Half the full-extent value in posSize.w to match texturedDisks/vertex.wesl line 104.
  // 'posSize.w' is the FULL quad extent in Mpc (set at the emission site
  // in thumbnailSubsystem.ts to '(diameterKpc/1000) * 4', the same
  // multiplier the points pass uses for GALAXY_RADIUS_MPC).  Each
  // corner sits at ±halfWorld * basis, so the rendered quad spans
  // 2*halfWorld = posSize.w world units total — agreeing with both the
  // textured-thumbnail disk (which uses identical posSize.w) and the
  // points-pass billboard (which uses the same multiplier directly).
  let halfWorld = instance.posSize.w * 0.5;
  // Floor at 0.05 to avoid degenerate-edge-on disks collapsing the quad to a
  // 1D line in the vertex stage; matches the texturedDisks/vertex.wesl convention.
  let axisRatio = max(instance.orientation.x, 0.05);
  let paRad = instance.orientation.y * 3.14159265 / 180.0;

  // ── Disk-plane basis (PA + inclination → world-space major / minor) ─
  //
  // The full derivation — line-of-sight from Earth-at-origin, sky-tangent
  // (north, east) frame with pole fallback, PA-east-of-north rotation,
  // and inclination tilt of the minor axis out of the sky plane — lives
  // in 'lib/orientation.wesl'. See its docblock for the camera-
  // independence invariant and the tight post-projection 'northLen <
  // 1e-4' pole-degeneracy fallback that this renderer historically used
  // and the lib now standardises on. 'axisRatio' is clamped at the call
  // site (above) BEFORE we feed it through as cosI, because the lib
  // intentionally doesn't re-clamp.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let axes = diskAxes(pos, paRad, cosI, sinI);
  let majorAxis = axes.major;
  let minorAxis = axes.minor;

  // Quad corners in world space: centre + corner.x · major + corner.y · minor,
  // each scaled by the half-extent.
  let worldOffset = corner.x * majorAxis * halfWorld + corner.y * minorAxis * halfWorld;
  let worldPos = pos + worldOffset;

  var out: VsOut;
  out.clipPos = worldToClip(u.cam, worldPos);
  out.uv = corner;
  out.colourIndex = instance.extras.x;
  out.crossfadeAlpha = instance.extras.y;
  // Famous-WebP crossfade-OUT against the textured-disk pass. Default
  // 1.0 for ~every galaxy; the proceduralDiskSubsystem only writes a
  // ramped value (toward 0.0) for Famous-source galaxies whose curated
  // WebP is loaded into the atlas. See the override site in
  // 'proceduralDiskSubsystem.ts'.
  out.procFadeOut = instance.extras.z;
  // Cluster-focus dim, evaluated once per instance at the galaxy centre
  // (constant across the quad's corners). At rest (blend=0) this is 1.0.
  out.focusDim = focusAlphaMultiplier(pos, focus);
  // Slot 6 carries the CPU-packed pick id as raw f32 bits; bitcast
  // recovers the original u32 '(sourceCode << 27) | localIdx' written by
  // the TS side in slot 6 = orientation.z. The visual fragment ignores this
  // varying; the pick fragment reads it to write the r32uint pick texture.
  out.pickId = bitcast<u32>(instance.orientation.z);
  // Effective surface-brightness amplitude, pre-scaled on the CPU by the
  // live sliders; forwarded unchanged so the fragment stage can multiply
  // its brightness profile by it.
  out.sbAmp = instance.extras.w;
  return out;
}
