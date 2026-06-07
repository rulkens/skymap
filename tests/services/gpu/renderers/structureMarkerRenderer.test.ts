import { describe, it, expect } from 'vitest';
import { createStructureMarkerRenderer } from '../../../../src/services/gpu/renderers/structureMarkerRenderer';
import type { StructureMarkerDescriptor } from '../../../../src/@types/rendering/StructureMarkerDescriptor';
import type { FadeUniformsBgl } from '../../../../src/@types/rendering/FadeUniformsBgl';

// Null-device pattern, mirrors markerLineRenderer.test.ts.
const newRenderer = (initialCapacity?: number) => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createStructureMarkerRenderer(
    ctx,
    'rgba16float',
    null as unknown as FadeUniformsBgl,
    initialCapacity,
  );
};

const cluster = (id: number): StructureMarkerDescriptor => ({
  // `id` is CPU-side metadata used by the selection / pick paths;
  // the renderer ignores it when packing the instance buffer, but
  // the type requires it.  Synthesize a stable per-fixture id.
  id: `test-cluster-${id}`,
  category: 'cluster',
  worldPos: [id, 0, 0],
  radiusMpc: 2,
  haloColor: [1, 0.85, 0.4, 1],
  ringColor: [1, 0.85, 0.4, 1],
});

// `void` is a JS reserved word; use void_ to avoid a syntax error.
const void_ = (id: number): StructureMarkerDescriptor => ({
  id: `test-void-${id}`,
  category: 'void',
  worldPos: [id, 0, 0],
  radiusMpc: 5,
  haloColor: [0, 0, 0, 0], // haloAlpha = 0 per spec — no halo for voids
  ringColor: [0, 0.9, 0.9, 1],
});

const group = (id: number): StructureMarkerDescriptor => ({
  id: `test-group-${id}`,
  category: 'group',
  worldPos: [id, 0, 0],
  radiusMpc: 1,
  haloColor: [0.5, 0.9, 0.6, 0.8], // soft green — colour irrelevant for CPU bucketing
  ringColor: [0.5, 0.9, 0.6, 1],
});

describe('StructureMarkerRenderer (CPU state)', () => {
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

  it('grows past the initial capacity instead of truncating', () => {
    // Regression: a fixed cap dropped descriptors in `pois` order, so
    // clusters saturated the buffer and superclusters/voids never packed
    // (visible only when clusters were toggled off).  The buffer must
    // grow to hold the full set.
    const r = newRenderer(2);
    r.setMarkers([cluster(1), cluster(2), cluster(3), cluster(4), cluster(5)]);
    expect(r.markerCount()).toBe(5);
  });

  it('label is stable', () => {
    const r = newRenderer();
    expect(r.label).toBe('structureMarkerRenderer');
  });

  it('counts group descriptors alongside cluster / void', () => {
    // Regression guard: group descriptors must NOT be skipped by the
    // write-pass guard.  Feed a mix of all four marker-bearing categories
    // and assert every descriptor is counted.
    const r = newRenderer();
    r.setMarkers([cluster(1), void_(2), group(3), group(4)]);
    expect(r.markerCount()).toBe(4);
  });

  it('group descriptors do not affect cluster or void counts', () => {
    // Buckets are independent: adding group markers must not bleed into
    // the cluster or void buckets (which would desync pick indices).
    const r = newRenderer();
    r.setMarkers([cluster(1), cluster(2), void_(3), group(4), group(5), group(6)]);
    // Total = 6; if any bucket bleed occurred markerCount would be wrong.
    expect(r.markerCount()).toBe(6);
  });
});
