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
 *   4. `galaxyInfoFor` returns null when the source's cloud isn't loaded.
 *   5. `destroy()` clears the internal state — subsequent reads return
 *      null even if `setHovered`/`setSelected` had been called before.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSelectionSubsystem } from '../../../../src/services/engine/subsystems/selectionSubsystem';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import { Source } from '../../../../src/data/sources';

/**
 * Build a no-op `EngineCallbacks` bag with vi-spied hover/select hooks.
 * Other callback fields are typed-required-only — the subsystem only
 * reads the two we care about, both under the nested `selection`
 * cluster after H5 task 11.
 */
function makeCallbacks(): EngineCallbacks & {
  selection: { onHoverChange: ReturnType<typeof vi.fn>; onSelectChange: ReturnType<typeof vi.fn> };
} {
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: {
      onHoverChange: vi.fn(),
      onSelectChange: vi.fn(),
    },
  } as unknown as EngineCallbacks & {
    selection: {
      onHoverChange: ReturnType<typeof vi.fn>;
      onSelectChange: ReturnType<typeof vi.fn>;
    };
  };
}

/**
 * Minimum-viable `GalaxyCatalog` for the subsystem's bounds-check + the
 * `buildGalaxyInfo` call inside `galaxyInfoFor`.  We supply just enough
 * typed-array slots that buildGalaxyInfo doesn't crash on undefined
 * reads; the resulting `GalaxyInfo` is opaque to these tests — we
 * assert on identity (the prebuilt-info short-circuit) and existence
 * (non-null), not on field values.
 */
function makeCloud(count: number): GalaxyCatalog {
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
  } as unknown as GalaxyCatalog;
}

describe('createSelectionSubsystem', () => {
  it('deduplicates setHovered(null) — fires onHoverChange only once across two no-op calls', () => {
    const cb = makeCallbacks();
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => undefined,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
      getMilliquasNames: () => [],
    });

    // First call from null → null is itself a no-op (selectionEq treats
    // both-null as equal), so the callback never fires at all.  Drive
    // a real change first to bring `hovered` to non-null, then back to
    // null twice — the second null is the dedup target.
    sub.setHovered({ source: Source.SDSS, localIdx: 1 });
    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(1);

    sub.setHovered(null);
    sub.setHovered(null);
    // Total calls: one for the first transition (→ {SDSS, 1}), one for
    // (→ null), then the second null is deduped.
    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(2);
  });

  it('fires onHoverChange twice for two distinct selections', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(10);
    const sub = createSelectionSubsystem({
      cb,
      // Same cloud for any source — the subsystem only cares about
      // count + the buildGalaxyInfo call signature.
      getCloud: () => cloud,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
      getMilliquasNames: () => [],
    });

    sub.setHovered({ source: Source.SDSS, localIdx: 1 });
    sub.setHovered({ source: Source.SDSS, localIdx: 2 });

    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(2);
  });

  it('uses prebuiltInfo on setSelected and bypasses galaxyInfoFor', () => {
    const cb = makeCallbacks();
    // No cloud loaded — galaxyInfoFor would return null.  But the
    // prebuilt info should still surface to onSelectChange.
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => undefined,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
      getMilliquasNames: () => [],
    });

    // Sentinel object — we don't care what's inside, only that the
    // exact reference reaches the callback.
    const prebuilt = { sentinel: true } as unknown as GalaxyInfo;

    sub.setSelected({ source: Source.SDSS, localIdx: 5 }, prebuilt);

    expect(cb.selection.onSelectChange).toHaveBeenCalledTimes(1);
    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(prebuilt);
  });

  it('galaxyInfoFor returns null when the cloud is missing for the source', () => {
    const cb = makeCallbacks();
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => undefined,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
      getMilliquasNames: () => [],
    });

    expect(sub.galaxyInfoFor({ source: Source.SDSS, localIdx: 0 })).toBeNull();
  });

  it('galaxyInfoFor returns null when localIdx is out of range', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(3);
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => cloud,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
      getMilliquasNames: () => [],
    });

    // Negative — invalid.
    expect(sub.galaxyInfoFor({ source: Source.SDSS, localIdx: -1 })).toBeNull();
    // >= count — out of range.
    expect(sub.galaxyInfoFor({ source: Source.SDSS, localIdx: 3 })).toBeNull();
  });

  it('destroy() clears internal state — subsequent reads return null', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(10);
    const sub = createSelectionSubsystem({
      cb,
      getCloud: () => cloud,
      getFamousMeta: () => [],
      getFamousXrefs: () => ({}),
      getMilliquasNames: () => [],
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
