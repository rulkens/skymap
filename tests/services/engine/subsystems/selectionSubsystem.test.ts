/**
 * selectionSubsystem — unit tests for the hover/select façade.
 *
 * Pure JS — no GPU, no DOM, no async.  Drives the subsystem with
 * synthetic clouds + a POI lookup stub and vi-mocked callbacks.
 *
 * Coverage:
 *   - Dedup: redundant setHovered / setSelected calls fan out only on
 *     real change (selectionEq covers both galaxy and POI variants).
 *   - Galaxy variant: setHovered / setSelected resolve through the
 *     cloud + sidecars and fire the callback with a GalaxyInfo.
 *   - POI variant: setHovered / setSelected resolve through getPoi
 *     and fire the callback with the PointOfInterest.
 *   - Cross-kind transitions clear the previous slot correctly.
 *   - prebuiltInfo escape hatch on setSelected (selectByAlias race).
 *   - Cloud-missing / out-of-range galaxy lookups fire onChange(null).
 *   - destroy() clears state.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSelectionSubsystem } from '../../../../src/services/engine/subsystems/selectionSubsystem';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import { Source } from '../../../../src/data/sources';

type Callbacks = EngineCallbacks & {
  selection: { onHoverChange: ReturnType<typeof vi.fn>; onSelectChange: ReturnType<typeof vi.fn> };
};

function makeCallbacks(): Callbacks {
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onHoverChange: vi.fn(), onSelectChange: vi.fn() },
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

const VIRGO: PointOfInterest = {
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const FORNAX: PointOfInterest = {
  id: 'fornax',
  name: 'Fornax Cluster',
  category: 'cluster',
  worldPos: [0, 10, 0],
  featured: true,
  physicalRadiusMpc: 1.5,
};

function makeSub(cb: Callbacks, opts: { cloud?: GalaxyCatalog; pois?: readonly PointOfInterest[] } = {}) {
  const pois = opts.pois ?? [];
  return createSelectionSubsystem({
    cb,
    getCloud: () => opts.cloud,
    getFamousMeta: () => [],
    getPoi: (id) => pois.find((p) => p.id === id) ?? null,
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

describe('createSelectionSubsystem — POI variant', () => {
  it('resolves POI hover through getPoi and fires onHoverChange(PointOfInterest)', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { pois: [VIRGO] });

    sub.setHovered({ kind: 'poi', id: 'virgo' });

    expect(cb.selection.onHoverChange).toHaveBeenCalledWith(VIRGO);
  });

  it('fires onSelectChange(PointOfInterest) when a POI is selected', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { pois: [VIRGO] });

    sub.setSelected({ kind: 'poi', id: 'virgo' });

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(VIRGO);
  });

  it('fires onChange(null) for an unknown POI id (deep-link race defense)', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { pois: [VIRGO] });

    sub.setSelected({ kind: 'poi', id: 'ghost-cluster' });

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(null);
  });

  it('dedupes same-POI sets — fires only on real transitions', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { pois: [VIRGO, FORNAX] });

    sub.setSelected({ kind: 'poi', id: 'virgo' });
    sub.setSelected({ kind: 'poi', id: 'virgo' }); // dup
    sub.setSelected({ kind: 'poi', id: 'fornax' });

    expect(cb.selection.onSelectChange).toHaveBeenCalledTimes(2);
  });
});

describe('createSelectionSubsystem — cross-kind transitions', () => {
  it('galaxy → POI selection fires onSelectChange once with the POI', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), pois: [VIRGO] });

    sub.setSelected(
      { kind: 'galaxy', source: Source.SDSS, localIdx: 1 },
      { sentinel: 'galaxy' } as unknown as GalaxyInfo,
    );
    sub.setSelected({ kind: 'poi', id: 'virgo' });

    expect(cb.selection.onSelectChange).toHaveBeenLastCalledWith(VIRGO);
  });

  it('POI → galaxy hover fires onHoverChange with the GalaxyInfo path', () => {
    const cb = makeCallbacks();
    const cloud = makeCloud(10);
    const sub = makeSub(cb, { cloud, pois: [VIRGO] });

    sub.setHovered({ kind: 'poi', id: 'virgo' });
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

describe('createSelectionSubsystem — lifecycle', () => {
  it('destroy() clears internal state', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb, { cloud: makeCloud(10), pois: [VIRGO] });

    sub.setHovered({ kind: 'galaxy', source: Source.SDSS, localIdx: 1 });
    sub.setSelected({ kind: 'poi', id: 'virgo' });
    expect(sub.hovered()).not.toBeNull();
    expect(sub.selected()).not.toBeNull();

    sub.destroy();

    expect(sub.hovered()).toBeNull();
    expect(sub.selected()).toBeNull();
  });
});
