// milkyWay/field/armRidgeDebugSample.wesl — debug-only compute kernel for
// Task 12's own numeric-validation exception (armRidge.wesl has no non-GPU
// path to check its output against — same shape as ringReduce.wesl's
// ringMeans check). One invocation per fixed (arm, logR) sample, each
// writing FLOATS_PER_SAMPLE floats; probeGpuErrors.ts diffs this against
// armRidgeGeometry.ts's own CPU output at the SAME literal geometry/arm/logR
// values (hand-mirrored there, not read back from here — a WGSL array has
// no run-time path to a Node test). 'armRidgeFrameAt's output is the
// coverage-gap fix (fix round 1): it transitively exercises
// 'armRidgeCurvePoint', 'warpHeight' and 'warpSurfaceFrame' (derivative
// terms, Gram-Schmidt, both cross products) in one composed check, since
// the original trio (angle/fadeEnvelope/crossSigma) never touches the warp
// path. Struct-typed fixtures are function-local, not module consts:
// WGSL's select() has no struct overload, so the per-sample arm pick below
// is a plain if/else.

import package::milkyWay::field::armRidge::ArmRec;
import package::milkyWay::field::armRidge::ArmRidgeGeometry;
import package::milkyWay::field::armRidge::armRidgeAngle;
import package::milkyWay::field::armRidge::armFadeEnvelope;
import package::milkyWay::field::armRidge::armCrossSigma;
import package::milkyWay::field::armRidge::armRidgeFrameAt;
import package::milkyWay::field::armRidge::armExcessSurfaceShape;
import package::milkyWay::field::armRidge::armColor;

const SAMPLE_COUNT: u32 = 4u;
// [0] angle, [1] fadeEnvelope, [2] crossSigma,
// [3..5] frame.point, [6..8] frame.along, [9..11] frame.across, [12..14] frame.pole,
// [15] excessSurfaceShape, [16..18] color.
const FLOATS_PER_SAMPLE: u32 = 19u;
const WIDTH_SCALE: f32 = 1.2;
const H_LIGHT: f32 = 2.5;
const EXCESS_SCALE_RATIO: f32 = 1.4;

// logR / youngFraction / radialT per sample — mirrored verbatim in
// probeGpuErrors.ts's CPU comparison.
const LOG_R = array<f32, SAMPLE_COUNT>(-0.5, 0.4, 0.9, 1.6);
const YOUNG_FRACTION = array<f32, SAMPLE_COUNT>(0.2, 0.4, 0.6, 0.8);
const RADIAL_T = array<f32, SAMPLE_COUNT>(0.8, 0.6, 0.4, 0.2);

fn fixtureGeom() -> ArmRidgeGeometry {
  return ArmRidgeGeometry(
    2.0,  // armStartRadius
    1.5,  // armInnerRampW
    6.0,  // armFullRadius
    0.3,  // waveAmount
    3.0,  // diskScaleLen
    0.4,  // warpStrength
    1.2,  // warpTwist
    8.0,  // warpStartRadius
    15.0, // outerRadius
  );
}

fn fixtureArmA() -> ArmRec {
  return ArmRec(0.5, 0.3, 0.12, 1.4, 0.7, 2.1, 0.4, 3.7, 1.1, 9.0);
}

fn fixtureArmB() -> ArmRec {
  return ArmRec(-1.2, 0.42, 0.2, 0.9, -0.3, 1.6, -0.5, 4.2, 2.0, 11.5);
}

@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;

@compute @workgroup_size(1)
fn csSample(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= SAMPLE_COUNT) {
    return;
  }
  var arm: ArmRec;
  if (i % 2u == 0u) {
    arm = fixtureArmA();
  } else {
    arm = fixtureArmB();
  }
  let geom = fixtureGeom();
  let logR = LOG_R[i];
  let radius = geom.armStartRadius * exp(logR);

  let base = i * FLOATS_PER_SAMPLE;
  outBuf[base] = armRidgeAngle(logR, arm, geom);
  outBuf[base + 1u] = armFadeEnvelope(radius, arm, geom);
  outBuf[base + 2u] = armCrossSigma(radius, WIDTH_SCALE, geom);

  let frame = armRidgeFrameAt(logR, arm, geom);
  outBuf[base + 3u] = frame.point.x;
  outBuf[base + 4u] = frame.point.y;
  outBuf[base + 5u] = frame.point.z;
  outBuf[base + 6u] = frame.along.x;
  outBuf[base + 7u] = frame.along.y;
  outBuf[base + 8u] = frame.along.z;
  outBuf[base + 9u] = frame.across.x;
  outBuf[base + 10u] = frame.across.y;
  outBuf[base + 11u] = frame.across.z;
  outBuf[base + 12u] = frame.pole.x;
  outBuf[base + 13u] = frame.pole.y;
  outBuf[base + 14u] = frame.pole.z;

  outBuf[base + 15u] = armExcessSurfaceShape(radius, H_LIGHT, EXCESS_SCALE_RATIO, geom);

  let color = armColor(YOUNG_FRACTION[i], RADIAL_T[i]);
  outBuf[base + 16u] = color.x;
  outBuf[base + 17u] = color.y;
  outBuf[base + 18u] = color.z;
}
