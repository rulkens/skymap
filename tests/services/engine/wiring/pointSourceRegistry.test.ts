/**
 * pointSourceRegistry — unit tests for the point-source slot wiring helper.
 *
 * The 5 point-source slots (SDSS, 2MRS, GLADE, Famous, Synthetic) all
 * share one slot construction shape: name = `${sourceName}-points`,
 * upload-on-commit, requestRender + `onCloudReady` echo on the `ready`
 * transition.  Pre-Phase-4 the body lived inline as a single 60-line
 * loop in `engine.ts`'s bootstrap IIFE.  Phase 4 lifts the per-source
 * variance into a declarative `POINT_SOURCE_REGISTRY` and reduces the
 * loop to one helper call per source.
 *
 * These tests verify the helper's contract without spinning up the full
 * engine:
 *   - each `wirePointSourceSlot` call mints a slot, subscribes to it,
 *     and stores it in `state.assetSlots.points` keyed by `Source`;
 *   - the subscriber fires `cb.onCloudReady(source, count)` and
 *     `requestRender()` on the `ready` transition, and is silent on
 *     the loading / committing / error transitions;
 *   - the commit step routes through the shared
 *     `commitPointCloudToRenderer` helper (uploads to the renderer,
 *     mutates `state.sources.clouds`);
 *   - multiple sources wired in succession produce independent slots
 *     keyed correctly — no cross-talk between SDSS and GLADE;
 *   - `POINT_SOURCE_REGISTRY` declares exactly the 5 expected sources
 *     in the same Source enum order the engine has used since Spec A.
 *
 * We intentionally do NOT exercise the AssetSlot's full retry-policy or
 * race-checking — `AssetSlot.test.ts` and the slot's own suite cover
 * that.  This suite is about the *plumbing* between the registry, the
 * helper, and `state.assetSlots.points`.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  POINT_SOURCE_REGISTRY,
  wirePointSourceSlot,
  type PointSourceConfig,
  type WirePointSourceDeps,
} from '../../../../src/services/engine/wiring/pointSourceRegistry';
import { Source } from '../../../../src/data/sources';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { PointCloud } from '../../../../src/@types/data/PointCloud';

/**
 * Minimal-shape fixture for the `EngineState` slices the helper reads
 * and writes: `gpu.renderer` (the upload target), `sources.clouds`
 * (mutated on commit), `subsystems.scheduler.requestRender` (woken on
 * ready), and the `assetSlots.points` Map (where the helper stores the
 * minted slot).  Casting through `unknown` keeps the test honest — any
 * field the helper reaches for outside this set surfaces as a runtime
 * undefined.
 */
function makeState(opts: {
  rendererUpload: ReturnType<typeof vi.fn>;
  loadedSources?: Iterable<{ source: Source; count: number }>;
}): EngineState {
  const clouds = new Map<Source, PointCloud>();
  return {
    gpu: {
      renderer: {
        upload: opts.rendererUpload,
        loadedSources: () => opts.loadedSources ?? [],
        totalCount: () => 0,
      },
    },
    sources: {
      clouds,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
    },
    assetSlots: {
      points: new Map(),
    },
  } as unknown as EngineState;
}

/**
 * Build a tiny `PointCloud`-shaped fixture.  Only `count` is read by
 * the subscriber's `onCloudReady` echo and by the upload log line.
 */
function fakeCloud(count: number): PointCloud {
  return { count } as unknown as PointCloud;
}

describe('POINT_SOURCE_REGISTRY', () => {
  it('declares exactly the 5 expected sources in Source enum order', () => {
    const sources = POINT_SOURCE_REGISTRY.map((c) => c.source);
    expect(sources).toEqual([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Famous,
      Source.Synthetic,
    ]);
  });

  it('uses the shared pointCloudFetcher for the four real surveys and the dedicated synthetic fetcher for Synthetic', () => {
    // We don't import the fetchers here to avoid coupling to their
    // implementation — but we can verify the structural invariant
    // "Synthetic's fetcher is not the same reference as the other four".
    const real = POINT_SOURCE_REGISTRY.filter((c) => c.source !== Source.Synthetic);
    const synthetic = POINT_SOURCE_REGISTRY.find((c) => c.source === Source.Synthetic);
    expect(synthetic).toBeDefined();
    const realFetchers = new Set(real.map((c) => c.fetcher));
    expect(realFetchers.size).toBe(1); // all four real surveys share one fetcher
    expect(synthetic!.fetcher).not.toBe(real[0]!.fetcher);
  });
});

describe('wirePointSourceSlot', () => {
  function makeDeps(cb: Partial<EngineCallbacks> = {}): WirePointSourceDeps {
    return { cb: cb as EngineCallbacks };
  }

  it('builds a slot and stores it in state.assetSlots.points keyed by Source', () => {
    const state = makeState({ rendererUpload: vi.fn().mockResolvedValue(undefined) });
    const cfg: PointSourceConfig = POINT_SOURCE_REGISTRY.find(
      (c) => c.source === Source.SDSS,
    )!;

    wirePointSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.SDSS);
    expect(slot).toBeDefined();
    expect(slot!.name).toBe('sdss-points');
    expect(slot!.state().kind).toBe('idle');
  });

  it('produces independent slots for each source — no cross-talk', () => {
    const state = makeState({ rendererUpload: vi.fn().mockResolvedValue(undefined) });
    const sdssCfg = POINT_SOURCE_REGISTRY.find((c) => c.source === Source.SDSS)!;
    const gladeCfg = POINT_SOURCE_REGISTRY.find((c) => c.source === Source.Glade)!;

    wirePointSourceSlot(state, sdssCfg, makeDeps());
    wirePointSourceSlot(state, gladeCfg, makeDeps());

    const sdssSlot = state.assetSlots.points.get(Source.SDSS);
    const gladeSlot = state.assetSlots.points.get(Source.Glade);
    expect(sdssSlot).toBeDefined();
    expect(gladeSlot).toBeDefined();
    expect(sdssSlot).not.toBe(gladeSlot);
    expect(sdssSlot!.name).toBe('sdss-points');
    expect(gladeSlot!.name).toBe('glade-points');
  });

  it('subscribes a handler that fires onCloudReady(source, count) and requestRender on the ready transition', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const onCloudReady = vi.fn();
    // Nested-only fire shape (H5 task 11): the registry fires
    // `cb.sources?.onCloudReady?.(...)` on the ready transition.
    const cb: Partial<EngineCallbacks> = { sources: { onCloudReady } };
    // Use a stub fetcher so we control when the slot transitions to ready.
    const cfg: PointSourceConfig = {
      source: Source.SDSS,
      fetcher: async () => fakeCloud(42),
      initialTier: 'medium',
    };

    wirePointSourceSlot(state, cfg, makeDeps(cb));

    const slot = state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    // Drive microtasks so the slot's fetch + commit chain settles.
    // The slot's commit awaits the renderer upload; once that resolves
    // the state transitions to 'ready' and the subscriber fires.
    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(onCloudReady).toHaveBeenCalledOnce();
    expect(onCloudReady).toHaveBeenCalledWith(Source.SDSS, 42);
    // requestRender fires once on the ready transition.
    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalled();
  });

  it("commit uploads the cloud to the renderer and writes it into state.sources.clouds", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const cloud = fakeCloud(7);
    const cfg: PointSourceConfig = {
      source: Source.Glade,
      fetcher: async () => cloud,
      initialTier: 'small',
    };

    wirePointSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.Glade)!;
    slot.load({ source: Source.Glade, tier: 'small' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    // Upload was called with (source, cloud) — the renderer's contract.
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(Source.Glade, cloud);
    // sources.clouds was populated post-upload.
    expect(state.sources.clouds.get(Source.Glade)).toBe(cloud);
  });

  it('skips the upload silently when state.gpu.renderer is null (post-destroy / pre-init race)', async () => {
    const state = makeState({ rendererUpload: vi.fn() });
    // Simulate the renderer having been torn down before commit fires.
    (state.gpu as unknown as { renderer: null }).renderer = null;

    const cfg: PointSourceConfig = {
      source: Source.TwoMRS,
      fetcher: async () => fakeCloud(3),
      initialTier: 'medium',
    };

    wirePointSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.TwoMRS)!;
    slot.load({ source: Source.TwoMRS, tier: 'medium' });

    // The commit body is async but runs to completion even with a null
    // renderer — it just becomes a no-op.  The slot still transitions
    // to 'ready' afterward, which is the contract every other test
    // path here relies on.
    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    // sources.clouds NOT populated — the upload was skipped.
    expect(state.sources.clouds.has(Source.TwoMRS)).toBe(false);
  });
});
