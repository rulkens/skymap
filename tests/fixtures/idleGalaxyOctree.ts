/**
 * idleGalaxyOctree — the galaxy runtime's octree fields with no octree source loaded, for
 * the stub runtimes the planner and pass tests build: nothing committed, an inert pooled
 * renderer. Spread into a fixture runtime.
 */
import { vi } from 'vitest';

export function idleGalaxyOctree() {
  return {
    octreePoints: new Map(),
    chunkStreams: new Map(),
    residencyVersion: 0,
    pooledPointRenderer: {
      setFrameCut: vi.fn(),
      draw: vi.fn(),
      poolRecordIndex: () => null,
      snapshotPickSlots: vi.fn(),
      pickDraws: () => [],
    },
  };
}
