/**
 * wireSlots — bootstrap phase that wires sidecar asset slots, the
 * load-progress emitter, the thumbnail subsystem, and runs the
 * parallel multi-survey load (with synthetic fallback).
 *
 * ### What this phase does
 *
 * The 5 point-source slots are minted earlier (in `initGpu`, immediately
 * after the renderer that they commit into).  This phase covers
 * everything else slot-shaped:
 *
 *   - **Filament slot.**  One-shot lifecycle, commits to
 *     `state.gpu.filamentRenderer`, fires `cb.onFilamentsReady` on the
 *     `ready` transition.  Stored on `state.assetSlots.filaments`.
 *   - **Famous-meta slot.**  No commit step (pure metadata); writes
 *     `state.sources.famousMeta` + `state.sources.famousXrefs` on
 *     `ready`, gracefully degrades on `error` by writing empties.
 *     Stored on `state.assetSlots.famousMeta`.
 *   - **PGC-alias slot.**  Lazy — minted here but only `load()`-ed
 *     when the public handle's `loadPgcAliases()` shim fires (Cmd+K
 *     palette open).  Stored on `state.assetSlots.pgcAlias`.
 *
 * After every slot exists this phase populates the flat `allSlots`
 * registry (carried in `BootstrapDeps` because the public handle
 * exposes the same Map as `assetSlots`), constructs the load-progress
 * emitter, and triggers the famous-meta load.  It then constructs the
 * thumbnail subsystem (the renderers it binds to come from `initGpu`
 * via `state.gpu.*`) and fires `cb.onStatusChange({ kind: 'loading' })`.
 *
 * Finally it runs the parallel multi-survey load: triggers each real
 * survey + Famous + filaments in parallel, awaits the all-arrivals
 * gate, and runs the synthetic fallback if every real survey came back
 * empty/errored.  The first survey whose cloud arrived with `count > 0`
 * is recorded on `deps.firstReadySourceRef.current` so `wireInput` can
 * fire the right `cb.onStatusChange({ kind: 'ready', source })` payload.
 *
 * ### Why this runs second (after initGpu, before wireInput)
 *
 * Slot commits upload to `state.gpu.renderer` / `state.gpu.filamentRenderer`,
 * so the renderers must exist first — that's `initGpu`'s job.  The
 * thumbnail subsystem's `bindToRenderers` wants the quad/disk/procedural
 * renderers from `state.gpu.*` (populated by `initGpu`).
 *
 * `wireInput` runs after this phase because the bbox computation that
 * sizes the camera (in `wireInput`) needs `state.sources.catalogs` to be
 * populated by at least one survey's commit step.  We `await
 * allArrivalsPromise` here precisely so that constraint holds.
 *
 * ### State writes
 *
 *   - `state.assetSlots.filaments`, `state.assetSlots.famousMeta`,
 *     `state.assetSlots.pgcAlias` — sidecar slot construction.
 *   - `state.sources.famousMeta`, `state.sources.famousXrefs` — via
 *     famous-meta subscriber (on `ready`).
 *   - `state.sources.catalogs` — populated by the per-source slot commit
 *     subscribers (wired in `initGpu` via `wireGalaxyCatalogSourceSlot`).
 *   - `state.subsystems.loadProgress`, `state.subsystems.thumbnails`.
 *   - `cb.onStatusChange({ kind: 'loading' })`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.allSlots` — populates with every minted slot.
 *   - Mutates `deps.firstReadySourceRef.current` — hand-off to wireInput.
 *
 * ### Async work
 *
 *   - `await allArrivalsPromise` — gate on every real survey + Famous
 *     having settled at least once.
 *   - `await synthSlot.load(...)` — only when every real survey came
 *     back empty/errored.
 *
 * ### Early-return semantics
 *
 * If after the synthetic fallback no clouds reached the GPU
 * (`state.sources.catalogs.size === 0`), this phase returns early.
 * Subsequent phases (`wireInput`, `startLoop`) check the same
 * condition and bail too — the engine sits in 'loading' state with
 * nothing to render, identical to the pre-Phase-5 IIFE's `return`
 * statement at the corresponding line.
 */

import { Source } from '../../../data/sources';
import { buildPoisFromFamousMeta } from './buildPoisFromFamousMeta';
import { createFilamentSlot } from '../../loading/slots/filamentSlot';
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createFamousMetaSlot } from '../../loading/slots/famousMetaSlot';
import { createPgcAliasSlot } from '../../loading/slots/pgcAliasSlot';
import { createSyntheticVolumeSlots } from '../../loading/slots/syntheticVolumeSlots';
import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { createGalaxyAtlasSubsystem } from '../subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../subsystems/proceduralDiskSubsystem';
import { createTexturedImpostorSubsystem } from '../subsystems/texturedImpostorSubsystem';
import { hasUrlGate } from '../../../utils/url/urlGate';
// Cosmography POI anchors wired unconditionally into the POI subsystem
// below — the user-facing toggle is the SettingsPanel per-category
// checkbox, not a URL gate.  (Pre-2026-05-17 this was gated on
// `?anchors=1`; see the inline rationale at the wire site.)
// Synthetic-volume imports that previously sat here
// (DEFAULT_VOLUME_FIELD_INTENSITY, getVolumeFieldDefaults,
// syntheticVolumeFetcher) were moved into `syntheticVolumeSlots.ts`
// by H4 and intentionally stay out.
import {
  CLUSTER_ANCHORS,
  SUPERCLUSTER_ANCHORS,
  VOID_ANCHORS,
  raDecDistToEqCart,
} from '../../../data/clusterAnchors';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 2: sidecar slots + load-progress emitter + thumbnail
 * subsystem + parallel multi-survey load with synthetic fallback.
 */
export async function wireSlots(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { cb, allSlots } = deps;
  // `phaseLocals` is set by `initGpu`, which always runs before us per
  // the orchestrator's order.  The non-null assertion is therefore
  // safe; if `initGpu` ever stops setting it the orchestrator would
  // need updating in lockstep.
  const phaseLocals = deps.phaseLocals!;
  const { device } = phaseLocals;
  // Renderers are owned by `state.gpu.*` (written by `initGpu`).  Pre-M1
  // (2026-05-11 audit) we also kept them on `phaseLocals` and read
  // through there with a `!` bang — the bang was folklore that assumed
  // phase ordering.  The explicit null-checks below turn that assumption
  // into a typed runtime error if `initGpu` is ever skipped/reordered.
  const { texturedQuadRenderer, texturedDiskRenderer, proceduralDiskRenderer } = state.gpu;
  if (
    texturedQuadRenderer === null ||
    texturedDiskRenderer === null ||
    proceduralDiskRenderer === null
  ) {
    throw new Error(
      'wireSlots: thumbnail/disk/proceduralDisk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // ── Filament asset slot (Task 9) ─────────────────────────────────
  // Factory owns the mint + subscribe + state write.  See
  // `loading/slots/filamentSlot.ts` for the lifecycle rationale.
  const filamentSlot = createFilamentSlot(state, cb);

  // ── Volumes URL gate ─────────────────────────────────────────────
  //
  // Mirror of App.tsx's `volumesUiEnabled` gate.  Used to decide
  // whether ANY volume slot is registered at all — both the CF-4 DM
  // density (real science data, still in visual-tuning phase) and the
  // synthetic debug fixtures.  Without `?volumes=1` (or a dev build)
  // we skip slot creation entirely, so the .scfd is never fetched and
  // the renderer never sees a field — no bandwidth spent, no half-
  // baked overlay rendered in production.
  //
  // Why gate the data path (not just the UI): the cube is ~4 MB and
  // — more importantly — the visual isn't ready for users yet.  Once
  // the rendering / colour-mapping is dialled in, drop both gates
  // (this one and `volumesUiEnabled` in App.tsx) in lockstep.
  const volumesEnabledByUrl = hasUrlGate('volumes');
  const volumesGateOpen = import.meta.env.DEV || volumesEnabledByUrl;

  // ── Cosmography anchor POIs (always wired) ───────────────────────
  //
  // Pre-2026-05-17 this block was gated behind `?anchors=1`, intended
  // as a dev overlay for visually cross-referencing the CF-4 DM cube
  // alignment.  The cluster + void labels turned out to be useful as
  // a first-class production overlay (they help users orient against
  // known large-scale structure), so the gate is now removed.  The
  // SettingsPanel's per-category checkboxes (Overlays → Labels) are
  // the user-facing knob; this wire just makes the POIs available.
  //
  // The three lists stay separate (rather than one merged export) so
  // the audit script in `tools/` can consume CLUSTER_ANCHORS without
  // pulling in interpretive supercluster/void POIs.
  //
  // Per-category crosshair scaling: clusters get a small marker
  // (cores are ~1 Mpc), superclusters get a larger one (extent
  // 30-50 Mpc), voids get a still larger one (radii 30-50+ Mpc).
  // The per-category min floors prevent vanishing markers on the
  // closest anchors (e.g. Virgo, Local Void).
  const slug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const staticAnchorPois: PointOfInterest[] = [
    ...CLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `cluster-${slug(a.name)}`,
        name: a.name,
        category: 'cluster',
        worldPos: raDecDistToEqCart(a),
        crosshairSizeMpc: Math.max(2, a.distMpc * 0.05),
      }),
    ),
    ...SUPERCLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `supercluster-${slug(a.name)}`,
        name: a.name,
        category: 'supercluster',
        worldPos: raDecDistToEqCart(a),
        crosshairSizeMpc: Math.max(10, a.distMpc * 0.1),
      }),
    ),
    ...VOID_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `void-${slug(a.name)}`,
        name: a.name,
        category: 'void',
        worldPos: raDecDistToEqCart(a),
        crosshairSizeMpc: Math.max(15, a.distMpc * 0.15),
      }),
    ),
  ];
  state.subsystems.pois.setPois(staticAnchorPois);

  // ── CF-4 DM density volume slot ──────────────────────────────────
  // Gated behind `volumesGateOpen` so production users don't see the
  // still-tuning overlay unless they opt in with `?volumes=1`.  When the
  // gate is closed, `state.assetSlots.cf4Density` stays null and the
  // loader's `.load()` call below is a `?.` no-op so nothing else has to
  // change.  Factory owns the mint + commit + state write — see
  // `loading/slots/cf4DensitySlot.ts`.
  if (volumesGateOpen) {
    createCf4DensitySlot(state, cb);
    // MCPM Cosmic Web slot — minted here, but `.load()` deferred to the
    // central coordination point below alongside filaments / CF-4 /
    // point-source loads.  Loading inline at mint time fires too early
    // in bootstrap (renderer not yet wired, no loading-bar registry),
    // so the slot's commit is a silent no-op.  Same pattern as
    // cf4DensitySlot: factory writes `state.assetSlots.mcpm`, the
    // central `.load()` below picks it up and triggers the actual fetch.
    createMcpmSlot(state, cb);
  }

  // ── Famous-galaxy sidecar slot (Task 10) ─────────────────────────
  // Factory owns the mint + subscribe + state write.  See
  // `loading/slots/famousMetaSlot.ts` for the dual-sidecar rationale and
  // the graceful-degradation policy on fetch error.
  const famousMetaSlot = createFamousMetaSlot(state, cb);

  // ── Famous-galaxy label wire (deferred merge) ────────────────────
  //
  // Famous POIs need two ingredients: the meta sidecar (for names +
  // diameter) and the Famous galaxy catalog (for worldPos).  Both arrive
  // asynchronously — `famousMetaSlot.load()` fires later in this phase;
  // the catalog arrives via the per-source slot commit that `initGpu`
  // already wired.  We re-run the merge whenever either ingredient
  // lands so the user sees labels appear as soon as the data is on
  // hand.
  //
  // Re-merging static anchors + Famous POIs every time isn't a
  // performance concern: setPois is O(N) over the merged list (~125
  // POIs at most), and produceLabels only forwards changes downstream
  // when the label set actually changes.  Simpler to recompute the
  // merged list than to track partial state.
  function rewireFamousPois(): void {
    const meta = state.sources.famousMeta;
    const catalog = state.sources.catalogs.get(Source.Famous);
    if (meta.length === 0 || catalog === undefined || catalog.count === 0) return;
    const famousPois = buildPoisFromFamousMeta(meta, catalog);
    state.subsystems.pois.setPois([...staticAnchorPois, ...famousPois]);
  }
  // Try immediately (in case both ingredients are already present —
  // possible when wireSlots is replayed in tests or after a hot reload).
  rewireFamousPois();
  // Subscribe to the famous-meta slot's transitions; the subscriber
  // also fires once with the current state, so a slot already in
  // `ready` state re-triggers the merge here.
  famousMetaSlot.subscribe((s) => {
    if (s.kind === 'ready') rewireFamousPois();
  });
  // Subscribe to the Famous catalog's slot for the symmetric trigger.
  const famousCatalogSlot = state.assetSlots.points.get(Source.Famous);
  if (famousCatalogSlot !== undefined) {
    famousCatalogSlot.subscribe((s) => {
      if (s.kind === 'ready') rewireFamousPois();
    });
  }

  // ── PGC-alias slot (Task 10) ─────────────────────────────────────
  // Lazy: only `load()`-ed on first Cmd+K palette open via the public
  // handle's `loadPgcAliases()` shim.  Factory owns the mint + state
  // write; see `loading/slots/pgcAliasSlot.ts`.
  const pgcAliasSlot = createPgcAliasSlot(state, cb);

  // ── Synthetic volume slots (DEV-only or `?volumes=1`) ────────────
  // Three debug fixtures (Gaussian blob + Cartesian/spherical grids).
  // Same `volumesGateOpen` flag as the CF-4 slot above so the
  // SettingsPanel Volumes section is never empty-in-dev or visible-
  // but-empty-in-prod.  Vite tree-shakes the synthetic factory's
  // imports out of production bundles when neither flag is reachable.
  // Factory owns the mint + state write; see
  // `loading/slots/syntheticVolumeSlots.ts` for the commit rationale.
  if (volumesGateOpen) {
    createSyntheticVolumeSlots(state, cb);
  }

  // ── Loading-bar emitter ──────────────────────────────────────────
  //
  // Post-Task-12 the per-engine loading-bar aggregator is a thin
  // subscriber over `aggregateRegistry`.  Build the slot registry
  // here (now that every slot exists) and hand it to the emitter;
  // `attachSlot` then wires each slot's `subscribe` so that any
  // state transition recomputes the projection and forwards the
  // snapshot to `cb.onLoadProgress`.
  //
  // Why a single shared Map rather than four separate `attachSlot`
  // calls each owning their own subset?  The same registry also
  // feeds the dev panel's per-slot view (Task 13); building it
  // once here keeps both consumers in lock-step on what counts as
  // "in flight".
  //
  // The `unknown` type-erasure below is benign — `aggregateRegistry`
  // only reads `slot.state()` discriminator fields, never the
  // payload type.  We re-narrow at the dev panel's per-slot
  // rendering site if it cares.
  //
  // `allSlots` is declared at outer scope (top of `createEngine`) so
  // the public handle can expose the same Map as `assetSlots` for
  // the `LoadingDevPanel` debug component.  We populate it here once
  // every slot exists.
  for (const [, slot] of state.assetSlots.points) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }
  allSlots.set(filamentSlot.name, filamentSlot as unknown as AssetSlot<unknown, unknown>);
  allSlots.set(famousMetaSlot.name, famousMetaSlot as unknown as AssetSlot<unknown, unknown>);
  allSlots.set(pgcAliasSlot.name, pgcAliasSlot as unknown as AssetSlot<unknown, unknown>);
  if (state.assetSlots.cf4Density) {
    allSlots.set(
      state.assetSlots.cf4Density.name,
      state.assetSlots.cf4Density as unknown as AssetSlot<unknown, unknown>,
    );
  }
  // Register the synthetic volume slots only when they were minted (dev
  // builds).  Doing the registration here (after the DEV-guarded mint
  // block) keeps the `allSlots` population site cohesive with its
  // neighbours instead of scattering it into the DEV branch.
  if (state.assetSlots.syntheticVolumes) {
    for (const slot of Object.values(state.assetSlots.syntheticVolumes)) {
      allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
    }
  }

  const progressEmitter = createLoadProgressEmitter((snapshot) => {
    cb.sources?.onLoadProgress?.(snapshot);
  }, allSlots);
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;

  // Trigger the famous-meta load as soon as the slot is wired —
  // sidecars are tiny and only feed InfoCard text, so kicking them
  // off here (rather than awaiting the much larger point fetches)
  // means the very first hover already has enriched text on a typical
  // connection.  PGC-aliases stay lazy; see `loadPgcAliases()` on the
  // handle for the on-demand trigger.
  famousMetaSlot.load();

  // Construct the three impostor subsystems in dependency order.  The
  // textured-impostor planner depends on the atlas (slot allocation +
  // eviction subscription); the procedural-disk planner is independent.
  const galaxyAtlas = createGalaxyAtlasSubsystem({
    device,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  const texturedImpostors = createTexturedImpostorSubsystem({
    device,
    atlas: galaxyAtlas,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  const proceduralDisks = createProceduralDiskSubsystem();

  // Bind the atlas's texture view into the two LOD-2 renderers.  The
  // pre-split code did this through thumbnailSubsystem.bindToRenderers;
  // post-split the atlas owns the view and the binding is two direct
  // calls.  proceduralDiskRenderer doesn't sample the atlas, so it
  // doesn't get a bindAtlas call.
  texturedQuadRenderer.bindAtlas(galaxyAtlas.getTextureView());
  texturedDiskRenderer.bindAtlas(galaxyAtlas.getTextureView());

  state.subsystems.galaxyAtlas = galaxyAtlas;
  state.subsystems.texturedImpostors = texturedImpostors;
  state.subsystems.proceduralDisks = proceduralDisks;

  // Register the always-on overlay fade handles at opacity 1.0. The
  // registry surfaces these to a future tour subsystem (which can
  // fadeTo them programmatically) without any per-renderer plumbing.
  // No loading-time fade-in is needed — the three overlays are
  // procedural or bundled and appear immediately on first frame.
  // `register(handle, 1)` sets the steady-state opacity directly; no
  // setImmediate(1) follow-up is required.
  state.subsystems.fades.register({ kind: 'overlay', id: 'milkyWay' }, 1);
  state.subsystems.fades.register({ kind: 'overlay', id: 'proceduralDisks' }, 1);
  state.subsystems.fades.register({ kind: 'overlay', id: 'texturedImpostors' }, 1);

  // Register the four label-layer fade handles. youAreHere / poi /
  // galaxyNames start at 0 — their producers fire fadeTo(1) on first
  // non-empty emit (see youAreHereSubsystem + poiSubsystem). scaleBar
  // is React-side so we register it at 1 — present in the registry
  // for tour addressability but never auto-faded by the engine.
  //
  // v1 only registers the handles; the label renderer doesn't plumb
  // their opacity into draw yet. Tour playback can already address
  // these via state.subsystems.fades.fadeTo(...); per-layer-aware
  // label draws are a follow-up plan.
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'youAreHere' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'poi' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'scaleBar' }, 1);

  // Signal loading state immediately so the user knows something is
  // happening before the (potentially multi-second) fetch completes.
  cb.lifecycle?.onStatusChange?.({ kind: 'loading' });

  // ── Parallel multi-survey load via asset slots ────────────────────
  //
  // Each survey flows through its own `AssetSlot`.  The slot's
  // long-lived subscriber (wired at slot construction) handles
  // upload + `catalogs.set` + `onCatalogReady` + `requestRender` on
  // every transition to `ready` — so this block only has to fire
  // the loads and gate boot on "every slot has settled at least
  // once" before computing the camera bbox.
  //
  // **Why gate on all-settled rather than first-arrival?**  The
  // bbox loop below iterates `state.sources.catalogs` to size the
  // camera's far plane.  If we framed on whichever survey arrived
  // first (typically 2MRS at ~2 MB / ~100 Mpc), GLADE's distant
  // galaxies (out to ~1.5 Gpc) would land outside the frustum and
  // never render — perceptually "the far plane has come closer".
  //
  // **Why track `pointsAnyReady` separately?**  The synthetic
  // fallback fires only when every *real* survey is empty/errored.
  // Famous is curated (~150 entries) and excluded from the
  // success/failure check both ways: a Famous-only success
  // shouldn't suppress synthetic, and a Famous-only failure
  // shouldn't trigger it.
  const REAL_POINT_SOURCES: Source[] = [Source.SDSS, Source.TwoMRS, Source.Glade];
  const ALL_POINT_SOURCES: Source[] = [...REAL_POINT_SOURCES, Source.Famous];
  let pointsAnyReady = false;
  let firstReadySource: Source | null = null;
  const allArrivalsPromise = new Promise<void>((resolve) => {
    let arrived = 0;
    for (const source of ALL_POINT_SOURCES) {
      const slot = state.assetSlots.points.get(source);
      if (!slot) {
        if (++arrived === ALL_POINT_SOURCES.length) resolve();
        continue;
      }
      let counted = false;
      const unsub = slot.subscribe((s) => {
        if (counted) return;
        if (s.kind === 'ready' && s.value.count > 0) {
          if (firstReadySource === null) firstReadySource = source;
          if (REAL_POINT_SOURCES.includes(source)) pointsAnyReady = true;
        }
        if (s.kind === 'ready' || s.kind === 'error') {
          counted = true;
          if (++arrived === ALL_POINT_SOURCES.length) resolve();
          unsub();
        }
      });
    }
  });

  for (const source of ALL_POINT_SOURCES) {
    state.assetSlots.points.get(source)?.load({ source, tier: state.sources.tier });
  }
  // Filaments load exactly once at boot — never on tier change.
  // See `filamentFetcher.ts` for the rationale.
  state.assetSlots.filaments?.load({ tier: state.sources.tier });
  // CF-4 DM density loads exactly once at boot — no tier dependency.
  // Failure (404, decode error) leaves the field unregistered; Volumes
  // panel simply omits it.
  state.assetSlots.cf4Density?.load();
  // MCPM Cosmic Web loads at the boot tier; `engine.setTier` reloads
  // on tier change.  Same failure posture as cf4Density above —
  // missing/404 .scfd silently omits the field from the Volumes panel.
  state.assetSlots.mcpm?.load({ tier: state.sources.tier });

  await allArrivalsPromise;

  // Synthetic fallback — every real survey is empty/errored.  Drive
  // through the synthetic slot so the same fetch → commit → upload path
  // runs (fade-in, dev-panel row, race-checked commit).  See
  // `syntheticPointFetcher.ts` for why this lives behind a slot.
  if (!pointsAnyReady) {
    const synthSlot = state.assetSlots.points.get(Source.Synthetic);
    if (synthSlot) {
      await new Promise<void>((resolve) => {
        const unsub = synthSlot.subscribe((s) => {
          if (s.kind === 'ready' || s.kind === 'error') {
            unsub();
            resolve();
          }
        });
        synthSlot.load({ source: Source.Synthetic, tier: state.sources.tier });
      });
      if (synthSlot.state().kind === 'ready') {
        firstReadySource = Source.Synthetic;
      }
    }
  }

  // Hand the resolved first-ready source to `wireInput` via the
  // mutable ref on `BootstrapDeps`.  Pre-M1 (2026-05-11 audit) this
  // wrote to `phaseLocals.firstReadySource`, which shaped a `wireSlots`
  // mutation like an `initGpu` output.  See
  // `BootstrapDeps.firstReadySourceRef` for the rationale on the
  // explicit ref shape.
  deps.firstReadySourceRef.current = firstReadySource;
}
