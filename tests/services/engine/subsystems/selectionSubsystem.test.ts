/**
 * selectionSubsystem — unit tests for the hover/select façade.
 *
 * Pure JS — no GPU, no DOM, no async.  Drives the subsystem with
 * synthetic clouds + a structure lookup stub and vi-mocked callbacks.
 *
 * Coverage:
 *   - Dedup: redundant setHovered / setSelected calls fan out only on
 *     real change (selectionEq covers galaxy and structure variants).
 *   - Galaxy variant: setHovered / setSelected resolve through the
 *     cloud + sidecars and fire the callback with a GalaxyInfo.
 *   - Structure variant: setHovered / setSelected resolve through
 *     getStructure and fire the callback with the StructureRecord.
 *   - Cross-kind transitions clear the previous slot correctly.
 *   - prebuiltInfo escape hatch on setSelected (selectByAlias race).
 *   - Cloud-missing / out-of-range galaxy lookups fire onChange(null).
 *   - Focus slot: setFocused is independent of setSelected, dedupes,
 *     and fires onFocusChange (not the selection callbacks).
 *   - Render wake: setSelected/setFocused wake on actual change; no-ops
 *     and setHovered stay wake-free.
 *   - destroy() clears state.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSelectionSubsystem } from '../../../../src/services/engine/subsystems/selectionSubsystem';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { StructureRecord } from '../../../../src/@types/data/structure/StructureRecord';
import { Source } from '../../../../src/data/sources';

type Callbacks = EngineCallbacks & {
  selection: { onHoverChange: ReturnType<typeof vi.fn>; onSelectChange: ReturnType<typeof vi.fn> };
  camera: { onFocusChange: ReturnType<typeof vi.fn> };
};

function makeCallbacks(): Callbacks {
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onHoverChange: vi.fn(), onSelectChange: vi.fn() },
    camera: { onFocusChange: vi.fn() },
  } as unknown as Callbacks;
}

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
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
    sourceCode: 0,
  } as unknown as GalaxyCatalog;
}

const VIRGO: StructureRecord = {
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const FORNAX: StructureRecord = {
  id: 'fornax',
  name: 'Fornax Cluster',
  category: 'cluster',
  worldPos: [0, 10, 0],
  featured: true,
  physicalRadiusMpc: 1.5,
};

function makeSub(
  cb: Callbacks,
  opts: {
    cloud?: GalaxyCatalog;
    structures?: readonly StructureRecord[];
    requestRender?: () => void;
  } = {},
) {
  const structures = opts.structures ?? [];
  return createSelectionSubsystem({
    cb,
    getCloud: () => opts.cloud,
    getFamousMeta: () => [],
    getStructure: (id) => structures.find((s) => s.id === id) ?? null,
    requestRender: opts.requestRender ?? (() => {}),
  });
}

describe('createSelectionSubsystem — galaxy variant', () => {
  it('dedupes setHovered — fires onHoverChange only on real transitions', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10) });

    // null → null is itself a no-op (selectionEq).
    sub.setHovered(null);
    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(0);

    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 1 });
    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 1 }); // dup
    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 2 });
    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(2);
  });

  it('uses prebuiltInfo on setSelected and bypasses the cloud lookup', () => {
    const cb = makeCallbacks();
    // No cloud — would resolve to null without the hint.
    const sub = makeSub(cb);
    const prebuilt = { sentinel: true } as unknown as GalaxyInfo;

    sub.setSelected({ kind: 'galaxy', source: Source.SDSS, localIdx: 5 }, prebuilt);

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(prebuilt);
  });

  it('fires onHoverChange(null) for an out-of-range galaxy localIdx', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(3) });

    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 99 });
    // The callback still fires (the slot changed null → non-null), but
    // the resolved target is null because the cloud lookup rejects.
    expect(cb.selection.onHoverChange).toHaveBeenCalledWith(null);
  });
});

describe('createSelectionSubsystem — structure variant', () => {
  it('resolves structure hover through getStructure and fires onHoverChange(StructureRecord)', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { structures: [VIRGO] });

    sub.setHovered({ kind: 'structure', id: 'virgo' });

    expect(cb.selection.onHoverChange).toHaveBeenCalledWith(VIRGO);
  });

  it('fires onSelectChange(StructureRecord) when a structure is selected', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { structures: [VIRGO] });

    sub.setSelected({ kind: 'structure', id: 'virgo' });

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(VIRGO);
  });

  it('fires onChange(null) for an unknown structure id (deep-link race defense)', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { structures: [VIRGO] });

    sub.setSelected({ kind: 'structure', id: 'ghost-cluster' });

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(null);
  });

  it('dedupes same-structure sets — fires only on real transitions', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { structures: [VIRGO, FORNAX] });

    sub.setSelected({ kind: 'structure', id: 'virgo' });
    sub.setSelected({ kind: 'structure', id: 'virgo' }); // dup
    sub.setSelected({ kind: 'structure', id: 'fornax' });

    expect(cb.selection.onSelectChange).toHaveBeenCalledTimes(2);
  });
});

describe('createSelectionSubsystem — selectedTarget', () => {
  it('returns null when nothing is pinned', () => {
    expect(makeSub(makeCallbacks()).selectedTarget()).toBeNull();
  });

  it('resolves a pinned structure selection to its StructureRecord', () => {
    const sub = makeSub(makeCallbacks(), { structures: [VIRGO] });
    sub.setSelected({ kind: 'structure', id: 'virgo' });
    expect(sub.selectedTarget()).toBe(VIRGO);
  });

  it('resolves a pinned galaxy selection to a GalaxyInfo', () => {
    const sub = makeSub(makeCallbacks(), { cloud: makeCloud(10) });
    sub.setSelected({ kind: 'galaxy', source: Source.SDSS, localIdx: 3 });
    // The dblclick focus reads this — a loaded cloud yields a real target.
    expect(sub.selectedTarget()).not.toBeNull();
  });

  it('returns null for a pinned galaxy whose cloud is not loaded', () => {
    const sub = makeSub(makeCallbacks()); // no cloud
    sub.setSelected({ kind: 'galaxy', source: Source.SDSS, localIdx: 3 });
    // Empty-space behaviour at dblclick: an unresolvable target releases focus.
    expect(sub.selectedTarget()).toBeNull();
  });
});

describe('createSelectionSubsystem — cross-kind transitions', () => {
  it('galaxy → structure selection fires onSelectChange once with the structure', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setSelected({ kind: 'galaxy', source: Source.SDSS, localIdx: 1 }, {
      sentinel: 'galaxy',
    } as unknown as GalaxyInfo);
    sub.setSelected({ kind: 'structure', id: 'virgo' });

    expect(cb.selection.onSelectChange).toHaveBeenLastCalledWith(VIRGO);
  });

  it('structure → galaxy hover fires onHoverChange with the GalaxyInfo path', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(10);
    const sub = makeSub(cb, { cloud, structures: [VIRGO] });

    sub.setHovered({ kind: 'structure', id: 'virgo' });
    expect(cb.selection.onHoverChange).toHaveBeenLastCalledWith(VIRGO);

    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 1 });
    // Galaxy variant resolves through the cloud → non-null GalaxyInfo
    // (we don't assert on its fields here — buildGalaxyInfo has its
    // own coverage).
    const lastCall = cb.selection.onHoverChange.mock.calls.at(-1)![0];
    expect(lastCall).not.toBeNull();
    expect(lastCall).not.toBe(VIRGO);
  });
});

describe('createSelectionSubsystem — focus slot', () => {
  it('setFocused updates focused() independently of selected()', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setFocused({ kind: 'structure', id: 'virgo' });
    expect(sub.focused()).toEqual({ kind: 'structure', id: 'virgo' });
    // Focus is its own rung — setting it does not pin the selection.
    expect(sub.selected()).toBeNull();
  });

  it('deselecting (setSelected null) leaves the focus slot intact', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setFocused({ kind: 'structure', id: 'virgo' });
    sub.setSelected({ kind: 'structure', id: 'virgo' });
    sub.setSelected(null); // deselect — must NOT drop the fade's focus

    expect(sub.selected()).toBeNull();
    expect(sub.focused()).toEqual({ kind: 'structure', id: 'virgo' });
  });

  it('setFocused fires onFocusChange with the resolved target, not the selection callbacks', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setFocused({ kind: 'structure', id: 'virgo' });

    // Symmetric with setSelected → onSelectChange: setFocused owns the
    // camera focus callback (which React mirrors into the URL hash).
    expect(cb.camera.onFocusChange).toHaveBeenCalledWith(VIRGO);
    expect(cb.selection.onSelectChange).not.toHaveBeenCalled();
    expect(cb.selection.onHoverChange).not.toHaveBeenCalled();
  });

  it('setFocused dedupes — re-focusing the same target fires onFocusChange once', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setFocused({ kind: 'structure', id: 'virgo' });
    sub.setFocused({ kind: 'structure', id: 'virgo' }); // dup — no refire
    expect(cb.camera.onFocusChange).toHaveBeenCalledTimes(1);
  });

  it('setFocused(null) fires onFocusChange(null)', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setFocused({ kind: 'structure', id: 'virgo' });
    sub.setFocused(null);
    expect(cb.camera.onFocusChange).toHaveBeenLastCalledWith(null);
  });

  it('setFocused(null) collapses focus', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setFocused({ kind: 'structure', id: 'virgo' });
    sub.setFocused(null);
    expect(sub.focused()).toBeNull();
  });
});

describe('createSelectionSubsystem — render wake', () => {
  it('setSelected wakes the scheduler on actual change', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { structures: [VIRGO], requestRender });

    sub.setSelected({ kind: 'structure', id: 'virgo' });

    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('setSelected does not wake when the selection is unchanged', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { structures: [VIRGO], requestRender });

    sub.setSelected({ kind: 'structure', id: 'virgo' });
    sub.setSelected({ kind: 'structure', id: 'virgo' }); // dup — dedupe guard fires

    // Only the first set is an actual change; the second is a no-op.
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('setFocused wakes on change and not on no-op', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { structures: [VIRGO], requestRender });

    sub.setFocused({ kind: 'structure', id: 'virgo' });
    sub.setFocused({ kind: 'structure', id: 'virgo' }); // dup — no extra wake

    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('setHovered never wakes the scheduler', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { structures: [VIRGO], requestRender });

    // Several distinct hover transitions — none should wake.
    sub.setHovered({ kind: 'structure', id: 'virgo' });
    sub.setHovered(null);
    sub.setHovered({ kind: 'structure', id: 'virgo' });

    expect(requestRender).not.toHaveBeenCalled();
  });
});

describe('createSelectionSubsystem — lifecycle', () => {
  it('destroy() clears internal state', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), structures: [VIRGO] });

    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 1 });
    sub.setSelected({ kind: 'structure', id: 'virgo' });
    sub.setFocused({ kind: 'structure', id: 'virgo' });
    expect(sub.hovered()).not.toBeNull();
    expect(sub.selected()).not.toBeNull();
    expect(sub.focused()).not.toBeNull();

    sub.destroy();

    expect(sub.hovered()).toBeNull();
    expect(sub.selected()).toBeNull();
    expect(sub.focused()).toBeNull();
  });
});
