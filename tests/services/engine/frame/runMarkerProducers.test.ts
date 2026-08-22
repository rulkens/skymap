/**
 * runMarkerProducers — tests the walker's concatenation contract (producer
 * order preserved, no filtering or deduping). `produceStructureMarkers`' own
 * suite tests fade math and opacity; this suite tests only the walk.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { StructureMarkerDescriptor } from '../../../../src/@types/rendering/StructureMarkerDescriptor';
import type { MarkerProducer } from '../../../../src/@types/engine/subsystems/MarkerProducer';

// Stub descriptors for testing. The `id` field lets us verify ordering.
const desc = (id: string): StructureMarkerDescriptor => ({
  id,
  category: 'cluster',
  worldPos: [0, 0, 0],
  radiusMpc: 1,
  haloColor: [1, 1, 1, 1],
  ringColor: [1, 1, 1, 1],
});

const alphaZeroDesc = (id: string): StructureMarkerDescriptor => ({
  id,
  category: 'cluster',
  worldPos: [0, 0, 0],
  radiusMpc: 1,
  haloColor: [1, 1, 1, 0],
  ringColor: [1, 1, 1, 0],
});

// Mock the MARKER_PRODUCERS array to use stub producers
vi.mock('../../../../src/services/engine/presentation/markerProducers', () => {
  const producer1: MarkerProducer = {
    id: 'producer1',
    produceMarkers: () => [desc('p1-a'), alphaZeroDesc('p1-b'), desc('p1-c')],
  };

  const producer2: MarkerProducer = {
    id: 'producer2',
    produceMarkers: () => [desc('p2-a'), desc('p2-b')],
  };

  return {
    MARKER_PRODUCERS: [producer1, producer2],
  };
});

// Now import the function under test
import { runMarkerProducers } from '../../../../src/services/engine/frame/runMarkerProducers';

describe('runMarkerProducers', () => {
  it('preserves producer order and emits every descriptor unfiltered', () => {
    // Mock state and context (values unused by stub producers)
    const state = {} as EngineState;
    const ctx = {} as ReadyFrameContext;

    const result = runMarkerProducers(state, ctx);

    // Expected output: concatenation of producer outputs in order
    expect(result).toHaveLength(5);
    expect(result.at(0)?.id).toBe('p1-a');
    expect(result.at(1)?.id).toBe('p1-b');
    expect(result.at(2)?.id).toBe('p1-c');
    expect(result.at(3)?.id).toBe('p2-a');
    expect(result.at(4)?.id).toBe('p2-b');

    // Verify alpha-0 descriptors are included (not filtered out)
    expect(result.at(1)?.haloColor[3]).toBe(0);
    expect(result.at(1)?.ringColor[3]).toBe(0);
  });
});
