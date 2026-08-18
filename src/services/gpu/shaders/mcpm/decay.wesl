// mcpm/decay.wesl — Polyphorm's cs_field_decay: one 27-tap weighted blur of the deposit
// field times decayFactor, plus a per-voxel dithered decay of the trace.
//
// Addressing transform: the fork's tex_in/tex_out/tex_trace texel fetches become grid.wesl
// buffer indices. loadDeposit's out-of-range zero is load-bearing rather than defensive —
// the low-boundary quirk below is defined by it. Taps read 'deposit' and the result lands
// in 'depositOut'; the host swaps the physical buffers per step, so no tap can observe
// this step's writes. Dispatch is dims/8 with no tail guard, exactly like the fork: every
// grid dimension is a multiple of 8 by host contract.

import package::mcpm::constants::DECAY_WG_X;
import package::mcpm::constants::DECAY_WG_Y;
import package::mcpm::constants::DECAY_WG_Z;
import package::mcpm::constants::QUIRK_DECAY_WEIGHT_ALL_INT3;
import package::mcpm::constants::QUIRK_NONPERIODIC_LOW_BOUNDARY;
import package::mcpm::constants::QUIRK_DITHERED_TRACE_DECAY;
import package::mcpm::io::sim;
import package::mcpm::grid::loadDeposit;
import package::mcpm::grid::storeDepositOut;
import package::mcpm::grid::scaleTrace;
import package::mcpm::rng::Rng;
import package::mcpm::rng::wangHash;
import package::mcpm::rng::rngSetSeed;
import package::mcpm::rng::rngNextFloat;

@compute @workgroup_size(DECAY_WG_X, DECAY_WG_Y, DECAY_WG_Z)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p = vec3<i32>(gid);

  // The fork accumulates a vec2 whose second lane is structurally dead: the bound D3D11
  // format was single-channel R16_FLOAT, so it never carried anything but 0.
  var v: f32 = 0.0;
  var w: f32 = 0.0;

  for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
      for (var dz: i32 = -1; dz <= 1; dz = dz + 1) {
        // HLSL:69's all(int3) means 'every component non-zero' and its '== 0' inverts
        // that, so 19 taps (centre + faces + EDGES) take the flat arm and only the 8
        // corners fall off. The falloff stays unhoisted: at the centre tap it would be
        // 1.0/sqrt(0.0), and both arms reach 1.0 without evaluating it, which is why the
        // buggy kernel never produced NaNs.
        var weight: f32;
        let hlslAllNonzero = all(vec3<bool>(dx != 0, dy != 0, dz != 0));
        if (QUIRK_DECAY_WEIGHT_ALL_INT3) {
          if (!hlslAllNonzero) {
            weight = 1.0;
          } else {
            weight = 1.0 / sqrt(f32(abs(dx) + abs(dy) + abs(dz)));
          }
        } else {
          if (dx == 0 && dy == 0 && dz == 0) {
            weight = 1.0;
          } else {
            weight = 1.0 / sqrt(f32(abs(dx) + abs(dy) + abs(dz)));
          }
        }

        // Sign-of-dividend '%': at p == 0 a dx == -1 tap stays -1 instead of wrapping to
        // the far face, and loadDeposit reads it as 0. Mass leaks out of the x/y/z = 0
        // faces, and w still sums the full 23.6188021, so those faces darken on top.
        var tap = p + vec3<i32>(dx, dy, dz);
        if (QUIRK_NONPERIODIC_LOW_BOUNDARY) {
          tap.x = tap.x % sim.worldWidth;
          tap.y = tap.y % sim.worldHeight;
          tap.z = tap.z % sim.worldDepth;
        } else {
          tap.x = (tap.x % sim.worldWidth + sim.worldWidth) % sim.worldWidth;
          tap.y = (tap.y % sim.worldHeight + sim.worldHeight) % sim.worldHeight;
          tap.z = (tap.z % sim.worldDepth + sim.worldDepth) % sim.worldDepth;
        }

        v = v + weight * loadDeposit(tap);
        w = w + weight;
      }
    }
  }
  v = v / w;

  v = v * sim.decayFactor;
  storeDepositOut(p, v);

  // Both seeds are deliberately terrible and stay that way: 113.0 * v truncates to 0
  // across all of empty space, and the coordinate product is 0 on the whole x/y/z = 0
  // planes and aliases badly elsewhere, so the dither is banded by deposit magnitude
  // rather than white — the published cube was fitted with that noise. The product stays
  // in u32 for the fork's wraparound.
  var rng: Rng;
  rngSetSeed(&rng, wangHash(u32(113.0 * v)), wangHash(gid.x * gid.y * gid.z));

  var traceDecay: f32;
  if (QUIRK_DITHERED_TRACE_DECAY) {
    traceDecay = 0.985 + 0.01 * rngNextFloat(&rng);
  } else {
    // The fork's own commented-out constant (HLSL:87), which is the dither's mean, not 1.0.
    traceDecay = 0.99;
  }
  scaleTrace(p, traceDecay);
}
