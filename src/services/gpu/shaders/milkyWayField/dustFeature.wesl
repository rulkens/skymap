// milkyWayField/dustFeature.wesl — the detail-tier dust splat network (design
// doc N1/N2): one oriented world-space quad per record, additively
// accumulating (tau, tau*tPeak) into the SAME dustMapTex dustMap.wesl's
// Gaussian dust splats already write — same two-channel convention (see
// dustMap.wesl's fs), so all populations sum into one map for splat.wesl's fs
// to read back with no changes there. 'kind' (io.wesl's FEATS table) selects
// a lane/spur segment (0) or a bubble/bead disc (1/2, signed-tau hole+rim or
// area-conserving knot) — see the fs's kind branch below.
//
// Where dustMap.wesl integrates a closed-form Gaussian along the whole ray,
// this pass intersects the ray against ONE PLANE per feature (the local
// disc surface the segment sits on) and evaluates a 2.5D profile at that
// single crossing — cheaper, and the only way to get a sharp, non-blobby
// edge (a volumetric Gaussian cannot render a crisp ridge at any covered-
// area cost). The trade is exactly what N1 named: this tier owns face-on
// and inclined views, where a plane crossing is a good model of a thin
// lane, and hands off to the smooth Gaussian lane at grazing incidence
// (the 'fade' term below), where the model's own assumption breaks down.

import package::lib::billboard::quadCorner;
import package::lib::valueNoise::valueNoise1D;
import package::milkyWayField::io::u;
import package::milkyWayField::io::feats;

struct DustFeatureOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> DustFeatureOut {
  let corner = quadCorner(vi);

  let base = 5u * inst;
  let f0 = feats[base];
  let f1 = feats[base + 1u];
  let f2 = feats[base + 2u];
  let f3 = feats[base + 3u];
  let p0 = f0.xyz;
  let p1 = f1.xyz;
  let normal = f2.xyz;
  let width = f0.w;
  let kind = f3.w;
  let isDisc = kind >= 0.5;

  let seg = p1 - p0;
  let segLen = length(seg);
  // segLen is never ~0 in practice (dustLaneFeatures.ts drops degenerate
  // segments before packing; kind>=1 records set p1 to a throwaway unit
  // offset from p0 for exactly this reason), but a stray 0-length record
  // would otherwise divide by zero into a NaN quad — fall back to an
  // arbitrary tangent rather than propagate one.
  let laneUDir = select(vec3<f32>(1.0, 0.0, 0.0), seg / segLen, segLen > 1e-6);

  // kind 1/2 (bubble/bead disc): p1 is unused, so the quad needs its own
  // in-plane tangent independent of it. 'normal' is the disc pole, near +Y
  // for a flat galaxy, so cross(normal, +X) is the non-degenerate primary
  // pick; cross(normal, +Y) is the fallback for the rare case normal is
  // itself near +-X.
  var discTangent = cross(normal, vec3<f32>(1.0, 0.0, 0.0));
  if (length(discTangent) < 1e-3) {
    discTangent = cross(normal, vec3<f32>(0.0, 1.0, 0.0));
  }
  let discUDir = normalize(discTangent);

  let uDir = select(laneUDir, discUDir, isDisc);
  let vDir = normalize(cross(normal, uDir));

  // Disc radius R (reusing 'width'): the rim sits at r=R, so kind 1's quad
  // needs headroom for the rim PLUS its own gaussian tail (1.6R); kind 2's
  // bead profile tail needs more (3.0R). Neither reads segLen.
  let R = width;
  let discHalf = select(1.6 * R, 3.0 * R, kind >= 1.5);
  let halfU = select(segLen * 0.5 + 3.0 * width, discHalf, isDisc);
  let halfV = select(3.5 * width, discHalf, isDisc);
  let mid = select((p0 + p1) * 0.5, p0, isDisc);

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  // Every corner's view-space depth, to guard the WHOLE primitive rather
  // than this one vertex: if only this vertex's own zv were tested, a quad
  // straddling the eye plane could send some vertices through the
  // perspective branch and others through the fullscreen one, producing a
  // degenerate (partially inverted) primitive instead of a consistently
  // wrong-but-safe one.
  let z00 = dot((mid - uDir * halfU - vDir * halfV) - eye, camFwd);
  let z10 = dot((mid + uDir * halfU - vDir * halfV) - eye, camFwd);
  let z11 = dot((mid + uDir * halfU + vDir * halfV) - eye, camFwd);
  let z01 = dot((mid - uDir * halfU + vDir * halfV) - eye, camFwd);
  let minZ = min(min(z00, z10), min(z11, z01));

  var out: DustFeatureOut;
  out.inst = inst;
  if (minZ < 1e-4) {
    // Honest fallback, same philosophy as lib/splatSilhouette's fullscreen
    // branch: a quad straddling (or behind) the eye plane has no valid
    // perspective projection, so cover the whole screen and let the
    // fragment shader's own plane-intersection test (which discards behind-
    // eye hits via t < 0) decide what's actually lit.
    out.pos = vec4<f32>(corner, 0.0, 1.0);
    out.ndc = corner;
    return out;
  }

  let world = mid + uDir * (corner.x * halfU) + vDir * (corner.y * halfV);
  let rel = world - eye;
  let zv = dot(rel, camFwd);
  let ndcX = dot(rel, camRight) / (zv * tanHalfFov * aspect) - shift;
  let ndcY = dot(rel, camUp) / (zv * tanHalfFov);
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.ndc = vec2<f32>(ndcX, ndcY);
  return out;
}

@fragment
fn fs(input: DustFeatureOut) -> @location(0) vec2<f32> {
  // Ray reconstruction, identical to dustMap.wesl's fs — the two passes
  // must agree pixel-for-pixel since their outputs sum into one map.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let base = 5u * input.inst;
  let f0 = feats[base];
  let f1 = feats[base + 1u];
  let f2 = feats[base + 2u];
  let f3 = feats[base + 3u];
  let f4 = feats[base + 4u];
  let p0 = f0.xyz;
  let p1 = f1.xyz;
  let normal = f2.xyz;
  let width = f0.w;
  let amplitude = f1.w;
  let edgeSharpness = f2.w;
  let noiseSeed = f3.x;
  let noiseAmp = f3.y;
  let noiseFreq = f3.z;
  let kind = f3.w;
  let sOffset = f4.x;
  let taperIn = f4.y;
  let taperOut = f4.z;

  let denom = dot(d, normal);

  // Derivative uniformity: fwidth(n)/fwidth(r2d) need 'n'/'r2d' computed in
  // UNCONDITIONAL control flow — WGSL forbids a derivative call behind a
  // divergent return. So t/hit/the segment frame/s/n/fw/r2d/fwr all happen
  // here, before ANY of this fs's early-exit guards below. Don't move
  // fade/t/s back above this block.
  let denomSafe = sign(denom) * max(abs(denom), 1e-4);
  let t = dot(p0 - o, normal) / denomSafe;
  let hit = o + t * d;

  let seg = p1 - p0;
  let len = length(seg);
  let uDir = seg / len;
  let mid = (p0 + p1) * 0.5;
  let vDir = normalize(cross(normal, uDir));

  let s = dot(hit - p0, uDir);
  let n = dot(hit - mid, vDir);
  let fw = fwidth(n);

  // Kind 1/2 (bubble/bead disc): r2d is the in-plane radial distance from
  // the disc centre p0 — 'hit - p0' with its normal component subtracted
  // out. fwr is r2d's own AA floor, computed here for the same
  // derivative-uniformity reason as fw above.
  let fromCenter = hit - p0;
  let r2d = length(fromCenter - normal * dot(fromCenter, normal));
  let fwr = fwidth(r2d);

  // Incidence fade: the plane-crossing model degrades toward grazing
  // incidence (a near-edge-on ray barely clips the segment's thin plane
  // before the true 3D lane geometry matters again). The smooth Gaussian
  // lane already owns edge-on views (design doc N1), so this tier fades OUT
  // there rather than extrapolating a wrong answer. smoothstep's lower edge
  // is 0.06, so past this guard abs(denom) > 0.06 is guaranteed.
  let fade = smoothstep(0.06, 0.2, abs(denom));
  if (fade <= 0.0) {
    return vec2<f32>(0.0, 0.0);
  }
  if (t < 0.0) {
    return vec2<f32>(0.0, 0.0);
  }

  if (kind >= 0.5) {
    // Bubble (1) / bead (2) discs: p0 is the centre, width is the radius R
    // (see io.wesl's FEATS table) — the lane's s/len bound above doesn't
    // apply here (p1 is a throwaway offset, not a real second endpoint).
    let R = width;
    let aaFloor = 0.75 * fwr;
    if (kind < 1.5) {
      // Kind 1 (bubble): a hole plus a swept rim, summed SIGNED — the map
      // accumulates signed tau so a bubble can carve into the smooth field
      // it sits on top of. splat.wesl/dustPresent.wesl clamp the summed
      // column at >= 0 at the point of use; a nested overshoot has to read
      // as clean dust there, never as negative absorption.
      let hole = exp(-pow(r2d / max(0.8 * R, aaFloor), 4.0));
      let rim = exp(-pow((r2d - R) / max(0.25 * R, aaFloor), 2.0));
      // rimGain rides noiseAmp's lane for this kind — see io.wesl's table.
      let rimGain = noiseAmp;
      let tauDelta = amplitude * (rimGain * rim - hole);
      return vec2<f32>(tauDelta * fade, tauDelta * fade * max(t, 0.0));
    }
    // Kind 2 (bead): a disc's column conserves by AREA, not width, so
    // shrinking the radius to the AA floor needs a SQUARED amplitude
    // correction — the lane's own 'conserve' (dustLaneFeatures.ts) is
    // linear because it conserves a 1D across-lane integral instead.
    let widthEffR = max(R, aaFloor);
    let conserveR = (R / widthEffR) * (R / widthEffR);
    let tau = amplitude * conserveR * exp(-pow(r2d / widthEffR, 4.0));
    return vec2<f32>(tau * fade, tau * fade * max(t, 0.0));
  }

  // Kind 0 (lane/spur segment) below. Segments butt exactly at joints; the
  // quad's halfU margin exists only so the ACROSS profile's tails aren't
  // clipped at an angled joint, never to extend the ridge lengthwise —
  // without this bound, adjacent quads' 3*width overhang double-counts tau
  // in the overlap, which is what made the joints read as bright beads
  // rather than a continuous ridge.
  if (s < 0.0 || s > len) {
    return vec2<f32>(0.0, 0.0);
  }

  // Only a chain's two free ends taper (taperIn/taperOut > 0 there, 0 at
  // every interior joint) — per-segment tapering at every joint is what
  // produced the beaded-dash defect instead of a continuous ridge.
  var windowIn = 1.0;
  if (taperIn > 0.0) {
    windowIn = smoothstep(0.0, taperIn, s);
  }
  var windowOut = 1.0;
  if (taperOut > 0.0) {
    windowOut = 1.0 - smoothstep(len - taperOut, len, s);
  }
  let window = windowIn * windowOut;

  // fwidth(n) is the world-units of across-lane distance one screen pixel
  // spans IN THIS VIEW — it sees perspective, distance, and the disc's own
  // foreshortening under an inclined camera all at once, where a depth-only
  // pixel size (the previous attempt) missed inclination entirely. 0.75 px
  // is the honest single-pixel AA floor: now that dustMapTex is
  // divisor-matched to its readers' own target (createGalaxyEngine.ts), this
  // clamp is the true consumer rate, not compensating for a decimating
  // resolution mismatch upstream (that mismatch, not this floor, was what
  // beaded the lanes — see dustMapTex's declaration comment). Scale the peak
  // down by the same ratio the sigma was widened by, preserving the
  // ACROSS-lane integrated column (the star renderer's clampFluxScale
  // identity, N1b).
  let widthEff = max(width, 0.75 * fw);
  let conserve = width / widthEff;

  let profile = exp(-pow(abs(n) / widthEff, edgeSharpness));
  // sOffset shifts the noise argument by this segment's own start arc-length
  // along the whole chain, so the pattern reads as one continuous crinkle
  // per arm instead of restarting its phase at every joint.
  let noise = 1.0 + noiseAmp * (valueNoise1D((sOffset + s) * noiseFreq + noiseSeed) * 2.0 - 1.0);

  // 1/|denom| (floored) is the same secant-angle column-lengthening a
  // slanted ray sees through any thin absorbing sheet — steeper incidence,
  // longer path, more column, up to the floor where 'fade' has already
  // taken over.
  let tau = (amplitude * profile * window * max(noise, 0.0) * conserve) / max(abs(denom), 0.25);
  return vec2<f32>(tau * fade, tau * fade * max(t, 0.0));
}
