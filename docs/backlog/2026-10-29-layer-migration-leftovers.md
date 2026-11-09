# What core still holds that Layers could own

**Readiness:** J-items `needs-design` (each needs a consented contract member). Surveyed at
`742f6e21b` (main + body PR 2).

**Answer.** The body PR finishes the body family, but core still holds about **10.4k LOC that could move with no
contract change**, plus about **7.3k LOC behind missing joints**. About **27k LOC (including ~11k WESL) stays in
core for a legitimate reason**: shared infrastructure, tool-shared formats, shaders by rule, or the unshipped v2
Milky Way field.

**Method.** An import graph over `src/`, `tools/` and `tests/` (6,603 files, relative imports resolved). Each core
file got an _owner set_: the Layers and core roots that reach it through core-only import chains. One Layer and no
core root means a pure-move candidate. Core-reached files were then swept by content keywords and per-kind
`switch`/`Record` tables. LOC is raw lines, excluding `.wesl` unless a row says otherwise. About 60 files needed a
"generic vs content" judgment.

## Summary table

| # | Item | Layer | Class | LOC | Blocker / joint |
|---|------|-------|-------|-----|-----------------|
| J1 | Seeded stars: Sun, famous stars, S-stars, makers, anchors (§7 step 5) | starCatalog | NEEDS-JOINT | ~2,700 | `BodyPosition` has no `anchor` kind; `SCENE_ANCHORS` / `ORBIT_REACH_BY_REGION` read core tables |
| J2 | Selection presentation: `buildGalaxyInfo` + galaxy math (via barrel), `sStarOrbitInfo` | galaxyCatalog, starCatalog | NEEDS-JOINT | ~1,340 | tables gone: each kind's `selection.kinds` facts (`toFocusable`, `focus`, `mayHaveLabel`) replaced them; the movable files remain |
| J3 | `ephemerisCorrections.generated` + `barycentricPairs` | body | NEEDS-JOINT | 1,113 | core solver (`orbitRowPlacement`) keys them by id; `LayerBody`/`OrbitalElements` would carry them |
| J4 | Content camera clips (flowOrbit, famousFlythrough, earth/Søndermarken/Perseverance flyouts) | flow, galaxyCatalog, body, earthScenes, missions | NEEDS-JOINT | ~480 | no `clips?` member; `ClipId` union + `clipRegistry` are core |
| J5 | `bodyFacts.generated` (card facts incl. `sgr-a-star`) | body, missions, blackHoles | NEEDS-JOINT | 500 | shared `BodyDetailCard` reads one table; `LayerBody` has no `facts` |
| J6 | Receding focus mode (`recedingFocusSubsystem`) | structure | NEEDS-JOINT | ~290 | core focus uniform read by other Layers' shaders; private fade controller vs "a Layer never drives a fade" |
| J7 | Palette famous/alias/structure arms | galaxyCatalog, structure | NEEDS-JOINT | ~250 | `LayerSearchEntry` lacks thumbnail/description/scoring class |
| J8 | Tier-swap galaxy re-anchor (`captureGalaxyFocusIds`, half of `watchTierSaga`) | galaxyCatalog | NEEDS-JOINT | ~120 | capture must run before core's tier write: an ordering hook |
| J10 | Earth places palette (`earthPlaces`, flyTo action) | body | NEEDS-JOINT | ~60 | `LayerSearchEntry` is focus-only |
| J12 | `starSphereRangeM` in core `deriveView` | starCatalog | NEEDS-JOINT | 38 | NEAR0 range is core-sized; no Layer range contribution |
| J13 | `bodySlabRosterIds` (`SCENE_PLANETS` roster) | body | NEEDS-JOINT | ~35 | known #3; per-body slab on `LayerBody` (backlog) |
| S1 | v2 analytic Milky Way field + `galaxyField` renderer | milkyWay (future) | STAYS (for now) | ~13,200 (+~5,000 WESL) | only `tools/galaxy-renderer` reads it; backlog "Draw the v2 analytic Milky Way in the milkyWay Layer" |
| S2 | Tool-shared formats/registries (catalog, star, structure, filament, shell-mesh formats; body texture + surface-tile registries) | 9 Layers | STAYS* | ~3,500 | writer (tools/) ↔ reader (Layer) contract; needs a one-line ruling |
| S3 | Octree stack (`gpu/octree`, `services/octree`, `utils/octree`, `data/octree`, `@types/octree`) | starCatalog today | STAYS | ~2,600 | GLADE octree #932 adds galaxyCatalog as second user |
| S4 | `galaxyGenerator` v1 + `shared/` | milkyWay + tools | STAYS | ~2,140 | shared with `tools/galaxy-renderer`; v1 slated for deletion |
| S5 | Generic helpers whose only user today is one Layer | various | STAYS | ~2,200 | `utils/` convention |
| S6 | Shaders for Layer content | all | STAYS | ~6,000 WESL | README rule |
| S7 | Body infrastructure per spec §4, shared places, labels/markers/selection ring, tours, featured tabs, tier | shared | STAYS | n/a | shared by ≥2 Layers or engine infrastructure |

Totals: MOVE-NOW 0 (every M-item has shipped). NEEDS-JOINT ~7,200. STAYS ~27,000 including ~11,000 WESL.

Known items, refined:

1. **Seeded stars** are sized at ~2.7k (J1). Stars are _anchors_, and `BodyPosition` only knows `site | orbit | sampled`. S-stars already fit `orbit`.
2. **Four core exhibits**: three moved to `compositions/exhibits/` (cross-Layer content); Observable Universe went with the horizon shell into the `cosmicHorizon` Layer.
3. **`near0SphereBodies`** filters through `bodySlabRosterIds`, the hand roster (`SCENE_PLANETS` + mesh bodies) (J13).
4. **blackHoles' "anchor" read** is a core _place_ (`galactic-centre`, shared with the S-stars, regions and Milky Way framing) and legitimately stays. The real content leak is the `sgr-a-star` row in `bodyFacts.generated` (J5). `sgrAStarMassSolar` has 3 readers, so it stays.

## Open ruling

**May `tools/` import a Layer's format/registry files?** (S2, ~3.5k LOC.) Eight `tools/` files already import
Layer files, so precedent exists; the 2026-10-29 ruling says yes, and the Layer M1 plan moved the S2 formats.

## NEEDS-JOINT: a contract member or seam is missing. Each one needs the user's yes.

### J1. Seeded stars (spec §7 step 5): ~2,700
`data/bodies/{famousStars.generated 1430, sStarElements 603, makers/sStar 70, sStarAppearance 62, makers/star 46, sStarOrbitInfo 44, sceneSStars 41, makers/starAnchor 29, famousStarsIndex 26, seededStarCatalogsBySource 24, sceneStars 22, sun.generated 20, seededStarCatalogs 19, sceneSun 13, sStarOrbitalElements 12, starResolvePx 4}`, plus `SStarSeed`, `FamousStarRow`, `SeededStarCatalog*` types, and star-only orbit helpers (`pericentreSpeedKmS`, `skyInclinationToFrameInclination`, `skyPositionAngleToFrameAngle`, `meanAnomalyAtJ2000`, `temperatureToLinearRgb`, `absMagFromGalacticCentreK`).
**Core readers.**
- `sceneBodies.ts` (`SCENE_SUN`, `SCENE_STARS`, `SCENE_S_STARS`), `sceneAnchors.ts` (`SUN_GENERATED`, `FAMOUS_STARS_GENERATED` → `starAnchor`), `orbitalElements.ts` (`S_STAR_ORBITAL_ELEMENTS`), `orbitReachByRegion.ts` (`SCENE_ANCHORS`).
- Also `bodySearchNames`, `constellationOfBody`, `mayHaveLabel`, `encode/decodeStarFocusId`, `rankPaletteMatches`.
- `starCatalog` itself reads 7 of these core files.

**Joint.** `BodyPosition` is `site | orbit | sampled`, and a fixed star is an anchor (`AnchorBody`). Needed: a `{ kind: 'anchor' }` position, or a Layer-folded anchor list, so `SCENE_ANCHORS` becomes a fold. S-stars already fit `orbit`. `ORBIT_REACH_BY_REGION` then reads the composed rows, as the spec says. `SCENE_ANCHORS` already holds a non-body row (`GALACTIC_CENTRE_ANCHOR`, a `PlaceId`), so the fold is the place-anchor table and should be named and filed as one rather than under `data/bodies/`.

### J2. Selection presentation tables: ~1,340 movable behind them
The per-kind core tables this item named (`BUILD_FOCUSABLE`, `REF_OF`, `focusFraming`, `mayHaveLabel`, `targetIdentityKey`, `selectionHaloTable`) are gone: each Layer's `selection.kinds` declares `toFocusable`, `focus` and `mayHaveLabel`, read through `selectionKindOf`. What still sits in core behind the galaxy, star, structure and MW kinds:
- `helpers/buildGalaxyInfo` 264, plus `famousDisplayName` 36 and `utils/format/{formatMorphology,formatLookback,famousWikipediaTitle}` 82.
- Galaxy math reached only through `buildGalaxyInfo`'s barrel import: `sdssName` 82, `galaxyType`+3 117+108, `iauName`+`iauRaDecSuffix` 120, `sdss{Explorer,Thumbnail,Navigate}Url` 97, `dssThumbnailUrl` 49, `aladinLiteUrl` 32, `ned*Url` 67, `galaxyThumbnailFovArcmin` 29, `lookbackTimeGyr` 40, `earthEraForLookback` 56, `hubbleVelocityKmS` 45, `cartesianToRaDecZ` 86, `format{Ra,Dec}Sexagesimal` 85. About 913 in all.
- `data/bodies/sStarOrbitInfo` 44, which the star Layer's `selection/utils/starDetail` reads.
- The galaxyCatalog fact selectors in `state/engine/selectors.ts`; the palette and the remote read `selectFamousGalaxiesMeta` too.

**Joint.** Delivered by [the selection-kind-facts spec](../superpowers/specs/completed/2026-11-05-selection-kind-facts-design.md) as each Layer's static `selection.kinds`; what remains is moving the files above.

### J3. Ephemeris corrections + barycentric pairs: 1,113
`ephemerisCorrections.generated` 1,088 (26 bodies: the planets and their moons) and `barycentricPairs` 25 (earth/moon). Both are read only by the core solver, `utils/orbit/orbitRowPlacement.ts`, keyed by element id. They are body content. **Joint:** the row's `OrbitalElements` (or `LayerBody`) carries its correction and barycentre. This widens `LayerBody`, which needs consent. The generator (`build-ephemeris-corrections`) would then emit into `layers/body/`.

### J4. Content camera clips: ~480
`data/animation/clips/flowOrbit 55` → flow, `famousFlythrough 70` → galaxyCatalog, `{earthFlyout 94, sondermarkenFlyout 81, perseveranceToSondermarken 141, earth*Loop 36}` → body/earthScenes/missions. `clipRegistry` and the `ClipId` union are core. Readers include `navigateSaga`, the remote menu, the debug clip triggers and `tools/record`. **Joint:** a `clips?` Layer member, or rule clips cross-Layer choreography like tours, in which case they stay. This is low value. `cosmicFlows` is settled: it drives several Layers' state, so it lives in `src/compositions/clips/` (M5).

### J5. `bodyFacts.generated`: 500
One table of card facts for 41 ids: planets, moons, craft and `sgr-a-star`. It is read by core's shared `BodyDetailCard` and by `blackHoles/ui/BlackHoleDetailCard`. **Joint:** per-row facts (`LayerBody.facts?`), or one generated facts file per Layer. Either way the seed and generator split.

### J6. Receding focus mode: ~290
`subsystems/recedingFocusSubsystem` 146 + `RecedingFocusSubsystem.d.ts` 66 + `ZERO_FOCUS`. `engine.ts` creates it and `frameContext` reads it. It feeds core's focus uniform (`focusUniform`/`focusBgl`), which galaxy, filament and structure shaders read. **Joint:** a Layer-provided focus-uniform producer. It also owns a private `createFadeController`, which contradicts "A Layer never drives a fade", so moving it means turning it into a declared fade.

### J7. Palette famous / alias / structure arms: ~250
`ScoredRow` kinds `famous` / `alias` / `structure` in `rankPaletteMatches` and `paletteRows` use thumbnails (`/images/famous/<id>.webp`, `structureShotUrl`), description matching and capped lists. **Joint:** widen `LayerSearchEntry` (`thumbnail?`, `description?`, a capped class).

### J8. Tier-swap galaxy re-anchor: ~120
`state/selection/captureGalaxyFocusIds` 63, `wiring/galaxyCatalogRequest` 14, and the re-anchor half of `state/tier/watchTierSaga`. Galaxy refs are positional, so they must be captured *before* core writes the tier. **Joint:** a pre-write hook (e.g. a `tierChanging` action the Layer's saga answers). Tier itself is global and stays.

### J10. Earth places palette: ~60
`data/palette/earthPlaces` 49 + the `flyTo` palette action. `LayerSearchEntry.id` is a focus id only. **Joint:** a search-entry action.

### J12. `starSphereRangeM` in core `deriveView`: 38
The NEAR0 view brackets the star-sphere range itself. **Joint:** a Layer range contribution to the NEAR0 row. This is small and may reasonably stay as slab infrastructure.

### J13. `bodySlabRosterIds`: ~35 (known item 3)
See the refinement above. Backlogged as `2026-10-28-per-body-slab-declaration.md` (`LayerBody` slab declaration).

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

- Layer-to-Layer `initialState` imports exist while the "Layer dependency DAG" item says a Layer may never import another; the rule and the code disagree and one needs a ruling.
- The `src/utils/math/index.ts` barrel is already covered by the queued naming-ratchets PR.
