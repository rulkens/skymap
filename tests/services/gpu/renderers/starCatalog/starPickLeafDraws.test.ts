/**
 * starPickLeafDraws — the pure filter that turns the per-frame prepared star cut
 * into the pick pass's leaf draw-list.
 *
 * The load-bearing guard: a pick only ever names a real star, so an AGGREGATE
 * glow (which stands in for a whole subtree) and a fully-faded / newcomer-at-0
 * leaf (which the eye can't see, so the cursor mustn't claim) never enter the
 * pick draw. This test pins exactly that — the aggregate stream is dropped
 * wholesale, and within the leaf stream only opacity > 0 survives.
 */
import { describe, expect, it } from 'vitest';
import { starPickLeafDraws } from '../../../../../src/services/gpu/renderers/starCatalog/starPickLeafDraws';
import type {
  PreparedStarCut,
  StarNodeStream,
} from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import type { StarNodeDraw } from '../../../../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { Source } from '../../../../../src/data/sources';

/** Build a one-node stream fixture at a given opacity + aggregate flag. */
function streamOf(draw: StarNodeDraw, opacity: number, isAggregate: number): StarNodeStream {
  const origin: Vec3 = [draw.nodeIndex, 0, 0];
  return {
    nodeDraws: [draw],
    originRelCamMpc: [origin],
    cellScaleMpc: [0.001],
    isAggregate: [isAggregate],
    subtreeStarCount: [1],
    opacity: [opacity],
  };
}

/** Concatenate two single-node streams into one leaf stream fixture. */
function leafStream(
  a: { draw: StarNodeDraw; opacity: number },
  b: { draw: StarNodeDraw; opacity: number },
): StarNodeStream {
  const sa = streamOf(a.draw, a.opacity, 0);
  const sb = streamOf(b.draw, b.opacity, 0);
  return {
    nodeDraws: [...sa.nodeDraws, ...sb.nodeDraws],
    originRelCamMpc: [...sa.originRelCamMpc, ...sb.originRelCamMpc],
    cellScaleMpc: [...sa.cellScaleMpc, ...sb.cellScaleMpc],
    isAggregate: [...sa.isAggregate, ...sb.isAggregate],
    subtreeStarCount: [...sa.subtreeStarCount, ...sb.subtreeStarCount],
    opacity: [...sa.opacity, ...sb.opacity],
  };
}

describe('starPickLeafDraws', () => {
  it('excludes aggregates and zero-opacity leaves', () => {
    const aggregate: StarNodeDraw = { nodeIndex: 1, firstRecord: 0, recordCount: 1 };
    const fadedLeaf: StarNodeDraw = { nodeIndex: 2, firstRecord: 10, recordCount: 5 };
    const liveLeaf: StarNodeDraw = { nodeIndex: 3, firstRecord: 20, recordCount: 7 };

    const prep: PreparedStarCut = {
      sources: [
        {
          source: Source.GaiaStars,
          // (b) a faded/newcomer leaf at opacity 0, (c) a visible leaf.
          leaf: leafStream({ draw: fadedLeaf, opacity: 0 }, { draw: liveLeaf, opacity: 0.7 }),
          // (a) an aggregate glow — structurally in the aggregate stream.
          aggregate: streamOf(aggregate, 0.9, 1),
        },
      ],
      sizePx: 2,
      brightness: 1,
      glowOverlap: 1,
      aggregateIntensityCap: 0.06,
    };

    const draws = starPickLeafDraws(prep);

    // Only source (c) survives: one source, one node, the live leaf.
    expect(draws).toHaveLength(1);
    expect(draws[0]!.source).toBe(Source.GaiaStars);
    expect(draws[0]!.nodeDraws).toEqual([liveLeaf]);
    expect(draws[0]!.originRelCamMpc).toEqual([[3, 0, 0]]);
    expect(draws[0]!.cellScaleMpc).toEqual([0.001]);
  });
});
