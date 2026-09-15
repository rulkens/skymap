/**
 * buildExtraSpecs — port of the spike's `applyExtras` method
 * (`Galaxy Renderer.dc.html:560-569`): the multi-galaxy perf-test scatter.
 */
import { describe, expect, it } from 'vitest';
import { buildExtraSpecs } from '../../../../tools/galaxy-renderer/src/data/buildExtraSpecs';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';

describe('buildExtraSpecs', () => {
  it('is deterministic under a seeded rng', () => {
    const a = buildExtraSpecs(20, mulberry32(123));
    const b = buildExtraSpecs(20, mulberry32(123));
    expect(a).toEqual(b);
  });
});
