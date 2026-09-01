import { describe, expect, it } from 'vitest';
import { isPreviewStale } from '../../../../../tools/mcpm-workbench/src/state/view/isPreviewStale';

describe('isPreviewStale', () => {
  it('is never stale when nothing is packed', () => {
    expect(isPreviewStale(null, 0)).toBe(false);
    expect(isPreviewStale(null, 42)).toBe(false);
  });

  it('is fresh while stepCount still matches the packed snapshot', () => {
    expect(isPreviewStale(42, 42)).toBe(false);
  });

  it('is stale once stepCount moves past the packed snapshot', () => {
    expect(isPreviewStale(42, 43)).toBe(true);
  });

  it('is stale on a reset too, not just forward progress', () => {
    expect(isPreviewStale(42, 0)).toBe(true);
  });
});
