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

import { runMarkerProducers } from '../../../../src/services/engine/frame/runMarkerProducers';

describe('runMarkerProducers', () => {
  it('preserves producer order and emits every descriptor unfiltered', () => {
    const state = {} as EngineState;
    const ctx = {} as ReadyFrameContext;

    const result = runMarkerProducers(state, ctx);

    expect(result).toHaveLength(5);
    expect(result.at(0)?.id).toBe('p1-a');
    expect(result.at(1)?.id).toBe('p1-b');
    expect(result.at(2)?.id).toBe('p1-c');
    expect(result.at(3)?.id).toBe('p2-a');
    expect(result.at(4)?.id).toBe('p2-b');

    expect(result.at(1)?.haloColor[3]).toBe(0);
    expect(result.at(1)?.ringColor[3]).toBe(0);
  });
});
