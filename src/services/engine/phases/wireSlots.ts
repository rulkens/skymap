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
 * via `phaseLocals`) and fires `cb.onStatusChange({ kind: 'loading' })`.
 *
 * Finally it runs the parallel multi-survey load: triggers each real
 * survey + Famous + filaments in parallel, awaits the all-arrivals
 * gate, and runs the synthetic fallback if every real survey came back
 * empty/errored.  The first survey whose cloud arrived with `count > 0`
 * is recorded on `phaseLocals.firstReadySource` so `wireInput` can fire
 * the right `cb.onStatusChange({ kind: 'ready', source })` payload.
 *
 * ### Why this runs second (after initGpu, before wireInput)
 *
 * Slot commits upload to `state.gpu.renderer` / `state.gpu.filamentRenderer`,
 * so the renderers must exist first — that's `initGpu`'s job.  The
 * thumbnail subsystem's `bindToRenderers` wants the quad/disk/procedural
 * renderers from `initGpu`'s `phaseLocals`.
 *
 * `wireInput` runs after this phase because the bbox computation that
 * sizes the camera (in `wireInput`) needs `state.sources.clouds` to be
 * populated by at least one survey's commit step.  We `await
 * allArrivalsPromise` here precisely so that constraint holds.
 *
 * ### State writes
 *
 *   - `state.assetSlots.filaments`, `state.assetSlots.famousMeta`,
 *     `state.assetSlots.pgcAlias` — sidecar slot construction.
 *   - `state.sources.famousMeta`, `state.sources.famousXrefs` — via
 *     famous-meta subscriber (on `ready`).
 *   - `state.sources.clouds` — populated by the per-source slot commit
 *     subscribers (wired in `initGpu` via `wirePointSourceSlot`).
 *   - `state.subsystems.loadProgress`, `state.subsystems.thumbnails`.
 *   - `cb.onStatusChange({ kind: 'loading' })`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.allSlots` — populates with every minted slot.
 *   - Mutates `deps.phaseLocals.firstReadySource`.
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
 * (`state.sources.clouds.size === 0`), this phase returns early.
 * Subsequent phases (`wireInput`, `startLoop`) check the same
 * condition and bail too — the engine sits in 'loading' state with
 * nothing to render, identical to the pre-Phase-5 IIFE's `return`
 * statement at the corresponding line.
 */

import { Source } from '../../../data/sources';
import { createAssetSlot } from '../../loading/AssetSlot';
import { cf4DensityFetcher } from '../../loading/fetchers/cf4DensityFetcher';
import { filamentFetcher } from '../../loading/fetchers/filamentFetcher';
import { famousMetaFetcher } from '../../loading/fetchers/famousMetaFetcher';
import { pgcAliasFetcher } from '../../loading/fetchers/pgcAliasFetcher';
import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { createThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';
import {
  DEFAULT_CF4_DENSITY_ENABLED,
  DEFAULT_VOLUME_FIELD_INTENSITY,
} from '../../../data/defaults';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import { syntheticVolumeFetcher } from '../../loading/fetchers/syntheticVolumeFetcher';

import type { AssetSlot } from '../../loading/types';
import type { ScalarCube } from '../../../@types/ScalarCube';
import type { SyntheticVolumeReq } from '../../loading/fetchers/syntheticVolumeFetcher';
import type { EngineState } from '../../../@types';
import type { BootstrapDeps } from './bootstrap';

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
  const { device, thumbnailRenderer, diskRenderer, proceduralDiskRenderer } = phaseLocals;

  // ── Filament asset slot (Task 9) ─────────────────────────────────
  //
  // The cosmic-web skeleton flows through its own slot — different
  // fetcher (binary format is segments-not-points), different
  // renderer target (`filamentRenderer` rather than the per-source
  // `pointRenderer`), and a one-shot lifecycle: load() at boot,
  // never on tier change.
  //
  // Why one-shot?  Re-downloading the ~30 MB skeleton every tier
  // flip would tax bandwidth for a topology that barely differs
  // between tiers — see `filamentFetcher.ts`'s docblock for the
  // detailed rationale, including the "small-tier-on-desktop edge
  // case" trade-off.
  //
  // Why awaited `upload()` even though `FilamentRenderer.upload` is
  // synchronous?  `await undefined` is harmless and keeps the slot's
  // commit signature uniform with the per-source slots above; if a
  // future filament-renderer revision adds an async upload path
  // (e.g. compute-shader rebuild), this site needs no change.
  const filamentSlot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      await state.gpu.filamentRenderer.upload(cloud);
    },
  });
  filamentSlot.subscribe((s) => {
    // Loading-bar plumbing is gone post-Task-12 — the emitter
    // recomputes from `aggregateRegistry(slots)` on every state
    // change.  This subscriber only fires the app-visible side
    // effects (counts echo + render wake) on the `ready` transition.
    if (s.kind === 'ready') {
      console.log(
        `[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`,
      );
      // Push the parsed counts up to the UI layer.  See
      // `EngineCallbacks.filaments.onReady` for the lifecycle rationale —
      // one-shot, fires only when the optional binary actually loaded.
      cb.filaments?.onReady?.(s.value.stripCount, s.value.vertexCount);
      state.subsystems.scheduler.requestRender();
    }
  });
  state.assetSlots.filaments = filamentSlot;

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
  const volumesEnabledByUrl =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return new URLSearchParams(window.location.search).has('volumes');
      } catch {
        return false;
      }
    })();
  const volumesGateOpen = import.meta.env.DEV || volumesEnabledByUrl;

  // ── CF-4 DM density volume slot ──────────────────────────────────
  //
  // Eager-at-boot fetch of public/data/cf4_density.scfd. On commit,
  // hands the decoded ScalarCube to scalarVolumeRenderer.addField under
  // the handle 'cf4-density', then seeds per-field settings if not
  // already present (preserving any user-tuned intensity/palette across
  // sessions).  Gated behind `volumesGateOpen` so production users
  // don't see the still-tuning overlay unless they opt in with
  // `?volumes=1`.
  //
  // When the gate is closed, `state.assetSlots.cf4Density` stays null;
  // the loader's `.load()` call below is a `?.` no-op so nothing else
  // has to change.
  if (volumesGateOpen) {
    const cf4DensitySlot = createAssetSlot({
      name: 'cf4Density',
      fetch: cf4DensityFetcher,
      commit: async (cube) => {
        const renderer = state.gpu.scalarVolumeRenderer;
        if (!renderer) return;
        const handle = 'cf4-density';
        // Seed defaults from the per-handle registry rather than the
        // cube; SCFD v2 is a data-only format (dims + frame + voxels
        // + dynamic range) so palette + densityScale don't ride along
        // in the binary anymore.  See `src/data/volumeFieldDefaults.ts`
        // for the why-not-binary discussion.  The renderer setters
        // below read from `persisted`, so once an entry exists the
        // user-tuned values (future persistence) override the seed.
        const defaults = getVolumeFieldDefaults(handle);
        renderer.addField(handle, cube);
        if (!state.settings.volumes.fields[handle]) {
          state.settings.volumes.fields[handle] = {
            enabled: DEFAULT_CF4_DENSITY_ENABLED,
            intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
            contrast: defaults.contrast,
            densityScale: defaults.densityScale,
            paletteId: defaults.paletteId,
          };
        }
        const persisted = state.settings.volumes.fields[handle]!;
        renderer.setIntensity(handle, persisted.intensity);
        renderer.setEnabled(handle, persisted.enabled);
        renderer.setContrast(handle, persisted.contrast);
        renderer.setFieldPalette(handle, persisted.paletteId);
        renderer.setDensityScale(handle, persisted.densityScale);
        // Envelope is per-cube static (a presentation property of the
        // dataset, not a user-tunable slider) so we apply it straight
        // from the registry rather than mirroring it into
        // `persisted` — no JS-side state to keep in sync.
        renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
        cb.volumes?.onFieldsChanged?.();
        state.subsystems.scheduler.requestRender();
      },
    });
    cf4DensitySlot.subscribe((s) => {
      if (s.kind === 'ready') {
        console.log(
          `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
            `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
        );
      }
    });
    state.assetSlots.cf4Density = cf4DensitySlot;
  }

  // ── Famous-galaxy sidecar slot (Task 10) ─────────────────────────
  //
  // The two famous-galaxy JSON sidecars (`famous_meta.json` +
  // `famous_xrefs.json`) flow through one combined slot — the fetcher
  // pulls them in parallel and returns a `{ meta, xrefs }` payload.
  //
  // No `commit` step: there's nothing GPU-side to upload — the
  // payload is pure metadata consumed by the InfoCard via
  // `state.sources.famousMeta` / `state.sources.famousXrefs`.  The
  // subscriber writes both fields and wakes one frame so the
  // famous-galaxy thumbnails referenced by the cross-match xrefs
  // become enqueueable from the per-frame loop without the user
  // having to nudge the camera.
  //
  // **Graceful degradation on error.**  The old `loadFamousSidecars`
  // returned empty values when either file 404'd; the new fetcher
  // throws on HTTP failure (so the retry policy distinguishes "really
  // gone" from "transient flake"), and the slot subscriber maps
  // `kind: 'error'` → "feature off" by writing empty `meta`/`xrefs`.
  // Net effect for the user is identical to the pre-slot behaviour:
  // famous galaxies render without enriched InfoCard text, but the
  // engine keeps running.
  const famousMetaSlot = createAssetSlot({
    name: 'famous-meta',
    fetch: famousMetaFetcher,
  });
  famousMetaSlot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.sources.famousMeta = s.value.meta;
      // GLADE local indices in the sidecar JSON now match the on-disk
      // binary directly — the cloudLoader no longer post-decodes
      // GLADE through a far-distance decimator (the data-tier system
      // owns point-count budgeting via its absolute-magnitude cut at
      // build time, which is a more principled rule and operates
      // BEFORE the binary is written, so xref indices stay valid).
      state.sources.famousXrefs = s.value.xrefs;
      state.subsystems.scheduler.requestRender();
    }
    if (s.kind === 'error') {
      // Match the old "absent file = feature off" behaviour exactly:
      // empty meta/xrefs disable the enriched InfoCard text but keep
      // the engine functional.  Defensive — these fields default to
      // `[]` / `{}` already, but writing them again here is explicit
      // about the contract.
      state.sources.famousMeta = [];
      state.sources.famousXrefs = {};
      console.warn('[engine] famous sidecars failed to load:', s.error);
    }
  });
  state.assetSlots.famousMeta = famousMetaSlot;

  // ── PGC-alias slot (Task 10) ─────────────────────────────────────
  //
  // The Cmd+K command palette's alias search needs `pgc_aliases.json`
  // (~1.7 MB).  Lazy: most users never hit Cmd+K, so paying the
  // download up front would be wasteful.  The slot is minted here for
  // lifecycle parity with every other asset, but `load()` is only
  // invoked through the public-handle's `loadPgcAliases()` shim on
  // first palette open.
  //
  // No `commit` — the resolved Map is consumed by the React layer via
  // the Promise the shim returns; nothing engine-side to mutate.
  const pgcAliasSlot = createAssetSlot({
    name: 'pgc-aliases',
    fetch: pgcAliasFetcher,
  });
  state.assetSlots.pgcAlias = pgcAliasSlot;

  // ── Synthetic volume slot (dev-only or `?volumes=1`) ─────────────
  //
  // Routes the Gaussian-blob smoke-test cube through the same
  // `createAssetSlot` path as real CF-4 / MCPM cubes will use when
  // those fetchers land.  By going through the slot the synthetic cube
  // gets the same fade-in, `LoadingDevPanel` row, race-checked commit,
  // and retry semantics as every real volume fetch — without any
  // bespoke "synthetic shortcut" in the render loop.
  //
  // **Visibility gate.**  The synthetic cubes are debug fixtures, not
  // shipped content, so they only mint when:
  //   - `import.meta.env.DEV` is true (smoke-test loop in `npm run dev`), OR
  //   - the URL contains `?volumes=1` (escape hatch for inspecting the
  //     overlay on the deployed site).
  //
  // The same gate drives the SettingsPanel "Volumes" section in
  // `App.tsx` (`volumesUiEnabled`) — keeping the two in lockstep means
  // the section is never empty in dev and never visible-but-empty in
  // prod.  Vite's dead-code elimination still tree-shakes the entire
  // synthetic block from production bundles (the `?volumes=1` branch
  // is reachable but the underlying fetcher / generator imports stay,
  // which is the cost of the escape hatch).
  //
  // **Commit pattern.**  The commit replicates the same operations that
  // `engineHandle.addVolumeField(handle, cube)` performs, but directly
  // against `state` rather than through the public handle.  The public
  // handle is assigned to `deps.handleRef.current` AFTER
  // `runBootstrapPhases` resolves — so `handleRef.current` is null when
  // `wireSlots` runs.  The slot's commit callback fires asynchronously
  // (after the fetch resolves), at which point the handle IS set; but
  // relying on that timing is fragile.  Accessing `state` directly (the
  // same pattern the `filamentSlot` commit uses) is structurally safe:
  // `state` is fully initialised before any slot commit runs.  The
  // settings-bag seed and renderer calls are intentionally the same
  // four lines as `addVolumeField` so both paths stay in sync when the
  // engine's volume-field logic changes.
  // Same gate as the CF-4 slot above (`volumesGateOpen`, hoisted near
  // the top of wireSlots).  Keeping both volume slot families behind
  // one flag means the SettingsPanel's Volumes section is never empty
  // in dev and never visible-but-empty in production.
  if (volumesGateOpen) {
    // Helper that mints one synthetic-volume slot.  The handle and the
    // default-enabled flag are baked into a closure (the AssetSlot
    // commit signature only sees the decoded payload, not the request,
    // so per-fixture identity has to ride along on the slot).  Three
    // sibling slots share this helper; refactoring to a Map of three
    // would lose the per-handle commit closure that's the whole point.
    const mintSyntheticVolumeSlot = (
      handle: string,
      defaultEnabled: boolean,
    ): AssetSlot<ScalarCube, SyntheticVolumeReq> =>
      createAssetSlot({
        name: `syntheticVolume:${handle}`,
        fetch: syntheticVolumeFetcher,
        commit: async (cube) => {
          const renderer = state.gpu.scalarVolumeRenderer;
          if (!renderer) return;
          // Seed defaults from the per-handle registry; see
          // `src/data/volumeFieldDefaults.ts` for the why-not-binary
          // discussion.  Same shape as the cf4Density commit above —
          // only the handle (closure-captured) and the `enabled` seed
          // (per-fixture via `defaultEnabled`) differ.
          const defaults = getVolumeFieldDefaults(handle);
          renderer.addField(handle, cube);
          // Seed the per-field settings entry with defaults if not
          // already present — mirrors the guard in `addVolumeField`
          // so re-registering preserves any previously-tuned values.
          if (!state.settings.volumes.fields[handle]) {
            state.settings.volumes.fields[handle] = {
              enabled: defaultEnabled,
              intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
              contrast: defaults.contrast,
              densityScale: defaults.densityScale,
              paletteId: defaults.paletteId,
            };
          }
          const persisted = state.settings.volumes.fields[handle]!;
          renderer.setIntensity(handle, persisted.intensity);
          renderer.setEnabled(handle, persisted.enabled);
          renderer.setContrast(handle, persisted.contrast);
          renderer.setFieldPalette(handle, persisted.paletteId);
          renderer.setDensityScale(handle, persisted.densityScale);
          // Same per-cube envelope plumbing as the cf4Density commit
          // above.  Debug fixtures register `NO_SPATIAL_ENVELOPE` in
          // the registry so the envelope is visually a no-op here —
          // grid corners stay visible for axis verification.
          renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
          // Fire the same React-facing callback that engineHandle's
          // addVolumeField fires.  Without this, the SettingsPanel
          // never learns the new field exists — its mirror is rebuilt
          // only on this callback.  We're bypassing the public handle
          // (per the docblock above) so we have to fire it ourselves.
          cb.volumes?.onFieldsChanged?.();
          state.subsystems.scheduler.requestRender();
        },
      });

    // All three synthetic fixtures register but stay OFF on boot: they
    // exist as opt-in diagnostic fixtures (Gaussian for "is anything
    // visible?" smoke tests, the two grids for axis/scale/origin
    // verification).  The CF-4 density field is what users should see
    // first; cluttering the scene with a default-on Gaussian sphere
    // fights that.  Toggle any of them from the Volumes panel.
    state.assetSlots.syntheticVolumes = {
      'debug-gaussian': mintSyntheticVolumeSlot('debug-gaussian', false),
      'debug-cartesian': mintSyntheticVolumeSlot('debug-cartesian', false),
      'debug-spherical': mintSyntheticVolumeSlot('debug-spherical', false),
    };
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

  const progressEmitter = createLoadProgressEmitter(
    (snapshot) => {
      cb.sources?.onLoadProgress?.(snapshot);
    },
    allSlots,
  );
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;

  // Trigger the famous-meta load as soon as the slot is wired —
  // sidecars are tiny and only feed InfoCard text, so kicking them
  // off here (rather than awaiting the much larger point fetches)
  // means the very first hover already has enriched text on a typical
  // connection.  PGC-aliases stay lazy; see `loadPgcAliases()` on the
  // handle for the on-demand trigger.
  famousMetaSlot.load();

  // Build the subsystem and hand it the renderer references for
  // atlas-view binding.  The subsystem's `bindToRenderers` is split
  // out from its constructor because the renderers need to exist
  // first; building them here keeps the construction order linear.
  const thumbnails = createThumbnailSubsystem({
    device,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  thumbnails.bindToRenderers(thumbnailRenderer, diskRenderer, proceduralDiskRenderer);
  state.subsystems.thumbnails = thumbnails;

  // Signal loading state immediately so the user knows something is
  // happening before the (potentially multi-second) fetch completes.
  cb.lifecycle?.onStatusChange?.({ kind: 'loading' });

  // ── Parallel multi-survey load via asset slots ────────────────────
  //
  // Each survey flows through its own `AssetSlot`.  The slot's
  // long-lived subscriber (wired at slot construction) handles
  // upload + `clouds.set` + `onCloudReady` + `requestRender` on
  // every transition to `ready` — so this block only has to fire
  // the loads and gate boot on "every slot has settled at least
  // once" before computing the camera bbox.
  //
  // **Why gate on all-settled rather than first-arrival?**  The
  // bbox loop below iterates `state.sources.clouds` to size the
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
  const REAL_POINT_SOURCES = [Source.SDSS, Source.TwoMRS, Source.Glade];
  const ALL_POINT_SOURCES = [...REAL_POINT_SOURCES, Source.Famous];
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

  // Hand the resolved first-ready source to the next phase.  See
  // `PhaseLocals.firstReadySource` for the rationale on why this
  // crosses the phase boundary via `phaseLocals` rather than `state`.
  phaseLocals.firstReadySource = firstReadySource;
}
