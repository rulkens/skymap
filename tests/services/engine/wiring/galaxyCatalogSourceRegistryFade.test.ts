/**
 * galaxyCatalogSourceRegistry — fade-orchestration test.
 *
 * Sibling to galaxyCatalogSourceRegistry.test.ts; this file isolates
 * the sequential fade-out / upload / fade-in choreography that the
 * slot's commit step drives through state.subsystems.fades.
 *
 * Why this lives in its own file: the parent test file stubs `fades`
 * just enough to not crash the wiring call. Here we record every
 * fadeTo invocation in order so we can assert the choreography
 * directly: first load fires only fadeTo(1, FADE_IN_DURATION_MS);
 * second load fires fadeTo(0, FADE_OUT_DURATION_MS) BEFORE upload(),
 * then fadeTo(1, FADE_IN_DURATION_MS) after.
 */

import { describe, it, expect, vi } from 'vitest';
import { wireGalaxyCatalogSourceSlot } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import { Source } from '../../../../src/data/sources';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../../src/services/animation/fadeController';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyCatalogSourceConfig } from '../../../../src/@types/engine/wiring/GalaxyCatalogSourceConfig';

function fakeCloud(count: number): GalaxyCatalog {
  return { count } as unknown as GalaxyCatalog;
}

type FadeCall = { target: number; duration: number; at: 'pre-upload' | 'post-upload' };

function makeFixture() {
  const fadeCalls: FadeCall[] = [];
  let uploadResolved = false;
  const upload = vi.fn(async (_source: Source, _cloud: GalaxyCatalog) => {
    uploadResolved = true;
  });
  const fadeTo = vi.fn(async (_handle: unknown, target: number, duration: number) => {
    fadeCalls.push({
      target,
      duration,
      at: uploadResolved ? 'post-upload' : 'pre-upload',
    });
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
    sources: { catalogs: new Map<Source, GalaxyCatalog>() },
    subsystems: { fades, scheduler: { requestRender: vi.fn() } },
    assetSlots: { points: new Map() },
  } as unknown as EngineState;
  return { state, fades, fadeCalls, upload };
}

function makeDeps() {
  return { cb: {} as EngineCallbacks };
}

describe('wireGalaxyCatalogSourceSlot — fade orchestration', () => {
  it('first load fires fadeTo(1, FADE_IN_DURATION_MS) after upload — no fade-out', async () => {
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
    expect(fx.fadeCalls).toEqual([
      { target: 1, duration: FADE_IN_DURATION_MS, at: 'post-upload' },
    ]);
  });

  it('second load awaits fadeTo(0, FADE_OUT_DURATION_MS) BEFORE upload, then fires fadeTo(1) after', async () => {
    const fx = makeFixture();
    // Pre-seed: pretend a catalog is already loaded for this source.
    fx.state.sources.catalogs.set(Source.SDSS, fakeCloud(99));

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
    expect(fx.fadeCalls).toEqual([
      { target: 0, duration: FADE_OUT_DURATION_MS, at: 'pre-upload' },
      { target: 1, duration: FADE_IN_DURATION_MS, at: 'post-upload' },
    ]);
  });
});
