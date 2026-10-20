/**
 * `createOctreeFrameDriver`: the plan cadence, the epoch wake and the re-cut cadence,
 * driven by a fake stream over an empty index (the chunk planner walks nothing).
 */
import { describe, it, expect, vi } from 'vitest';
import { createOctreeFrameDriver } from '../../../src/services/octree/createOctreeFrameDriver';
import type { Octree } from '../../../src/@types/octree/Octree';
import type { OctreeChunkStream } from '../../../src/@types/octree/OctreeChunkStream';
import type { OctreeCutSpec } from '../../../src/@types/octree/OctreeCutSpec';
import { EYE_SLACK_MPC, NODE_FADE_MS } from '../../../src/data/octree/octreeNodeFade';

type Cols = { readonly count: number };
const INTERVAL = 4;

const OCTREE = {
  family: 'star',
  grid: { bits: 10, origin: [0, 0, 0], cellEdge: 1 },
  nodes: { count: 0 },
  chunks: [],
  chunkCount: 0,
} as unknown as Octree<Cols>;

function cutAt(x: number): OctreeCutSpec {
  return {
    originMpc: [x, 0, 0],
    planes: new Float32Array(0),
    sources: [],
  } as unknown as OctreeCutSpec;
}

function fakeStream() {
  const state = { epoch: 0 };
  const stream = {
    slots: 4,
    update: vi.fn(),
    resident: () => null,
    hasFailed: () => false,
    inFlightCount: () => 0,
    epoch: () => state.epoch,
  } as unknown as OctreeChunkStream<Cols>;
  return { state, stream };
}

describe('createOctreeFrameDriver', () => {
  it('a landing chunk re-plans at once and returns recut', () => {
    const { state, stream } = fakeStream();
    const driver = createOctreeFrameDriver<Cols>(INTERVAL);
    const streams = [{ stream, octree: OCTREE }];
    driver.step(0, cutAt(0), streams);
    expect(stream.update).toHaveBeenCalledTimes(1);

    state.epoch++;
    const step = driver.step(16, cutAt(0), streams);
    expect(stream.update).toHaveBeenCalledTimes(2);
    expect(step.residencyChanged).toBe(true);
    expect(step.recut).toBe(true);
    expect(step.awake).toBe(true);
  });

  it('a still cut with nothing wanted plans once, then not again', () => {
    const { stream } = fakeStream();
    const driver = createOctreeFrameDriver<Cols>(INTERVAL);
    const streams = [{ stream, octree: OCTREE }];
    for (let f = 0; f < INTERVAL * 3; f++) driver.step(f * 16, cutAt(0), streams);
    expect(stream.update).toHaveBeenCalledTimes(1);

    driver.reset();
    driver.step(1000, cutAt(0), streams);
    expect(stream.update).toHaveBeenCalledTimes(2);
  });

  it('a moving cut recuts every other frame', () => {
    const { stream } = fakeStream();
    const driver = createOctreeFrameDriver<Cols>(INTERVAL);
    const streams = [{ stream, octree: OCTREE }];
    driver.step(0, cutAt(0), streams);
    const recuts = [1, 2, 3, 4].map(
      (i) => driver.step(i * 16, cutAt(i * EYE_SLACK_MPC * 10), streams).recut,
    );
    expect(recuts).toEqual([false, true, false, true]);
  });

  it('votes awake for NODE_FADE_MS after the cut last moved, and never with no cut', () => {
    const driver = createOctreeFrameDriver<Cols>(INTERVAL);
    driver.step(0, cutAt(0), []);
    expect(driver.step(NODE_FADE_MS - 1, cutAt(0), []).awake).toBe(true);
    expect(driver.step(NODE_FADE_MS, cutAt(0), []).awake).toBe(false);
    expect(driver.step(NODE_FADE_MS + 1, null, []).awake).toBe(false);
  });
});
