/**
 * Integration test — produceStructureMarkers → structureMarkerRenderer round-trip.
 *
 * The point of this test is NOT to exercise either side in isolation (their
 * dedicated unit suites already do that), but to assert the contract BETWEEN
 * them: the shape produceStructureMarkers emits must plug cleanly into
 * setMarkers, and the renderer's marker count must agree with what the
 * producer chose to emit.
 *
 * Why this matters: produceStructureMarkers and setMarkers were authored
 * against the same StructureMarkerDescriptor type, but TypeScript only catches
 * shape mismatches at the boundary if both call sites are wired in the same
 * translation unit.  This test is the smallest possible end-to-end smoke check
 * that catches drift — e.g. a renamed field on the descriptor type would
 * compile in both modules' unit tests but still mismatch at runtime.
 *
 * The "null device" pattern is the standard renderer test idiom in this repo:
 * createStructureMarkerRenderer's GPU allocations are all guarded by `if
 * (device)`, so the renderer is safe to construct with `null` cast to
 * GPUDevice — setMarkers/markerCount run their CPU-side bookkeeping without
 * touching the GPU.
 */

import { describe, it, expect } from 'vitest';
import { produceStructureMarkers } from '../../../src/services/engine/presentation/produceStructureMarkers';
import { createEngineData } from '../../../src/services/engine/data/createEngineData';
import { createStructureMarkerRenderer } from '../../../src/services/gpu/renderers/structureMarker/structureMarkerRenderer';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

function makeRegistry() {
  return createFadeRegistry({ requestRender: () => {} });
}
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FadeUniformsBgl } from '../../../src/@types/rendering/FadeUniformsBgl';

describe('produceStructureMarkers → structureMarkerRenderer.setMarkers', () => {
  it('the renderer reports the same marker count the producer emitted', () => {
    const renderer = createStructureMarkerRenderer(
      {
        device: null as unknown as GPUDevice,
        context: null as unknown as GPUCanvasContext,
        format: 'rgba16float' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      null as unknown as FadeUniformsBgl,
      false,
    );

    const data = createEngineData();
    // World positions chosen so each structure lands above its category's
    // markerMinApparentRadiusPx floor at the test camera (at [0,0,1000],
    // pxPerRad=500). Famous galaxies are not structures, so they can't enter
    // this path at all — the store only holds the three structure categories.
    data.structures.setGroup('anchors', [
      {
        id: 'virgo',
        name: 'Virgo',
        category: 'cluster',
        worldPos: [10, 0, 990],
        featured: true,
        physicalRadiusMpc: 2,
      },
      {
        id: 'hercules',
        name: 'Hercules SC',
        category: 'supercluster',
        worldPos: [0, 100, 950],
        featured: true,
        physicalRadiusMpc: 50,
      },
      {
        id: 'bootes',
        name: 'Boötes Void',
        category: 'void',
        worldPos: [0, 0, 800],
        featured: true,
        physicalRadiusMpc: 50,
      },
    ] as StructureInfo[]);

    const state = {
      data,
      settings: {
        structures: {
          enabled: true,
          items: {
            cluster: { enabled: true, labelEnabled: true },
            supercluster: { enabled: true, labelEnabled: true },
            void: { enabled: true, labelEnabled: true },
            group: { enabled: true, labelEnabled: true },
          },
        },
      },
      selection: { hover: null, select: null, focus: null },
      subsystems: {
        fades: makeRegistry(),
        clipPlayer: { clipOpacityOf: () => 1 },
      },
    } as unknown as EngineState;
    const ctx = {
      drawCamPos: [0, 0, 1000],
      canvasSize: { width: 1024, height: 768 },
      drawPxPerRad: 500,
      fovYRad: (60 * Math.PI) / 180,
      focusBlend: 0,
      nowMs: 0,
    } as unknown as ReadyFrameContext;

    const markers = produceStructureMarkers(state, ctx);
    renderer.setMarkers(markers);
    // 3 markers: cluster + SC + void.
    expect(renderer.markerCount()).toBe(3);
  });
});
