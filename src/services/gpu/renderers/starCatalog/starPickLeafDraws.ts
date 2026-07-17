/**
 * starPickLeafDraws — turn the per-frame prepared star cut into the pick pass's
 * leaf draw-list, the pure (unit-testable) half of `starCatalogLayer.drawPick`.
 *
 * ### Why leaf-only, and why opacity > 0
 *
 * A pick names exactly one real star, so only the LEAF stream is a candidate:
 * an AGGREGATE glow stands in for a whole subtree and has no single star to
 * resolve, so it must never claim the cursor. The aggregate nodes already live
 * in a separate stream (`PreparedStarSource.aggregate`), so "leaf-only" is just
 * reading the `leaf` stream and ignoring the other — no `isAggregate` re-check
 * needed here.
 *
 * Within the leaf stream we drop every node at `opacity <= 0`. Two nodes carry
 * a zero opacity in the prepared cut: a NEWCOMER seeded at 0 heading up to 1
 * (its sprite hasn't drawn yet this frame), and a leaf mid-fade that reached 0
 * on its way out but hasn't been pruned yet. Both are invisible to the eye, so
 * the cursor mustn't select them — "you can only click what you can see" is the
 * same enabled-gate rule the whole engine follows (opacity 0 ⇒ no pick). A leaf
 * at any opacity > 0 (even a barely-visible mid-fade sliver) stays pickable so
 * the click target tracks the sprite exactly. The guard is `<= 0` rather than
 * `=== 0` on purpose: `opacity` here is `crossfade × nodeFade`, a product of two
 * factors that are each clamped `>= 0`, so it can never actually be negative
 * today — the `<=` is a cheap belt-and-braces against a future underflow letting
 * an out-of-range opacity leak a click onto an invisible star. (Because
 * `computeStarCut` only reaches this stream when the source's crossfade is > 0,
 * `opacity` is zero iff the node fade is zero.)
 *
 * ### A pure filter — the traversal lives elsewhere
 *
 * This is a linear filter over the `PreparedStarCut` it is handed: it reads the
 * already-partitioned leaf arrays and never itself walks the octree or advances
 * the LOD fades. Building that cut is `prepareStarCut`'s job — memoised per
 * frame for the visual pass, and recomputed on the pick path's fresh `ctx` at
 * pick time (see `starCatalogLayer.drawPick`) — so whatever traversal a pick
 * costs happens there, not here. A source whose leaf stream is entirely
 * opacity-0 (or empty) is omitted from the result, so the pick draw issues no
 * work for it.
 */

import type { SourceType } from '../../../../@types/data/SourceType';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StarNodeDraw } from './walkStarOctreeCut';
import type { PreparedStarCut } from '../../../engine/frame/passes/starCatalogLayer';

export function starPickLeafDraws(prep: PreparedStarCut): readonly {
  source: SourceType;
  nodeDraws: StarNodeDraw[];
  originRelCamMpc: Vec3[];
  cellScaleMpc: number[];
}[] {
  const draws: {
    source: SourceType;
    nodeDraws: StarNodeDraw[];
    originRelCamMpc: Vec3[];
    cellScaleMpc: number[];
  }[] = [];

  for (const s of prep.sources) {
    const leaf = s.leaf;
    const nodeDraws: StarNodeDraw[] = [];
    const originRelCamMpc: Vec3[] = [];
    const cellScaleMpc: number[] = [];

    for (let i = 0; i < leaf.nodeDraws.length; i++) {
      if (leaf.opacity[i]! <= 0) continue; // invisible newcomer / fully-faded leaf
      nodeDraws.push(leaf.nodeDraws[i]!);
      originRelCamMpc.push(leaf.originRelCamMpc[i]!);
      cellScaleMpc.push(leaf.cellScaleMpc[i]!);
    }

    if (nodeDraws.length > 0)
      draws.push({ source: s.source, nodeDraws, originRelCamMpc, cellScaleMpc });
  }

  return draws;
}
