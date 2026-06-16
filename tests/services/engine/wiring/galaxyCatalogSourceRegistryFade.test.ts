/**
 * galaxyCatalogSourceRegistry — fade-orchestration test.
 *
 * Sibling to galaxyCatalogSourceRegistry.test.ts; this file isolates
 * the sequential fade-out / upload / fade-in choreography of the slot's
 * commit step. The tier-swap fade-OUT is a producer-driven mid-commit
 * dissolve and stays hand-coded through `state.subsystems.fades.fadeTo`;
 * the first-load fade-IN routes through the intent → fade bridge
 * (`syncVisibilityFades`).
 *
 * The bridge is mocked to a typed spy so this test asserts the commit's
 * own contract: first load calls the bridge once (after upload, no
 * fade-out); second load fires fadeTo(0, FADE_OUT_DURATION_MS) BEFORE
 * upload, then calls the bridge after. The bridge's per-row fade is
 * covered by syncVisibilityFades.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { FADE_OUT_DURATION_MS } from '../../../../src/services/animation/fadeController';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyCatalogSourceConfig } from '../../../../src/@types/engine/wiring/GalaxyCatalogSourceConfig';

// Mock the bridge: the first-load fade-in routes through it, so a typed spy lets
// us assert the commit's call without standing up the real per-row fade walk.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

import { wireGalaxyCatalogSourceSlot } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';

const bridge = vi.mocked(syncVisibilityFades);

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
      renderer: {
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
  return { cb: {} as EngineCallbacks };
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
    // The fade-in routes through the bridge, scoped to the survey row.
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith(fx.state, { animate: true, only: ['survey'] });
    // The fade-in bridge fires AFTER the renderer upload (commit order).
    expect(fx.upload.mock.invocationCallOrder[0]!).toBeLessThan(
      bridge.mock.invocationCallOrder[bridge.mock.invocationCallOrder.length - 1]!,
    );
  });

  it('second load awaits fadeTo(0, FADE_OUT_DURATION_MS) BEFORE upload, then drives the bridge after', async () => {
    const fx = makeFixture();
    // Pre-seed: pretend a catalog is already loaded for this source.
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
    slot.load({ source: Source.SDSS, tier: 'large' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(fx.upload).toHaveBeenCalledOnce();
    // The tier-swap fade-OUT fires BEFORE upload, unchanged by the bridge routing.
    expect(fx.fadeOutCalls).toEqual([
      { target: 0, duration: FADE_OUT_DURATION_MS, at: 'pre-upload' },
    ]);
    // The fade-in still routes through the bridge after upload.
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith(fx.state, { animate: true, only: ['survey'] });
    // The fade-in bridge fires AFTER the renderer upload (commit order).
    expect(fx.upload.mock.invocationCallOrder[0]!).toBeLessThan(
      bridge.mock.invocationCallOrder[bridge.mock.invocationCallOrder.length - 1]!,
    );
  });
});
