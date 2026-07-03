// generateStars.wesl — the star-pass compute entry point. One invocation
// writes one output SLOT, not one source-population "star": it scans the
// packed range table to find which population owns its slot, decomposes the
// slot into (iteration, sub) within that population, then dispatches to the
// population's formula. Every case is a dead-record stub for now — Tasks 6-8
// fill in the real per-population math; this task fixes the scan/dispatch
// shape so those tasks only need to fill in a switch-case body each.
//
// ## Why the range scan is LINEAR, not a binary search
//
// gen.starRanges holds at most 7 live entries — one per star population in
// POPULATION_IDS' fixed source order, carveStarLayout.ts omitting any
// population whose iteration count comes out zero for this galaxy's
// category. A binary search over a table this small buys nothing: its
// midpoint arithmetic and extra branches cost more instructions than just
// walking up to 7 entries, and a linear scan is a direct mirror of
// carveStarLayout's own construction (a single prefix-sum pass over the same
// spec order) — the CPU and GPU sides read the same shape of table the same
// way, which is easier to verify than two structurally different searches
// that merely agree on the answer.
//
// ## Why the slot decomposes into (iteration, sub)
//
// A range's 'iterations' count is not its slot count: some populations
// reserve MORE than one output slot per source draw because a single CPU-
// side iteration can emit more than one record. spiralArms carves stride 5
// (carveStarLayout.ts:19-23) — one HII-knot iteration can write a halo glow,
// a core, and up to 3 newborn stars, so 5 slots are reserved even though most
// iterations use only 1. irregularClumps carves stride 2
// (carveStarLayout.ts:24-26) — a halo glow plus a core. Every other star
// population carves stride 1 (one slot per iteration). 'iteration' says
// which source draw this slot belongs to; 'sub' says which of that draw's
// reserved slots this particular invocation is — together the two numbers a
// per-population formula needs (Tasks 6-8) to reconstruct "which draw, which
// of its slots" without the CPU's serial loop ever running on the GPU.
//
// ## Why the dispatch is a table switch
//
// One case per id in POPULATION_IDS that actually owns star slots — bulge,
// bar, disk, spiralArms, irregularClumps, halo, globularStar. globularCluster
// (6) is the CPU's per-cluster driving loop, not a slot owner:
// carveStarLayout never emits a range for it, so it has no case here either.
// A switch keyed on the same ids the CPU carves against is the direct GPU
// mirror of that table — the alternative, an if/else chain re-deriving
// population membership from some other predicate, would be a second place
// that has to agree with populationIds.ts instead of one.

import package::lib::generate::gen;
import package::lib::generate::StarRec;
import package::lib::generate::writeStar;

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let slot = gid.x;
  if (slot >= gen.starCapacity) {
    return;
  }

  var dead: StarRec;
  dead.alive = false;

  for (var i = 0u; i < gen.starRangeCount; i = i + 1u) {
    let range = gen.starRanges[i];
    let start = range.x;
    let iterations = range.y;
    let stride = range.z;
    let popId = range.w;
    let rangeLen = iterations * stride;

    if (slot >= start && slot < start + rangeLen) {
      let iteration = (slot - start) / stride;
      let sub = (slot - start) % stride;
      // Not yet consumed — every case below is a dead-record stub. Kept
      // here (rather than only computed inside a later task) so the
      // decomposition contract is visible at the call site now.
      _ = iteration;
      _ = sub;

      switch (popId) {
        case 0u: { writeStar(slot, dead); return; }  // bulge
        case 1u: { writeStar(slot, dead); return; }  // bar
        case 2u: { writeStar(slot, dead); return; }  // disk
        case 3u: { writeStar(slot, dead); return; }  // spiralArms
        case 4u: { writeStar(slot, dead); return; }  // irregularClumps
        case 5u: { writeStar(slot, dead); return; }  // halo
        case 7u: { writeStar(slot, dead); return; }  // globularStar
        default: { writeStar(slot, dead); return; }
      }
    }
  }

  // Past the last live range (or starRangeCount is 0 for this galaxy): no
  // population owns this slot, so it stays dead.
  writeStar(slot, dead);
}
