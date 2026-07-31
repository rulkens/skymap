// starPoints/vertex.wesl — billboard vertex stage for the hand-seeded famous /
// neighbourhood stars, drawn on the survey (Gaia bin) leaf photometry so a
// famous star renders pixel-identically to a catalogue leaf of the same absMag,
// colour and camera distance.
//
// The neighbourhood's stars render as additive point sprites in the depthless
// HDR accumulation — the same visual language as the survey point cloud, but
// through a THIN DEDICATED pipeline rather than the survey 'points/' shaders. A
// handful of seeded stars needs none of the survey stage's per-source
// fade/source/focus bind groups, Malmquist gating, pick identity or octree
// vertex-pull. What IS shared is the billboard math (lib/camera + lib/billboard)
// AND the photometric core (lib/starPhotometry) — so the two stages sit on the
// same size/flux/exposure constants and can never drift a leaf's look apart.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'StarPointUniforms' (io.wesl): the shared
// 80-byte 'CameraUniforms' prefix (viewProj + viewportPx) plus the user's base
// star-dot size 'sizePx' and exposure trim 'brightness', forwarded from the same
// 'starCatalogs' settings the survey stage reads. Per-star colour + magnitude
// ride in the instance attributes.
//
// ## Attribute layout (stepMode 'instance', stride 28 bytes)
//
//   @location(0) position: vec3<f32>  — star position, offset 0.
//   @location(1) color:    vec3<f32>  — linear-RGB spectral tint, offset 12.
//   @location(2) absMag:   f32        — absolute magnitude, offset 24.
//
// Positions are f32, but the caller ('starPointsLayer') hands them in already
// CAMERA-RELATIVE: it subtracts the eye from each anchor and folds the eye
// offset into 'viewProj' (via 'rebaseViewProj'), both in f64, before upload.
// Without that rebase the raw parsec-scale anchor (~1e-6 Mpc from the render
// origin) and the raw view translation would be near-equal large numbers whose
// f32 subtraction here cancels catastrophically, jittering the sprite centre as
// the camera closes on a local star. Rebased, both operands of 'worldToClip'
// are small and well-conditioned, so f32 suffices — and the camera-relative
// 'position' doubles as the record's camera-relative vector, so its squared
// length IS the squared camera distance the apparent-flux dimming needs.
//
// ## Photometry (RADIUS from the slider, MAGNITUDE + DISTANCE as BRIGHTNESS)
//
// A famous star is always a POINT source (a leaf; no aggregate branch). Its
// radius is a fixed slider-scaled legibility floor, and its absolute magnitude
// and camera distance express purely as the peak INTENSITY of a
// luminance-conserving Gaussian dot — identical to the survey leaf case
// (lib/starPhotometry.wesl):
//
//   sizeScale = sizePx / STAR_SIZE_REF_PX      -- default slider ⇒ 1
//   rPxRaw    = STAR_GLOW_MIN_PX * sizeScale   -- pre-ceiling photometric radius
//   rPx       = min(STAR_GLOW_MAX_PX, rPxRaw)  -- drawn radius
//   d2        = dot(position, position)        -- squared camera distance (Mpc^2)
//   fluxApp   = 10^(-0.4*absMag) * D_REF^2 / max(d2, MIN_D2)   -- apparent flux
//   intensity = starPeakIntensity(brightness, fluxApp, rPxRaw)
//
// The peak scales so the dot's INTEGRATED luminance is EXPOSURE * brightness *
// fluxApp regardless of rPx (starPeakIntensity), so the slider redistributes a
// FIXED light across a wider/narrower dot while 'brightness' scales the total.

import package::bodies::starPoints::io::VSOut;
import package::bodies::starPoints::io::StarPointUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::starPhotometry::STAR_SIZE_REF_PX;
import package::lib::starPhotometry::STAR_GLOW_MIN_PX;
import package::lib::starPhotometry::STAR_GLOW_MAX_PX;
import package::lib::starPhotometry::D_REF_MPC;
import package::lib::starPhotometry::MIN_D2_MPC2;
import package::lib::starPhotometry::starPeakIntensity;
import package::lib::starPhotometry::toRefPx;

@group(0) @binding(0) var<uniform> u: StarPointUniforms;

// Depth epsilon: pull the clamped clip-z this far inside the far plane (in
// ndc-z terms) so a point sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) absMag: f32,
) -> VSOut {
  let center = worldToClip(u.cam, position);
  let corner = quadCorner(vi);

  // Radius: a fixed slider-scaled legibility floor (point source, no box to
  // fill); the px ceiling bounds only the DRAWN radius. 'sizeScale' makes the
  // default slider the identity. A point radius reaches the ceiling only at
  // implausible slider values -- the raw/drawn split exists to keep the peak
  // convention identical to the survey stage's (lib/starPhotometry.wesl).
  let sizeScale = u.sizePx / STAR_SIZE_REF_PX;
  let rPxRaw = STAR_GLOW_MIN_PX * sizeScale;
  let rPx = min(STAR_GLOW_MAX_PX, rPxRaw);

  // Inverse-square attenuation: 'position' is the star's camera-relative vector
  // (Mpc), so its squared length is the squared camera distance. D_REF^2/d2 dims
  // the intrinsic flux to the apparent flux the eye receives (= 1 at 10 pc),
  // with the floor guarding the fly-through pole.
  let d2 = dot(position, position);
  let fluxApp = pow(10.0, -0.4 * absMag) * (D_REF_MPC * D_REF_MPC) / max(d2, MIN_D2_MPC2);

  // Peak from the pre-ceiling radius, converted to reference px (toRefPx) so
  // the dot's luminance per unit SOLID ANGLE equals EXPOSURE * brightness *
  // fluxApp wherever the ceiling is not biting — the shared convention with
  // the survey stage (lib/starPhotometry.wesl).
  let intensity = starPeakIntensity(u.brightness, fluxApp, toRefPx(rPxRaw, u.cam.viewportPx.y));

  let offset = expandBillboardScreen(u.cam, center, rPx, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Survive the adaptive foreground far plane on a deep descent. The NEAR0 far
  // plane tracks camera distance ('foregroundFrustum': far = camDist * 100), so
  // diving onto one star collapses it to just past that star and the OTHER
  // parsec-scale points fall beyond it and frustum-clip. Clamping clip-z to just
  // inside the far plane keeps them on screen. This is safe ONLY because this is
  // the depthless additive HDR point pass — no depth test or write — so a
  // clamped z perturbs no depth comparison; the depth-tested bodies (Earth /
  // star spheres / planets) keep the tight far plane for their depth precision.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS));

  out.uv = corner;
  out.color = color;
  out.intensity = intensity;
  return out;
}
