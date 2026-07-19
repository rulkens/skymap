// atmosphere/shell/fragment.wesl — the atmosphere in-scatter shell fragment.
//
// Per fragment of the atmosphere-top proxy sphere's FAR wall (front faces are
// culled by the pipeline), this reconstructs the view ray, finds the segment of
// it inside the atmosphere shell (the analytic march bound), looks up the
// in-scattered sky radiance from the per-frame sky-view LUT, and emits it with a
// premultiplied-OVER alpha so the limb glows and the sunset arc reddens. There
// is NO per-pixel march here -- the march lives in the LUT bakes; this stage is
// a couple of texture samples + the analytic intersection (spec §11).
//
// ## The analytic march bound (WESL mirror of 'atmosphereShellBound')
//
// The CPU 'utils/math/atmosphereShellBound.ts' is the unit-tested source of
// truth for this clamp; this is its GPU twin, reusing the SAME shared quadratic
// ('lib/util.wesl::raySphere') that the CPU's 'raySphereRoots' mirrors. In this
// mesh's local frame the atmosphere top is the UNIT sphere (topRadius == 1) and
// the ground is 'u.bottomRadius' in (0, 1). Two sphere tests + the clamp:
//   - Top sphere gives the entry/exit; miss or wholly-behind -> discard.
//   - 'tNear -> 0' when the camera is inside the shell (near root negative).
//   - Ground-hit far clamp: the opaque surface caps the visible atmosphere.
// Modeled on 'horizonShell/fragment.wesl' (the select/discard shape).
//
// ## The two LUT lookups
//
//   - Sky-view LUT (per-frame): indexed by (view-zenith, azimuth-relative-to-sun)
//     at the camera altitude, it returns the in-scattered radiance directly --
//     the reddening at the terminator is baked per-channel into it, which is why
//     v1's scalar alpha suffices (see below).
//   - Transmittance LUT (startup): sampled at the near + far endpoints of the
//     bound; the RATIO 'T(near)/T(far)' is the transmittance of the segment
//     itself (the Bruneton ratio identity, exact for a ray that continues to the
//     top -- the limb + sky cases that actually render here). Its luminance
//     drives the scalar background-opacity.
//
// All LUT parametrisations are UNIT-AGNOSTIC (built from radii ratios), so this
// stage feeds LOCAL radii (top == 1, bottom == u.bottomRadius, camera radius in
// atmosphere-top units) and gets the same uv the km-baked LUT was written with.
// That is why the fragment needs neither 'ScatteringParams' nor the km radii.
//
// ## Premultiplied-OVER output (spec §8.3, v1)
//
// The pipeline blends 'blend:\'over\'' with srcFactor 'one', dstFactor
// 'one-minus-src-alpha': out = src.rgb + dst*(1 - src.a). We emit
// 'vec4(inScatter * u.exposure, opacity)', opacity = 1 - luminance(segment
// transmittance) -- exactly the spec's 'out = inScatter + dst*(1 - opacity)'.
// The visible sunset reddening rides the PER-CHANNEL 'inScatter'; the scalar
// alpha only attenuates the background, which behind the limb is space (dst ~ 0),
// so a scalar there is invisible in v1 (per-channel/dual-source is the deferred
// upgrade). A ray that never enters the atmosphere discards (no contribution).
//
// Comments single-quoted, never backticks. Literal 'package::' imports.
//
// ## Inter-stage contract
//
// The input at @location(0) MUST match 'vertex.wesl's 'VsOut.localPos' at
// @location(0) (matched by location, not a shared struct -- see the vertex
// header for why this task keeps them separate).

import package::lib::sphere::AtmosphereUniforms;
import package::lib::util::raySphere;
import package::atmosphere::scattering::sampleTransmittanceToTop;
import package::atmosphere::scattering::skyViewLutParamsToUv;

@group(0) @binding(0) var<uniform> u: AtmosphereUniforms;
@group(0) @binding(1) var lutSamp: sampler;
@group(0) @binding(2) var skyViewLut: texture_2d<f32>;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;

// The atmosphere top is the unit sphere in this mesh's local frame.
const TOP_RADIUS: f32 = 1.0;
const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);
// Rec. 709 luminance weights, for collapsing the per-channel segment
// transmittance to the scalar background-opacity (v1).
const LUMINANCE: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

struct FsIn {
  // Unit-atmosphere-top local-space position (see vertex.wesl VsOut.localPos).
  @location(0) localPos: vec3<f32>,
};

@fragment
fn fs(in: FsIn) -> @location(0) vec4<f32> {
  // View ray in the local frame. Renormalize AFTER the implicit model transform
  // (the proxy is a scaled sphere) -- the house trap; an un-normalized dir
  // breaks every dot product below.
  let dir = normalize(in.localPos - u.camPosLocal);
  let ro = u.camPosLocal;

  // ── Analytic march bound (mirror of atmosphereShellBound) ──────────
  let top = raySphere(ro, dir, PLANET_CENTER, TOP_RADIUS);
  // Miss the top sphere, or the whole shell behind the camera -> nothing.
  if (top.y < 0.0) {
    discard;
  }
  let tNear = max(0.0, top.x);
  var tFar = top.y;

  // Ground occlusion: the opaque surface caps the visible atmosphere at the
  // first ground crossing when it lies ahead of tNear.
  let ground = raySphere(ro, dir, PLANET_CENTER, u.bottomRadius);
  let intersectsGround = ground.x > 0.0;
  if (intersectsGround && ground.x > tNear) {
    tFar = min(tFar, ground.x);
  }

  // ── Sky-view LUT lookup for the in-scattered radiance ──────────────
  let viewHeight = length(u.camPosLocal);
  let up = u.camPosLocal / viewHeight;
  let viewZenithCos = dot(dir, up);

  // Azimuth of the view relative to the sun, both projected off the up axis.
  // 'lightViewCos' encodes it exactly as the sky-view bake reconstructs the ray
  // (dot of the two off-axis unit vectors).
  let viewPerp = dir - up * viewZenithCos;
  let sunUp = dot(u.sunDirLocal, up);
  let sunPerp = u.sunDirLocal - up * sunUp;
  let viewPerpLen = length(viewPerp);
  let sunPerpLen = length(sunPerp);
  var lightViewCos = 1.0;
  if (viewPerpLen > 1e-5 && sunPerpLen > 1e-5) {
    lightViewCos = dot(viewPerp / viewPerpLen, sunPerp / sunPerpLen);
  }

  let skyUv = skyViewLutParamsToUv(u.bottomRadius, viewHeight, viewZenithCos, lightViewCos, intersectsGround);
  let inScatter = textureSampleLevel(skyViewLut, lutSamp, skyUv, 0.0).rgb;

  // ── Transmittance of the shell segment -> scalar background-opacity ─
  let nearPos = ro + dir * tNear;
  let rNear = length(nearPos);
  let muNear = dot(dir, nearPos / rNear);
  let farPos = ro + dir * tFar;
  let rFar = length(farPos);
  let muFar = dot(dir, farPos / rFar);

  let tToTopNear = sampleTransmittanceToTop(transmittanceLut, lutSamp, u.bottomRadius, TOP_RADIUS, rNear, muNear);
  let tToTopFar = sampleTransmittanceToTop(transmittanceLut, lutSamp, u.bottomRadius, TOP_RADIUS, rFar, muFar);
  // Bruneton ratio identity: transmittance of the near->far segment is the ratio
  // of the two transmittance-to-top lookups, clamped to a valid [0,1] range.
  let segTransmittance = clamp(tToTopNear / max(tToTopFar, vec3<f32>(1e-6)), vec3<f32>(0.0), vec3<f32>(1.0));
  let opacity = 1.0 - dot(segTransmittance, LUMINANCE);

  // Premultiplied-OVER: rgb is the added in-scatter, alpha attenuates the
  // background (space behind the limb).
  return vec4<f32>(inScatter * u.exposure, opacity);
}
