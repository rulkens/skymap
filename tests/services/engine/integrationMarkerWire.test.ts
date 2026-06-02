/**
 * Integration test — produceMarkers → clusterMarkerRenderer round-trip.
 *
 * The point of this test is NOT to exercise either subsystem in isolation
 * (their dedicated unit suites already do that), but to assert the contract
 * BETWEEN them: the shape produceMarkers emits must plug cleanly into
 * setMarkers, and the renderer's marker count must agree with what the
 * subsystem chose to emit.
 *
 * Why this matters: produceMarkers and setMarkers were authored against
 * the same ClusterMarkerDescriptor type, but TypeScript only catches
 * shape mismatches at the boundary if both call sites are wired in the
 * same translation unit.  This test is the smallest possible end-to-end
 * smoke check that catches drift between the two — e.g. a renamed field
 * on the descriptor type would compile in both modules' unit tests but
 * still produce a runtime mismatch when the real engine wires them
 * together.
 *
 * The "null device" pattern is the standard renderer test idiom in this
 * repo: createClusterMarkerRenderer's GPU allocations are all guarded by
 * `if (device)`, so the renderer is safe to construct with `null` cast
 * to GPUDevice — setMarkers/markerCount run their CPU-side bookkeeping
 * (descriptor array bookkeeping + count) without touching the GPU at
 * all.  This keeps the test runnable under node-vitest with no WebGPU
 * shim.
 */

import { describe, it, expect } from 'vitest';
import { createPoiSubsystem } from '../../../src/services/engine/subsystems/poiSubsystem';
import { createClusterMarkerRenderer } from '../../../src/services/gpu/renderers/clusterMarkerRenderer';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FadeUniformsBgl } from '../../../src/@types/rendering/FadeUniformsBgl';

describe('poiSubsystem.produceMarkers → clusterMarkerRenderer.setMarkers', () => {
  it('the renderer reports the same marker count produceMarkers emitted', () => {
    const sub = createPoiSubsystem();
    const renderer = createClusterMarkerRenderer(
      {
        device: null as unknown as GPUDevice,
        context: null as unknown as GPUCanvasContext,
        format: 'rgba16float' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
      },
      'rgba16float',
      null as unknown as FadeUniformsBgl,
    );
    // World positions chosen so each POI lands above its category's
    // markerMinApparentRadiusPx floor at the test camera (which sits at
    // [0,0,1000] with pxPerRad=500).  Without this, the far-distance
    // fade introduced in 2026-05-28 drops sub-floor POIs from the
    // descriptor stream and the count contract would be off.
    sub.setPois([
      {
        id: 'virgo',
        name: 'Virgo',
        category: 'cluster',
        worldPos: [10, 0, 990],
        physicalRadiusMpc: 2,
      },
      {
        id: 'hercules',
        name: 'Hercules SC',
        category: 'supercluster',
        worldPos: [0, 100, 950],
        physicalRadiusMpc: 50,
      },
      {
        id: 'bootes',
        name: 'Boötes Void',
        category: 'void',
        worldPos: [0, 0, 800],
        physicalRadiusMpc: 50,
      },
      // famousGalaxy excluded by produceMarkers — the famous-galaxy
      // billboards are drawn by a different subsystem, so the cluster
      // marker pass intentionally skips them.
      {
        id: 'm31',
        name: 'M31',
        category: 'famousGalaxy',
        worldPos: [0.78, 0, 999],
        physicalRadiusMpc: 0.05,
      },
    ] as PointOfInterest[]);

    const state = {
      subsystems: {
        fades: { fadeTo: () => Promise.resolve() },
        selection: { selected: () => null, focused: () => null },
      },
    } as unknown as EngineState;
    const ctx = {
      drawCamPos: [0, 0, 1000],
      canvasSize: { width: 1024, height: 768 },
      drawPxPerRad: 500,
    } as unknown as ReadyFrameContext;

    const markers = sub.produceMarkers(state, ctx);
    renderer.setMarkers(markers);
    // 3 markers: cluster + SC + void (famous excluded).
    expect(renderer.markerCount()).toBe(3);
  });
});
