// milkyWay/field/armRidge.wesl — WGSL port of armRidgeGeometry.ts, the v2
// analytic field's own ridge-angle/width/fade/colour vocabulary. Fresh port,
// NOT generate.wesl's armStarSample (v1's inline copy reads a different
// uniform table and its outer-fade envelope is a KNOWN-DIVERGED formula that
// cost the Milky Way preset's arms a factor ~2 — see ARM_TAPER_START_FRAC
// below). geometry-level scalars a caller's own GalaxyDescription would
// carry (armStartRadius, armInnerRampW, armFullRadius, waveAmount,
// diskScaleLen, plus the warp's own four fields) ride ArmRidgeGeometry,
// threaded as an explicit parameter rather than a bind-group global — no
// buffer layout exists yet for it; that is Task 13/14's own concern.

struct ArmRec {
  phase: f32,
  pitch: f32,
  meanderAmp: f32,
  meanderFreq: f32,
  meanderPhase: f32,
  waveF1: f32,
  waveP1: f32,
  waveF2: f32,
  waveP2: f32,
  fadeRadius: f32,
}

struct ArmRidgeGeometry {
  armStartRadius: f32,
  armInnerRampW: f32,
  armFullRadius: f32,
  waveAmount: f32,
  diskScaleLen: f32,
  warpStrength: f32,
  warpTwist: f32,
  warpStartRadius: f32,
  outerRadius: f32,
}

struct ArmRidgeFrame {
  point: vec3<f32>,
  along: vec3<f32>,
  across: vec3<f32>,
  pole: vec3<f32>,
}

struct WarpSurfaceFrame {
  along: vec3<f32>,
  across: vec3<f32>,
  pole: vec3<f32>,
}

// warpHeight — warpHeight.ts ported verbatim: the warp's vertical
// displacement at (radius, azimuth), zero inside warpStartRadius.
fn warpHeight(radius: f32, azimuth: f32, geom: ArmRidgeGeometry) -> f32 {
  if (geom.warpStrength <= 0.0 || radius <= geom.warpStartRadius) {
    return 0.0;
  }
  let rel = (radius - geom.warpStartRadius) / max(1e-4, geom.outerRadius - geom.warpStartRadius);
  let node = geom.warpTwist * rel;
  return geom.warpStrength * geom.outerRadius * 0.4 * rel * rel * sin(azimuth - node);
}

// warpSurfaceFrame — warpSurfaceFrame.ts ported verbatim: the warped disc
// surface's orthonormal frame at (radius, azimuth), 'across' Gram-Schmidt'd
// off 'along' since the two raw tangents are only orthogonal where the warp
// is flat.
fn warpSurfaceFrame(radius: f32, azimuth: f32, geom: ArmRidgeGeometry) -> WarpSurfaceFrame {
  let cosPhi = cos(azimuth);
  let sinPhi = sin(azimuth);

  var dhdR = 0.0;
  var dhdPhi = 0.0;
  if (geom.warpStrength > 0.0 && radius > geom.warpStartRadius) {
    let span = max(1e-4, geom.outerRadius - geom.warpStartRadius);
    let rel = (radius - geom.warpStartRadius) / span;
    let node = geom.warpTwist * rel;
    let amp = geom.warpStrength * geom.outerRadius * 0.4 * rel * rel;
    let dAmp = (geom.warpStrength * geom.outerRadius * 0.4 * 2.0 * rel) / span;
    let dNode = geom.warpTwist / span;
    dhdR = dAmp * sin(azimuth - node) - amp * dNode * cos(azimuth - node);
    dhdPhi = amp * cos(azimuth - node);
  }

  let along = normalize(vec3<f32>(-sinPhi, dhdPhi / max(1e-6, radius), cosPhi));
  let radial = vec3<f32>(cosPhi, dhdR, sinPhi);
  let across = normalize(radial - dot(radial, along) * along);
  let pole = cross(along, across); // along x across is +Y on a flat disc
  return WarpSurfaceFrame(along, across, pole);
}

// armRidgeAngle — log-spiral phase + meander + (waveAmount-scaled) high-
// frequency wave. armRidgeGeometry.ts skips generate.wesl's own 'waveAmount
// == 0' branch deliberately (waveAmount is 0 for most presets there, so the
// branch is a per-star perf guard, not a value the port needs to reproduce).
fn armRidgeAngle(logR: f32, arm: ArmRec, geom: ArmRidgeGeometry) -> f32 {
  let angle = arm.phase + arm.pitch * logR
    + arm.meanderAmp * sin(arm.meanderFreq * logR * 2.0 + arm.meanderPhase);
  return angle + geom.waveAmount * (
    sin(arm.waveF1 * logR + arm.waveP1) * 0.16
    + sin(arm.waveF2 * logR + arm.waveP2) * 0.09
  );
}

// armRidgeCurvePoint — the ridge's warped centre at a log-radius; every blob
// on this arm is placed against this curve, not re-derived per caller.
fn armRidgeCurvePoint(logR: f32, arm: ArmRec, geom: ArmRidgeGeometry) -> vec3<f32> {
  let radius = geom.armStartRadius * exp(logR);
  let angle = armRidgeAngle(logR, arm, geom);
  return vec3<f32>(radius * cos(angle), warpHeight(radius, angle, geom), radius * sin(angle));
}

// armCurvePos — armRidgeCurvePoint indexed by radius, for armRidgeFrameAt's
// own central-difference tangent below (armRidgeGeometry.ts's private helper).
fn armCurvePos(radius: f32, arm: ArmRec, geom: ArmRidgeGeometry) -> vec3<f32> {
  return armRidgeCurvePoint(log(radius / geom.armStartRadius), arm, geom);
}

// armRidgeFrameAt — the ridge's own orthonormal frame: 'along' a central-
// difference tangent, 'across'/'pole' the warped surface's own pair
// re-orthonormalised against it (surfacePole need not be perpendicular to
// 'along').
fn armRidgeFrameAt(logR: f32, arm: ArmRec, geom: ArmRidgeGeometry) -> ArmRidgeFrame {
  let radius = geom.armStartRadius * exp(logR);
  let angle = armRidgeAngle(logR, arm, geom);
  let point = armRidgeCurvePoint(logR, arm, geom);
  let ahead = armCurvePos(radius * 1.01, arm, geom);
  let behind = armCurvePos(radius * 0.99, arm, geom);
  let along = normalize(ahead - behind);
  let surfacePole = warpSurfaceFrame(radius, angle, geom).pole;
  let across = normalize(cross(surfacePole, along));
  let pole = cross(along, across);
  return ArmRidgeFrame(point, along, across, pole);
}

// Where the outer taper begins, as a fraction of this arm's own fadeRadius —
// NOT armFullRadius (0.42 * fadeRadius), which generate.wesl's sprite copy
// of this envelope still uses: at 0.42 its smoothstep is a SECOND radial
// brightness law stacked on armExcessSurfaceShape, one no knob can reach
// past, and it alone cost the Milky Way preset's arms a factor ~2 by the
// disc edge. Do not change this back to 0.42.
const ARM_TAPER_START_FRAC: f32 = 0.6;

// armFadeEnvelope — the analytic arms' radial extent: an inner ramp off
// armStartRadius, an outer taper to zero at this arm's own fadeRadius.
// WGSL's smoothstep(0,1,t) already clamps t to [0,1] before the cubic, same
// as armRidgeGeometry.ts's own smoothstep01.
fn armFadeEnvelope(radius: f32, arm: ArmRec, geom: ArmRidgeGeometry) -> f32 {
  let innerT = (radius - geom.armStartRadius) / geom.armInnerRampW;
  let taperStart = arm.fadeRadius * ARM_TAPER_START_FRAC;
  let outerT = (radius - taperStart) / max(0.001, arm.fadeRadius - taperStart);
  return smoothstep(0.0, 1.0, innerT) * (1.0 - smoothstep(0.0, 1.0, outerT));
}

// Reid et al. 2019's maser-arm width law in units of the disc scale length
// (h = 2.605 kpc for the MW): w/h = FLOOR_H + SLOPE*(R/h).
const ARM_WIDTH_FLOOR_H: f32 = 0.017;
const ARM_WIDTH_SLOPE: f32 = 0.036;

// armCrossSigma — this arm's cross-section sigma at a radius; 'widthScale'
// is the tuning knob (GalaxyArmTuning.widthScale) the CPU version reads off
// its own 'tuning' argument.
fn armCrossSigma(radius: f32, widthScale: f32, geom: ArmRidgeGeometry) -> f32 {
  return (ARM_WIDTH_FLOOR_H * geom.diskScaleLen + ARM_WIDTH_SLOPE * radius) * widthScale;
}

// armExcessSurfaceShape — the arm excess's radial brightness shape,
// normalised to 1 at armFullRadius. 'hLight'/'scaleRatio' are the caller's
// own (GalaxyArmTuning.excessScaleRatio on the CPU side), not geometry.
fn armExcessSurfaceShape(radius: f32, hLight: f32, scaleRatio: f32, geom: ArmRidgeGeometry) -> f32 {
  return exp(-(radius - geom.armFullRadius) / (hLight * max(scaleRatio, 1e-3)));
}

// Hot blue-white, nudged bluer with youngFraction — eyeball match, not a
// re-derivation of tempColorRamp.
const ARM_COLOR_OLD: vec3<f32> = vec3<f32>(0.8, 0.86, 1.0);
const ARM_COLOR_YOUNG: vec3<f32> = vec3<f32>(0.65, 0.78, 1.0);

// A second, independent inside-out cross-fade on top of the age one above,
// kept a minority share (ARM_RADIAL_STRENGTH) so youngFraction stays the
// dominant signal.
const ARM_RADIAL_INNER: vec3<f32> = vec3<f32>(0.9, 0.85, 0.68);
const ARM_RADIAL_OUTER: vec3<f32> = vec3<f32>(0.6, 0.75, 1.0);
const ARM_RADIAL_STRENGTH: f32 = 0.4;

// armColor — matches armRidgeGeometry.ts's armColor exactly so this arm's
// GPU-placed clouds share the ridge chain's own colour rather than
// re-deriving it.
fn armColor(youngFraction: f32, radialT: f32) -> vec3<f32> {
  let age = clamp(youngFraction, 0.0, 1.0);
  let ageColor = mix(ARM_COLOR_OLD, ARM_COLOR_YOUNG, age);
  let radial = clamp(radialT, 0.0, 1.0);
  let radialColor = mix(ARM_RADIAL_INNER, ARM_RADIAL_OUTER, radial);
  return mix(ageColor, radialColor, ARM_RADIAL_STRENGTH);
}
