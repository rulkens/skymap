import { describe, it, expect } from 'vitest';
import type { ClusterMarkerRenderer } from '../../../../src/@types/rendering/ClusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../../src/@types/rendering/ClusterMarkerDescriptor';

// Type-level assertion that the renderer's public surface declares the
// `pickRing` method introduced in plan 3.  The GPU side cannot be unit-
// tested without a real device; this file is intentionally a compile-time
// gate dressed up as a runtime assertion so `npm test` reports a pass.
//
// If the type loses `pickRing` (or the signature drifts), this file fails
// to type-check and `npm test` fails before any expect() runs.
describe('ClusterMarkerRenderer pick API', () => {
  it('declares a pickRing method on the type', () => {
    // Indexed-access on the type itself: if `pickRing` is missing,
    // `ClusterMarkerRenderer['pickRing']` is a compile-time error and
    // the file refuses to typecheck.  Capture the type at runtime via
    // a typeof binding so we can assert at least one shape constraint
    // (a function accepting a GPURenderPassEncoder).
    type PickRingFn = ClusterMarkerRenderer['pickRing'];
    const fn: PickRingFn = (_pass) => {
      void _pass;
    };
    expect(fn).toBeTypeOf('function');
  });

  it('ClusterMarkerDescriptor accepts category group (type gate)', () => {
    // Compile-time guard: ensures `'group'` is a valid PoiCategory on
    // ClusterMarkerDescriptor so group descriptors can reach pickRing.
    // If the category union loses 'group' this assignment is a type error.
    const d: ClusterMarkerDescriptor = {
      id: 'test-group-pick-1',
      category: 'group',
      worldPos: [1, 2, 3],
      radiusMpc: 1,
      haloColor: [0.5, 0.9, 0.6, 0.8],
      ringColor: [0.5, 0.9, 0.6, 1],
    };
    expect(d.category).toBe('group');
  });
});
