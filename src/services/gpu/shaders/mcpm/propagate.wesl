// mcpm/propagate.wesl — Polyphorm's cs_agents_propagate: the algorithm verbatim, the
// addressing transformed. Every grid load and store is a grid.wesl call and nothing else
// moved, so the port stays bug-for-bug faithful until the VAC validation gate passes;
// each surviving oddity is either a QUIRK_* override from constants.wesl or carries a
// note where it sits. The grids are single-channel here, so the fork's deposit 'color'
// lane and the trace direction lanes are dropped rather than ported: its own R16_FLOAT
// grids discard them in hardware in the SDSS regime this reproduces.

import package::mcpm::constants::PROPAGATE_WG_X;
import package::mcpm::constants::PROPAGATE_WG_Y;
import package::mcpm::constants::PROPAGATE_WG_Z;
import package::mcpm::constants::QUIRK_INT3_TRUNCATED_SENSING;
import package::mcpm::io::sim;
import package::mcpm::io::agentX;
import package::mcpm::io::agentY;
import package::mcpm::io::agentZ;
import package::mcpm::io::agentPhi;
import package::mcpm::io::agentTheta;
import package::mcpm::io::agentWeight;
import package::mcpm::grid::loadDeposit;
import package::mcpm::grid::addDeposit;
import package::mcpm::grid::addTrace;
import package::mcpm::rng::Rng;
import package::mcpm::rng::wangHash;
import package::mcpm::rng::rngSetSeed;
import package::mcpm::rng::rngNextFloat;

// The fork's four feature #defines (cs_agents_propagate.hlsl:11-14) with its shipped
// defaults. Quirks are not declared here — constants.wesl is their one registry.
override PROBABILISTIC_SAMPLING: bool = true;
override AGENT_REROUTING: bool = true;
override FIXED_AGENT_DISTANCE_SAMPLING: bool = false;
override IGNORE_DATA: bool = false;

// The fork's truncated pi, verbatim: it biases randomAngle and must not be 'fixed'.
const PI: f32 = 3.141592;
const TWOPI: f32 = 2.0 * PI;

fn rotate(v: vec3<f32>, a: vec3<f32>, angle: f32) -> vec3<f32> {
  return cos(angle) * v + sin(angle) * cross(a, v) + dot(a, v) * (1.0 - cos(angle)) * a;
}

// 'mod' is a WGSL reserved word. Agent MOVEMENT wraps with this floor-mod (always
// non-negative, so truly periodic) while the decay blur wraps with integer '%' (sign of
// the dividend): the asymmetry is the fork's and both halves of it are kept.
fn modFloor(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

@compute @workgroup_size(PROPAGATE_WG_X, PROPAGATE_WG_Y, PROPAGATE_WG_Z)
fn cs(
  @builtin(local_invocation_index) threadIndex: u32,
  @builtin(workgroup_id) groupId: vec3<u32>,
  @builtin(num_workgroups) nGroups: vec3<u32>,
) {
  // The fork hardcodes this dispatch's 10/100/1000. Read off the builtins the expression
  // reduces to those constants and stays a bijection onto [0, invocations) under any
  // workgroup reshape, which is all idx is ever used for.
  let groupIdx = groupId.x + groupId.y * nGroups.x + groupId.z * nGroups.x * nGroups.y;
  let idx = threadIndex + (PROPAGATE_WG_X * PROPAGATE_WG_Y * PROPAGATE_WG_Z) * groupIdx;

  // The fork carries no guard because its dispatch truncates below the agent count. This
  // is bitwise identical under that dispatch and stops a covering one from clamping an
  // out-of-range index onto a real agent.
  if (idx >= u32(sim.nDataPoints + sim.nAgents)) { return; }

  var x = agentX[idx];
  var y = agentY[idx];
  var z = agentZ[idx];

  // u32(x*y*z) is 0 for any agent on a grid plane, and the product is only representable
  // because the VAC grid keeps it under 2^32. Verbatim, seed stream included.
  var rng: Rng;
  rngSetSeed(&rng, wangHash(73u * idx), wangHash(u32(x * y * z)));

  var th = agentTheta[idx];
  var ph = agentPhi[idx];
  var weight = agentWeight[idx];

  // Indices [0, nDataPoints) are the catalog points: sentinel theta = -5.0, deposit only.
  if (th < -1.0) {
    if (!IGNORE_DATA) {
      // Raw, unwrapped position. The fork's load/store pair here is unguarded because an
      // out-of-range store is discarded, which makes the paired load dead; addDeposit
      // no-ops the whole read-modify-write, which is that same behaviour on buffers.
      addDeposit(vec3<i32>(vec3<f32>(x, y, z)), 10.0 * weight);
    }
    return;
  }

  let centerAxis = vec3<f32>(sin(th) * cos(ph), cos(th), sin(th) * sin(ph));

  // Draw 1. This 0.95..1.05 jitter is shared by the sensing cone here and the turn
  // magnitude below — one random, not two.
  let xiDirectional = 0.95 + 0.1 * rngNextFloat(&rng);
  let senseTheta = th - sim.senseSpread * xiDirectional;
  let offCenterBaseDir =
    vec3<f32>(sin(senseTheta) * cos(ph), cos(senseTheta), sin(senseTheta) * sin(ph));

  var senseDistanceProb = sim.senseDistance;
  var xi: f32;
  if (FIXED_AGENT_DISTANCE_SAMPLING) {
    // Consumes no draw, exactly as the #ifdef arm does not.
    xi = clamp(modFloor(0.01 * f32(idx), 1.0), 0.001, 0.999);
  } else {
    xi = clamp(rngNextFloat(&rng), 0.001, 0.999);  // draw 2
  }
  // Maxwell-Boltzmann inverse-CDF fit; the log argument stays positive across the clamp.
  let distanceScalingFactor = -0.3033 * log((pow(xi + 0.005, -0.4) - 0.9974) / 7.326);
  senseDistanceProb = senseDistanceProb * distanceScalingFactor;

  let p = vec3<i32>(vec3<f32>(x, y, z));

  // HLSL:138 loads a value HLSL:230 overwrites before its only read — provably dead,
  // so it is not ported here.

  // Sensing does NOT wrap, unlike movement below: an offset leaving the grid falls to
  // loadDeposit's zero, which is what D3D11 returned for an out-of-range typed-UAV load.
  let centerSensePos = centerAxis * senseDistanceProb;
  var depositAhead: f32;
  if (QUIRK_INT3_TRUNCATED_SENSING) {
    // Truncation toward zero biases the sensed cell toward the agent on every axis.
    depositAhead = loadDeposit(p + vec3<i32>(centerSensePos));
  } else {
    depositAhead = loadDeposit(p + vec3<i32>(round(centerSensePos)));
  }

  let randomAngle = rngNextFloat(&rng) * TWOPI - PI;  // draw 3
  let senseOffset = rotate(offCenterBaseDir, centerAxis, randomAngle) * senseDistanceProb;
  var senseDeposit: f32;
  if (QUIRK_INT3_TRUNCATED_SENSING) {
    senseDeposit = loadDeposit(p + vec3<i32>(senseOffset));
  } else {
    senseDeposit = loadDeposit(p + vec3<i32>(round(senseOffset)));
  }

  var pStraight: f32;
  var pTurn: f32;
  if (PROBABILISTIC_SAMPLING) {
    pStraight = pow(max(depositAhead, 0.0), sim.sharpness);
    pTurn = pow(max(senseDeposit, 0.0), sim.sharpness);
  } else {
    pStraight = depositAhead;
    pTurn = senseDeposit;
  }

  // Draw 4, taken unconditionally ahead of the branch so the stream advances identically
  // whether or not the agent turns.
  let xiDir = rngNextFloat(&rng);
  if (pStraight + pTurn > 1.0e-5) {
    var takeTurn: bool;
    if (PROBABILISTIC_SAMPLING) {
      takeTurn = xiDir < pTurn / (pTurn + pStraight);
    } else {
      takeTurn = pTurn > pStraight;
    }
    if (takeTurn) {
      let thetaTurn = th - sim.turnAngle * xiDirectional;
      let offCenterBaseDirTurn =
        vec3<f32>(sin(thetaTurn) * cos(ph), cos(thetaTurn), sin(thetaTurn) * sin(ph));
      // The sensing ray's randomAngle again: the agent turns toward what it sensed.
      let newDirection = rotate(offCenterBaseDirTurn, centerAxis, randomAngle);
      ph = atan2(newDirection.z, newDirection.x);
      // acos can see |arg| marginally over 1 from f32 rounding. Unclamped in the fork.
      th = acos(newDirection.y / length(newDirection));
    }
  }

  // Inert for the VAC parameter set, where centerAttraction is 0.
  if (sim.centerAttraction > 0.001) {
    // f32(dim) / 2.0, never f32(dim / 2): integer division would shift the attractor by
    // half a cell on odd grid dimensions.
    let toCenter = vec3<f32>(
      f32(sim.worldWidth) / 2.0 - x,
      f32(sim.worldHeight) / 2.0 - y,
      f32(sim.worldDepth) / 2.0 - z);
    let dCenter = length(toCenter);
    let dcTurn = clamp((dCenter - 50.0) / 150.0, 0.0, 1.0) * sim.centerAttraction;
    var dir = vec3<f32>(sin(th) * cos(ph), cos(th), sin(th) * sin(ph));
    let centerDir = normalize(toCenter);
    // HLSL:205 broadcasts a scalar acos into a float3; all three lanes are equal.
    let centerAngle = vec3<f32>(acos(dot(dir, centerDir)));
    let st = 0.1 * dcTurn;
    // sin(centerAngle) is 0 once the agent points at the centre. Unguarded in the fork.
    dir = sin((1.0 - st) * centerAngle) / sin(centerAngle) * dir
        + sin(st * centerAngle) / sin(centerAngle) * centerDir;
    if (length(dir) > 0.0 && (dir.z != 0.0 || dir.x != 0.0)) {
      th = acos(dir.y / length(dir));
      ph = atan2(dir.z, dir.x);
    }
  }

  // The step length reuses the sensing draw, correlating an agent's move and sense
  // distances within a step — load-bearing MCPM behaviour a tidy rewrite would decouple.
  let dp = vec3<f32>(sin(th) * cos(ph), cos(th), sin(th) * sin(ph))
         * sim.moveDistance * (0.1 + 0.9 * distanceScalingFactor);
  x = x + dp.x;
  y = y + dp.y;
  z = z + dp.z;

  x = modFloor(x, f32(sim.worldWidth));
  y = modFloor(y, f32(sim.worldHeight));
  z = modFloor(z, f32(sim.worldDepth));

  const wF: f32 = 0.9;
  let nAgentsM = f32(sim.nAgents) / 1.0e6;
  let thrF = 0.05 * nAgentsM * sim.depositValue + 0.1e-3 * nAgentsM;

  // Read at the POST-MOVE position — the two accumulations at the end of the kernel
  // write at the post-reroute one instead.
  let currentDeposit = loadDeposit(vec3<i32>(vec3<f32>(x, y, z)));
  weight = wF * weight + (1.0 - wF) * currentDeposit;

  if (AGENT_REROUTING) {
    if (weight < thrF) {
      // Draws 5-7, consumed only here, so a rerouted agent's stream diverges from a
      // surviving one's from this point on.
      x = rngNextFloat(&rng) * f32(sim.worldWidth);
      y = rngNextFloat(&rng) * f32(sim.worldHeight);
      z = rngNextFloat(&rng) * f32(sim.worldDepth);
      weight = sim.depositValue;
    }
  }

  agentX[idx] = x;
  agentY[idx] = y;
  agentZ[idx] = z;
  agentTheta[idx] = th;
  agentPhi[idx] = ph;
  agentWeight[idx] = weight;

  // POST-REROUTE position: a rerouted agent deposits at its new random location, not
  // where it moved to. Both accumulations race by design (grid.wesl's addDeposit/addTrace
  // header) and the deposit one re-reads a texel this invocation already read stale.
  let wc = vec3<i32>(vec3<f32>(x, y, z));
  addDeposit(wc, sim.depositValue);
  // An agent that sensed far leaves proportionally more trace; normalizationFactor is
  // pinned to 1.0 upstream, so this reduces to a bare distance weighting.
  addTrace(wc, (1.0 / sim.normalizationFactor) * distanceScalingFactor);
}
