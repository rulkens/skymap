# 03 — Architecture and user-facing features

Subagent sweep, 2026-09-17, `main` @ `845720549`. Unverified; open the cited file before relying on a claim.

## 1. Architecture inventory

- **Engine lifecycle** — one long-running imperative WebGPU engine (`src/services/engine/engine.ts`); React never owns per-frame state. Five fixed async bootstrap phases: `initGpu → createLayers → wireSlots → wireInput → startLoop` (`src/services/engine/phases/`).
- **Frame program** — hand-authored `FRAME_ORDER` (`engine/frame/frameOrder.ts`), expanded by `expandFrameOrder.ts`, walked by `executeFrame.ts`; `checkFrameOrder.ts` fails at boot if a registered pass is unnamed. GPU-timing slots derive from the same expansion.
- **Render-on-demand** — `engine/subsystems/renderScheduler.ts`; the loop re-schedules only while something is live (`engine/helpers/shouldKeepTicking.ts`).
- **Layer concept** — a Layer owns its sources, settings, renderers, asset slots, passes, sagas, UI section, fades / labels / selection rows. Contract `src/@types/engine/layer/Layer.d.ts`; built by `engine/layer/defineLayer.ts`. Folder-is-the-contract doc: `src/layers/README.md`.
- **Layers (10 folders)** — formed: `galaxyCatalog` (reference implementation), `filaments`. Settings-only stubs still core-implemented: `body`, `constellations`, `flow`, `milkyWay`, `starCatalog`, `structure`, `volume`, `zoneOfAvoidance`.
- **Compositions** — `src/compositions/app.ts` (`APP_COMPOSITION`), `appSettingsFragments.ts`.
- **Camera** — floating-origin, reversed-Z, 10⁷–10²⁶ m. Driver table with strict precedence, one author per frame (`engine/camera/cameraDrivers.ts`). Rung / fold machinery in `engine/camera/rungs/`. Orbit input in `src/services/camera/`. The one Mpc↔metre seam: `engine/camera/bodyRelativePose.ts`.
- **Animation / clips** — clips are serializable data; pose is a pure `evaluateClip(data, t)`; cues fire edge-triggered from `engine/subsystems/clipPlayer.ts`. Fades: `src/services/animation/fadeRegistry.ts` (ADR 0001).
- **State** — Redux Toolkit, 9 slices in `src/store/rootReducer.ts`: `settings, ui, tier, camera, selection, selectionRows, tour, engine, time`. Intent-vs-observable split: `docs/superpowers/conventions/intent.md` + ADR 0007.
- **Effects layer** — typed-redux-saga (ADR 0008), 19 watchers in `src/store/rootSaga.ts`. Engine↔saga bridge: `src/store/SagaContextProvider.tsx`, `sagaContextRegistered.ts`, `RunSagaProvider.tsx`; engine-side reconciliation `src/store/effects/ReconcileEffects.ts` + `engine/wiring/makeReconcileEffects.ts`.
- **Engine wiring** — `engine/wiring/` binds settings → demand → asset slots → fades.
- **Loading / asset slots** — `src/services/loading/AssetSlot.ts`, `dataManifest.ts`, `fetchWithProgress.ts`, `retryPolicy.ts`; 14 fetchers + 11 slot declarations. ADR 0005 is the design record.
- **Tiering** — `small | medium | large` (`src/data/tierLadder.ts`, `tierTargets.ts`), chosen from viewport, owned by `src/state/tier/`.
- **Workers** — one real web worker: `engine/bake/buildPointInterleavedBuffer.worker.ts`. `src/worker.ts` is the unrelated Cloudflare pass-through.
- **Selection / picking** — r32uint pick texture, 6-bit source + 26-bit local index (`src/data/selectionEncoding.ts`); rows composed in `engine/selection/composeSelectionRows.ts`.
- **Labels / overlays** — `engine/subsystems/label2DDirector.ts` + `engine/presentation/`.
- **Streaming subsystems** — `bitmapStreamSubsystem`, `galaxyAtlasSubsystem`, `surfaceTileSubsystem` + `utils/surfaceTiles/cutSurfaceTiles.ts`, `tileStreamSubsystem`.

## 2. User-facing features

**Navigation and camera**

- Orbit drag, scroll / pinch zoom, continuous zoom across 19 orders of magnitude — `src/services/camera/orbitControls.ts`, ADR 0010.
- Auto-rotate — `src/components/AutoRotateToggle/`.
- Home (Earth) — `src/components/HomeButton/`, `state/selection/goHome.ts`.
- Click to select, hover to preview, `F` to focus; per-kind framing distances — `engine/interaction/clickHandler.ts`, `state/selection/watchFocusTweenSaga.ts`.
- Body follow / approach, surface-relative stepping — `engine/camera/applyFocusedBodyPivot.ts`, `services/camera/surfaceStep.ts`, `engine/camera/rungs/siteRung.ts`.
- Fly-to a lon/lat on a body — `state/camera/flyToLonLatActions.ts`, `watchFlyToLonLatSaga.ts`.
- Orientation frames (equatorial / galactic / supergalactic) — `state/camera/orientationActions.ts`.
- Scale bar — `src/components/ScaleBar/`. Navigation cheatsheet — `src/components/NavigationPanel/`.

**Search and info**

- Command palette (`Cmd/Ctrl+K`, `/`): famous atlas, ~48k PGC aliases, structures, bodies, Milky Way — `src/components/CommandPalette/`. Featured thumbnail grid on an empty query.
- InfoCards, compact + detail per kind (galaxy, field star, structure, body, Milky Way, zone of avoidance), Wikipedia row, mobile bottom sheet — `src/components/InfoCard/`.

**Scene content**

- ~3M galaxies (SDSS / 2MRS / GLADE / Milliquas), dot → procedural disk → real thumbnail LOD — `src/layers/galaxyCatalog/`.
- Famous galaxies with curated thumbnails and descriptions (ADR 0002 / 0004).
- DisPerSE filaments (`src/layers/filaments/`); MCPM and CF4 density volumes, CF4++ flow field (`src/layers/volume/`, `src/layers/flow/`).
- Clusters, superclusters, voids, groups as marker rings + labels — `src/layers/structure/`.
- Zone of Avoidance; constellation lines (opt-in); 16.8M Gaia stars, resolvable ones becoming true-scale spheres; procedural Milky Way.
- Sgr A\* with lensing and the S-star orbits — `src/data/bodies/sceneSgrAStar.ts`, `sStarElements.ts`.
- Solar system on a live clock: Sun, 8 planets, Pluto/Charon, 14 moons, Saturn's rings, orbit trails, atmospheres — `src/data/bodies/`.
- Earth: PBR, night lights, clouds, atmosphere, streamed surface tiles to city scale.
- Missions as GLB meshes: Voyager 1 + 2, Hubble, Curiosity, Perseverance, Spirit, Opportunity — `src/data/bodies/sceneMeshBodies.ts`, `surfaceFixedSites.ts`. Plus two easter eggs (whale, bowl of petunias).

**Tours and time**

- Guided tour "The Long Way Out" (14 beats), launched from the splash — `src/state/tour/`, `src/data/animation/tours/grandTour/`, `src/components/TourOverlay/`.
- Three tours registered (`grandTour`, `demo`, `webShowcase`); standalone clips in `src/data/animation/clips/clipRegistry.ts`.
- Time bar: date jump, rate ladder, direction, pause, "now" — `src/components/TimeBar/`, `src/state/time/`.

**Settings, URL, chrome**

- Settings sections: Display (orientation, tonemap, exposure, FOV, bloom, HDR), Earth, Stars, Structures, Cosmic Web, Flow, Labels & Guides, Galaxy Provenance, Tier — `src/components/SettingsPanel/`.
- URL hash params `#focus=`, `#t=`, `#orientation=` — `src/state/url/hashParamSources.ts`, `src/services/url/`.
- Splash with progress, About pill, Tour CTA, three keyed error states — `src/components/Splash/`.
- `?cinema` mode for offline 4K capture — `src/utils/url/isCinemaMode.ts`, `tools/record/`.
- Debug panel (`D`) — `src/components/DebugPanel/` (25+ sections).
- Keyboard shortcuts (`src/state/input/keyboardShortcuts.ts`): `Cmd/Ctrl+K`, `/` search · `Esc` · `F` focus · `H` / `E` home · `Tab` hide UI · `L` log camera · `D` debug · `[` `]` time rate · `\` pause · `Shift+N` now · `←` / `→` / `Space` tour.
- Three deployed workbenches: `/galaxy/`, `/mcpm/`, `/flow/`.

**Not present:** no VR / WebXR in `src/` or `tools/` (spot-checked 2026-09-17); no in-app recording UI.

## 3. ADRs and conventions

ADRs (`docs/adrs/`): 1 Fade is a subsystem · 2 Hi-res famous thumbnails in a `texture_2d_array` · 3 Cluster/supercluster POIs as a generated catalog artefact · 4 Famous calibration lives on `famous_meta.json` · 5 Engine data layer and demand-driven loading · 6 Volume field settings in the settings layer · 7 Intent-centric state with an explicit effects layer · 8 typed-redux-saga · 9 One shared catalog walk feeds both disk planners · 10 Continuous per-object floating origin · 11 Declarative per-family composition, not a render graph.

Conventions (`docs/superpowers/conventions/`): comments, intent, leanness, plan style, renderer conventions, SDD execution, simplicity, singleton overlay layers, testing.

## 4. Tour / powers-of-ten / animation docs

- `docs/tour/goal.md` — north star: a ~2½ min narrated powers-of-ten journey, aimed at a curious 12-year-old and their grandparent.
- `docs/tour/script.md` + `stages/NN-*.md` (14 beats, several with `.facts.md` fact-check companions).
- `docs/tour/cinematography.md`, `graphic-design.md`, `writing-style.md`, `implementation-notes.md`.
- `docs/powers-of-ten/` — a self-contained static page: ~46 rungs from 10²⁷ m to 10⁻¹⁸ m, each with subject, rendering approach, real dataset, build-status badge. The roadmap as a visualization.
- `docs/animation/clip-primitives.md` (522 lines) — the clip authoring reference.

## 5. Liftable nearly as-is

`README.md`, `docs/science.md`, `docs/DATA.md`, `docs/RENDERER.md` (the landmine half is written for maintainers), `docs/adrs/*`, `docs/tour/*`, `docs/powers-of-ten/`, `ATTRIBUTIONS.md`, `CITATION.cff`, `CONTRIBUTING.md`, `src/layers/README.md`, `docs/superpowers/conventions/{simplicity,intent,renderers,testing}.md`, `docs/references/orbit-trail-*.md`.

## 6. Gaps — architecture documented nowhere

1. No engine-lifecycle document.
2. **No state-architecture doc** — nothing describes the 9 slices, the 19 sagas, or the engine↔saga bridge. The biggest missing page.
3. The camera system as a whole (driver table, rung / fold machinery, the Mpc↔metre seam).
4. Loading and tiering (AssetSlot state machine, demand reevaluation, manifest + content hashing, retry, tier selection).
5. The frame program / pass model.
6. Picking end-to-end.
7. The label / caption director.
8. Layer migration status — which parts of the 8 stub Layers still live in core.
9. The `?cinema` / recorder / perf-harness contract.
10. **No user-facing help at all** — keyboard table duplicated in `NavigationPanel` markup, URL params only in `hashParamSources.ts`, no description of what settings toggles change.
11. `src/worker.ts` and `docs/DEPLOY.md` are not cross-linked.
12. What is and is not off the main thread.
