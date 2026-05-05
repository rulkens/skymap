/**
 * Tests for loadProgressAggregator — the per-source → aggregated snapshot
 * collator used by the loading bar.
 *
 * The contract under test:
 *   - `null` snapshot when nothing's in flight (so the bar can fade out).
 *   - Non-null snapshot whose loaded/total are sums across in-flight sources.
 *   - Idempotent transitions (start/finish twice = single effect).
 *   - Late `update` after `finish` is dropped silently.
 *   - `total` ratchets upward (server reports 0 then a real number).
 */

import { describe, expect, it, vi } from 'vitest';
import { createLoadProgressAggregator } from '../../../src/services/engine/loadProgressAggregator';
import { Source } from '../../../src/data/sources';
import type { LoadProgressState } from '../../../src/@types/EngineCallbacks';

describe('createLoadProgressAggregator', () => {
  it('emits null when no source has started', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);
    expect(agg.snapshot()).toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits a snapshot when a source starts', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);

    agg.start(Source.SDSS, 1000);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![0]).toEqual({
      loadedBytes: 0,
      totalBytes: 1000,
      inFlightCount: 1,
    });
  });

  it('sums loaded + total across multiple in-flight sources', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);

    agg.start(Source.SDSS, 1000);
    agg.start(Source.Glade, 5000);
    agg.update(Source.SDSS, 500, 1000);
    agg.update(Source.Glade, 2500, 5000);

    expect(agg.snapshot()).toEqual({
      loadedBytes: 3000, // 500 + 2500
      totalBytes: 6000, // 1000 + 5000
      inFlightCount: 2,
    });
  });

  it('removes a source on finish and falls back to null when last finishes', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);

    agg.start(Source.SDSS, 1000);
    agg.start(Source.Glade, 5000);
    agg.finish(Source.SDSS);

    expect(agg.snapshot()).toEqual({
      loadedBytes: 0,
      totalBytes: 5000,
      inFlightCount: 1,
    });

    agg.finish(Source.Glade);

    expect(agg.snapshot()).toBeNull();
    // The last call to emit was with null.
    expect(emit.mock.calls.at(-1)![0]).toBeNull();
  });

  it('is idempotent on duplicate finish', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);

    agg.start(Source.SDSS, 1000);
    const callsBefore = emit.mock.calls.length;
    agg.finish(Source.SDSS);
    agg.finish(Source.SDSS); // second call: no-op

    // Two emits for [start, finish]; the second finish doesn't add a third.
    expect(emit.mock.calls.length - callsBefore).toBe(1);
  });

  it('drops update events for sources that have already finished', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);

    agg.start(Source.SDSS, 1000);
    agg.finish(Source.SDSS);
    const callsBefore = emit.mock.calls.length;
    agg.update(Source.SDSS, 500, 1000); // late event — silently dropped

    expect(emit.mock.calls.length).toBe(callsBefore);
    expect(agg.snapshot()).toBeNull();
  });

  it('ratchets total upward when the server revises it later', () => {
    // Edge case: server's initial Content-Length header was missing (total=0)
    // but a later chunk arrives with the real total embedded.  The
    // aggregator's denominator should grow, not shrink — otherwise the bar
    // would visually jump backward.
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const agg = createLoadProgressAggregator(emit);

    agg.start(Source.SDSS, 0);
    agg.update(Source.SDSS, 1000, 0);
    agg.update(Source.SDSS, 2000, 5000); // total becomes known

    expect(agg.snapshot()).toEqual({
      loadedBytes: 2000,
      totalBytes: 5000,
      inFlightCount: 1,
    });

    // A later event with a smaller total must NOT shrink the denominator.
    agg.update(Source.SDSS, 3000, 1000);
    expect(agg.snapshot()!.totalBytes).toBe(5000);
  });
});
