// atmosphere/shell/fragment.wesl — the atmosphere in-scatter shell fragment.
//
// Shader-derivation file: the contracts below run longer than the comment budget.
// No per-pixel march: it lives in the LUT bakes; this stage is an analytic ray/sphere
// bound plus a few texture samples, emitted in TWO blend passes (MULTIPLY then ADD)
// because extinction is per-channel and a colour attachment has ONE alpha. A single
// luminance alpha attenuated the disc achromatically while adding chromatic
// in-scatter, washing it cyan. The ALPHA channel stays luminance-collapsed: it is the
// compositor's single background weight. Both passes discard from the same predicate,
// or the limb double-counts.
//
// Wall duty ('front_facing' split, BOTH walls rasterise): the NEAR wall carries the
// over-disc aerial perspective on every finite-depth pixel (body, terrain, a mesh
// seated on it); the FAR wall carries limb + sky on FAR-depth pixels. Rays are
// classified by SAMPLED depth, not the floor sphere: terrain above that floor at the
// limb misses it, leaving bare tile with neither extinction nor in-scatter. The step
// attaches no depth, so a depth nearer than the shell entry is what drops a fragment
// an opaque body sits in front of. A camera INSIDE the shell is served by the
// full-screen inside path ('atmosphereInsideBand'), never this fragment.
//
// March bound: the GPU twin of 'utils/math/atmosphereShellBound.ts' (the unit-tested
// source of truth), over the shared 'lib/util.wesl::raySphere'. Local frame: top is
// the UNIT sphere, ground is 'u.bottomRadius'. All LUT parametrisations are
// unit-agnostic (radii ratios), so LOCAL radii index the km-baked LUTs identically.
//
// Transmittance of the segment is the ratio of two transmittance-to-top lookups
// (Bruneton). Ground-ENDING rays look DOWN, off the LUT's covered domain, so they are
// read in the REVERSED direction (T(a to b) == T(b to a)); see the lookup below.
//
// Comments single-quoted, never backticks. Literal 'package::' imports. The input at
// @location(0) must match 'vertex.wesl's 'VsOut.localPos' (matched by location).

import package::lib::sphere::AtmosphereUniforms;
import package::lib::util::raySphere;
import package::lib::sceneDepthRay::FAR_DEPTH;
import package::lib::sceneDepthRay::sceneRayDistance;
import package::atmosphere::scattering::sampleTransmittanceToTop;
import package::atmosphere::scattering::skyViewLutParamsToUv;

// The sampled row's km-scaled frame ('sampledDepthKmFrame'), the viewport, and the
// 1/topRadiusKm landing the km distance in local units. Byte offsets mirrored in
// 'atmosphereShellRenderer.ts', pinned by a parity test.
struct ShellDepthFrame {
  invMvp: mat4x4<f32>,
  camPosKm: vec3<f32>,
  viewportPx: vec2<f32>,
  kmToLocal: f32,
};

@group(0) @binding(0) var<uniform> u: AtmosphereUniforms;
@group(0) @binding(1) var lutSamp: sampler;
@group(0) @binding(2) var skyViewLut: texture_2d<f32>;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;
// Ring-alpha strip: a 1x1 transparent placeholder on ringless bodies. Sampled only
// inside the ring-in-front branch, which 'ringOuterRatio == 0' short-circuits.
@group(0) @binding(4) var ringTexture: texture_2d<f32>;
// 'foreground:0's depth, sampled not attached. An unresolved frame arrives as the
// 1x1 far-cleared placeholder, so the FAR_DEPTH arm keeps it safe. Reached only from
// 'sampleShell': the inside path imports 'sampleShellSegment' and would hoist these
// on top of its own bindings 5 and 6.
@group(0) @binding(5) var sceneDepth: texture_depth_2d;
@group(0) @binding(6) var<uniform> depthFrame: ShellDepthFrame;

// The atmosphere top is the unit sphere in this mesh's local frame.
const TOP_RADIUS: f32 = 1.0;
const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);
// Rec. 709 luminance weights, for the ALPHA channel only (the rgb path is
// per-channel). They sum to exactly 1.0, which is what makes
// 'dot(mix(vec3(1), T, ringVis), LUMINANCE)' equal 'mix(1, luminance(T),
// ringVis)', so an opaque ring band in front leaves the coverage at zero.
const LUMINANCE: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);
// Sky luminance suppression of the background, in 1/luminance, at sea level. A look
// constant: at noon from 6.5 km the darkest sky (~0.006) hides a star; sun 2 deg down
// (~0.002) shows ~18%.
const SKY_ADAPTATION_GAIN: f32 = 5000.0;
// The gain falls off with camera altitude (shell-thickness units; Earth: 8 km of
// 100). A sunlit limb from orbit and a noon zenith from the ground have the same
// per-pixel luminance; only the viewer's surroundings differ (adapted, or not).
const SKY_ADAPTATION_SCALE: f32 = 0.08;

struct FsIn {
  // Framebuffer pixel position (y-down, half-pixel centres).
  @builtin(position) clip: vec4<f32>,
  // See vertex.wesl VsOut.localPos.
  @location(0) localPos: vec3<f32>,
  // True on the NEAR (front) wall, false on the FAR (back) wall.
  @builtin(front_facing) frontFacing: bool,
};

// Everything both passes need, from ONE evaluation. 'hit' false means off the
// shell, hidden by an opaque body, or on the wrong wall; both entry points discard.
struct ShellSample {
  // Per-channel background multiplier: the segment transmittance, ring-blended.
  transmit: vec3<f32>,
  // In-scattered radiance to ADD, already exposed and ring-scaled.
  emission: vec3<f32>,
  // The compositor's single background weight: extinction and sky adaptation.
  coverage: f32,
  hit: bool,
};

// Shared core: march bound, LUT lookups and ring occlusion. 'ro' is always
// 'u.camPosLocal'; callers pass 'dir' normalized and 'tDepth' in LOCAL units
// ('hasDepth' false leaves it unread).
fn sampleShellSegment(dir: vec3<f32>, tDepth: f32, hasDepth: bool) -> ShellSample {
  // Off-shell default: each value is its blend's IDENTITY (multiply by 1, add 0), so
  // a fragment surviving its discard is a no-op, not a white or black hole.
  var out: ShellSample;
  out.transmit = vec3<f32>(1.0);
  out.emission = vec3<f32>(0.0);
  out.coverage = 0.0;
  out.hit = false;

  let ro = u.camPosLocal;

  let top = raySphere(ro, dir, PLANET_CENTER, TOP_RADIUS);
  if (top.y < 0.0) {
    return out;
  }
  let tNear = max(0.0, top.x);
  var tFar = top.y;

  // An opaque body in FRONT of the shell hides the whole segment.
  if (hasDepth && tDepth < tNear) {
    return out;
  }

  // The ground crossing caps the visible atmosphere; the pixel's own scene distance
  // caps it again where terrain stands above the floor sphere.
  let ground = raySphere(ro, dir, PLANET_CENTER, u.bottomRadius);
  let floorHit = ground.x > 0.0;
  if (floorHit && ground.x > tNear) {
    tFar = min(tFar, ground.x);
  }
  if (hasDepth) {
    tFar = min(tFar, tDepth);
  }
  // Picks the sky-view LUT's half and the transmittance direction below.
  let intersectsGround = floorHit || (hasDepth && tDepth < top.y);

  let viewHeight = length(u.camPosLocal);
  let up = u.camPosLocal / viewHeight;
  let viewZenithCos = dot(dir, up);

  // Azimuth relative to the sun, encoded as the sky-view bake reconstructs the ray.
  let viewPerp = dir - up * viewZenithCos;
  let sunUp = dot(u.sunDirLocal, up);
  let sunPerp = u.sunDirLocal - up * sunUp;
  let viewPerpLen = length(viewPerp);
  let sunPerpLen = length(sunPerp);
  var lightViewCos = 1.0;
  if (viewPerpLen > 1e-5 && sunPerpLen > 1e-5) {
    lightViewCos = dot(viewPerp / viewPerpLen, sunPerp / sunPerpLen);
  }

  // A ray ending on TERRAIN short of the floor sphere (the limb band) looks just
  // above the horizon, past where the ground half stops, so this uv and the reversed
  // endpoints below clamp to that horizon row; right to within its texel.
  let skyUv = skyViewLutParamsToUv(u.bottomRadius, viewHeight, viewZenithCos, lightViewCos, intersectsGround);
  let inScatter = textureSampleLevel(skyViewLut, lutSamp, skyUv, 0.0).rgb;

  let nearPos = ro + dir * tNear;
  let rNear = length(nearPos);
  let muNear = dot(dir, nearPos / rNear);
  let farPos = ro + dir * tFar;
  let rFar = length(farPos);
  let muFar = dot(dir, farPos / rFar);

  // Read the segment in whichever direction points AWAY from the ground so both
  // endpoints stay in the LUT's covered domain (its d-range ends at the
  // horizon-grazing ray; a down-looking endpoint clamps and the ratio degrades).
  // Ground rays point down: NEGATE mu at each endpoint and INVERT the ratio.
  var segTransmittance: vec3<f32>;
  if (intersectsGround) {
    let tUpFar = sampleTransmittanceToTop(transmittanceLut, lutSamp, u.bottomRadius, TOP_RADIUS, rFar, -muFar);
    let tUpNear = sampleTransmittanceToTop(transmittanceLut, lutSamp, u.bottomRadius, TOP_RADIUS, rNear, -muNear);
    segTransmittance = clamp(tUpFar / max(tUpNear, vec3<f32>(1e-6)), vec3<f32>(0.0), vec3<f32>(1.0));
  } else {
    let tToTopNear = sampleTransmittanceToTop(transmittanceLut, lutSamp, u.bottomRadius, TOP_RADIUS, rNear, muNear);
    let tToTopFar = sampleTransmittanceToTop(transmittanceLut, lutSamp, u.bottomRadius, TOP_RADIUS, rFar, muFar);
    segTransmittance = clamp(tToTopNear / max(tToTopFar, vec3<f32>(1e-6)), vec3<f32>(0.0), vec3<f32>(1.0));
  }

  // The ring draws BEFORE this shell and writes no depth, so the multiply pass would
  // darken a ring physically in FRONT of the atmosphere. The annulus never
  // intersects the shell, so its plane crossing is wholly in front of the segment
  // ('tRing < tNear') or wholly behind. In front, it blocks 'ringBlock' (its strip
  // alpha): in-scatter scales by the complement and transmittance MIXES toward 1
  // (multiplying by 'ringVis' would drive the multiply pass to black under an
  // opaque ring, the inverse of masking the shell off).
  var ringBlock = 0.0;
  if (u.ringOuterRatio > 0.0 && abs(dir.z) > 1e-6) {
    let tRing = -ro.z / dir.z;
    if (tRing > 0.0 && tRing < tNear) {
      let rHit = length((ro + dir * tRing).xy);
      if (rHit >= u.ringInnerRatio && rHit <= u.ringOuterRatio) {
        let uCoord = (rHit - u.ringInnerRatio) / (u.ringOuterRatio - u.ringInnerRatio);
        // 'textureSampleLevel': non-uniform control flow, mip-less strip.
        ringBlock = textureSampleLevel(ringTexture, lutSamp, vec2<f32>(uCoord, 0.5), 0.0).a;
      }
    }
  }
  let ringVis = 1.0 - ringBlock;

  out.transmit = mix(vec3<f32>(1.0), segTransmittance, ringVis);
  out.emission = inScatter * u.exposure * ringVis;
  // Extinction alone passes ~90% of a star through a noon zenith: stars vanish by
  // day because the eye adapts to the sky's radiance. The exposed in-scatter stands
  // in for that level, weighted by the sky around the camera, so a dark sky and a
  // view from space reduce to pure extinction.
  let altitudeFrac = max(viewHeight - u.bottomRadius, 0.0) / (TOP_RADIUS - u.bottomRadius);
  let gain = SKY_ADAPTATION_GAIN * exp(-altitudeFrac / SKY_ADAPTATION_SCALE);
  let adaptation = 1.0 + gain * dot(out.emission, LUMINANCE);
  out.coverage = 1.0 - dot(out.transmit, LUMINANCE) / adaptation;
  out.hit = true;
  return out;
}

// Outside path (proxy mesh): 'dir' from the interpolated localPos, the ray's end
// from the sampled depth, then the wall-duty discard.
fn sampleShell(in: FsIn) -> ShellSample {
  // Renormalize: the proxy is a scaled sphere, and an un-normalized dir breaks every
  // dot product in 'sampleShellSegment'.
  let dir = normalize(in.localPos - u.camPosLocal);

  // The depth texture need not match the viewport (the placeholder is 1x1): rescale
  // the texel, keep the fragment's uv. Reconstruction runs in the SAMPLED row's km
  // frame, whose near/far planes wrote the depth values.
  let uv = in.clip.xy / depthFrame.viewportPx;
  let texel = vec2<i32>(in.clip.xy * vec2<f32>(textureDimensions(sceneDepth)) / depthFrame.viewportPx);
  let depth = textureLoad(sceneDepth, texel, 0);
  let hasDepth = depth != FAR_DEPTH;
  var tDepth = 0.0;
  if (hasDepth) {
    tDepth = sceneRayDistance(uv, depth, depthFrame.invMvp, depthFrame.camPosKm) * depthFrame.kmToLocal;
  }

  var out = sampleShellSegment(dir, tDepth, hasDepth);
  if (!out.hit) {
    return out;
  }

  // Wrong wall <=> facing and finite depth disagree. Without this the limb
  // double-counts, neither wall being depth-tested.
  if (in.frontFacing != hasDepth) {
    out.hit = false;
    out.transmit = vec3<f32>(1.0);
    out.emission = vec3<f32>(0.0);
    out.coverage = 0.0;
  }
  return out;
}

// Pass 1: blend 'zero'/'src' on both components, dst *= src; 'dst.a *= 1 - coverage'.
@fragment
fn fsMultiply(in: FsIn) -> @location(0) vec4<f32> {
  let s = sampleShell(in);
  if (!s.hit) {
    discard;
  }
  return vec4<f32>(s.transmit, 1.0 - s.coverage);
}

// Pass 2: blend 'one'/'one', dst += src. With pass 1 the alpha lands on
// 'coverage + dst.a * (1 - coverage)', the compositor's single background weight.
@fragment
fn fsAdd(in: FsIn) -> @location(0) vec4<f32> {
  let s = sampleShell(in);
  if (!s.hit) {
    discard;
  }
  return vec4<f32>(s.emission, s.coverage);
}
