// atmosphere/shell/fragment.wesl — the atmosphere in-scatter shell fragment.
//
// Per fragment of the atmosphere-top proxy sphere (BOTH walls rasterise —
// 'cullMode:\'none\''), this reconstructs the view ray, finds the segment of it
// inside the atmosphere shell (the analytic march bound), looks up the
// in-scattered sky radiance from the per-frame sky-view LUT, and emits it in TWO
// blend passes so the limb glows, the sunset arc reddens, AND the
// lit disc gains over-disc aerial perspective (haze). There is NO per-pixel
// march here -- the march lives in the LUT bakes; this stage is a couple of
// texture samples + the analytic intersection (spec §11).
//
// ## Two walls, one duty each ('front_facing' split)
//
// The pipeline draws both walls; the fragment splits duty by facing so the two
// are exhaustive AND mutually exclusive:
//   - NEAR wall (front-facing): carries the OVER-DISC aerial perspective. It
//     renders ONLY ground-hitting rays -- a ray past the limb belongs to the far
//     wall, so a front face there discards (else the limb double-counts: both
//     walls pass the depth test at the limb).
//   - FAR wall (back-facing): carries the LIMB + SKY. It renders ONLY
//     ground-missing rays -- a back face over the disc discards. Today those disc
//     rays are depth-culled anyway (the far wall sits behind the planet), but the
//     explicit discard keeps the split exhaustive whatever the depth state.
// Depth-testing EACH wall against the opaque scene keeps cross-body occlusion for
// both: a nearer body occludes the disc haze via the near wall's depth and the
// limb via the far wall's.
//
// Case analysis: camera OUTSIDE the shell -> disc = near wall, limb = far wall.
// Camera INSIDE the shell -> only back faces are geometrically visible, so the
// sky/limb still renders and down-looking (ground) rays lose their haze
// (acceptable: the in-atmosphere descent regime is the deferred froxel's job).
// In practice this proxy never reaches that regime: the layer hands off to the
// full-screen inside path slightly above the top (see 'isInsideAtmosphereShell').
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
//     the reddening at the terminator is baked per-channel into it.
//   - Transmittance LUT (startup): sampled at the near + far endpoints of the
//     bound; the RATIO of the two transmittance-to-top lookups is the
//     transmittance of the segment itself (the Bruneton ratio identity), which is
//     the multiply pass's per-channel blend factor. For the FAR wall's limb +
//     sky rays (which continue to the top) the ratio 'T(near)/T(far)' reads with
//     (r, mu) as-is. For the NEAR wall's ground-hitting rays the endpoints look
//     DOWN, off the LUT's covered domain (its d-range ends at the horizon-grazing
//     ray), so the segment is read in the REVERSED direction (both endpoints then
//     look 'up' and land inside the LUT) -- see the direction-flip identity at
//     the lookup below.
//
// All LUT parametrisations are UNIT-AGNOSTIC (built from radii ratios), so this
// stage feeds LOCAL radii (top == 1, bottom == u.bottomRadius, camera radius in
// atmosphere-top units) and gets the same uv the km-baked LUT was written with.
// That is why the fragment needs neither 'ScatteringParams' nor the km radii.
//
// ## Two draws: MULTIPLY then ADD (spec §8.3)
//
// Extinction is per-channel and a colour attachment has ONE alpha, so the shell
// draws the same geometry twice rather than folding both into a premultiplied
// OVER. 'fsMultiply' ('zero'/'src') scales the destination by the segment
// transmittance; 'fsAdd' ('one'/'one') adds the exposed in-scatter. A single
// luminance alpha attenuated the disc achromatically while adding chromatic
// in-scatter, so a lambda^-4 Rayleigh ramp gained blue without losing blue and
// washed the disc cyan. The ALPHA channel stays luminance-collapsed on purpose
// -- it is the compositor's single background weight, and the two passes'
// factors reproduce the old 'a + dst.a*(1-a)' exactly (algebra at the entry
// points). A ray that never enters the atmosphere, or falls on the wrong wall,
// discards -- in BOTH passes, from the same predicate, or the limb double-counts.
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
import package::lib::fullscreenTri::FullscreenOut;

@group(0) @binding(0) var<uniform> u: AtmosphereUniforms;
@group(0) @binding(1) var lutSamp: sampler;
@group(0) @binding(2) var skyViewLut: texture_2d<f32>;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;
// Ring-alpha strip -- a 1x1 transparent placeholder on every ringless body,
// Saturn's radial strip once its bitmap commits. Sampled only inside the
// ring-in-front branch, which 'ringOuterRatio == 0' short-circuits (the same
// every-body-binds pattern 'texturedBody/fragment.wesl' binding 3 uses).
@group(0) @binding(4) var ringTexture: texture_2d<f32>;

// The atmosphere top is the unit sphere in this mesh's local frame.
const TOP_RADIUS: f32 = 1.0;
const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);
// Rec. 709 luminance weights, for the ALPHA channel only (the rgb path is
// per-channel). They sum to exactly 1.0, which is what makes
// 'dot(mix(vec3(1), T, ringVis), LUMINANCE)' equal 'mix(1, luminance(T),
// ringVis)' -- i.e. the coverage below is the old scalar opacity, unchanged.
const LUMINANCE: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

struct FsIn {
  // Unit-atmosphere-top local-space position (see vertex.wesl VsOut.localPos).
  @location(0) localPos: vec3<f32>,
  // Which wall this fragment belongs to (the pipeline draws both). True on the
  // NEAR (front) wall, which carries the over-disc haze; false on the FAR (back)
  // wall, which carries the limb + sky. Drives the duty split below.
  @builtin(front_facing) frontFacing: bool,
};

// Everything both passes need, from ONE evaluation of the shared geometry + LUT
// work. 'hit' false means this fragment is off the shell or on the wrong wall;
// both entry points discard on it, so the two draws cover identical pixels.
struct ShellSample {
  // Per-channel background multiplier: the segment transmittance, ring-blended.
  transmit: vec3<f32>,
  // In-scattered radiance to ADD, already exposed and ring-scaled.
  emission: vec3<f32>,
  // 1 - luminance(transmit) — the compositor's single background weight.
  coverage: f32,
  hit: bool,
  // Does this ray hit the ground sphere ahead of the shell entry? Carried out
  // so callers can run their OWN wall-duty test against it -- the outside path
  // needs the front_facing split below; the inside full-screen pass has no
  // "wrong wall" and skips it entirely.
  intersectsGround: bool,
};

// Shared core: the analytic march bound, the two LUT lookups, and the ring
// occlusion -- everything 'sampleShell' used to do EXCEPT deriving 'dir' from
// the proxy mesh's interpolated localPos and the front_facing wall-duty split.
// 'ro' is always 'u.camPosLocal'; callers pass 'dir' already normalized.
fn sampleShellRay(dir: vec3<f32>) -> ShellSample {
  // Off-shell / wrong-wall default, returned early below: the caller owns the
  // discard, and the LUT work never runs on a ray that missed. The values are
  // each blend's IDENTITY (multiply by 1, add 0), so a fragment that somehow
  // survives its discard is a no-op rather than a white or black hole.
  var out: ShellSample;
  out.transmit = vec3<f32>(1.0);
  out.emission = vec3<f32>(0.0);
  out.coverage = 0.0;
  out.hit = false;
  out.intersectsGround = false;

  let ro = u.camPosLocal;

  // ── Analytic march bound (mirror of atmosphereShellBound) ──────────
  let top = raySphere(ro, dir, PLANET_CENTER, TOP_RADIUS);
  // Miss the top sphere, or the whole shell behind the camera -> nothing.
  if (top.y < 0.0) {
    return out;
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
  out.intersectsGround = intersectsGround;

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

  // ── Per-channel transmittance of the shell segment ─────────────────
  let nearPos = ro + dir * tNear;
  let rNear = length(nearPos);
  let muNear = dot(dir, nearPos / rNear);
  let farPos = ro + dir * tFar;
  let rFar = length(farPos);
  let muFar = dot(dir, farPos / rFar);

  // Bruneton ratio identity: the transmittance of the near->far segment is the
  // ratio of the two transmittance-to-top lookups, clamped to a valid [0,1].
  //
  // Direction-flip identity: T(a to b) equals T(b to a); read the segment in
  // whichever direction points AWAY from the ground so both endpoints live in the
  // LUT's covered domain (its d-range ends at the horizon-grazing ray, so a
  // down-looking endpoint clamps to the LUT edge and the ratio degrades). The far
  // wall's limb + sky rays already point up (keep (r, mu) as-is); the near wall's
  // ground rays point down, so NEGATE mu at each endpoint (both then read 'up')
  // and INVERT the ratio (the far endpoint is now the 'start' of the upward read).
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

  // ── Ring-in-front occlusion ─────────────────────────────────────────
  //
  // The ring draws BEFORE this shell and writes no depth, so ring pixels are in
  // dst and the multiply pass would attenuate them by the segment transmittance
  // -- haze darkening a ring that is physically in FRONT of the atmosphere. The
  // annulus never intersects the shell (Saturn's ring inner edge sits well
  // outside the atmosphere top), so along any view ray the ring-plane crossing
  // is either wholly in front of the segment ('tRing < tNear') or wholly behind
  // it. When in front, the ring blocks a 'ringBlock' fraction (its strip alpha)
  // of this fragment's view of the atmosphere: the in-scatter scales by the
  // complement, and the transmittance MIXES toward 1 (not multiplies by
  // 'ringVis' — that would drive the multiply pass to black where the ring is
  // opaque, the exact inverse of masking the shell off). An opaque band in front
  // fully masks the shell (dst rides through untouched); a gap ('alpha ~ 0')
  // leaves the haze intact; a ring BEHIND the segment keeps full haze over it, as
  // it should. 'ringOuterRatio == 0' (every ringless body) short-circuits.
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
  out.coverage = 1.0 - dot(out.transmit, LUMINANCE);
  out.hit = true;
  return out;
}

// Outside path (proxy mesh): derives 'dir' from the interpolated localPos,
// delegates the shared work to 'sampleShellRay', then applies the wall-duty
// discard that only makes sense for a two-sided proxy mesh (see the
// front_facing header comment above).
fn sampleShell(in: FsIn) -> ShellSample {
  // View ray in the local frame. Renormalize AFTER the implicit model transform
  // (the proxy is a scaled sphere) -- the house trap; an un-normalized dir
  // breaks every dot product in 'sampleShellRay'.
  let dir = normalize(in.localPos - u.camPosLocal);
  var out = sampleShellRay(dir);
  if (!out.hit) {
    return out;
  }

  // ── Wall-duty split (front_facing) ─────────────────────────────────
  //
  // The near wall (front-facing) renders ONLY ground-hitting rays (the disc
  // haze); the far wall (back-facing) renders ONLY ground-missing rays (the limb
  // + sky). Discard the other half on each so the pair is exhaustive AND mutually
  // exclusive whatever the depth state (incl. the camera-inside case). Without
  // the near-wall guard the limb would double-count -- both walls pass the depth
  // test past the limb.
  if (in.frontFacing && !out.intersectsGround) {
    out.hit = false;
    return out;
  }
  if (!in.frontFacing && out.intersectsGround) {
    out.hit = false;
    return out;
  }
  return out;
}

// Pass 1 — blend 'zero'/'src' on BOTH components: dst *= src. rgb attenuates the
// destination per channel; alpha carries the luminance complement of the same
// factor, so 'dst.a *= 1 - coverage'.
@fragment
fn fsMultiply(in: FsIn) -> @location(0) vec4<f32> {
  let s = sampleShell(in);
  if (!s.hit) {
    discard;
  }
  return vec4<f32>(s.transmit, 1.0 - s.coverage);
}

// Pass 2 — blend 'one'/'one' on both components: dst += src. Together with pass
// 1 the alpha lands on the old 'coverage + dst.a * (1 - coverage)', which the
// compositor still reads as the single background weight; only the rgb path
// gained its per-channel extinction.
@fragment
fn fsAdd(in: FsIn) -> @location(0) vec4<f32> {
  let s = sampleShell(in);
  if (!s.hit) {
    discard;
  }
  return vec4<f32>(s.emission, s.coverage);
}

// ── Inside-shell path (full-screen pass, Task 6 wires the pipeline) ────────
//
// Camera inside the atmosphere shell: there is no proxy mesh to interpolate a
// local position from, so the view ray is reconstructed by unprojecting the
// full-screen triangle's screen position through 'u.invMvp'. No wall split --
// a full-screen pass has no "wrong wall" (spec §4.2).

// Recover the view ray for 'uv' by inverting fullscreenVertex's own mapping
// ('uv = ((xy+1)*0.5, (1-xy)*0.5)') back to clip-space xy, unprojecting
// through 'u.invMvp', and renormalizing (the house trap after a non-uniformly
// scaled model transform -- same reason 'sampleShell's dir derivation does).
fn insideRayDir(uv: vec2<f32>) -> vec3<f32> {
  let xy = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  // NDC z = 0.5, NOT 0.0: any z on the pixel's ray works in exact math, but the
  // body slab's reversed-Z projection puts z = 0 at the FAR plane, where the
  // unprojected w collapses toward 0 and the f32 divide turns 'p' into noise --
  // in practice every pixel degenerated to near-one direction and the whole sky
  // veiled uniformly grey. Mid-frustum keeps w healthy under either depth
  // convention.
  let clip = vec4<f32>(xy, 0.5, 1.0);
  let world = u.invMvp * clip;
  let p = world.xyz / world.w;
  return normalize(p - u.camPosLocal);
}

@fragment
fn fsInsideMultiply(in: FullscreenOut) -> @location(0) vec4<f32> {
  let dir = insideRayDir(in.uv);
  let s = sampleShellRay(dir);
  if (!s.hit) {
    discard;
  }
  return vec4<f32>(s.transmit, 1.0 - s.coverage);
}

@fragment
fn fsInsideAdd(in: FullscreenOut) -> @location(0) vec4<f32> {
  let dir = insideRayDir(in.uv);
  let s = sampleShellRay(dir);
  if (!s.hit) {
    discard;
  }
  return vec4<f32>(s.emission, s.coverage);
}
