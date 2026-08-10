// generateDust.wesl — the dust-pass compute entry point. Structurally the
// mirror of generateStars.wesl: one invocation per output SLOT, a linear
// scan of the packed range table to find the owning population, an
// (iteration, sub) decomposition of the slot within that population, then a
// table switch on popId.
//
// ## Why the range scan is LINEAR, not a binary search
//
// gen.dustRanges holds at most 5 live entries — one per dust population in
// POPULATION_IDS' fixed source order, carveDustLayout.ts omitting any
// population this galaxy's category/params rule out (armDust only for
// spiral/barred, lenticularRingDust only when the ring strength is nonzero,
// and so on). Same reasoning as the star pass: a binary search's midpoint
// arithmetic is strictly more work than walking at most 5 entries, and a
// linear scan mirrors carveDustLayout's own single prefix-sum construction
// directly, so carveDustLayout and this shader read the table the same way
// instead of merely agreeing on the answer via two different search shapes.
//
// ## Why the slot still decomposes into (iteration, sub)
//
// Every dust population carveDustLayout.ts carves today uses stride 1
// (armDust, barDust, lenticularNucDust, lenticularRingDust, irregularDust
// all reserve exactly one output slot per source draw) — so 'sub' is always
// 0 for dust as things stand. The decomposition is still computed here, the
// same way as the star pass, because the range-table CONTRACT
// (PopulationRange's start/iterations/stride) doesn't promise stride 1; it
// only happens to be true of every dust builder carved so far. Reading
// 'iteration'/'sub' out of the same fields the star pass reads keeps the two
// entry points structurally identical, so a future dust population that
// *does* need multiple slots per draw (mirroring spiralArms' stride 5) is a
// carveDustLayout.ts + switch-case change, not a rewrite of this scan.
//
// ## Why the dispatch is a table switch
//
// One case per id in POPULATION_IDS that owns dust slots — armDust, barDust,
// lenticularNucDust, lenticularRingDust, irregularDust — keyed on the same
// ids carveDustLayout.ts carves against, for the same reason as the star
// pass: one table both sides read, not an if/else chain re-deriving
// population membership from some other predicate.

import package::milkyWay::sprites::generate::gen;
import package::milkyWay::sprites::generate::DustRec;
import package::milkyWay::sprites::generate::writeDust;
import package::milkyWay::sprites::generate::buildArmDust;
import package::milkyWay::sprites::generate::buildBarDust;
import package::milkyWay::sprites::generate::buildLenticularNucDust;
import package::milkyWay::sprites::generate::buildLenticularRingDust;
import package::milkyWay::sprites::generate::buildIrregularDust;

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let slot = gid.x;
  if (slot >= gen.dustCapacity) {
    return;
  }

  var dead: DustRec;
  dead.alive = false;

  for (var i = 0u; i < gen.dustRangeCount; i = i + 1u) {
    let range = gen.dustRanges[i];
    let start = range.x;
    let iterations = range.y;
    let stride = range.z;
    let popId = range.w;
    let rangeLen = iterations * stride;

    if (slot >= start && slot < start + rangeLen) {
      let iteration = (slot - start) / stride;
      let sub = (slot - start) % stride;
      // Every dust population carves stride 1 today, so 'sub' is always 0 and
      // the builders reconstruct their particle from 'iteration' alone. 'sub'
      // is still read here (mirroring the star pass) so a future multi-slot
      // dust population is a carve + switch change, not a rescan rewrite.
      _ = sub;

      switch (popId) {
        case 8u:  { writeDust(slot, buildArmDust(iteration)); return; }             // armDust
        case 9u:  { writeDust(slot, buildBarDust(iteration)); return; }             // barDust
        case 10u: { writeDust(slot, buildLenticularNucDust(iteration)); return; }   // lenticularNucDust
        case 11u: { writeDust(slot, buildLenticularRingDust(iteration)); return; }  // lenticularRingDust
        case 12u: { writeDust(slot, buildIrregularDust(iteration)); return; }       // irregularDust
        default:  { writeDust(slot, dead); return; }
      }
    }
  }

  // Past the last live range (or dustRangeCount is 0 for this galaxy): no
  // population owns this slot, so it stays dead.
  writeDust(slot, dead);
}
