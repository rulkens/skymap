/**
 * biasCorrectionSubsystem — the Malmquist-bias bake state machine: per-source
 * ratios/weights baked in a worker, cached, and spliced into the renderer's
 * vertex buffers. A generation counter drops a bake that a newer `setMode`
 * superseded (the fast-toggle race). Coupling is one-way — the renderer knows
 * nothing of this subsystem; the subsystem reaches in through its setters.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import { BiasMode } from '../../../data/galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../../../@types/data/galaxyCatalog/BiasMode';
import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import type { ComputeSchechterRatiosInput } from '../../../@types/engine/ComputeSchechterRatiosInput';
import type { ComputeAngularWeightsInput } from '../../../@types/engine/ComputeAngularWeightsInput';
import type { SchechterRunner } from '../../../@types/engine/subsystems/SchechterRunner';
import type { AngularRunner } from '../../../@types/engine/subsystems/AngularRunner';
import type { BiasCorrectionSubsystem } from '../../../@types/engine/subsystems/BiasCorrectionSubsystem';
import type { BiasCorrectionDeps } from '../../../@types/engine/subsystems/BiasCorrectionDeps';
import type { GalaxyPointRenderer } from '../../../@types/rendering/GalaxyPointRenderer';
import type { SourceType } from '../../../@types/data/SourceType';

// The `?worker` suffix is Vite-only and does not resolve in a Node test
// environment: tests inject synchronous runners through the factory's
// `schechterRunner` / `angularRunner` rather than importing these defaults.
import ComputeSchechterRatiosWorker from './bake/computeSchechterRatios.worker?worker';
import ComputeAngularWeightsWorker from './bake/computeAngularWeights.worker?worker';
import { cloneGalaxyCatalogForTransfer } from '../../../data/galaxyCatalog/galaxyCatalogTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';

/**
 * One worker per call: parallel catalog fetches bake in unpredictable order, and
 * a per-call worker needs no internal queue — spawn (a few ms) is noise against
 * a 1-2 s bake. `slice(0)` before transferring because the engine keeps reading
 * the original cloud for picker/InfoCard rows, so its buffers cannot be detached
 * in place (~50 ms memcpy, versus a multi-second clone with no transfer list).
 */
function defaultSchechterRunner(input: ComputeSchechterRatiosInput): Promise<Float32Array> {
  const { copy, transfer } = cloneGalaxyCatalogForTransfer(input.cloud);
  return runDisposableWorker<ComputeSchechterRatiosInput, Float32Array>(
    ComputeSchechterRatiosWorker,
    { ...input, cloud: copy },
    transfer,
    'schechter-ratio',
  );
}

/**
 * Mirror of `defaultSchechterRunner`. This bake is three linear passes plus a
 * per-shell median sort, ~100-300 ms at full deck — still worth a worker, since
 * dropping a frame on a mode toggle feels sluggish.
 */
function defaultAngularRunner(input: ComputeAngularWeightsInput): Promise<Float32Array> {
  const { copy, transfer } = cloneGalaxyCatalogForTransfer(input.cloud);
  return runDisposableWorker<ComputeAngularWeightsInput, Float32Array>(
    ComputeAngularWeightsWorker,
    { ...input, cloud: copy },
    transfer,
    'angular-weights',
  );
}

export function createBiasCorrectionSubsystem(deps: BiasCorrectionDeps): BiasCorrectionSubsystem {
  const { renderer, getMode, getLoadedClouds, requestRender } = deps;
  const schechterRunner: SchechterRunner = deps.schechterRunner ?? defaultSchechterRunner;
  const angularRunner: AngularRunner = deps.angularRunner ?? defaultAngularRunner;

  // `mode` initialises from the live setting at first READ, so the mirror
  // starts in sync without a construction-time read of the store.
  let mode: BiasModeT | null = null;
  const cachedSchechter = new Map<SourceType, Float32Array>();
  const cachedAngular = new Map<SourceType, Float32Array>();
  // Captured by each bake at start, compared on resolve: the fast-toggle race
  // fix, the same shape as AssetSlot's tier-swap counter.
  let generation = 0;

  function currentMode(): BiasModeT {
    if (mode === null) {
      mode = getMode();
    }
    return mode;
  }

  function loadedSourceCatalogPairs(): { source: SourceType; catalog: GalaxyCatalog }[] {
    const out: { source: SourceType; catalog: GalaxyCatalog }[] = [];
    const catalogs = getLoadedClouds();
    for (const source of GALAXY_CATALOG_SOURCES) {
      const catalog = catalogs.get(source);
      if (catalog && catalog.count > 0) {
        out.push({ source, catalog });
      }
    }
    return out;
  }

  async function bakeSchechterFor(
    source: SourceType,
    cloud: GalaxyCatalog,
    myGen: number,
  ): Promise<void> {
    const ratios = await schechterRunner({ cloud, source });
    if (myGen !== generation) return; // stale — superseded by a newer setMode
    cachedSchechter.set(source, ratios);
    // The wake belongs at the splice site, not after the bakes: the loop may
    // have gone to sleep while the bake ran, and this covers BOTH callers —
    // setMode and the onSourceUploaded re-bake, whose stranded splice was the
    // AngularReweight-on-boot "galaxies dim on first mouse move" strand.
    renderer.spliceSchechterRatios(source, ratios);
    requestRender();
  }

  async function bakeAngularFor(
    source: SourceType,
    cloud: GalaxyCatalog,
    myGen: number,
  ): Promise<void> {
    const weights = await angularRunner({ cloud, source });
    if (myGen !== generation) return;
    cachedAngular.set(source, weights);
    // See bakeSchechterFor for why the wake sits at the splice site.
    renderer.spliceAngularWeights(source, weights);
    requestRender();
  }

  async function setMode(next: BiasModeT): Promise<void> {
    generation += 1;
    const myGen = generation;
    mode = next;
    // Entry wake — flips the shader's mode gate next frame, and the only wake
    // an identity mode needs.
    requestRender();

    if (next === BiasMode.None || next === BiasMode.VolumeLimited || next === BiasMode.VMax) {
      // The shader's gate ignores the per-galaxy slot in these modes; clearing
      // it leaves 0.0 to read as "not active" in a debug overlay.
      renderer.clearBiasOverlays();
      return;
    }

    const pairs = loadedSourceCatalogPairs();

    if (next === BiasMode.Schechter) {
      // Per-source independence: each bake splices as it resolves, and wakes
      // the loop itself — a trailing wake here would be redundant.
      await Promise.all(
        pairs.map(({ source, catalog }) => bakeSchechterFor(source, catalog, myGen)),
      );
      return;
    }

    if (next === BiasMode.AngularReweight) {
      await Promise.all(pairs.map(({ source, catalog }) => bakeAngularFor(source, catalog, myGen)));
      return;
    }
  }

  function onSourceUploaded(source: SourceType, cloud: GalaxyCatalog): void {
    cachedSchechter.delete(source);
    cachedAngular.delete(source);

    // One source re-bakes, not all of them: a setMode Promise.all already in
    // flight is independent and keeps resolving (mid_bake_upload_race).
    const myGen = generation;
    const m = currentMode();
    if (m === BiasMode.Schechter) {
      void bakeSchechterFor(source, cloud, myGen);
    } else if (m === BiasMode.AngularReweight) {
      void bakeAngularFor(source, cloud, myGen);
    }
  }

  function onSourceUnloaded(source: SourceType): void {
    cachedSchechter.delete(source);
    cachedAngular.delete(source);
  }

  // How the renderer notifies us mid-mode that a source arrived or left.
  renderer.setBiasUploadCallback((source, cloud) => onSourceUploaded(source, cloud));
  renderer.setBiasUnloadCallback((source) => onSourceUnloaded(source));

  // A `const` so the `satisfies Destroyable` latch below can hold: teardown
  // iterates the subsystem bag uniformly.
  const subsystem: BiasCorrectionSubsystem = {
    setMode,
    onSourceUploaded,
    onSourceUnloaded,
    state: () => ({
      mode: currentMode(),
      sourcesWithSchechter: Array.from(cachedSchechter.keys()),
      sourcesWithAngular: Array.from(cachedAngular.keys()),
    }),
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
