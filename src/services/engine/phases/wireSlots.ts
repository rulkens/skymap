/**
 * wireSlots — bootstrap phase 2: the demand-driven asset orchestrator.
 *
 * The 6 point-source slots are minted earlier (in `initGpu`, alongside the
 * renderer their commit uploads into) and self-install into
 * `state.assetSlots.points`. This phase wires everything else and then lets the
 * demand loop decide what actually loads:
 *
 *   1. `buildSlotsFromRegistry` — construct every non-external slot from
 *      `ASSET_WIRING` (sidecars: filaments, famous-meta, cluster catalog,
 *      PGC alias, CF-4 + MCPM volumes). Pure: no state writes, no loads.
 *   2. `installSlots` — the single mutation site that writes each built slot
 *      onto its named `state.assetSlots` field.
 *   3. DEV synthetic-volume fixtures — minted + installed here (not a wiring
 *      row; tree-shaken from production).
 *   4. `wireImpostorSubsystems` / `registerOverlayFades` /
 *      `wireStructureProjection` — the thumbnail/disk subsystems, fade
 *      handles, and the structure-store anchor + bulk projection.
 *   5. `createSyntheticFallback` — the imperative gate that arms the synthetic
 *      backstop (via the `'syntheticFallback'` request flag) iff every real
 *      survey settles without data.
 *   6. `installLoadProgress` — the flat `allSlots` registry + load-progress
 *      emitter, over both point + sidecar slots.
 *   7. `reevaluateDemand` — the single place loads start. It walks every wiring
 *      row and triggers each demanded slot with its tier-derived request. The
 *      same loop re-runs on every state change, so "is this asset required?"
 *      has one answer in one place.
 *
 * The phase does not block on data arrival: `cb.onStatusChange({ kind:
 * 'loading' })` fires synchronously and `wireInput`/`startLoop` run immediately
 * after, so the camera and rAF loop come up with whatever has landed. Per-
 * arrival `ready` emission and the synthetic fallback run as background
 * subscribers wired here.
 *
 * ### State writes
 *
 *   - `state.assetSlots.{filaments,famousMeta,structureCatalog,pgcAlias,
 *     cf4Density,mcpm}` (via `installSlots`) + `.syntheticVolumes` (DEV).
 *   - `state.subsystems.{loadProgress, structures}` + the impostor subsystem handles.
 *   - `state.requests` may gain `'syntheticFallback'` (via the gate).
 *   - `cb.onStatusChange({ kind: 'loading' })` synchronously.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.allSlots` — populated with every installed slot.
 */

import { ASSET_WIRING } from '../wiring/assetWiring';
import { buildSlotsFromRegistry } from '../wiring/buildSlotsFromRegistry';
import { installSlots } from '../wiring/installSlots';
import { installLoadProgress } from '../wiring/installLoadProgress';
import { createSyntheticVolumeSlots } from '../../loading/slots/syntheticVolumeSlots';
import { wireImpostorSubsystems } from '../wiring/wireImpostorSubsystems';
import { registerOverlayFades } from '../wiring/registerOverlayFades';
import { wireStructureProjection } from '../wiring/wireStructureProjection';
import { createSyntheticFallback } from '../wiring/createSyntheticFallback';
import { reevaluateDemand } from '../wiring/reevaluateDemand';

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
  // in one mutation pass.  Point slots are skipped here (built: 'external' —
  // already minted in initGpu).
  const slots = buildSlotsFromRegistry(ASSET_WIRING, { state, cb });
  installSlots(state, slots);

  // DEV-only synthetic volume fixtures — axis-verification debug cubes.  Not a
  // wiring row (kept out so Vite tree-shakes the procedural generators from
  // production); minted + installed at the call site under DEV.
  if (import.meta.env.DEV) {
    state.assetSlots.syntheticVolumes = createSyntheticVolumeSlots(state, cb);
  }

  // Build and wire the five impostor subsystems (galaxy atlas, textured
  // disks, procedural disks, hi-res Famous texture + planner).
  wireImpostorSubsystems(state, deps);

  // Register overlay, volume-master, and label-layer fade handles, seeded
  // from the user's stored opacities so frame 1 is coherent.
  registerOverlayFades(state);

  // Wire the structure groups (static anchors + the bulk-cluster
  // subscription) into the structure store. Famous-galaxy labels are derived
  // straight from galaxyStore by produceFamousLabels — not wired here.
  wireStructureProjection(state, cb);

  // Arm the synthetic-fallback gate.  It subscribes to the survey slots and
  // trips the `'syntheticFallback'` request flag (then re-runs demand) iff
  // every real survey settles without data — the count-aware policy a pure
  // demand predicate can't express.
  createSyntheticFallback(state, cb);

  // Build the flat `allSlots` registry + load-progress emitter over every
  // installed slot (point + sidecar + DEV synthetic).
  installLoadProgress(state, deps);

  // Signal loading state immediately so the user sees progress before the
  // (potentially multi-second) fetches complete.
  cb.lifecycle?.onStatusChange?.({ kind: 'loading' });

  // The single place loads start: walk the wiring registry and trigger every
  // demanded slot with its tier-derived request.  At boot this loads the
  // default-visible surveys + famous-meta + the default-on MCPM volume +
  // the cluster catalog; filaments / CF-4 / PGC-alias stay idle until their
  // demand flips.  The same loop re-runs on every state change.
  reevaluateDemand(state);
}
