/**
 * seedAgents — task S14: 'aroundData' anchors must never land outside the
 * box, and a fully-culled (nData=0) selection must degrade to uniform
 * rather than index x[-1] into NaN. Box matches worldToVoxel.test.ts:
 * origin [-8,-8,-8], voxelSizeMpc 2, dims [8,8,8].
 */
import { describe, expect, it } from 'vitest';
import { cullPointsToBox } from '../../../../tools/mcpm-workbench/src/field/cullPointsToBox';
import { seedAgents, AGENT_COUNT_STEP } from '../../../../tools/mcpm-workbench/src/sim/seedAgents';
import { Source } from '../../../../src/data/source';
import type { AgentWeights } from '../../../../tools/mcpm-workbench/@types/AgentWeights';
import type { CatalogPoints } from '../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

const box: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [16, 16, 16],
  dims: [8, 8, 8],
  voxelSizeMpc: 2,
};

function pointsFrom(positions: readonly number[]): CatalogPoints {
  const count = positions.length / 3;
  return {
    positions: new Float32Array(positions),
    log10StellarMass: new Float32Array(count).fill(10),
    count,
    sources: [Source.SDSS],
  };
}

const AROUND_DATA_SPREAD = 0.025; // mirrors seedAgents.ts's own constant
const maxSpreadMargin = AROUND_DATA_SPREAD * Math.min(...box.dims);

// A single sweep over 100k-plus agents rather than one `expect` per lane per
// agent — the same assertion via per-element `expect` calls is what blew the
// default vitest timeout.
function trackBounds(seeded: { x: Float32Array; y: Float32Array; z: Float32Array }): {
  min: [number, number, number];
  max: [number, number, number];
  nanCount: number;
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let nanCount = 0;
  for (let i = 0; i < seeded.x.length; i++) {
    const lanes = [seeded.x[i]!, seeded.y[i]!, seeded.z[i]!];
    for (let axis = 0; axis < 3; axis++) {
      const v = lanes[axis]!;
      if (Number.isNaN(v)) {
        nanCount++;
        continue;
      }
      if (v < min[axis]!) min[axis] = v;
      if (v > max[axis]!) max[axis] = v;
    }
  }
  return { min, max, nanCount };
}

describe('seedAgents aroundData anchoring', () => {
  it('never anchors a free agent on a culled (out-of-box) point', () => {
    // Two in-box points, one far outside; culling drops the outsider before
    // seedAgents ever sees it, so no free agent can anchor there.
    const points = pointsFrom([-2, -6, 2, 0, 0, 0, 500, 500, 500]);
    const weights: AgentWeights = {
      weights: new Float32Array([1, 1, 1]),
      nanCount: 0,
      medianLog10Mass: 10,
    };
    const culled = cullPointsToBox(points, weights, box);
    expect(culled.points.count).toBe(2); // sanity: the outsider really was dropped

    const seeded = seedAgents({
      points: culled.points,
      weights: culled.weights,
      box,
      agentCount: AGENT_COUNT_STEP,
      mode: 'aroundData',
      seed: 1,
    });

    const bounds = trackBounds(seeded);
    expect(bounds.min[0]).toBeGreaterThanOrEqual(0 - maxSpreadMargin);
    expect(bounds.max[0]).toBeLessThanOrEqual(box.dims[0] + maxSpreadMargin);
    expect(bounds.min[1]).toBeGreaterThanOrEqual(0 - maxSpreadMargin);
    expect(bounds.max[1]).toBeLessThanOrEqual(box.dims[1] + maxSpreadMargin);
    expect(bounds.min[2]).toBeGreaterThanOrEqual(0 - maxSpreadMargin);
    expect(bounds.max[2]).toBeLessThanOrEqual(box.dims[2] + maxSpreadMargin);
  });

  it('degrades to uniform seeding, without NaN, when the culled set is empty', () => {
    const points = pointsFrom([500, 500, 500]); // entirely outside the box
    const weights: AgentWeights = {
      weights: new Float32Array([1]),
      nanCount: 0,
      medianLog10Mass: 10,
    };
    const culled = cullPointsToBox(points, weights, box);
    expect(culled.points.count).toBe(0);

    const seeded = seedAgents({
      points: culled.points,
      weights: culled.weights,
      box,
      agentCount: AGENT_COUNT_STEP,
      mode: 'aroundData',
      seed: 1,
    });

    expect(seeded.x.length).toBe(AGENT_COUNT_STEP);
    const bounds = trackBounds(seeded);
    expect(bounds.nanCount).toBe(0);
    expect(bounds.min[0]).toBeGreaterThanOrEqual(0);
    expect(bounds.max[0]).toBeLessThan(box.dims[0]);
    expect(bounds.min[1]).toBeGreaterThanOrEqual(0);
    expect(bounds.max[1]).toBeLessThan(box.dims[1]);
    expect(bounds.min[2]).toBeGreaterThanOrEqual(0);
    expect(bounds.max[2]).toBeLessThan(box.dims[2]);
  });
});
