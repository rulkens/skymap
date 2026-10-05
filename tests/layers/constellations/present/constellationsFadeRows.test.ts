/**
 * constellationsFadeRows — same demand-loaded pattern as filaments/flow: the
 * row seeds at 0 and its fade must stay suppressed until the artifact is
 * uploaded (`hasData()` true).
 */

import { describe, it, expect, vi } from 'vitest';
import { constellationsFadeRows } from '../../../../src/layers/constellations/present/constellationsFadeRows';
import type { ConstellationsRuntime } from '../../../../src/layers/constellations/@types/ConstellationsRuntime';

describe('constellationsFadeRows', () => {
  it('the row guard reads the runtime renderer’s hasData()', () => {
    const hasData = vi.fn<() => boolean>(() => false);
    const runtime = { renderer: { hasData } } as unknown as ConstellationsRuntime;
    const row = constellationsFadeRows(runtime)[0]!;

    expect(row.guard?.(undefined as never, undefined)).toBe(false);
    hasData.mockReturnValue(true);
    expect(row.guard?.(undefined as never, undefined)).toBe(true);
  });
});
