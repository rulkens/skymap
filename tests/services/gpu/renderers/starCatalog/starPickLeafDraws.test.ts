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
import { Source } from '../../../../../src/data/sources';

/** Build a one-node flat stream fixture at a given opacity + aggregate flag. */
function streamOf(draw: StarNodeDraw, opacity: number, isAggregate: number): StarNodeStream {
  return {
    count: 1,
    nodeIndex: new Int32Array([draw.nodeIndex]),
    firstRecord: new Uint32Array([draw.firstRecord]),
    recordCount: new Uint32Array([draw.recordCount]),
    originRelCamMpc: new Float32Array([draw.nodeIndex, 0, 0]),
    cellScaleMpc: new Float32Array([0.001]),
    isAggregate: new Uint8Array([isAggregate]),
    subtreeStarCount: new Float32Array([1]),
    opacity: new Float32Array([opacity]),
  };
}

/** Concatenate two single-node leaf streams into one flat leaf stream fixture. */
function leafStream(
  a: { draw: StarNodeDraw; opacity: number },
  b: { draw: StarNodeDraw; opacity: number },
): StarNodeStream {
  return {
    count: 2,
    nodeIndex: new Int32Array([a.draw.nodeIndex, b.draw.nodeIndex]),
    firstRecord: new Uint32Array([a.draw.firstRecord, b.draw.firstRecord]),
    recordCount: new Uint32Array([a.draw.recordCount, b.draw.recordCount]),
    originRelCamMpc: new Float32Array([a.draw.nodeIndex, 0, 0, b.draw.nodeIndex, 0, 0]),
    cellScaleMpc: new Float32Array([0.001, 0.001]),
    isAggregate: new Uint8Array([0, 0]),
    subtreeStarCount: new Float32Array([1, 1]),
    opacity: new Float32Array([a.opacity, b.opacity]),
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
      anyNodeFading: false,
      originMpc: [0, 0, 0],
    };

    const draws = starPickLeafDraws(prep);

    // Only source (c) survives: one source, one node, the live leaf. The
    // aggregate stream is dropped wholesale and the opacity-0 leaf is filtered,
    // leaving just liveLeaf's compacted flat entry (firstRecord 20, recordCount 7).
    expect(draws).toHaveLength(1);
    expect(draws[0]!.source).toBe(Source.GaiaStars);
    expect(draws[0]!.drawCount).toBe(1);
    expect(draws[0]!.firstRecord).toEqual(new Uint32Array([20]));
    expect(draws[0]!.recordCount).toEqual(new Uint32Array([7]));
    expect(draws[0]!.originRelCamMpc).toEqual(new Float32Array([3, 0, 0]));
    expect(draws[0]!.cellScaleMpc).toEqual(new Float32Array([0.001]));
  });
});
