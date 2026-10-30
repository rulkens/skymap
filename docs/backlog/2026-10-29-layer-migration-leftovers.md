# What core still holds that Layers could own

**Readiness:** M-items `ready`; J-items `needs-design` (each needs a consented contract member). Surveyed at
`742f6e21b` (main + body PR 2).

**Answer.** The body PR finishes the body family, but core still holds about **10.7k LOC that could move with no
contract change**, plus about **7.3k LOC behind missing joints**. About **27k LOC (including ~11k WESL) stays in
core for a legitimate reason**: shared infrastructure, tool-shared formats, shaders by rule, or the unshipped v2
Milky Way field.

**Method.** An import graph over `src/`, `tools/` and `tests/` (6,603 files, relative imports resolved). Each core
file got an _owner set_: the Layers and core roots that reach it through core-only import chains. One Layer and no
core root means a pure-move candidate. Core-reached files were then swept by content keywords and per-kind
`switch`/`Record` tables. LOC is raw lines, excluding `.wesl` unless a row says otherwise. About 60 files needed a
"generic vs content" judgment; the M1 list is in the appendix.

## Summary table

| # | Item | Layer | Class | LOC | Blocker / joint |
|---|------|-------|-------|-----|-----------------|
| M1 | Single-Layer files left in core (~286 files: renderer/subsystem types, settings types, helpers, generated data) | 14 Layers (galaxyCatalog 2.9k, missions 1.2k, cosmicWebDensity 0.9k, starCatalog 0.8k, milkyWay 0.55k, body 0.48k, flow 0.41k, blackHoles 0.33k, …) | MOVE-NOW | ~8,200 | none: `npm run move-files` per Layer |
| M2 | Galaxy + star detail cards (+ compact cards, star astro utils) | galaxyCatalog, starCatalog | MOVE-NOW | ~807 | none: `ui.detailCard` exists; drop `CORE_DETAIL_CARDS` |
| M4 | `TIPS` table split (star/galaxy/milkyWay/structure keys) | 4 Layers | MOVE-NOW | ~391 | none (split one table) |
| M5 | Cosmic Flows, Cosmic Web, Zone of Avoidance exhibits | flow, cosmicWebDensity, zoneOfAvoidance | MOVE-NOW | 313 | none: `exhibits` exists; precedent for cross-Layer initialState imports |
| M6 | Galaxy provenance debug section | galaxyCatalog | MOVE-NOW | 286 | none: `ui.debug` exists |
| M7 | Earth settings subgroup | body | MOVE-NOW* | 162 | a placement ruling: it nests inside core's Display section |
| M8 | Milky Way + seeded-star palette arms | milkyWay, starCatalog | MOVE-NOW | ~100 | none: `search` fits |
| J1 | Seeded stars: Sun, famous stars, S-stars, makers, anchors (§7 step 5) | starCatalog | NEEDS-JOINT | ~2,700 | `BodyPosition` has no `anchor` kind; `SCENE_ANCHORS` / `ORBIT_REACH_BY_REGION` read core tables |
| J2 | Selection presentation: `buildGalaxyInfo` + galaxy math (via barrel), star arm of `buildFocusable`, galaxy/structure/MW framing | galaxyCatalog, starCatalog, structure, milkyWay | NEEDS-JOINT | ~1,480 | per-kind core tables (`BUILD_FOCUSABLE`, `REF_OF`, `focusFraming`, `mayHaveLabel`, `targetIdentityKey`, `selectionHaloTable`); needs `SelectionKindRow` members |
| J3 | `ephemerisCorrections.generated` + `barycentricPairs` | body | NEEDS-JOINT | 1,113 | core solver (`orbitRowPlacement`) keys them by id; `LayerBody`/`OrbitalElements` would carry them |
| J4 | Content camera clips (cosmicFlows, flowOrbit, famousFlythrough, earth/Søndermarken/Perseverance flyouts) | flow, galaxyCatalog, body, earthScenes, missions | NEEDS-JOINT | ~580 | no `clips?` member; `ClipId` union + `clipRegistry` are core |
| J5 | `bodyFacts.generated` (card facts incl. `sgr-a-star`) | body, missions, blackHoles | NEEDS-JOINT | 500 | shared `BodyDetailCard` reads one table; `LayerBody` has no `facts` |
| J6 | Structure focus mode (`structureFocusSubsystem`) | structure | NEEDS-JOINT | ~290 | core focus uniform read by other Layers' shaders; private fade controller vs "a Layer never drives a fade" |
| J7 | Palette famous/alias/structure arms | galaxyCatalog, structure | NEEDS-JOINT | ~250 | `LayerSearchEntry` lacks thumbnail/description/scoring class |
| J8 | Tier-swap galaxy re-anchor (`captureGalaxyFocusIds`, half of `watchTierSaga`) | galaxyCatalog | NEEDS-JOINT | ~120 | capture must run before core's tier write: an ordering hook |
| J9 | Body debug overlays + terrain-pick radius in core `debugSlice` | body | NEEDS-JOINT | ~80 | core `createPickDriver` reads the `terrain-pick-marker` toggle; no Layer debug-overlay rows |
| J10 | Earth places palette (`earthPlaces`, flyTo action) | body | NEEDS-JOINT | ~60 | `LayerSearchEntry` is focus-only |
| J12 | `starSphereRangeM` in core `deriveView` | starCatalog | NEEDS-JOINT | 38 | NEAR0 range is core-sized; no Layer range contribution |
| J13 | `bodySlabRosterIds` (`SCENE_PLANETS` roster) | body | NEEDS-JOINT | ~35 | known #3; per-body slab on `LayerBody` (backlog) |
| J14 | `sgrAStar` sky-capture row + `sgrAStarLensing` band | blackHoles | NEEDS-JOINT | ~25 | `CUBEMAP_CAPTURES`/`SKY_CAPTURE_KEYS` are core-only |
| S1 | v2 analytic Milky Way field + `galaxyField` renderer | milkyWay (future) | STAYS (for now) | ~13,200 (+~5,000 WESL) | only `tools/galaxy-renderer` reads it; backlog "Draw the v2 analytic Milky Way in the milkyWay Layer" |
| S2 | Tool-shared formats/registries (catalog, star, structure, filament, shell-mesh formats; body texture + surface-tile registries) | 9 Layers | STAYS* | ~3,500 | writer (tools/) ↔ reader (Layer) contract; needs a one-line ruling |
| S3 | Octree stack (`gpu/octree`, `services/octree`, `utils/octree`, `data/octree`, `@types/octree`) | starCatalog today | STAYS | ~2,600 | GLADE octree #932 adds galaxyCatalog as second user |
| S4 | `galaxyGenerator` v1 + `shared/` | milkyWay + tools | STAYS | ~2,140 | shared with `tools/galaxy-renderer`; v1 slated for deletion |
| S5 | Generic helpers whose only user today is one Layer | various | STAYS | ~2,200 | `utils/` convention |
| S6 | Shaders for Layer content | all | STAYS | ~6,000 WESL | README rule |
| S7 | Body infrastructure per spec §4, shared places, labels/markers/selection ring, tours, featured tabs, tier | shared | STAYS | n/a | shared by ≥2 Layers or engine infrastructure |

Totals: MOVE-NOW ~10,700 (M1 8.2k + M2-M8 2.4k). NEEDS-JOINT ~7,300. STAYS ~27,000 including ~11,000 WESL.

Known items, refined:

1. **Seeded stars** are sized at ~2.7k (J1). Stars are _anchors_, and `BodyPosition` only knows `site | orbit | sampled`. S-stars already fit `orbit`.
2. **Four core exhibits**: three are MOVE-NOW (M5); Observable Universe went with the horizon shell into the `cosmicHorizon` Layer.
3. **`near0SphereBodies`** filters through `bodySlabRosterIds`, the hand roster (`SCENE_PLANETS` + mesh bodies) (J13).
4. **blackHoles' "anchor" read** is a core _place_ (`galactic-centre`, shared with the S-stars, regions and Milky Way framing) and legitimately stays. The real content leaks are the `sgr-a-star` row in `bodyFacts.generated` (J5), and the `sgrAStar` sky-capture row and lensing band (J14). `sgrAStarMassSolar` has 3 readers, so it stays.

## Open ruling

**May `tools/` import a Layer's format/registry files?** (S2, ~3.5k LOC.) Eight `tools/` files already import
Layer files, so precedent exists; a one-line ruling decides whether the tool-shared formats move. Decided when the
M1 sweep starts.

## MOVE-NOW: existing contract members are enough

### M1. Single-Layer files still in core: ~8,200 LOC, ~286 files
**Evidence.** The owner set is exactly one Layer: no core root and no `tools/` importer reaches the file. The appendix lists every file per Layer.
**Why still core.** These were left behind: the earlier Layer PRs moved the code and left its types and helpers in place. Most of it is `src/@types/{rendering,engine/subsystems,settings,loading,data}/*` describing a Layer's own renderers, subsystems and settings. The README says that home is the Layer's `@types/`, and `cosmicWebDensity` already keeps `CosmicWebDensitySettings` there while 13 sibling `*Settings.d.ts` stay in `src/@types/settings/`.
**Biggest.**
- **galaxyCatalog 2,867:** `hiResFamousTexture` 253, `fetchGalaxyBitmap` 183, `bake/buildPointInterleavedBuffer`(+worker) 121, `utils/render/disk/*` ~470, and ~1.3k of renderer/subsystem types.
- **missions ~1,160:** `missionEvents.generated` 120, `utils/exhibits/{mission,timeline}/*` ~430, `data/bodies/makers/orbiter` 62 (by convention this belongs in `missions/bodies/makers/`), `utils/camera/mission*` 114, `utils/orbit/{tessellateTrack,hermiteTrackVelAt,…}`.
- **cosmicWebDensity 924:** `volumeFieldRenderer` 458 + `createScalarVolumePass` 46, plus the `clampVolume*` helpers.
- **starCatalog ~780:** `nearestResolvableStar` 153, `drawFlooredSpherePick` 125, `resolveStarRecord` 85, `decodeStarFocusId`, `starTintFromBpRp`.
- **milkyWay 550:** the v1-only helpers `milkyWayCloud`, `milkyWayModelMatrix` and fade alpha, plus `milkyWaySliderFields` 159.
- **body 480:** `flyToPresets` 94, `bodyAtlas.generated`, the tile/texture types.
- **flow 413, blackHoles ~325** (incl. `packBlackHoleLensingUniforms` 180), zoneOfAvoidance 223, structure 196 (incl. `state/settings/projectMarkerCategoryVisibility`), constellations 86, cosmicWebFilaments 86, localBubble 74, lightTime 39, earthScenes 12.

**Caveats.**
- `volumeFieldRenderer`/`createScalarVolumePass` have generic names, and the backlog's Edenhofer dust Layer may reuse them. Keep or move is the user's call; the default is to move them now.
- milkyWay's v1 helpers die with v1, so deleting them beats moving them.

### M2. Galaxy and star detail cards: ~807
`src/components/InfoCard/{GalaxyDetailCard,CompactCard,StarDetailCard,CompactStarCard}` (279 + 323), plus star astro utils that only the card reads (`deriveStarProperties`, `starTeffK`, `starTeffCoefficients`, `starLuminositySolar`, `starRadiusSolar`, `isGiantStar`, `bolometricCorrectionG`, `starWikipediaTitle`: 205).
**Why still core.** `detailCardTable.ts` hard-codes `CORE_DETAIL_CARDS` for "the two kinds no Layer claims". Seven Layers already use `ui: { slot: 'detailCard' }`. The cards are props-driven (`DetailCardProps<K>`), so they can move before their view-model builders (J2).

### M4. `TIPS` table split: ~391 of 582 lines
`components/InfoCard/tooltips.tsx` is one `Record` of tooltip copy for every card. By key usage: star 160 lines (13 keys), galaxy 116 (9), body 115 (10, stays with the shared BodyDetailCard), milkyWay 68 (6), structure 47 (4), shared 59. The milkyWay and structure cards already reach from their Layers into this core table.

### M5. Three core exhibits: 313
`data/exhibits/cosmicFlows` 108 → flow, `cosmicWeb` 110 → cosmicWebDensity, `zoneOfAvoidance` 95 → zoneOfAvoidance.
**Why still core.** They are rows in `src/data/exhibits/exhibitRegistry.ts`; the `exhibits` Layer member (#854) already hosts the Voyager exhibit. The one multi-Layer case, Observable Universe, already lives in the `cosmicHorizon` Layer. Cosmic Web's subject is the `polyphorm-2mrs` volume (`cosmicWebFilaments` is the other candidate home). `ExhibitId` is a hand-kept union that `exhibitRegistry`'s `Record` checks for completeness; once rows come from Layers it should be derived from the folded rows. These exhibits import other Layers' `initialState`. `body/exhibits/solarSystem.ts` (→ starCatalog) and `missions/exhibits/voyagerMissions.ts` (→ galaxyCatalog, starCatalog, structure) already do the same and nothing forbids it, so it does not block. `utils/cosmicWebDensityOff` is also read by `featuredTabs`, so it stays.

### M6. Galaxy provenance debug section: 286
`DebugPanel/GalaxyProvenanceSection` 154, `containers/GalaxyProvenanceSectionContainer` 56, `utils/sumProvenanceCounts` 34, `data/provenanceFilter` 29, `GalaxyProvenanceSettings.d.ts` 13. The container imports galaxyCatalog's slice. `ui: { slot: 'debug' }` exists.

### M7. Earth settings subgroup: 162 (MOVE-NOW*)
`SettingsPanel/EarthSection` 99 + `containers/EarthSectionContainer` 63. The container imports body's slice and selectors from core. Blocker: placement only. `SettingsSections.tsx` renders it *inside* `DisplaySectionContainer`, while Layer `main` sections render at the top. Either rule it a top-level body section (pure move) or add a nested-slot joint. This is a UX ruling, not a contract member.

### M8. Milky Way + seeded-star palette arms: ~100
`rankPaletteMatches`, `paletteRows` and `paletteRowLabel` carry bespoke `milkyWay` and `starCatalog` arms (`data/palette/milkyWayNames`, `BODY_SEARCH_NAMES`, `SEEDED_STAR_CATALOGS_BY_SOURCE`). `LayerSearchEntry {id, names, class, chip}` already fits both; body, missions, earthScenes and blackHoles use it.

---

## NEEDS-JOINT: a contract member or seam is missing. Each one needs the user's yes.

### J1. Seeded stars (spec §7 step 5): ~2,700
`data/bodies/{famousStars.generated 1430, sStarElements 603, makers/sStar 70, sStarAppearance 62, makers/star 46, sStarOrbitInfo 44, sceneSStars 41, makers/starAnchor 29, famousStarsIndex 26, seededStarCatalogsBySource 24, sceneStars 22, sun.generated 20, seededStarCatalogs 19, sceneSun 13, sStarOrbitalElements 12, starResolvePx 4}`, plus `SStarSeed`, `FamousStarRow`, `SeededStarCatalog*` types, and star-only orbit helpers (`pericentreSpeedKmS`, `skyInclinationToFrameInclination`, `skyPositionAngleToFrameAngle`, `meanAnomalyAtJ2000`, `temperatureToLinearRgb`, `absMagFromGalacticCentreK`).
**Core readers.**
- `sceneBodies.ts` (`SCENE_SUN`, `SCENE_STARS`, `SCENE_S_STARS`), `sceneAnchors.ts` (`SUN_GENERATED`, `FAMOUS_STARS_GENERATED` → `starAnchor`), `orbitalElements.ts` (`S_STAR_ORBITAL_ELEMENTS`), `orbitReachByRegion.ts` (`SCENE_ANCHORS`).
- Also `bodySearchNames`, `constellationOfBody`, `mayHaveLabel`, `encode/decodeStarFocusId`, `rankPaletteMatches`.
- `starCatalog` itself reads 7 of these core files.

**Joint.** `BodyPosition` is `site | orbit | sampled`, and a fixed star is an anchor (`AnchorBody`). Needed: a `{ kind: 'anchor' }` position, or a Layer-folded anchor list, so `SCENE_ANCHORS` becomes a fold. S-stars already fit `orbit`. `ORBIT_REACH_BY_REGION` then reads the composed rows, as the spec says. `SCENE_ANCHORS` already holds a non-body row (`GALACTIC_CENTRE_ANCHOR`, a `PlaceId`), so the fold is the place-anchor table and should be named and filed as one rather than under `data/bodies/`.

### J2. Selection presentation tables: ~1,480 movable behind them
Core holds a row per selection kind in `BUILD_FOCUSABLE` (`helpers/buildFocusable.ts`), `REF_OF`, `focusFraming` (switch), `mayHaveLabel` (switch), `targetIdentityKey`, `selectionHaloTable` and `CORE_DETAIL_CARDS` (M2). That is the anti-goal shape of spec §2: a table keyed by kind gaining a row per Layer. What sits behind the galaxy, star, structure and MW rows:
- `helpers/buildGalaxyInfo` 264, plus `famousDisplayName` 36 and `utils/format/{formatMorphology,formatLookback,famousWikipediaTitle}` 82.
- Galaxy math reached only through `buildGalaxyInfo`'s barrel import: `sdssName` 82, `galaxyType`+3 117+108, `iauName`+`iauRaDecSuffix` 120, `sdss{Explorer,Thumbnail,Navigate}Url` 97, `dssThumbnailUrl` 49, `aladinLiteUrl` 32, `ned*Url` 67, `galaxyThumbnailFovArcmin` 29, `lookbackTimeGyr` 40, `earthEraForLookback` 56, `hubbleVelocityKmS` 45, `cartesianToRaDecZ` 86, `format{Ra,Dec}Sexagesimal` 85. About 913 in all.
- The star arm's `starDetail` plus `sStarOrbitInfo` 44, and the camera's `galaxyFocusDistance` 59 + `structureFocusDistance` 82.
- The galaxyCatalog/starCatalog fact selectors in `state/engine/selectors.ts`.

**Joint.** The `SelectionKindRow` presentation members: `toFocusable(row)`, `framing(row, fovY)`, `mayHaveLabel(ref)`, a halo row. Body-like arms already avoid the framing switch through `driver: DriverGeometry`. Galaxies and structures don't host the camera, so they can't reuse it.
Consolidated into [the selection-kind-facts item](2026-10-28-selection-kind-facts-in-the-layer.md), which carries J2 now.

### J3. Ephemeris corrections + barycentric pairs: 1,113
`ephemerisCorrections.generated` 1,088 (26 bodies: the planets and their moons) and `barycentricPairs` 25 (earth/moon). Both are read only by the core solver, `utils/orbit/orbitRowPlacement.ts`, keyed by element id. They are body content. **Joint:** the row's `OrbitalElements` (or `LayerBody`) carries its correction and barycentre. This widens `LayerBody`, which needs consent. The generator (`build-ephemeris-corrections`) would then emit into `layers/body/`.

### J4. Content camera clips: ~580
`data/animation/clips/{cosmicFlows 99, flowOrbit 55}` → flow, `famousFlythrough 70` → galaxyCatalog, `{earthFlyout 94, sondermarkenFlyout 81, perseveranceToSondermarken 141, earth*Loop 36}` → body/earthScenes/missions. `clipRegistry` and the `ClipId` union are core. Readers include `navigateSaga`, the remote menu, the debug clip triggers and `tools/record`. **Joint:** a `clips?` Layer member, or rule clips cross-Layer choreography like tours, in which case they stay. This is low value; `cosmicFlows`, which drives flow's slice, is the only one with a clear owner.

### J5. `bodyFacts.generated`: 500
One table of card facts for 41 ids: planets, moons, craft and `sgr-a-star`. It is read by core's shared `BodyDetailCard` and by `blackHoles/ui/BlackHoleDetailCard`. **Joint:** per-row facts (`LayerBody.facts?`), or one generated facts file per Layer. Either way the seed and generator split.

### J6. Structure focus mode: ~290
`subsystems/structureFocusSubsystem` 146 + `StructureFocusSubsystem.d.ts` 66 + `ZERO_FOCUS`, plus the camera's `structureFocusDistance` (counted in J2). `engine.ts` creates it and `frameContext` reads it. It feeds core's focus uniform (`focusUniform`/`focusBgl`), which galaxy, filament and structure shaders read. **Joint:** a Layer-provided focus-uniform producer. It also owns a private `createFadeController`, which contradicts "A Layer never drives a fade", so moving it means turning it into a declared fade.

### J7. Palette famous / alias / structure arms: ~250
`ScoredRow` kinds `famous` / `alias` / `structure` in `rankPaletteMatches` and `paletteRows` use thumbnails (`/images/famous/<id>.webp`, `structureShotUrl`), description matching and capped lists. **Joint:** widen `LayerSearchEntry` (`thumbnail?`, `description?`, a capped class).

### J8. Tier-swap galaxy re-anchor: ~120
`state/selection/captureGalaxyFocusIds` 63, `wiring/galaxyCatalogRequest` 14, and the re-anchor half of `state/tier/watchTierSaga`. Galaxy refs are positional, so they must be captured *before* core writes the tier. **Joint:** a pre-write hook (e.g. a `tierChanging` action the Layer's saga answers). Tier itself is global and stays.

### J9. Body debug overlays in core `debugSlice`: ~80
Four of six `DEBUG_OVERLAY_ROWS` (`surface-lod-overlay`, `terrain-no-displacement`, `terrain-no-skirts`, `terrain-pick-marker`) plus `terrainPickMarkerRadiusM` / `terrainPickMarkerSliderFields` are body content. Core `interaction/createPickDriver` reads the `terrain-pick-marker` toggle, and the inbound boundary test forbids it from importing body state. **Joint:** Layer-declared debug-overlay rows.

### J10. Earth places palette: ~60
`data/palette/earthPlaces` 49 + the `flyTo` palette action. `LayerSearchEntry.id` is a focus id only. **Joint:** a search-entry action.

### J12. `starSphereRangeM` in core `deriveView`: 38
The NEAR0 view brackets the star-sphere range itself. **Joint:** a Layer range contribution to the NEAR0 row. This is small and may reasonably stay as slab infrastructure.

### J13. `bodySlabRosterIds`: ~35 (known item 3)
See the refinement above. Backlogged as `2026-10-28-per-body-slab-declaration.md` (`LayerBody` slab declaration).

### J14. Sgr A* sky capture: ~25
`data/rendering/cubemapCaptures.ts` hard-codes the `sgrAStar` row, `SKY_CAPTURE_KEYS = ['sgrAStar','solarSystem']`, and `SCALE_FADE_BANDS.sgrAStarLensing`. blackHoles imports `cubemapCaptures` 5 times. **Joint:** Layer-declared sky captures. The `solarSystem` capture is mesh-probe infrastructure and stays.

### J16. 13 galaxyCatalog/starCatalog files read `APP_SOURCE_REGISTRY` for their own rows
galaxyCatalog `create.ts`, `load/galaxyCatalogAssetRows.ts`, `render/catalogStore.ts`, `state/galaxyCatalogs/selectors.ts`, `subsystems/proceduralDiskSubsystem.ts`, `ui/GalaxiesSection.tsx`; starCatalog `load/installStarPool.ts`, `load/starCatalogAssetRows.ts`, `load/starCatalogFetcher.ts`, `load/starCatalogSlot.ts`, `passes/fieldStarSpherePass.ts`, `render/cut/starSourcesInBand.ts`, `ui/StarCatalogTuningSectionContainer.tsx`. Per composition spec §4.7 a Layer's id-domain types and lookups derive from its own `sources` tuple, and only cross-Layer readers take the composed registry; path-only today, moved from `data/sources`.

---

## STAYS: shared or infrastructure

- **S1. v2 analytic MW field: ~13,200 TS + ~5,000 WESL.** `services/gpu/renderers/galaxyField` 5,810, `galaxyGenerator/v2` 3,762, most of `@types/galaxy`, `utils/galaxy/ismMap*`, `healpixNest`, etc. 243 core files are reached *only* from `tools/` (the galaxy-renderer workbench); no app code draws them. This is real content with no Layer yet, but it is unshipped. Its home is milkyWay, per the backlog's "Draw the v2 analytic Milky Way in the milkyWay Layer" (prep joints named there: field camera, `{view,size}` targets, host into `src/`).
- **S2. Tool-shared formats and registries: ~3,500.** `galaxyCatalogFormat`, `starCatalogFormat`+`starBinCodec`, `structureCatalogFormat`, `filamentBinaryFormat`, `shellMeshFormat`, `scalarFieldPalettes`, `flowFieldConstants`, `bodyTextureRegistry`, `surfaceTileParams`, `{earth,mars}SurfaceParams`, `utils/surfaceTiles/*`, `tierTargets`. Each is one Layer plus a `tools/` builder. They stay unless the user rules that tools may import Layer files; eight tools files already do, so precedent exists. *A one-line ruling decides ~3.5k LOC.*
- **S3. Octree stack: ~2,600.** It is starCatalog-only today, but GLADE galaxy octree #932 is executing and adds galaxyCatalog, so it is engine infrastructure.
- **S4. `galaxyGenerator` v1 + `shared/`: ~2,140.** Shared with `tools/galaxy-renderer`; v1 is slated for deletion.
- **S5. Generic helpers with one user today: ~2,200.** `utils/math/{cubeSphereMesh,annulusMesh,mortonDecode3,…}`, `utils/camera/{composeBodyMvp,camPosLocal,frustumPlanesFromViewProj,…}`, `utils/worker/runDisposableWorker`, `rampLut`, `PaletteSelect`, `jsonFetcher`, `mulberry32`. They stay in `utils/` by convention.
- **S6. WESL for Layer content: ~6,000.** The README rule keeps shaders in `src/services/gpu/shaders/<family>/`.
- **S7. Shared and engine infrastructure.**
  - Spec §4 body infrastructure: the position solver, the body tables and fold, `bodyPickRenderer`, `meshBodyRenderer` + `meshAssets.generated`, `orbitTrail*`, `bodyGlintRenderer` (4 Layers), `BodyDetailCard` (3 Layers), the `satellite`/`meshBody` makers (2 Layers each), `sceneEarth`, `utils/scene/*`.
  - Shared places and constants: the `galactic-centre` place, `sgrAStarMassSolar`, `galacticCenter`.
  - Labels, marker lines, selection ring, debug lines.
  - `famousLabelStyle`, despite its name: it is also used by `bodyCaption`.
  - Tours, `featuredTabs`, the tier slice, and `SettingsAction`, which names flow and galaxyCatalog actions for tour beats: cross-Layer editorial composition.

## Quality debt noted in passing

- `@types/engine/state/FocusState`, `@types/engine/wiring/WirePointSourceDeps` and `@types/engine/layer/ComposedSources` have zero references.
- Layer-to-Layer `initialState` imports exist (see M5) while the "Layer dependency DAG" item says a Layer may never import another; the rule and the code disagree and one needs a ruling.
- The `src/utils/math/index.ts` barrel is already covered by the queued naming-ratchets PR.

## Appendix: M1 files per Layer

Owner-set analysis; each Layer's pure-move files with line counts. The M1 sweep works from this list.

```
## blackHoles 145
   74 src/utils/lensing/buildSchwarzschildDeflectionLut.ts
   21 src/utils/palette/focusShotUrl.ts
   16 src/utils/lensing/lensEdgeFadeEndRs.ts
   11 src/@types/lensing/SchwarzschildDeflectionLut.d.ts
   8 src/data/lensing/schwarzschildLutDomain.ts
   8 src/@types/settings/BlackHoleItemSettings.d.ts
   7 src/@types/settings/BlackHolesSettings.d.ts
## body 480
   94 src/data/debug/flyToPresets.ts
   46 src/data/bodies/bodyAtlas.generated.ts
   35 src/@types/scene/SurfaceCutTile.d.ts
   35 src/@types/scene/ResolvedTileResidency.d.ts
   28 src/@types/loading/BodyTextureReq.d.ts
   24 src/@types/scene/AtmosphereParams.d.ts
   22 src/@types/data/debug/FlyToPreset.d.ts
   20 src/utils/bodyTextures/bodyTextureSlotKey.ts
   20 src/@types/scene/SurfacePatchAnchor.d.ts
   20 src/@types/scene/AtmosphereConstituent.d.ts
   17 src/@types/settings/BodyItemSettings.d.ts
   17 src/@types/scene/BodySpec.d.ts
   13 src/@types/settings/EarthSettings.d.ts
   13 src/@types/settings/BodySettings.d.ts
   13 src/@types/engine/frame/PreparedBodySurfaceFrame.d.ts
   12 src/@types/scene/TileCamera.d.ts
   12 src/@types/scene/PhaseFunction.d.ts
   12 src/@types/scene/DensityProfile.d.ts
   10 src/@types/scene/ResidentHeightLookup.d.ts
   9 src/@types/settings/OrbitTrailsSettings.d.ts
   5 src/@types/scene/HeightTileImage.d.ts
   3 src/@types/camera/TerrainSubCamera.d.ts
## constellations 86
   38 src/@types/rendering/ConstellationRenderer.d.ts
   30 src/@types/loading/ConstellationsArtifact.d.ts
   12 src/@types/settings/ConstellationsSettings.d.ts
   4 src/data/constellation/constellationLineColor.ts
   2 src/data/constellation/constellationLineHalfwidthPx.ts
## cosmicWebDensity 924
   458 src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts
   65 src/@types/rendering/FieldEntry.d.ts
   63 src/@types/settings/VolumeFieldSettings.d.ts
   58 src/@types/rendering/VolumeFieldRenderer.d.ts
   46 src/services/engine/frame/passes/createScalarVolumePass.ts
   36 src/utils/clampVolumeFieldSettings.ts
   28 src/@types/engine/frame/ScalarVolumePassRow.d.ts
   27 src/utils/clampVolumeTrim.ts
   25 src/utils/clampVolumeIntensity.ts
   24 src/utils/volume/deriveVolumeLiveness.ts
   23 src/utils/clampVolumeExposure.ts
   23 src/utils/clampVolumeDensityScale.ts
   23 src/utils/clampVolumeContrast.ts
   14 src/@types/rendering/VolumeFieldLiveness.d.ts
   11 src/@types/data/volume/CosmicWebDensityFieldId.d.ts
## cosmicWebFilaments 86
   31 src/@types/rendering/FilamentRenderer.d.ts
   26 src/utils/clampFilamentIntensity.ts
   9 src/@types/settings/CosmicWebFilamentsSettings.d.ts
   8 src/data/filament/filamentBaseTint.ts
   6 src/@types/loading/FilamentReq.d.ts
   4 src/data/filament/filamentHotTint.ts
   2 src/data/filament/filamentLineHalfwidthPx.ts
## earthScenes 12
   12 src/data/bodies/earthSceneBodyIds.ts
## flow 413
   110 src/data/flow/flowFields.ts
   105 src/@types/rendering/FlowFieldRenderer.d.ts
   46 src/utils/clampFlowParams.ts
   44 src/@types/data/flow/FlowFieldMeta.d.ts
   41 src/data/flow/flowFieldMetaFromCube.ts
   22 src/@types/data/flow/FlowField.d.ts
   18 src/utils/flowFrameDeltaSec.ts
   15 src/@types/rendering/ReseedLatch.d.ts
   6 src/@types/data/flow/FlowSliderField.d.ts
   4 src/@types/data/flow/FlowSliderKey.d.ts
   2 src/@types/data/flow/FlowSliderSurface.d.ts
## galaxyCatalog 2867
   253 src/services/gpu/resources/hiResFamousTexture.ts
   183 src/utils/network/fetchGalaxyBitmap.ts
   93 src/services/engine/bake/buildPointInterleavedBuffer.ts
   93 src/@types/rendering/hiResFamousTexture/HiResFamousTexture.d.ts
   76 src/@types/rendering/InstancedQuadConfig.d.ts
   75 src/data/galaxyCatalog/colourIndex.ts
   72 src/@types/rendering/InstancedQuadRenderer.d.ts
   69 src/@types/rendering/GalaxyPointDrawSettings.d.ts
   67 src/@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskSubsystem.d.ts
   64 src/@types/rendering/TexturedDiskRenderer.d.ts
   61 src/@types/rendering/GalaxyPickRenderer.d.ts
   57 src/@types/rendering/DiskInstance.d.ts
   55 src/utils/render/disk/resolveDiskPlacement.ts
   54 src/data/galaxyLodBands.ts
   52 src/data/galaxyCatalog/galaxyCatalogTransfer.ts
   52 src/@types/rendering/ProceduralDiskRenderer.d.ts
   50 src/utils/galaxy/buildObjIdLookup.ts
   48 src/utils/galaxy/derivePointRecord.ts
   48 src/@types/loading/FetchGalaxyBitmapInput.d.ts
   47 src/utils/render/disk/maybeEmitProceduralDisk.ts
   45 src/@types/engine/subsystems/proceduralDiskSubsystem/ProceduralDiskSubsystem.d.ts
   44 src/utils/render/disk/effectiveTilt.ts
   44 src/@types/rendering/GalaxyPointRenderer.d.ts
   43 src/@types/engine/subsystems/hiResFamousSubsystem/HiResFamousSubsystem.d.ts
   42 src/utils/countEstimatedProvenance.ts
   41 src/utils/render/disk/nucleusCorner.ts
   41 src/utils/paddedRadiusMpc.ts
   41 src/@types/engine/subsystems/DiskRowVisitor.d.ts
   39 src/@types/rendering/ProceduralDiskInstance.d.ts
   38 src/utils/galaxy/nearestRowByDirection.ts
   38 src/@types/data/galaxyCatalog/GalaxyRecordSource.d.ts
   34 src/utils/render/disk/calibratedDiskSizeWorld.ts
   34 src/utils/render/disk/byDistanceToCamera.ts
   32 src/@types/rendering/PickSourceDraw.d.ts
   29 src/utils/render/disk/strideWindow.ts
   29 src/@types/settings/GalaxyCatalogSettings.d.ts
   28 src/services/engine/bake/buildPointInterleavedBuffer.worker.ts
   27 src/utils/render/disk/hiResLayerFold.ts
   25 src/utils/render/disk/apparentSizePxAtDistance.ts
   23 src/utils/render/disk/purgeStrideWindow.ts
   22 src/utils/render/disk/maxVisibleCamDistSq.ts
   22 src/utils/galaxy/galaxySbAmp.ts
   22 src/@types/engine/subsystems/TexturedDiskDeps.d.ts
   22 src/@types/engine/subsystems/DiskWalkInput.d.ts
   21 src/utils/render/disk/loadFadeAlpha.ts
   21 src/utils/galaxy/galaxyMagOffset.ts
   21 src/@types/data/galaxyCatalog/ClonedGalaxyCatalog.d.ts
   20 src/@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskFrameInput.d.ts
   20 src/@types/data/galaxyCatalog/GalaxyColumnBlock.d.ts
   19 src/utils/galaxy/durableIdClaimants.ts
   18 src/services/engine/helpers/focusedFamousIndex.ts
   18 src/@types/rendering/AtlasConfig.d.ts
   16 src/utils/render/disk/galaxyCacheKey.ts
   16 src/utils/render/disk/diskQuadExtentMpc.ts
   16 src/@types/engine/subsystems/proceduralDiskSubsystem/ProceduralDiskFrameInput.d.ts
   16 src/@types/engine/subsystems/DiskPlannerWalk.d.ts
   15 src/data/pickPaddingPx.ts
   14 src/@types/engine/GalaxyPointFields.d.ts
   14 src/@types/engine/BuildPointInterleavedBufferResult.d.ts
   12 src/@types/rendering/CapacityStrategy.d.ts
   12 src/@types/engine/subsystems/hiResFamousSubsystem/HiResFamousFrameInput.d.ts
   12 src/@types/engine/GalaxyPointDerived.d.ts
   12 src/@types/engine/BuildPointInterleavedBufferInput.d.ts
   11 src/@types/settings/BiasSettings.d.ts
   11 src/@types/engine/subsystems/hiResFamousSubsystem/HiResFamousFrameOutput.d.ts
   11 src/@types/engine/subsystems/HiResFamousPair.d.ts
   10 src/data/network/deadHostStreak.ts
   10 src/@types/rendering/hiResFamousTexture/CreateHiResFamousTextureArgs.d.ts
   10 src/@types/engine/subsystems/HiResFamousDeps.d.ts
   10 src/@types/engine/subsystems/GalaxyAtlasDeps.d.ts
   9 src/@types/rendering/DiskPlacement.d.ts
   7 src/utils/galaxy/decodeAngularWeight.ts
   7 src/data/galaxyCatalog/galaxyAtlasSlotSide.ts
   7 src/@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskTestState.d.ts
   7 src/@types/engine/GalaxyPointStats.d.ts
   7 src/@types/data/galaxyCatalog/BiasMode.d.ts
   6 src/@types/rendering/BlendMode.d.ts
   6 src/@types/loading/PgcAliasJsonShape.d.ts
   6 src/@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskFrameOutput.d.ts
   6 src/@types/engine/subsystems/proceduralDiskSubsystem/ProceduralDiskFrameOutput.d.ts
   6 src/@types/engine/subsystems/hiResFamousSubsystem/HiResFamousPerGalaxyState.d.ts
   6 src/@types/engine/BuildAliasIndexInput.d.ts
   5 src/@types/settings/ThumbnailsSettings.d.ts
   5 src/@types/loading/HiResFamousReq.d.ts
   5 src/@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskSubsystemWithTestSeam.d.ts
   5 src/@types/engine/subsystems/DiskPlannerWalkDeps.d.ts
   3 src/@types/loading/FamousGalaxiesPayload.d.ts
   2 src/data/galaxyCatalog/sdssTargetMeanMag.ts
   2 src/@types/loading/PgcAliasMap.d.ts
## lightTime 39
   26 src/data/lightTime/lightTimeSpheres.ts
   7 src/@types/settings/LightTimeSettings.d.ts
   6 src/data/lightTime/lightTimeFadeBands.ts
## localBubble 74
   23 src/@types/rendering/LocalBubbleRenderer.d.ts
   13 src/data/localBubble/localBubbleSliderFields.ts
   12 src/data/localBubble/shellVertexFormats.ts
   9 src/utils/clampLocalBubbleIntensity.ts
   9 src/@types/settings/LocalBubbleSettings.d.ts
   8 src/data/localBubble/localBubbleTint.ts
## milkyWay 550
   159 src/data/milkyWay/milkyWaySliderFields.ts
   127 src/services/engine/galaxyGenerator/v1/milkyWayCloud.ts
   70 src/services/engine/galaxyGenerator/v1/milkyWayModelMatrix.ts
   46 src/@types/galaxy/MilkyWayCloud.d.ts
   26 src/services/engine/galaxyGenerator/v1/milkyWayFadeAlpha.ts
   26 src/@types/settings/MilkyWaySettings.d.ts
   19 src/services/engine/galaxyGenerator/v1/milkyWayModelCached.ts
   19 src/services/engine/galaxyGenerator/v1/milkyWayCamPosModel.ts
   14 src/@types/galaxy/MilkyWayCloudBuffers.d.ts
   10 src/utils/astro/galacticYearMyr.ts
   10 src/data/milkyWay/milkyWayFacts.ts
   9 src/@types/data/milkyWay/MilkyWaySliderField.d.ts
   8 src/@types/data/milkyWay/MilkyWaySliderKey.d.ts
   7 src/data/milkyWay/milkyWayPickMinSizePx.ts
## missions 1025
   120 src/data/missions/missionEvents.generated.ts
   75 src/utils/exhibits/mission/buildMissionProfile.ts
   62 src/data/bodies/makers/orbiter.ts
   58 src/utils/orbit/tessellateTrack.ts
   54 src/utils/exhibits/mission/missionFrame.ts
   40 src/utils/labels/meshBodyCaption.ts
   39 src/utils/exhibits/timeline/timelineAxisLabels.ts
   39 src/utils/exhibits/mission/bodyRelativeState.ts
   36 src/utils/orbit/hermiteTrackVelAt.ts
   34 src/utils/exhibits/mission/missionStops.ts
   25 src/utils/exhibits/timeline/describeTimelineInstant.ts
   22 src/utils/exhibits/timeline/adjacentEventId.ts
   21 src/utils/exhibits/mission/flybyOutsideBend.ts
   19 src/utils/orbit/trackKmToWorldMpc.ts
   19 src/@types/camera/MissionCameraFrame.d.ts
   17 src/utils/exhibits/timeline/timelineLanes.ts
   17 src/data/missions/hitchhikerOrbit.ts
   17 src/@types/settings/MissionsSettings.d.ts
   17 src/@types/exhibits/MissionTimeline.d.ts
   16 src/utils/exhibits/timeline/timelineFraction.ts
   16 src/utils/exhibits/timeline/currentMissionEvent.ts
   15 src/utils/orbit/periodDaysFromSemiMajorKm.ts
   15 src/@types/missions/MissionStop.d.ts
   14 src/utils/exhibits/timeline/missionEventStepMs.ts
   14 src/utils/exhibits/mission/formatMissionSpeed.ts
   13 src/@types/missions/MissionFrame.d.ts
   12 src/@types/missions/MissionCourse.d.ts
   12 src/@types/exhibits/ExhibitTimelineClock.d.ts
   11 src/utils/exhibits/timeline/timelineInstant.ts
   11 src/utils/exhibits/timeline/laneColorCss.ts
   11 src/data/missions/missionTrailStyle.ts
   10 src/utils/meshBodies/meshGroundOffsetM.ts
   9 src/@types/settings/MissionTrailsSettings.d.ts
   8 src/utils/missions/launchIsoOf.ts
   7 src/utils/exhibits/timeline/timelineAxis.ts
   7 src/utils/exhibits/timeline/formatClockDate.ts
   7 src/data/bodies/contactShadowHalfHeightM.ts
   6 src/utils/scene/emphasisDim.ts
   6 src/utils/exhibits/timeline/timelineEndMs.ts
   6 src/@types/exhibits/TimelineLane.d.ts
   6 src/@types/camera/MissionOffsets.d.ts
   5 src/utils/exhibits/timeline/missionEventMs.ts
   5 src/data/exhibits/sameInstantMs.ts
   5 src/data/exhibits/mission/missionRampMs.ts
   5 src/@types/settings/MissionCraftSettings.d.ts
   5 src/@types/exhibits/TimelineAxis.d.ts
   5 src/@types/data/mesh/ContactDecalMatrices.d.ts
   4 src/utils/exhibits/timeline/formatEventDate.ts
   4 src/utils/exhibits/timeline/formatClockTime.ts
   4 src/data/missions/capeCanaveralLc41.ts
   4 src/data/exhibits/mission/noMissionOffsets.ts
   2 src/data/exhibits/mission/missionSurfaceStandoff.ts
   2 src/data/exhibits/mission/missionSpeeds.ts
   2 src/data/exhibits/mission/missionLegWallMs.ts
   2 src/data/exhibits/mission/missionFrameMargin.ts
   2 src/data/exhibits/mission/missionFlybyLeadDays.ts
   2 src/data/exhibits/mission/missionEaseMs.ts
   2 src/data/exhibits/mission/frameCrossingsPerS.ts
   2 src/@types/exhibits/TimelineAxisLabel.d.ts
## starCatalog 710
   153 src/services/engine/helpers/nearestResolvableStar.ts
   125 src/services/engine/helpers/drawFlooredSpherePick.ts
   85 src/services/engine/helpers/resolveStarRecord.ts
   54 src/@types/settings/StarCatalogSettings.d.ts
   40 src/utils/star/starExposureRamp.ts
   31 src/services/url/decodeStarFocusId.ts
   28 src/@types/settings/StarCatalogItemSettings.d.ts
   25 src/utils/star/packStarGpuRecords.ts
   23 src/utils/star/starSourceDrawOpacity.ts
   21 src/utils/star/starColumnsOf.ts
   18 src/data/famousStarPickRadiusPx.ts
   18 src/@types/scene/PositionedStar.d.ts
   16 src/data/starExposureRamp.ts
   16 src/data/starCullSlack.ts
   13 src/utils/star/starCrossfadeOpacity.ts
   12 src/@types/data/starCatalog/StarColumns.d.ts
   11 src/@types/loading/StarCatalogReq.d.ts
   11 src/@types/data/starCatalog/StarCatalogId.d.ts
   8 src/@types/settings/SStarTrailsSettings.d.ts
   2 src/data/starPlanIntervalFrames.ts
## structure 196
   33 src/utils/labels/aboveRingAnchor.ts
   32 src/state/settings/projectMarkerCategoryVisibility.ts
   30 src/utils/format/wrapLabelName.ts
   24 src/utils/format/formatAbellDesignation.ts
   23 src/@types/loading/structureCatalogPayload/StructureMetaEntry.d.ts
   14 src/utils/picking/structurePickId.ts
   13 src/services/engine/helpers/structureIdOf.ts
   13 src/@types/loading/structureCatalogPayload/StructureCatalogPayload.d.ts
   12 src/@types/settings/StructureSettings.d.ts
   2 src/data/markerRadiusRetune.ts
## zoneOfAvoidance 223
   65 src/data/zoneOfAvoidance/zoneOfAvoidanceSliderFields.ts
   58 src/@types/rendering/ZoneOfAvoidanceRenderer.d.ts
   25 src/@types/settings/ZoneOfAvoidanceTuning.d.ts
   23 src/@types/settings/ZoneOfAvoidanceSettings.d.ts
   13 src/data/zoneOfAvoidance/zoneOfAvoidanceShell.ts
   12 src/@types/rendering/ZoneOfAvoidanceShell.d.ts
   10 src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderField.d.ts
   9 src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderKey.d.ts
   8 src/data/zoneOfAvoidance/zoneOfAvoidanceLabelText.ts
```
