// milkyWay/ismMap/ismMapFluidStep.wesl — Pass B of the fluid ISM-map step:
// density advected through the velocity field ismMapFluidVelocity.wesl
// (Pass A) already composed into velocityTex this step, semi-Lagrangian,
// directly in WORLD/grid coordinates. No material-frame trick and no final
// un-shear pass — ismMapFluidPack.wesl's own repack is a straight copy.
//
// State layout (x=gas, y=stars, z=activity, w=dust — see GalaxyIsmMap.ts's
// contract table). gas/dust/stars are ADVECTED (semi-Lagrangian back-trace
// into prevTex, the SAME upstream sample) while activity alone is EULERIAN
// (read from this texel's own previous value, never resampled).

import package::milkyWay::ismMap::ismMapShear::ismMapRingRadius;
import package::milkyWay::ismMap::ismMapShear::wrapAz;

struct IsmMapFluidConstants {
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
  // Pass-A-consumed only (ismMapFluidVelocity.wesl's composedVelocity) — kept
  // here for byte-identical layout, same discipline as diffusion above.
  armDrag: f32,
  // gasProfile's exponential decline length, grid-radius units (same as
  // rMin/rMax/corotationRadius) — see gasProfile below.
  gasScaleLength: f32,
  // gasProfile's r->infinity floor fraction [0,1] (the flat HI component);
  // 1 makes the profile identically 1.0, the pre-profile calibration.
  gasFloor: f32,
  // Pass-A-consumed only (ismMapFluidVelocity.wesl's composedVelocity) — kept
  // here for byte-identical layout, same discipline as armDrag above.
  laneBias: f32,
  // Pass-A-consumed only (ismMapFluidVelocity.wesl's composedVelocity) — kept
  // here for byte-identical layout, same discipline as laneBias above.
  gatherOffset: f32,
  // Tracer mass added per step at stamped texels, times local gas — see the
  // TS param's own doc (GalaxyIsmMapFluidParams.starsDeposit) for the
  // calibration story.
  starsDeposit: f32,
  // Per-step retention of the advected stars tracer — see the TS param's own
  // doc (GalaxyIsmMapFluidParams.starsDecay) for the tau mapping.
  starsDecay: f32,
}

// Same layout as ismMapFluidVelocity.wesl's own copy (packIsmMapFluidStepIndex.ts
// is the offset authority) — Pass A reads all three fields, this pass reads
// only 'step' (activeStart/activeEnd are Pass A's event-window concern).
struct IsmMapFluidStepIndex {
  step: f32,
  activeStart: f32,
  activeEnd: f32,
}

const PI: f32 = 3.14159265358979;
const ISM_MAP_AMBIENT_DUST: f32 = 1.0;
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

@group(0) @binding(0) var<uniform> u: IsmMapFluidConstants;
@group(0) @binding(1) var prevTex: texture_2d<f32>;
@group(0) @binding(2) var nextTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> stepIdx: IsmMapFluidStepIndex;
@group(0) @binding(4) var velocityTex: texture_2d<f32>;

// Radial gas equilibrium: an exponential H2-like disc on top of a flat
// gasFloor "HI" pedestal — both the step-0 seed and the regen relaxation
// target below converge to this, not to a bare 1.0.
fn gasProfile(r: f32) -> f32 {
  return u.gasFloor + (1.0 - u.gasFloor) * exp(-r / u.gasScaleLength);
}

// Divergence of velocityTex at (az, ring), central-differenced over each
// axis's own integer neighbours (az wraps, ring clamps — Neumann-ish: a
// clamped ring-edge neighbour equals the self texel, so the ring derivative
// reads as zero rather than extrapolating off the grid). Ring partial is
// rescaled by azToRingMetric before summing, same az-equivalent-units
// convention ismMapFluidVelocity.wesl's forcingGradient uses.
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

// 5-point Laplacian of gas (prevTex.x) and dust (prevTex.w), in TEXEL units
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
    nAzPlus.w + nAzMinus.w + nRingPlus.w + nRingMinus.w
  );
  return neighbourSum - 4.0 * selfGasDust;
}

// Bilinear sample of prevTex — wraps in az, clamps in ring.
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
  let r = ismMapRingRadius(ring, ringCount, u.rMin, u.rMax);

  // Gas and the ambient dust pedestal both seed at gasProfile(r) (dust
  // scaled by ISM_MAP_AMBIENT_DUST — roughly constant dust-to-gas ratio):
  // uniform at the default gasFloor=1 (profile === 1 everywhere), and
  // diverging once this generator's own radial profile is dialed in. Pass A
  // is not dispatched for step 0 (velocity is unused), so velocityTex is
  // dead here.
  if (genStep == 0u) {
    let seedGas = gasProfile(r);
    // y seeds at 0, not the old eventAge clock's huge "long ago" sentinel:
    // stars is a MATERIAL tracer that accumulates from nothing via deposit,
    // so an empty disc starts with none, not a decayed trace of an event
    // that never happened.
    textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(seedGas, 0.0, 0.0, ISM_MAP_AMBIENT_DUST * seedGas));
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

  // Semi-Lagrangian back-trace, dt = 1 step: gas/dust/stars sample where THIS
  // texel's material came FROM, not where it self-reads (contrast activity's
  // Eulerian read below).
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
  let advectedDust = advected.w * continuityMult;

  // Operator-split diffusion, applied to the PREVIOUS state (not the
  // advected one) and added on top of it — see diffusionLaplacian above.
  // Clamped >= 0 so a strong coefficient can't push a thin texel negative.
  let lap = diffusionLaplacian(i32(az), i32(ring), azCount, ringCount, vec2<f32>(selfState.x, selfState.w));
  let diffusedGas = max(0.0, advectedGas + u.diffusion * lap.x);
  let diffusedDust = max(0.0, advectedDust + u.diffusion * lap.y);

  let selfActivity = selfState.z;

  // gasRegen is now a relaxation RATE toward gasProfile(r), not a flat
  // refill: at the default profile (gasFloor=1, profile===1) it is close in
  // scale to the old term (0.028*(1-gas) vs the old flat +0.028) but not
  // identical, and it no longer pushes gas toward GAS_CEILING unconditionally
  // — it relaxes toward the profile, the physically-meaningful equilibrium.
  let gas = min(GAS_CEILING, max(0.0, diffusedGas + u.gasRegen * (gasProfile(r) - diffusedGas)));
  // stars is MATERIAL, not Eulerian (this file's header): 'advected.y' is
  // already the previous stars value sampled at the SAME back-traced source
  // point gas/dust read above, so a stamped clump shears into a chain along
  // with the gas that formed it instead of staying a fixed circle. Deposit
  // is local (this texel's own gas, not the upstream sample) — the impulse's
  // own multi-step duration is absorbed into starsDeposit's calibration.
  let stars = advected.y * u.starsDecay + u.starsDeposit * gas * eventStamp;
  let dust = min(diffusedDust, DUST_OVERSHOOT_CEILING);
  let activity = mix(selfActivity, eventStamp, u.emaRate);

  textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(gas, stars, activity, dust));
}
