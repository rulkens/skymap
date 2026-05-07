// proceduralDisks.wgsl — 3D-oriented procedural galaxy impostors.
//
// Sibling pass to 'disks.wgsl' (texture-based disks) and 'points.wgsl'
// (screen-aligned billboards).  Renders every galaxy whose apparent
// size exceeds 8 px (with a crossfade up to 14 px) as a 3D-oriented
// quad shaded with a two-component brightness profile (Gaussian bulge
// + exponential disk).  No texture sampling — the fragment stage
// generates the shape entirely from per-fragment math.
//
// The vertex stage is structurally identical to disks.wgsl: we
// construct an in-plane orthonormal basis from 'axisRatio' (which
// encodes inclination via 'cos(i) = axisRatio' for thin disks) and
// 'positionAngleDeg' (east-of-north major-axis direction on the sky),
// then offset the corner vertices into world space.  See disks.wgsl
// for the full derivation; we trust that derivation here and re-use
// the math.

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  // (unused in this shader; preserved for ABI continuity with the disk
  // pass — see disks.wgsl line 62-69 for the same pattern.)
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,         // x, y, z, sizeWorldMpc
  @location(1) orientation: vec4<f32>,     // axisRatio, positionAngleDeg, _, _
  @location(2) extras: vec4<f32>,          // colourIndex, crossfadeAlpha, _, _
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Disk-local UV in [-1, 1]² — used by the fragment shader to compute
  // radial distance for the brightness profile.
  @location(0) uv: vec2<f32>,
  // Per-instance colour-index value (forwarded for the colour ramp).
  @location(1) @interpolate(flat) colourIndex: f32,
  // Per-instance crossfade alpha (0..1).
  @location(2) @interpolate(flat) crossfadeAlpha: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];

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
  // Implementation reuses the same algebra as disks.wgsl — see that
  // file for the full step-by-step derivation including the sign
  // conventions for sky-east vs world-X.
  let pos = instance.posSize.xyz;
  // Half the full-extent value in posSize.w to match disks.wgsl line 104.
  // 'posSize.w' is the FULL quad extent in Mpc (set at the emission site
  // in thumbnailSubsystem.ts to '(diameterKpc/1000) * 4', the same
  // multiplier the points pass uses for GALAXY_RADIUS_MPC).  Each
  // corner sits at ±halfWorld * basis, so the rendered quad spans
  // 2*halfWorld = posSize.w world units total — agreeing with both the
  // textured-thumbnail disk (which uses identical posSize.w) and the
  // points-pass billboard (which uses the same multiplier directly).
  let halfWorld = instance.posSize.w * 0.5;
  // Floor at 0.05 to avoid degenerate-edge-on disks collapsing the quad to a
  // 1D line in the vertex stage; matches the disks.wgsl convention.
  let axisRatio = max(instance.orientation.x, 0.05);
  let paRad = instance.orientation.y * 3.14159265 / 180.0;

  // ── Line of sight (Earth → galaxy) ───────────────────────────────────
  //
  // Earth sits at the world origin in this coordinate system; 'losDir'
  // is therefore the Earth-to-galaxy direction.  WORLD-FIXED: the disk's
  // orientation is an intrinsic property of the galaxy in 3D space and
  // must not depend on where the camera currently sits, otherwise
  // orbiting would visibly rotate the disk plane with the camera (the
  // exact bug 'disks.wgsl' was rewritten to fix; see its header).
  //
  // Earth (origin) → galaxy direction.  WORLD-FIXED, independent of camera
  // position, so orbiting reveals the true 3D inclination foreshortening
  // rather than rotating the disk with the camera.  This mirrors
  // 'disks.wgsl''s 'losDir = normalize(center)' derivation; see the long
  // header comment in that file for the full reasoning on why this is
  // emphatically NOT 'pos - camPosWorld' (the bug fixed there).
  let los = normalize(pos);

  // Local sky-north and sky-east at the galaxy.  We Gram-Schmidt
  // celestial-north (+Z world) against 'los' to get the sky-north
  // tangent direction; sky-east is then los × sky-north.
  let CELESTIAL_NORTH = vec3<f32>(0.0, 0.0, 1.0);
  let northTangentRaw = CELESTIAL_NORTH - los * dot(CELESTIAL_NORTH, los);
  let northLen = length(northTangentRaw);
  // Pole degeneracy: if the line of sight is essentially along the
  // celestial pole, the sky-tangent has no defined "north".  Fall back
  // to using world +Y as the in-plane reference.  Picking +Y is
  // arbitrary but consistent (every pole-on viewing renders with the
  // same fallback orientation) and the loss of sky-PA fidelity at the
  // poles is invisible in practice.
  let northTangent = select(
    northTangentRaw / northLen,
    vec3<f32>(0.0, 1.0, 0.0),
    northLen < 1e-4,
  );
  // East-on-sky tangent.  Argument order MATCHES disks.wgsl's
  // 'east_proj = cross(north_proj, losDir)' so the (north, east, los)
  // frame is right-handed in the same sense and PA convention agrees
  // with the textured-thumbnail pass.  Reversing the cross flips the
  // sign of the resulting major-axis rotation for any non-zero PA,
  // which would visibly disagree with the thumbnail at the crossfade
  // boundary — that bug just got fixed; don't reintroduce it.
  let eastTangent = cross(northTangent, los);

  // Major axis on sky: rotate sky-north by PA toward sky-east.
  let majorSky = northTangent * cos(paRad) + eastTangent * sin(paRad);
  // Perpendicular-to-major in the sky-tangent plane.  This matches
  // 'disks.wgsl''s 'minor_in_sky = cross(losDir, major)' exactly — the
  // two passes MUST share basis math, otherwise their on-screen
  // ellipses disagree at the crossfade boundary.
  let perpMajorSky = cross(los, majorSky);

  // ── Tilt the minor axis out of the sky plane by inclination ──────────
  //
  // Inclination i with cos(i) = axisRatio.  Face-on (axisRatio = 1,
  // sinI = 0) → minor lies entirely in the sky plane → projects as a
  // circle.  Edge-on (axisRatio → 0, sinI → 1) → minor ≈ losDir → disk
  // is parallel to the line of sight and projects as a thin streak.
  //
  // This formula is identical to disks.wgsl line 166:
  //   minor_3d = minor_in_sky * cosI + losDir * sinI
  // and that identity is load-bearing — an earlier revision built a
  // disk normal first, then took 'cross(normal, major)' to recover the
  // minor axis.  That route flips the sign of the 'sinI * los' term
  // (because 'cross(perpMajorSky, major) = -los' in this right-handed
  // frame), tilting the disk in the OPPOSITE direction from the
  // textured-thumbnail pass.  At axisRatio ≈ 0.87 (i ≈ 30°) the visible
  // mismatch is a ~30° rotation against one axis vs. the thumbnail —
  // exactly the bug we just fixed; don't reintroduce it.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let majorAxis = majorSky;
  let minorAxis = perpMajorSky * cosI + los * sinI;

  // Quad corners in world space: centre + corner.x · major + corner.y · minor,
  // each scaled by the half-extent.
  let worldOffset = corner.x * majorAxis * halfWorld + corner.y * minorAxis * halfWorld;
  let worldPos = pos + worldOffset;

  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv = corner;
  out.colourIndex = instance.extras.x;
  out.crossfadeAlpha = instance.extras.y;
  return out;
}

// ── Fragment stage ─────────────────────────────────────────────────────
//
// Reads the disk-local uv (in [-1,1]² where r=1 is the impostor's
// apparent edge) and shades a two-component galaxy brightness profile:
//
//   - Gaussian bulge (σ = 0.4): bright inner core.
//   - Exponential disk (scale = 0.5): softer halo.
//
// Hue comes entirely from the per-galaxy colour-index ramp — the same
// ramp the points pass uses, so a galaxy's procedural-disk colour
// matches its companion point exactly.  Earlier versions added warm-
// bulge / cool-disk tint shifts on top of the ramp colour; that made
// the procedural disk visibly diverge from the points pass (warmer at
// the centre, cooler at the rim) so it's been removed.  Only the
// brightness profile remains.
//
// Final alpha is the combined brightness × crossfadeAlpha so the
// impostor fades in cleanly across the 8-14 px transition band.

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;
const BULGE_WEIGHT = 0.6;
const DISK_WEIGHT = 0.4;

// Mirror of points.wgsl's 'ramp(t)'.  Kept under the same name so a
// grep for 'ramp' finds both copies; kept in this file (rather than
// shared via WGSL include — there is no include mechanism) so the
// procedural-disk pass renders exactly the same colour as the
// points pass for any given colour-index value.  See
// points.wgsl:601-633 for the full derivation.
fn ramp(t: f32) -> vec3<f32> {
  let s = clamp(t * 0.5, 0.0, 1.0);
  let blueWhite = mix(vec3<f32>(0.4, 0.6, 1.0), vec3<f32>(1.0, 0.95, 0.8), s);
  let whiteRed  = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.5, 0.3), s);
  return select(blueWhite, whiteRed, t > 1.0);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }

  let bulge = exp(-(r * r) / (2.0 * BULGE_SIGMA * BULGE_SIGMA));
  let disk  = exp(-r / DISK_SCALE);
  let intensity = bulge * BULGE_WEIGHT + disk * DISK_WEIGHT;

  // Colour: ramp hue only, no per-component tint shifts.  See the
  // fragment-stage header comment above for why the warm-bulge / cool-
  // disk tints were removed (they made this pass visibly diverge from
  // the points pass at the crossfade boundary).
  let base = ramp(in.colourIndex);
  let tinted = base;

  // Soft edge fade.  We're outputting LINEAR colour into an rgba16float
  // HDR target; the tone-map pass converts to sRGB later (see
  // toneMap.wgsl).  The disk's exponential decay leaves a residual
  // 'exp(-2) ≈ 0.135' at r = 1.0 in LINEAR space, which the gamma curve
  // brightens to ~42% display brightness — that's the hard edge the
  // user sees right before the discard.
  //
  // Apply a smoothstep edge fade from r = 0.6 (full disk) to r = 1.0
  // (zero alpha), and SQUARE it to compensate for the ~2.2-power gamma:
  // a value 'x' in linear space becomes 'x^(1/2.2) ≈ x^0.45' in display.
  // To get display brightness that fades roughly linearly with r, the
  // linear intensity must fade as '(1-r')^2.2 ≈ (1-r')^2' (where r' is
  // the smoothstep parameter).  Squaring 'edgeFade' yields exactly that
  // '(smoothed)^2' shape — perceptually smooth in display space.
  //
  // We multiply the alpha (not the rgb separately) because we use
  // premultiplied alpha additive blending; alpha is the brightness
  // gate, and fading it to 0 at r = 1.0 is what removes the hard edge.
  let edgeFade = smoothstep(1.0, 0.6, r);
  let edgeFadeLinear = edgeFade * edgeFade;
  let alpha = intensity * in.crossfadeAlpha * edgeFadeLinear;
  // Premultiplied alpha — matches the project's blend mode (see
  // device.ts 'alphaMode: 'premultiplied'').
  return vec4<f32>(tinted * alpha, alpha);
}
