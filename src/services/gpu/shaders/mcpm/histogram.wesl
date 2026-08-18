// mcpm/histogram.wesl — Polyphorm's cs_density_histo: bins the trace density sampled at
// data-point positions into the fork's 17-bin (N_HISTOGRAM_BINS) log histogram, and writes
// each point's own density so the host can derive meanLogTraceAtPoints — a statistic THIS
// PROJECT defines, not the fork (spec section 9: "the fork's kernel only bins"), aligned to
// dataPointHistogram.ts's CLI definition: only IN-GRID points count, divided by how many were
// sampled (histogramSlice.ts's recordHistogramSample — same contract, both sites say so).
//
// group(0) is io.wesl's McpmUniforms, reused as-is: grid::loadTrace's OOB guard needs
// sim.worldWidth/Height/Depth regardless (grid.wesl imports io::sim itself), and
// McpmUniforms already carries nDataPoints too, so this pass borrows both rather than
// duplicating them in a second uniform — a SEPARATE @group(0)@binding(0) declaration
// does not link (the compiled module ends up with two variables on one binding). group(1)
// reuses a SUBSET of io.wesl's trace + agent position/weight storage, per its per-pass-slot
// contract. group(2) is this pass's own new resources — the sampleRandomly flag (too small
// and too volatile to earn McpmUniforms a 17th field) plus the histogram/densities buffers.

import package::mcpm::constants::HISTOGRAM_WG_X;
import package::mcpm::constants::HISTOGRAM_WG_Y;
import package::mcpm::constants::HISTOGRAM_WG_Z;
import package::mcpm::constants::HISTOGRAM_BASE;
import package::mcpm::constants::N_HISTOGRAM_BINS;
import package::mcpm::io::sim;
import package::mcpm::io::agentX;
import package::mcpm::io::agentY;
import package::mcpm::io::agentZ;
import package::mcpm::io::agentWeight;
import package::mcpm::grid::inGrid;
import package::mcpm::grid::loadTrace;
import package::mcpm::rng::Rng;
import package::mcpm::rng::wangHash;
import package::mcpm::rng::rngSetSeed;
import package::mcpm::rng::rngNextFloat;

struct HistogramFlags {
  sampleRandomly: i32,
};

// This pass's own resources, not part of io.wesl's group(1) contract (its header
// reserves them here). 'densities' has no fork analogue by that name (halos_densities
// there); the host reads it back to derive meanLogTraceAtPoints (spec section 9) from
// the SAME per-point samples this kernel bins. histogramCounts is N_HISTOGRAM_BINS + 1
// elements: 0..16 are the fork's bins/max-marker, unchanged; index 17 is THIS project's
// own addition, the count of IN-GRID points actually sampled this step — the divisor
// dataPointHistogram.ts's CLI statistic uses, so the host never has to re-derive it.
@group(2) @binding(0) var<uniform> flags: HistogramFlags;
@group(2) @binding(1) var<storage, read_write> histogramCounts: array<atomic<u32>>;
@group(2) @binding(2) var<storage, read_write> densities: array<f32>;

@compute @workgroup_size(HISTOGRAM_WG_X, HISTOGRAM_WG_Y, HISTOGRAM_WG_Z)
fn cs(
  @builtin(local_invocation_index) threadIndex: u32,
  @builtin(workgroup_id) groupId: vec3<u32>,
  @builtin(num_workgroups) nGroups: vec3<u32>,
) {
  // Same bijection propagate.wesl uses; the host dispatches this pass at propagate's own
  // (10, 10, gridZ) shape (main.cpp uses the identical grid_z formula for both), so most
  // invocations here fall past 'idx >= n_data_points' and return immediately — the fork's
  // own inefficiency, preserved rather than trimmed to a data-point-sized dispatch.
  let groupIdx = groupId.x + groupId.y * nGroups.x + groupId.z * nGroups.x * nGroups.y;
  let idx = threadIndex + (HISTOGRAM_WG_X * HISTOGRAM_WG_Y * HISTOGRAM_WG_Z) * groupIdx;

  if (idx >= u32(sim.nDataPoints)) { return; }

  var x = agentX[idx];
  var y = agentY[idx];
  var z = agentZ[idx];
  // QUIRK(dead_mass_read), ported verbatim from cs_density_histo.wgsl's own comment: the
  // fork reads particles_weights[idx] and never uses it (there, dropping the access drops
  // the binding from Dawn's auto-derived layout). This port's layouts are explicit, never
  // 'auto', so the read has no such consequence here — kept anyway for behavioural fidelity.
  _ = agentWeight[idx];

  if (flags.sampleRandomly != 0) {
    var rng: Rng;
    rngSetSeed(&rng, wangHash(73u * idx), wangHash(u32(x * y * z)));
    x = rngNextFloat(&rng) * f32(sim.worldWidth);
    y = rngNextFloat(&rng) * f32(sim.worldHeight);
    z = rngNextFloat(&rng) * f32(sim.worldDepth);
  }

  // Signed truncation, THEN the bounds check — not vec3<u32>(vec3<f32>(...)) first: a
  // negative f32 -> u32 conversion is an indeterminate value (saturates to 0 on the
  // hardware the fork's own comment describes), which would collapse an out-of-grid point
  // below the origin onto voxel (0,0,0) and read that corner's REAL density instead of
  // being recognised as out-of-grid. 'inGrid' never sees a coordinate that already lost its
  // sign, so it catches the low side exactly like the high side.
  let voxel = vec3<i32>(vec3<f32>(x, y, z));
  if (!inGrid(voxel)) {
    // Out-of-grid catalog points are excluded from both the bin vector and
    // meanLogTraceAtPoints, matching dataPointHistogram.ts's CLI statistic exactly
    // (module header). -1 is recordHistogramSample's skip sentinel — a real density is
    // never negative.
    densities[idx] = -1.0;
    return;
  }

  let density = loadTrace(voxel);
  densities[idx] = density;
  atomicAdd(&histogramCounts[N_HISTOGRAM_BINS], 1u); // in-grid sampled count

  var histoIndex = 0u;
  if (density > 1.0e-5) {
    let logDensity = log(density) / log(HISTOGRAM_BASE);
    // f32->u32 saturates in WGSL, matching the D3D hardware saturation the fork relied on.
    histoIndex = 1u + min(u32(logDensity + 5.0), N_HISTOGRAM_BINS - 3u);
  }

  atomicAdd(&histogramCounts[histoIndex], 1u);
  atomicMax(&histogramCounts[N_HISTOGRAM_BINS - 1u], u32(1.0e5 * density));
}
