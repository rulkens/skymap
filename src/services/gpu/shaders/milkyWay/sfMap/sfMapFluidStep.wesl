// milkyWay/sfMap/sfMapFluidStep.wesl — Pass B of the fluid SF-map step:
// density advected through the velocity field sfMapFluidVelocity.wesl
// (Pass A) already composed into velocityTex this step, semi-Lagrangian,
// directly in WORLD/grid coordinates. Unlike the automaton there is no
// material-frame trick and no final un-shear pass — sfMapFluidPack.wesl's
// own repack is a straight copy.
//
// State layout is IDENTICAL to the automaton's own ping-pong texel (gas,
// age, dust, oldActivity), but gas/dust are ADVECTED (semi-Lagrangian
// back-trace into prevTex) while age/oldActivity are EULERIAN (read from
// this texel's own previous value, never resampled).

struct SfMapFluidConstants {
  rMin: f32,
  rMax: f32,
  corotationRadius: f32,
  shearStrength: f32,
  gasRegen: f32,
  emaRate: f32,
  curlStrength: f32,
  curlScale: f32,
  impulseDuration: f32,
  armGather: f32,
  // Explicit diffusion coefficient (texel^2/step) for gas/dust, this pass's
  // own consumer — see diffusionLaplacian below. Explicit 2D diffusion is
  // stable only for coefficient <= 0.25; the slider range enforces it.
  diffusion: f32,
  // Pass-A-consumed only (sfMapFluidVelocity.wesl's composedVelocity) — kept
  // here for byte-identical layout, same discipline as diffusion above.
  armDrag: f32,
}

// Same layout as sfMapFluidVelocity.wesl's own copy (packSfMapFluidStepIndex.ts
// is the offset authority) — Pass A reads all three fields, this pass reads
// only 'step' (activeStart/activeEnd are Pass A's event-window concern).
struct SfMapFluidStepIndex {
  step: f32,
  activeStart: f32,
  activeEnd: f32,
}

const PI: f32 = 3.14159265358979;
const SF_MAP_AMBIENT_DUST: f32 = 1.0;
const DUST_OVERSHOOT_CEILING: f32 = 8.0;
// Gas needs headroom to show the continuity source term's contrast (see
// that term below) — half of DUST_OVERSHOOT_CEILING, since gasRegen already
// pulls gas back toward 1.0 every step and dust has no such pull.
const GAS_CEILING: f32 = 4.0;
// Velocity is authored directly in texels/step, so the back-trace's own
// implicit dt is 1 — documents the fact, not a free parameter to tune.
const DT_TEXELS_PER_STEP: f32 = 1.0;
// Clamp band on the per-step continuity multiplier (1 - dt*divV): wide
// enough for real convergence/divergence to read as structure, tight enough
// that one step's spike can't null out or blow up a texel (this source term
// is a numerical safety valve, not a conservative scheme with a physical
// bound).
const CONTINUITY_MULT_MIN: f32 = 0.6;
const CONTINUITY_MULT_MAX: f32 = 1.4;

@group(0) @binding(0) var<uniform> u: SfMapFluidConstants;
@group(0) @binding(1) var prevTex: texture_2d<f32>;
@group(0) @binding(2) var nextTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> stepIdx: SfMapFluidStepIndex;
@group(0) @binding(4) var velocityTex: texture_2d<f32>;

// Periodic az wrap, shared by divVelocity's own neighbour lookups — the
// grid is periodic in az the same way everywhere it is read.
fn wrapAz(az: i32, azCount: i32) -> i32 {
  var a = az % azCount;
  if (a < 0) {
    a += azCount;
  }
  return a;
}

// Divergence of velocityTex at (az, ring), central-differenced over each
// axis's own integer neighbours (az wraps, ring clamps — Neumann-ish: a
// clamped ring-edge neighbour equals the self texel, so the ring derivative
// reads as zero rather than extrapolating off the grid). Ring partial is
// rescaled by azToRingMetric before summing, same az-equivalent-units
// convention sfMapFluidVelocity.wesl's forcingGradient uses.
fn divVelocity(az: i32, ring: i32, azCount: u32, ringCount: u32, azToRingMetric: f32) -> f32 {
  let azCountI = i32(azCount);
  let ringCountI = i32(ringCount);
  let azPlus = wrapAz(az + 1, azCountI);
  let azMinus = wrapAz(az - 1, azCountI);
  let ringPlus = clamp(ring + 1, 0, ringCountI - 1);
  let ringMinus = clamp(ring - 1, 0, ringCountI - 1);

  let vPlusAz = textureLoad(velocityTex, vec2<i32>(azPlus, ring), 0).x;
  let vMinusAz = textureLoad(velocityTex, vec2<i32>(azMinus, ring), 0).x;
  let vPlusRing = textureLoad(velocityTex, vec2<i32>(az, ringPlus), 0).y;
  let vMinusRing = textureLoad(velocityTex, vec2<i32>(az, ringMinus), 0).y;

  let dVelAzDAz = (vPlusAz - vMinusAz) * 0.5;
  let dVelRingDRing = (vPlusRing - vMinusRing) * 0.5;
  return dVelAzDAz + dVelRingDRing * azToRingMetric;
}

// 5-point Laplacian of gas (prevTex.x) and dust (prevTex.z), in TEXEL units
// on both axes — deliberately NOT physical (theta, ln r) space: the
// pathology this term exists to kill (1-texel density-spike collapse,
// grid-scale checkerboard modes, both artifacts of the OLD velocity-gradient
// pressure term this replaced) is itself a grid-scale artifact, so texel
// space is the space that treats it. Same edge semantics as divVelocity: az
// wraps, ring clamps (a clamped ring neighbour equals self, i.e. zero-flux
// boundary).
fn diffusionLaplacian(az: i32, ring: i32, azCount: u32, ringCount: u32, selfGasDust: vec2<f32>) -> vec2<f32> {
  let azCountI = i32(azCount);
  let ringCountI = i32(ringCount);
  let azPlus = wrapAz(az + 1, azCountI);
  let azMinus = wrapAz(az - 1, azCountI);
  let ringPlus = clamp(ring + 1, 0, ringCountI - 1);
  let ringMinus = clamp(ring - 1, 0, ringCountI - 1);

  let nAzPlus = textureLoad(prevTex, vec2<i32>(azPlus, ring), 0);
  let nAzMinus = textureLoad(prevTex, vec2<i32>(azMinus, ring), 0);
  let nRingPlus = textureLoad(prevTex, vec2<i32>(az, ringPlus), 0);
  let nRingMinus = textureLoad(prevTex, vec2<i32>(az, ringMinus), 0);

  let neighbourSum = vec2<f32>(
    nAzPlus.x + nAzMinus.x + nRingPlus.x + nRingMinus.x,
    nAzPlus.z + nAzMinus.z + nRingPlus.z + nRingMinus.z
  );
  return neighbourSum - 4.0 * selfGasDust;
}

// Bilinear sample of prevTex — wraps in az, clamps in ring, same edge
// semantics as sfMapAutomatonStep.wesl's own neighbour reads.
fn sampleBilinear(azF: f32, ringF: f32, azCount: u32, ringCount: u32) -> vec4<f32> {
  let a0f = floor(azF);
  let fracAz = azF - a0f;
  var a0 = i32(a0f) % i32(azCount);
  if (a0 < 0) {
    a0 += i32(azCount);
  }
  let a1 = (a0 + 1) % i32(azCount);

  let r0f = floor(ringF);
  let fracRing = clamp(ringF - r0f, 0.0, 1.0);
  let r0 = clamp(i32(r0f), 0, i32(ringCount) - 1);
  let r1 = clamp(r0 + 1, 0, i32(ringCount) - 1);

  let c00 = textureLoad(prevTex, vec2<i32>(a0, r0), 0);
  let c10 = textureLoad(prevTex, vec2<i32>(a1, r0), 0);
  let c01 = textureLoad(prevTex, vec2<i32>(a0, r1), 0);
  let c11 = textureLoad(prevTex, vec2<i32>(a1, r1), 0);
  let cx0 = mix(c00, c10, fracAz);
  let cx1 = mix(c01, c11, fracAz);
  return mix(cx0, cx1, fracRing);
}

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(nextTex);
  if (any(gid.xy >= dims)) {
    return;
  }
  let azCount = dims.x;
  let ringCount = dims.y;
  let az = gid.x;
  let ring = gid.y;
  let genStep = u32(stepIdx.step);

  // Same seed as the automaton's own step 0 — the two generators must agree
  // on what an unrun map looks like. Pass A is not dispatched for step 0
  // (velocity is unused), so velocityTex is dead here.
  if (genStep == 0u) {
    textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(1.0, 1.0e4, SF_MAP_AMBIENT_DUST, 0.0));
    return;
  }

  // Metric: physical theta per az-texel over physical ln(r) per ring-texel —
  // see this file's header. Ratio is grid-wide constant (the shared r^2
  // conformal factor cancels), not a per-ring quantity.
  let lnSpan = log(u.rMax / u.rMin);
  let dLnRPerRing = lnSpan / f32(ringCount - 1u);
  let dThetaPerAz = 2.0 * PI / f32(azCount);
  let azToRingMetric = dThetaPerAz / dLnRPerRing;

  let selfState = textureLoad(prevTex, vec2<i32>(i32(az), i32(ring)), 0);

  // Pass A already composed this texel's velocity + event stamp — one load
  // replaces what used to be a full composedVelocity() re-evaluation.
  let velSample = textureLoad(velocityTex, vec2<i32>(i32(az), i32(ring)), 0);
  let velAz = velSample.x;
  let velRing = velSample.y;
  let eventStamp = velSample.z;
  let divV = divVelocity(i32(az), i32(ring), azCount, ringCount, azToRingMetric);

  let azCountF = f32(azCount);

  // Semi-Lagrangian back-trace, dt = 1 step: gas/dust sample where THIS
  // texel's material came FROM, not where it self-reads (contrast age/
  // oldActivity below).
  var prevAzF = (f32(az) - velAz) % azCountF;
  if (prevAzF < 0.0) {
    prevAzF += azCountF;
  }
  let prevRingF = clamp(f32(ring) - velRing, 0.0, f32(ringCount - 1u));
  let advected = sampleBilinear(prevAzF, prevRingF, azCount, ringCount);

  // Compressible-continuity source: pure semi-Lagrangian advection of a
  // uniform field is a fixed point regardless of velocity, so mass piling
  // up where the field converges (divV < 0) and thinning where it diverges
  // (divV > 0) is what actually produces density structure, not advection.
  let continuityMult = clamp(1.0 - DT_TEXELS_PER_STEP * divV, CONTINUITY_MULT_MIN, CONTINUITY_MULT_MAX);
  let advectedGas = advected.x * continuityMult;
  let advectedDust = advected.z * continuityMult;

  // Operator-split diffusion, applied to the PREVIOUS state (not the
  // advected one) and added on top of it — see diffusionLaplacian above.
  // Clamped >= 0 so a strong coefficient can't push a thin texel negative.
  let lap = diffusionLaplacian(i32(az), i32(ring), azCount, ringCount, vec2<f32>(selfState.x, selfState.z));
  let diffusedGas = max(0.0, advectedGas + u.diffusion * lap.x);
  let diffusedDust = max(0.0, advectedDust + u.diffusion * lap.y);

  let selfAge = selfState.y;
  let selfOldActivity = selfState.w;

  let gas = min(GAS_CEILING, diffusedGas + u.gasRegen);
  var age = selfAge + 1.0;
  // "Core" threshold: an event only just born here dominates the intensity
  // sum, so this fires exactly at its birth texel/step, not its whole tail.
  if (eventStamp > 0.5) {
    age = 0.0;
  }
  let dust = min(diffusedDust, DUST_OVERSHOOT_CEILING);
  let oldActivity = mix(selfOldActivity, eventStamp, u.emaRate);

  textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(gas, age, dust, oldActivity));
}
