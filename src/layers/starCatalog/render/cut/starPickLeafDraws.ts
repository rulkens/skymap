/**
 * The pure (unit-testable) half of `drawStarPick`: turns a prepared cut into
 * the pick pass's leaf draw-list. LEAF-only — an aggregate stands in for a
 * subtree, no single star to name. Drops every node at `opacity <= 0` (a
 * not-yet-visible newcomer, or a fully-faded leaf not yet pruned): "you can
 * only click what you can see" is the engine's usual opacity-0-⇒-no-render
 * rule. `<=` rather than `===` is belt-and-braces against a future underflow;
 * today `opacity` (crossfade × nodeFade) is always `>= 0`. No leaf here ever
 * names the Sun: it is excluded from the catalog at build time (drawn by the
 * true-scale seed passes as the scene origin), so the octree carries no
 * record at [0,0,0].
 */

import type { PreparedStarCut } from '../../@types/PreparedStarCut';
import type { StarPickLeafDraw } from '../../@types/StarPickLeafDraw';

export function starPickLeafDraws(prep: PreparedStarCut): readonly StarPickLeafDraw[] {
  const draws: StarPickLeafDraw[] = [];

  for (const s of prep.sources) {
    const leaf = s.leaf;

    // Count first so the compacted arrays are exact-sized. Fresh allocations
    // (not the reused stream) are fine — a pick is event-driven, off the
    // per-frame hot path, and must not alias a stream a later frame rewrites.
    let visible = 0;
    for (let i = 0; i < leaf.count; i++) if (leaf.opacity[i]! > 0) visible++;
    if (visible === 0) continue; // omit a source with no visible leaves

    const firstRecord = new Uint32Array(visible);
    const recordCount = new Uint32Array(visible);
    const originRelCamMpc = new Float32Array(visible * 3);
    const cellScaleMpc = new Float32Array(visible);

    let j = 0;
    for (let i = 0; i < leaf.count; i++) {
      if (leaf.opacity[i]! <= 0) continue;
      firstRecord[j] = leaf.firstRecord[i]!;
      recordCount[j] = leaf.recordCount[i]!;
      const oi = i * 3;
      const oj = j * 3;
      originRelCamMpc[oj] = leaf.originRelCamMpc[oi]!;
      originRelCamMpc[oj + 1] = leaf.originRelCamMpc[oi + 1]!;
      originRelCamMpc[oj + 2] = leaf.originRelCamMpc[oi + 2]!;
      cellScaleMpc[j] = leaf.cellScaleMpc[i]!;
      j++;
    }

    draws.push({
      source: s.source,
      drawCount: visible,
      firstRecord,
      recordCount,
      originRelCamMpc,
      cellScaleMpc,
    });
  }

  return draws;
}
