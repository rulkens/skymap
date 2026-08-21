/**
 * wireSlots — bootstrap phase 2: the demand-driven asset orchestrator.
 *
 * Mints every asset slot the engine has and then lets the demand loop decide
 * what actually loads:
 *
 *   1. `buildSlotsFromRegistry` — construct every non-external slot from
 *      `ASSET_WIRING` (sidecars: filaments, famous-galaxies-meta, cluster catalog,
 *      PGC alias, CF-4 + MCPM volumes). Pure: no state writes, no loads.
 *   2. `installSlots` — the single mutation site that writes each built slot
 *      onto its named `state.assetSlots` field.
 *   3. The two externally-built families — the per-source `points` slots
 *      (`wireGalaxyCatalogSourceSlot`) and the keyed `bodyTextures` family
 *      (`wireBodyTextureSlots`) — minted here, not by `buildSlotsFromRegistry`
 *      (their `ASSET_WIRING` rows carry `built: 'external'`).
 *   4. DEV synthetic-volume fixtures — minted + installed here (not a wiring
 *      row; tree-shaken from production).
 *   5. `wireImpostorSubsystems` / `createEarthTileSubsystem` / `seedFades` /
 *      `wireStructureProjection` — the thumbnail/disk subsystems, Earth's
 *      surface virtual texture, the whole fade-ownership manifest (every fade
 *      handle, seeded), and the structure-store anchor + bulk projection.
 *   6. `createSyntheticFallback` — the imperative gate that arms the synthetic
 *      backstop (via the `'syntheticFallback'` request flag) iff every real
 *      galaxy catalog settles without data.
 *   7. `installLoadProgress` — the flat `allSlots` registry + load-progress
 *      emitter, over both point + sidecar slots.
 *   8. `installSlotReadyWake` — one subscription per slot wakes the render
 *      scheduler on `ready`; the single channel-mouth enforcement point.
 *      `installFormatVersionAlert` shares the same window and shape: the first
 *      time any slot's error is a `FormatVersionError`, it dispatches a
 *      `cause: 'format-version'` status AND `reopenSplash()` — a returning
 *      visitor's `seenVersion` already hid the splash, so the alert needs
 *      both to actually reach them.
 *   9. `reevaluateDemand` — the single place loads start, awaited on
 *      `loadDataManifest` immediately before it so no fetch can race the
 *      manifest. It walks every wiring row and triggers each demanded slot
 *      with its tier-derived request. The same loop re-runs on every state
 *      change, so "is this asset required?" has one answer in one place.
 *
 * The phase does not block on data arrival: `engineStatusChanged({ kind:
 * 'loading' })` dispatches synchronously (before the manifest await) and
 * `wireInput`/`startLoop` run immediately after this returns, so the camera
 * and rAF loop come up with whatever has landed. Per-arrival `ready` dispatch
 * and the synthetic fallback run as background subscribers wired here.
 *
 * ### State writes
 *
 *   - `state.assetSlots.{filaments,famousGalaxiesMeta,structureCatalog,pgcAlias,
 *     cf4Density,mcpm,flow}` (via `installSlots`) + `.points` (via
 *     `wireGalaxyCatalogSourceSlot`) + `.bodyTextures` (via
 *     `wireBodyTextureSlots`) + `.syntheticVolumes` (DEV).
 *   - `state.subsystems.{loadProgress, structures, earthTiles}` + the impostor
 *     subsystem handles.
 *   - `state.requests` may gain `'syntheticFallback'` (via the gate).
 *   - `engineStatusChanged({ kind: 'loading' })` dispatched synchronously.
 *   - Each slot in `deps.allSlots` gains an `installSlotReadyWake` and an
 *     `installFormatVersionAlert` subscriber; the latter may later dispatch
 *     `engineStatusChanged({ kind: 'error', cause: 'format-version' })` AND
 *     `reopenSplash()`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.allSlots` — populated with every installed slot.
 */

import { ASSET_WIRING } from '../wiring/assetWiring';
import { buildSlotsFromRegistry } from '../wiring/buildSlotsFromRegistry';
import { installSlots } from '../wiring/installSlots';
import { installLoadProgress } from '../wiring/installLoadProgress';
import { installSlotReadyWake } from '../wiring/installSlotReadyWake';
import { installFormatVersionAlert } from '../wiring/installFormatVersionAlert';
import { wireBodyTextureSlots } from '../wiring/bodyTextureSlotRegistry';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  wireGalaxyCatalogSourceSlot,
} from '../wiring/galaxyCatalogSourceRegistry';
import { createSyntheticVolumeSlots } from '../../loading/slots/syntheticVolumeSlots';
import { wireImpostorSubsystems } from '../wiring/wireImpostorSubsystems';
import { createEarthTileSubsystem } from '../subsystems/earthTileSubsystem';
import { seedFades } from '../wiring/fadeLayers';
import { wireStructureProjection } from '../wiring/wireStructureProjection';
import { createSyntheticFallback } from '../wiring/createSyntheticFallback';
import { reevaluateDemand } from '../wiring/reevaluateDemand';
import { loadDataManifest } from '../../loading/dataManifest';
import { engineStatusChanged } from '../../../state/engine/engineSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export async function wireSlots(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { cb } = deps;

  // Fail-fast precondition: both disk renderers must be non-null before any
  // slot construction touches EngineState.  The same check is repeated inside
  // `wireImpostorSubsystems` co-located with the reads it guards — the
  // redundancy is intentional and cheap.
  if (state.gpu.texturedDiskRenderer === null || state.gpu.proceduralDiskRenderer === null) {
    throw new Error(
      'wireSlots: texturedDisk/proceduralDisk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // Build every non-external slot from the wiring registry, then install them
  // in one mutation pass.  Point + body-texture slots are skipped here
  // (built: 'external' — minted below instead).
  const slots = buildSlotsFromRegistry(ASSET_WIRING, { state, cb });
  installSlots(state, slots);

  // The two externally-built families: their `ASSET_WIRING` rows carry
  // `built: 'external'`, so `buildSlotsFromRegistry` above skips them and
  // they're minted here directly. Must run before `createSyntheticFallback`
  // (subscribes to the points slots), `installLoadProgress` (enumerates both
  // families into `allSlots`), and `reevaluateDemand` (triggers their loads).
  for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
    wireGalaxyCatalogSourceSlot(state, cfg, { cb });
  }
  wireBodyTextureSlots(state);

  // DEV-only synthetic volume fixtures — axis-verification debug cubes.  Not a
  // wiring row (kept out so Vite tree-shakes the procedural generators from
  // production); minted + installed at the call site under DEV.
  if (import.meta.env.DEV) {
    state.assetSlots.syntheticVolumes = createSyntheticVolumeSlots(state, cb);
  }

  // Build and wire the five impostor subsystems (galaxy atlas, textured
  // disks, procedural disks, hi-res Famous texture + planner).
  wireImpostorSubsystems(state, deps);

  // Earth's surface virtual texture. A subsystem, not a renderer — it owns
  // residency and streaming — so it's constructed here, not in `initGpu`.
  // Construction is free (no GPU memory, no fetch until the tile planner
  // engages), and kept out of `wireImpostorSubsystems` since it shares nothing
  // with that dependency-ordered cluster but the device.
  state.subsystems.earthTiles = createEarthTileSubsystem({
    device: deps.phaseLocals!.device,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });

  // Register and seed EVERY fade handle from the manifest — the
  // overlay/volume-master/label/structure rows PLUS the demand-loaded
  // galaxy/filament/flow/volume sets — so frame 1 is coherent and the
  // demand-loaded layers seed at 0 ready to fade in on first load.
  seedFades(state);

  // Wire the structure groups (static anchors + the bulk-cluster
  // subscription) into the structure store. Famous-galaxy labels are derived
  // straight from galaxyStore by produceFamousGalaxyLabels — not wired here.
  wireStructureProjection(state, cb);

  // Arm the synthetic-fallback gate.  It subscribes to the galaxy catalog slots and
  // trips the `'syntheticFallback'` request flag (then re-runs demand) iff
  // every real galaxy catalog settles without data — the count-aware policy a pure
  // demand predicate can't express.
  createSyntheticFallback(state, cb);

  // Build the flat `allSlots` registry + load-progress emitter over every
  // installed slot (point + sidecar + DEV synthetic).
  installLoadProgress(state, deps);

  // Channel-mouth render wake.  After installLoadProgress (allSlots fully
  // populated), before reevaluateDemand (no slot can reach 'ready' unsubscribed).
  installSlotReadyWake(() => state.subsystems.scheduler.requestRender(), deps.allSlots);

  // Same window: a stale-.bin version mismatch turns into a splash-visible
  // error instead of silently falling through to the synthetic backstop
  // (createSyntheticFallback suppresses arming on the same error type).
  installFormatVersionAlert(cb.store.dispatch, deps.allSlots);

  // Signal loading state immediately so the user sees progress before the
  // (potentially multi-second) fetches complete.
  cb.store.dispatch(engineStatusChanged({ kind: 'loading' }));

  // reevaluateDemand is the only place loads start, so awaiting the manifest
  // here — after the loading dispatch, before any fetch can begin — makes
  // "no data fetch can race the manifest" structural rather than a hope.
  await loadDataManifest();

  // The single place loads start: walk the wiring registry and trigger every
  // demanded slot with its tier-derived request.  At boot this loads the
  // default-visible galaxy catalogs + famous-galaxies-meta + the default-on MCPM volume +
  // the cluster catalog; filaments / CF-4 / PGC-alias stay idle until their
  // demand flips.  The same loop re-runs on every state change.
  reevaluateDemand(state);
}
