import { describe, it, expect } from 'vitest';
import { createClusterMarkerRenderer } from '../../../../src/services/gpu/renderers/clusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../../src/@types/rendering/ClusterMarkerDescriptor';
import type { FadeUniformsBgl } from '../../../../src/@types/rendering/FadeUniformsBgl';

// Null-device pattern, mirrors markerLineRenderer.test.ts.
const newRenderer = (maxMarkers?: number) => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createClusterMarkerRenderer(ctx, 'rgba16float', null as unknown as FadeUniformsBgl, maxMarkers);
};

const cluster = (id: number): ClusterMarkerDescriptor => ({
  // `id` is CPU-side metadata used by the selection / pick paths;
  // the renderer ignores it when packing the instance buffer, but
  // the type requires it.  Synthesize a stable per-fixture id.
  id: `test-cluster-${id}`,
  category: 'cluster',
  worldPos: [id, 0, 0],
  physicalRadiusMpc: 2,
  haloColor: [1, 0.85, 0.4],
  ringColor: [1, 0.85, 0.4],
  haloAlpha: 1,
  ringAlpha: 1,
});

describe('ClusterMarkerRenderer (CPU state)', () => {
  it('starts with zero markers', () => {
    const r = newRenderer();
    expect(r.markerCount()).toBe(0);
  });

  it('counts markers after setMarkers', () => {
    const r = newRenderer();
    r.setMarkers([cluster(1), cluster(2), cluster(3)]);
    expect(r.markerCount()).toBe(3);
  });

  it('replaces (not appends) on subsequent setMarkers', () => {
    const r = newRenderer();
    r.setMarkers([cluster(1)]);
    r.setMarkers([cluster(2), cluster(3)]);
    expect(r.markerCount()).toBe(2);
  });

  it('caps at maxMarkers', () => {
    const r = newRenderer(2);
    r.setMarkers([cluster(1), cluster(2), cluster(3)]);
    expect(r.markerCount()).toBe(2);
  });

  it('label is stable', () => {
    const r = newRenderer();
    expect(r.label).toBe('clusterMarkerRenderer');
  });
});
