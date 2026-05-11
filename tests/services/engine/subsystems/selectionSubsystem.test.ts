/**
 * selectionSubsystem — unit tests for the hover/select state façade.
 *
 * The subsystem is intentionally pure JS — no GPU, no DOM, no async —
 * so the tests can drive its behaviour with synthetic clouds and
 * vi-mocked callbacks without spinning up an engine.
 *
 * Coverage focus:
 *
 *   1. `setHovered(null)` twice fires `onHoverChange` exactly once
 *      (deduplication via the internal `selectionEq` helper).
 *   2. `setHovered(s1)` followed by `setHovered(s2)` fires twice.
 *   3. `setSelected(sel, prebuiltInfo)` uses the prebuilt info and
 *      bypasses the cloud lookup (the `selectByAlias` race-window
 *      contract).
 *   4. `pointInfoFor` returns null when the source's cloud isn't loaded.
 *   5. `destroy()` clears the internal state — subsequent reads return
 *      null even if `setHovered`/`setSelected` had been called before.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSelectionSubsystem } from '../../../../src/services/engine/subsystems/selectionSubsystem';
import type { EngineCallbacks, PointCloud, PointInfo } from '../../../../src/@types';
import { Source } from '../../../../src/data/sources';

/**
 * Build a no-op `EngineCallbacks` bag with vi-spied hover/select hooks.
 * Other callback fields are typed-required-only — the subsystem only
 * reads the two we care about.
 */
function makeCallbacks(): EngineCallbacks {
  return {
    onStatusChange: vi.fn(),
    onHoverChange: vi.fn(),
    onSelectChange: vi.fn(),
  } as unknown as EngineCallbacks;
}

/**
 * Minimum-viable `PointCloud` for the subsystem's bounds-check + the
 * `buildPointInfo` call inside `pointInfoFor`.  We supply just enough
 * typed-array slots that buildPointInfo doesn't crash on undefined
 * reads; the resulting `PointInfo` is opaque to these tests — we
 * assert on identity (the prebuilt-info short-circuit) and existence
 * (non-null), not on field values.
 */
function makeCloud(count: number): PointCloud {
  const f32 = (n: number) => new Float32Array(n);
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: f32(count * 3),
    magU: f32(count),
    magG: f32(count),
    magR: f32(count),
    magI: f32(count),
    magZ: f32(count),
    diameterKpc: f32(count),
    axisRatio: f32(count),
    positionAngleDeg: f32(count),
    sourceCode: 0,
  } as unknown as PointCloud;
}

describe('createSelectionSubsystem', () => {
  it('deduplicates setHovered(null) — fires onHoverChange only once across two no-op calls', () => {
    const cb = makeCallbacks();
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => undefined,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
    });

    // First call from null → null is itself a no-op (selectionEq treats
    // both-null as equal), so the callback never fires at all.  Drive
    // a real change first to bring `hovered` to non-null, then back to
    // null twice — the second null is the dedup target.
    sub.setHovered({ source: Source.SDSS, localIdx: 1 });
    expect(cb.onHoverChange).toHaveBeenCalledTimes(1);

    sub.setHovered(null);
    sub.setHovered(null);
    // Total calls: one for the first transition (→ {SDSS, 1}), one for
    // (→ null), then the second null is deduped.
    expect(cb.onHoverChange).toHaveBeenCalledTimes(2);
  });

  it('fires onHoverChange twice for two distinct selections', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(10);
    const sub = createSelectionSubsystem({
      cb,
      // Same cloud for any source — the subsystem only cares about
      // count + the buildPointInfo call signature.
      getCloud: () => cloud,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
    });

    sub.setHovered({ source: Source.SDSS, localIdx: 1 });
    sub.setHovered({ source: Source.SDSS, localIdx: 2 });

    expect(cb.onHoverChange).toHaveBeenCalledTimes(2);
  });

  it('uses prebuiltInfo on setSelected and bypasses pointInfoFor', () => {
    const cb = makeCallbacks();
    // No cloud loaded — pointInfoFor would return null.  But the
    // prebuilt info should still surface to onSelectChange.
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => undefined,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
    });

    // Sentinel object — we don't care what's inside, only that the
    // exact reference reaches the callback.
    const prebuilt = { sentinel: true } as unknown as PointInfo;

    sub.setSelected({ source: Source.SDSS, localIdx: 5 }, prebuilt);

    expect(cb.onSelectChange).toHaveBeenCalledTimes(1);
    expect(cb.onSelectChange).toHaveBeenCalledWith(prebuilt);
  });

  it('pointInfoFor returns null when the cloud is missing for the source', () => {
    const cb = makeCallbacks();
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => undefined,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
    });

    expect(sub.pointInfoFor({ source: Source.SDSS, localIdx: 0 })).toBeNull();
  });

  it('pointInfoFor returns null when localIdx is out of range', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(3);
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => cloud,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
    });

    // Negative — invalid.
    expect(sub.pointInfoFor({ source: Source.SDSS, localIdx: -1 })).toBeNull();
    // >= count — out of range.
    expect(sub.pointInfoFor({ source: Source.SDSS, localIdx: 3 })).toBeNull();
  });

  it('destroy() clears internal state — subsequent reads return null', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(10);
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => cloud,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
    });

    sub.setHovered({ source: Source.SDSS, localIdx: 1 });
    sub.setSelected({ source: Source.SDSS, localIdx: 2 });
    expect(sub.hovered()).not.toBeNull();
    expect(sub.selected()).not.toBeNull();

    sub.destroy();

    expect(sub.hovered()).toBeNull();
    expect(sub.selected()).toBeNull();
  });
});
