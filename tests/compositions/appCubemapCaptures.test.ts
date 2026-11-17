/**
 * `APP_CUBEMAP_CAPTURE_REGISTRY` is hand-assembled beside `APP_COMPOSITION`: a Layer missing from
 * the spread compiles, and its target row then never bakes. A key collision compiles too, one row
 * silently winning the spread. Row order is the bake order and the timing panel's display order.
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import {
  APP_CUBEMAP_CAPTURE_REGISTRY,
  APP_SKY_CAPTURE_KEYS,
} from '../../src/compositions/appCubemapCaptures';
import { CORE_CUBEMAP_CAPTURES } from '../../src/data/rendering/cubemapCaptures';
import type { SkyCapture } from '../../src/@types/rendering/SkyCapture';
import type { SkyCaptureKey } from '../../src/@types/rendering/SkyCaptureKey';

// `U` pinned: `layers` is a tuple of unlike Layer types.
const DECLARED = APP_COMPOSITION.layers.flatMap<[string, SkyCapture]>((layer) =>
  Object.entries(layer.skyCaptures ?? {}),
);
const REGISTRY: Readonly<Record<string, unknown>> = APP_CUBEMAP_CAPTURE_REGISTRY;

describe('APP_CUBEMAP_CAPTURE_REGISTRY', () => {
  it("holds every composed Layer's skyCaptures rows", () => {
    expect(DECLARED.length).toBeGreaterThan(0);
    // Identity, not deep equality: a hand-copied row would drift unseen.
    for (const [key, row] of DECLARED) expect(REGISTRY[key], key).toBe(row);
  });

  it("holds core's rows, after the Layers'", () => {
    for (const [key, row] of Object.entries(CORE_CUBEMAP_CAPTURES)) {
      expect(REGISTRY[key], key).toBe(row);
    }
    expect(Object.keys(REGISTRY)).toEqual([
      ...DECLARED.map(([key]) => key),
      ...Object.keys(CORE_CUBEMAP_CAPTURES),
    ]);
  });

  it('APP_SKY_CAPTURE_KEYS is the sky rows, in table order', () => {
    expect(APP_SKY_CAPTURE_KEYS).toEqual(
      Object.entries(REGISTRY)
        .filter(([, row]) => (row as { kind: string }).kind === 'sky')
        .map(([key]) => key),
    );
  });
});

// Type-level: fails `tsc` if the derived key loosens to take a probe row, or tightens past a sky row.
// @ts-expect-error a probe row is not a sky capture
const _probe: SkyCaptureKey = 'probe';
const _layerRow: SkyCaptureKey = 'sgrAStar';
const _coreRow: SkyCaptureKey = 'solarSystem';
