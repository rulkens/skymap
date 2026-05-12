/**
 * biasCorrectionSubsystem — unit tests for the closure-returning facade
 * that owns Malmquist-bias mode flags, cached ratios/weights per source,
 * the async bake state machine, and the worker-runner registry.
 *
 * Coverage focus (per the spec's *Race behaviour — preserve exactly*
 * section, R1 mitigation):
 *
 *   1. fast_toggle_race            — three setMode calls; stale bake's
 *                                    splice is dropped.
 *   2. mid_bake_upload_race        — onSourceUploaded mid-bake fires a
 *                                    per-source bake, not a re-bake-all.
 *   3. multi_source_completion_ordering — each source's splice fires
 *                                    in resolution order; one
 *                                    requestRender at the end.
 *   4. attach_before_setMode       — setMode before attachRenderer:
 *                                    bake runs, splice happens at
 *                                    attach time.
 *   5. attach_after_setMode_completes — bake resolves before attach;
 *                                    cached results splice on attach.
 *
 * Stub renderer captures every spliceSchechterRatios / spliceAngular-
 * Weights / clearBiasOverlays / setBiasUploadCallback /
 * setBiasUnloadCallback call.  Stub runners use Promise constructors
 * so tests drive arbitrary completion ordering.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBiasCorrectionSubsystem } from '../../../../src/services/engine/subsystems/biasCorrectionSubsystem';
import { BiasMode } from '../../../../src/data/biasMode';
import { Source } from '../../../../src/data/sources';
import type { PointCloud } from '../../../../src/@types/data/PointCloud';
import type { PointRenderer } from '../../../../src/@types/rendering/PointRenderer';

type SpliceCall =
  | { kind: 'schechter'; source: Source; data: Float32Array }
  | { kind: 'angular'; source: Source; data: Float32Array }
  | { kind: 'clear'; source: Source | undefined };

type StubRenderer = {
  renderer: PointRenderer;
  calls: SpliceCall[];
  /** Read the most-recently-installed upload callback (post-attachRenderer). */
  getUploadCb(): ((source: Source, cloud: PointCloud) => void) | null;
  /** Read the most-recently-installed unload callback (post-attachRenderer). */
  getUnloadCb(): ((source: Source) => void) | null;
};

/**
 * Build a stub renderer that captures every method call the subsystem
 * makes against it.  Mirrors the subset of the PointRenderer surface
 * the subsystem actually uses (5 methods).
 */
function makeStubRenderer(): StubRenderer {
  const calls: SpliceCall[] = [];
  let uploadCb: ((source: Source, cloud: PointCloud) => void) | null = null;
  let unloadCb: ((source: Source) => void) | null = null;
  const stub = {
    spliceSchechterRatios: (source: Source, data: Float32Array) => {
      calls.push({ kind: 'schechter', source, data });
    },
    spliceAngularWeights: (source: Source, data: Float32Array) => {
      calls.push({ kind: 'angular', source, data });
    },
    clearBiasOverlays: (source?: Source) => {
      calls.push({ kind: 'clear', source });
    },
    setBiasUploadCallback: (cb: ((source: Source, cloud: PointCloud) => void) | null) => {
      uploadCb = cb;
    },
    setBiasUnloadCallback: (cb: ((source: Source) => void) | null) => {
      unloadCb = cb;
    },
  };
  return {
    renderer: stub as unknown as PointRenderer,
    calls,
    getUploadCb: () => uploadCb,
    getUnloadCb: () => unloadCb,
  };
}

function makeCloud(count: number): PointCloud {
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
  } as unknown as PointCloud;
}

/**
 * Build the three narrow deps the subsystem now consumes (Task 4 of
 * the lean-engine-cleanup refactor):
 *
 *   - `getMode`         — live BiasMode accessor (mutable via the
 *                         returned `setMode` setter, so tests can flip
 *                         the user-facing mode between calls without
 *                         re-creating the subsystem).
 *   - `getLoadedClouds` — closure over the test-owned `clouds` Map,
 *                         which tests mutate in place to simulate
 *                         tier swaps / per-source uploads.
 *   - `requestRender`   — `vi.fn()` so call-count assertions in the
 *                         multi-source-completion-ordering test work
 *                         identically to the old `scheduler.requestRender`.
 *
 * Returned alongside the deps: handles to inspect / mutate from inside
 * each test (the `requestRender` spy and a `setMode` setter on the
 * mode mirror).
 */
function makeDeps(clouds: Map<Source, PointCloud>) {
  let currentMode: BiasMode = BiasMode.None;
  const requestRender = vi.fn();
  return {
    deps: {
      getMode: () => currentMode,
      getLoadedClouds: () => clouds,
      requestRender,
    },
    requestRender,
    setMode: (m: BiasMode) => {
      currentMode = m;
    },
  };
}

describe('createBiasCorrectionSubsystem', () => {
  it('setMode(None) on a no-source state resolves cleanly with a clearBiasOverlays call', async () => {
    const stub = makeStubRenderer();
    const { deps } = makeDeps(new Map());
    const sub = createBiasCorrectionSubsystem(deps);
    sub.attachRenderer(stub.renderer);

    await sub.setMode(BiasMode.None);
    expect(stub.calls.filter((c) => c.kind === 'clear').length).toBe(1);
  });

  it('setMode(Schechter) fires per-source bake for every loaded source and splices ratios', async () => {
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([
      [Source.SDSS, makeCloud(3)],
      [Source.Glade, makeCloud(5)],
    ]);
    const { deps } = makeDeps(clouds);
    const callsLog: { source: Source }[] = [];
    const schechterRunner = vi.fn(async (input: { source: Source; cloud: PointCloud }) => {
      callsLog.push({ source: input.source });
      return new Float32Array(input.cloud.count);
    });

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });
    sub.attachRenderer(stub.renderer);

    await sub.setMode(BiasMode.Schechter);
    expect(callsLog.length).toBe(2);
    const splices = stub.calls.filter((c) => c.kind === 'schechter');
    expect(splices.length).toBe(2);
  });

  it('fast_toggle_race — None → Schechter → None drops the stale Schechter splice', async () => {
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([[Source.SDSS, makeCloud(3)]]);
    const { deps } = makeDeps(clouds);
    // Hold the Schechter bake open via an external resolver.
    let resolveBake: (v: Float32Array) => void = () => {};
    const schechterRunner = vi.fn(
      () =>
        new Promise<Float32Array>((res) => {
          resolveBake = res;
        }),
    );

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });
    sub.attachRenderer(stub.renderer);

    // 1. setMode(None) — synchronously clears.
    await sub.setMode(BiasMode.None);
    // 2. setMode(Schechter) — kicks off the bake (held).
    const schechterPromise = sub.setMode(BiasMode.Schechter);
    // 3. setMode(None) before the bake resolves — bumps generation.
    await sub.setMode(BiasMode.None);
    // 4. Resolve the held bake with a marker payload.
    resolveBake(new Float32Array([1, 2, 3]));
    await schechterPromise;

    // Assert: NO spliceSchechterRatios call — the stale bake's result was dropped.
    const spliceCalls = stub.calls.filter((c) => c.kind === 'schechter');
    expect(spliceCalls.length).toBe(0);
  });

  it('mid_bake_upload_race — onSourceUploaded mid-bake fires a per-source bake', async () => {
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([
      [Source.SDSS, makeCloud(3)],
      [Source.Famous, makeCloud(2)],
    ]);
    const { deps } = makeDeps(clouds);
    const bakedSources: Source[] = [];
    const schechterRunner = vi.fn(async (input: { source: Source; cloud: PointCloud }) => {
      bakedSources.push(input.source);
      // Yield once so the test can fire onSourceUploaded mid-bake.
      await Promise.resolve();
      return new Float32Array(input.cloud.count);
    });

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });
    sub.attachRenderer(stub.renderer);

    // Start the multi-source bake (don't await yet).
    const setModePromise = sub.setMode(BiasMode.Schechter);

    // Fire a fresh-source upload mid-bake.
    const newCloud = makeCloud(7);
    clouds.set(Source.Glade, newCloud);
    sub.onSourceUploaded(Source.Glade, newCloud);

    await setModePromise;
    // Yield to let the per-source GLADE bake complete.
    await new Promise((r) => setTimeout(r, 0));

    // Original bake covers SDSS + Famous; mid-bake upload adds GLADE.
    expect(bakedSources.includes(Source.Glade)).toBe(true);
    // No re-bake-all: SDSS and Famous each appear exactly once.
    expect(bakedSources.filter((s) => s === Source.SDSS).length).toBe(1);
    expect(bakedSources.filter((s) => s === Source.Famous).length).toBe(1);
  });

  it('multi_source_completion_ordering — splice fires in resolution order; one requestRender at end', async () => {
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([
      [Source.SDSS, makeCloud(3)],
      [Source.TwoMRS, makeCloud(2)],
      [Source.Glade, makeCloud(5)],
    ]);
    const { deps, requestRender } = makeDeps(clouds);
    // Per-source resolvers so we control completion order.
    const resolvers = new Map<Source, (v: Float32Array) => void>();
    const schechterRunner = vi.fn(
      (input: { source: Source; cloud: PointCloud }) =>
        new Promise<Float32Array>((res) => {
          resolvers.set(input.source, (v) => res(v));
        }),
    );

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });
    sub.attachRenderer(stub.renderer);

    const setModePromise = sub.setMode(BiasMode.Schechter);

    // Resolve in REVERSE order: Glade → TwoMRS → SDSS.  Yield between
    // resolves so the subsystem's then-callbacks (which fire the splice)
    // run synchronously in the resolution order before the next one
    // settles.
    resolvers.get(Source.Glade)!(new Float32Array([10, 11, 12, 13, 14]));
    await new Promise((r) => setTimeout(r, 0));
    resolvers.get(Source.TwoMRS)!(new Float32Array([20, 21]));
    await new Promise((r) => setTimeout(r, 0));
    resolvers.get(Source.SDSS)!(new Float32Array([30, 31, 32]));
    await setModePromise;

    const splices = stub.calls.filter((c) => c.kind === 'schechter');
    expect(splices.map((s) => s.source)).toEqual([Source.Glade, Source.TwoMRS, Source.SDSS]);
    // Exactly one requestRender call after all three splices.
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('attach_before_setMode — setMode without attachRenderer; splice fires at attach time', async () => {
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([[Source.SDSS, makeCloud(3)]]);
    const { deps } = makeDeps(clouds);
    const schechterRunner = vi.fn(
      async (input: { source: Source; cloud: PointCloud }) => new Float32Array(input.cloud.count),
    );

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });

    // setMode WITHOUT attachRenderer — bake should run; splice deferred.
    await sub.setMode(BiasMode.Schechter);
    expect(stub.calls.length).toBe(0);

    // attachRenderer fires the deferred splices.
    sub.attachRenderer(stub.renderer);
    const splices = stub.calls.filter((c) => c.kind === 'schechter');
    expect(splices.length).toBe(1);
    expect(splices[0]!.source).toBe(Source.SDSS);
  });

  it('attach_after_setMode_completes — bake resolves before attach; cached results splice on attach', async () => {
    // Same shape as attach_before_setMode but with explicit ordering:
    // bake completes BEFORE attachRenderer is called.  (The previous
    // test already exercises this via `await sub.setMode(...)`, but
    // making the assertion explicit guards against future refactors
    // that might short-circuit the cache when no renderer is wired.)
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([
      [Source.SDSS, makeCloud(2)],
      [Source.Glade, makeCloud(3)],
    ]);
    const { deps } = makeDeps(clouds);
    const schechterRunner = vi.fn(
      async (input: { source: Source; cloud: PointCloud }) => new Float32Array(input.cloud.count),
    );

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });
    await sub.setMode(BiasMode.Schechter);
    // Subsystem state should now show two cached entries.
    expect(sub.state().sourcesWithSchechter.length).toBe(2);
    // No splice yet — no renderer.
    expect(stub.calls.filter((c) => c.kind === 'schechter').length).toBe(0);

    // Attach: cached results splice immediately.
    sub.attachRenderer(stub.renderer);
    expect(stub.calls.filter((c) => c.kind === 'schechter').length).toBe(2);
  });

  it('onSourceUnloaded — drops cached ratios + weights for that source', async () => {
    const stub = makeStubRenderer();
    const clouds = new Map<Source, PointCloud>([[Source.SDSS, makeCloud(3)]]);
    const { deps } = makeDeps(clouds);
    const schechterRunner = vi.fn(
      async (input: { source: Source; cloud: PointCloud }) => new Float32Array(input.cloud.count),
    );

    const sub = createBiasCorrectionSubsystem({ ...deps, schechterRunner });
    sub.attachRenderer(stub.renderer);
    await sub.setMode(BiasMode.Schechter);
    expect(sub.state().sourcesWithSchechter).toContain(Source.SDSS);

    sub.onSourceUnloaded(Source.SDSS);
    expect(sub.state().sourcesWithSchechter).not.toContain(Source.SDSS);
  });

  it('attachRenderer wires the upload/unload callbacks on the renderer', () => {
    const stub = makeStubRenderer();
    const { deps } = makeDeps(new Map());
    const sub = createBiasCorrectionSubsystem(deps);

    expect(stub.getUploadCb()).toBeNull();
    expect(stub.getUnloadCb()).toBeNull();

    sub.attachRenderer(stub.renderer);

    expect(typeof stub.getUploadCb()).toBe('function');
    expect(typeof stub.getUnloadCb()).toBe('function');
  });
});
