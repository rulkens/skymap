/**
 * galaxyCatalogSourceRegistry — fade-orchestration test.
 *
 * Sibling to galaxyCatalogSourceRegistry.test.ts; this file isolates
 * the sequential dissolve / upload / fade-in choreography of the slot's
 * commit step. The tier-swap dissolve is a transient pre-replace fade-OUT
 * (via `dissolveCatalogBuffer` → `fades.fadeTo`), fired only when the reload
 * request carries `dissolvePrevious` — an EXPLICIT flag set by `setTier`, not
 * inferred from data-store membership. The fade-IN routes through the SCOPED
 * single-item intent → fade bridge (`syncVisibilityFadeItem`) — driving ONLY
 * the catalog just uploaded, not every survey row, so a concurrent tier-swap
 * reload of another source can't re-drive (and race) this one's fade.
 *
 * The bridge is mocked to a typed spy so this test asserts the commit's
 * own contract: a plain load calls the scoped bridge once (after upload, no
 * dissolve); a `dissolvePrevious` load fires fadeTo(0, FADE_OUT_DURATION_MS)
 * BEFORE upload, then calls the bridge after; and a plain re-commit of an
 * already-loaded source does NOT dissolve (the old `isFirstLoad` proxy would
 * have). The bridge's per-row fade is covered by syncVisibilityFades.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { FADE_OUT_DURATION_MS } from '../../../../src/services/animation/fadeController';
import { syncVisibilityFadeItem } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyCatalogSourceConfig } from '../../../../src/@types/engine/wiring/GalaxyCatalogSourceConfig';

// Mock the bridge: the first-load fade-in routes through the scoped single-item
// entry, so a typed spy lets us assert the commit's call without standing up the
// real per-row fade walk. `syncVisibilityFades` (the batch entry) is kept
// exported too so the module's shape is preserved for any other importer.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
  syncVisibilityFadeItem:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFadeItem
    >(),
}));

import { wireGalaxyCatalogSourceSlot } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';

const bridge = vi.mocked(syncVisibilityFadeItem);

function fakeCloud(count: number): GalaxyCatalog {
  return { count } as unknown as GalaxyCatalog;
}

type FadeOutCall = { target: number; duration: number; at: 'pre-upload' | 'post-upload' };

function makeFixture() {
  const fadeOutCalls: FadeOutCall[] = [];
  let uploadResolved = false;
  const upload = vi.fn(async (_source: SourceType, _cloud: GalaxyCatalog) => {
    uploadResolved = true;
  });
  // Only the tier-swap fade-OUT still calls fades.fadeTo directly; record it.
  const fadeTo = vi.fn(async (_handle: unknown, target: number, duration: number) => {
    fadeOutCalls.push({ target, duration, at: uploadResolved ? 'post-upload' : 'pre-upload' });
  });
  const fades = {
    label: 'fadeRegistry',
    register: vi.fn(),
    unregister: vi.fn(),
    fadeTo,
    setImmediate: vi.fn(),
    opacityOf: vi.fn(() => 1),
    isAnyAnimating: vi.fn(() => false),
    tick: vi.fn(),
    destroy: vi.fn(),
  };
  const state = {
    gpu: {
      galaxyPointRenderer: {
        upload,
        loadedSources: () => [][Symbol.iterator](),
        totalCount: () => 0,
      },
    },
    data: createEngineData(),
    subsystems: { fades, scheduler: { requestRender: vi.fn() } },
    assetSlots: { points: new Map() },
  } as unknown as EngineState;
  return { state, fades, fadeOutCalls, upload };
}

function makeDeps() {
  // commit() dispatches catalogLoaded via cb.store.dispatch; a no-op store keeps
  // these fade-orchestration tests focused on the dissolve/fade path.
  return { cb: { store: { dispatch: vi.fn() } } as unknown as EngineCallbacks };
}

describe('wireGalaxyCatalogSourceSlot — fade orchestration', () => {
  beforeEach(() => bridge.mockClear());

  it('first load drives the fade-in through the bridge after upload — no fade-out', async () => {
    const fx = makeFixture();
    const cloud = fakeCloud(5);
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => cloud,
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(fx.state, cfg, makeDeps());
    const slot = fx.state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(fx.upload).toHaveBeenCalledOnce();
    // No tier-swap fade-out on first load.
    expect(fx.fadeOutCalls).toEqual([]);
    // The fade-in routes through the scoped bridge, applying the survey row's
    // intent to ONLY this catalog (not every survey id).
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith(fx.state, 'survey', galaxyCatalogIdOf(Source.SDSS), {
      animate: true,
    });
    // The fade-in bridge fires AFTER the renderer upload (commit order).
    expect(fx.upload.mock.invocationCallOrder[0]!).toBeLessThan(
      bridge.mock.invocationCallOrder[bridge.mock.invocationCallOrder.length - 1]!,
    );
  });

  it('dissolvePrevious load awaits fadeTo(0, FADE_OUT_DURATION_MS) BEFORE upload, then drives the bridge after', async () => {
    const fx = makeFixture();
    const cloud = fakeCloud(7);
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => cloud,
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(fx.state, cfg, makeDeps());
    const slot = fx.state.assetSlots.points.get(Source.SDSS)!;
    // The EXPLICIT flag is the dissolve trigger — not a pre-seeded data store.
    slot.load({ source: Source.SDSS, tier: 'large', dissolvePrevious: true });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(fx.upload).toHaveBeenCalledOnce();
    // The dissolve fires BEFORE upload.
    expect(fx.fadeOutCalls).toEqual([
      { target: 0, duration: FADE_OUT_DURATION_MS, at: 'pre-upload' },
    ]);
    // The fade-in still routes through the scoped bridge after upload, applying
    // the survey intent to ONLY this catalog.
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith(fx.state, 'survey', galaxyCatalogIdOf(Source.SDSS), {
      animate: true,
    });
    // The fade-in bridge fires AFTER the renderer upload (commit order).
    expect(fx.upload.mock.invocationCallOrder[0]!).toBeLessThan(
      bridge.mock.invocationCallOrder[bridge.mock.invocationCallOrder.length - 1]!,
    );
  });

  it('a plain re-commit of an already-loaded source does NOT dissolve (the leaky isFirstLoad proxy is gone)', async () => {
    const fx = makeFixture();
    // The source is already in the data store — exactly the condition the old
    // `!catalogs.has(source)` proxy read as "tier swap" and dissolved on. With
    // the explicit flag, a plain reload (no `dissolvePrevious`) must NOT dissolve.
    fx.state.data.galaxies.setCatalog(Source.SDSS, fakeCloud(99));

    const cloud = fakeCloud(7);
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => cloud,
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(fx.state, cfg, makeDeps());
    const slot = fx.state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(fx.upload).toHaveBeenCalledOnce();
    // No dissolve — the buffer is replaced straight through, fade-in only.
    expect(fx.fadeOutCalls).toEqual([]);
    expect(bridge).toHaveBeenCalledTimes(1);
  });
});
