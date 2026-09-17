# 02 — Data: sources, pipeline, formats, algorithms

Subagent sweep, 2026-09-17, `main` @ `845720549`. Unverified; open the cited file before relying on a claim.

Anchor docs: `docs/DATA.md` (pipeline runbook), `ATTRIBUTIONS.md` (per-source licence and citation), `docs/science.md` (the public-facing sibling), `CITATION.cff`. `tools/utils/io/rawDataRegistry.ts` (~180 keys, each with `description` / `upstream` / `fetcher` / `readme`) is the machine-readable provenance table — a site could generate its source table from it.

## 1. External data sources

**Galaxy catalogs (SKMP)**

- **SDSS** spectro galaxies + ugriz + shape — `tools/parsers/sdssCsv.ts`; manual SkyServer/CasJobs CSV. DR17, Abdurro'uf+2022.
- **2MRS** (Huchra+2012, ApJS 199,26) — `tools/parsers/twoMrs.ts` (VizieR J/ApJS/199/26).
- **GLADE v2.3** (Dálya+2018) — `tools/parsers/glade.ts` (VizieR VII/281, streamed, ~800 MB).
- **Milliquas v8** (Flesch 2023) — `tools/parsers/milliquas.ts`, `tools/fetch/fetchMilliquas.ts`, `data/raw/milliquas/README.md`. **Not in `ATTRIBUTIONS.md`.**
- **DESI DR1 LSS** (BGS/LRG/ELG/QSO) — `tools/parsers/desiFits.ts`, geometry in `tools/catalog/desiPatches.ts`. CC BY 4.0 + verbatim acknowledgment.
- **HyperLEDA** (Paturel 2003 / Makarov 2014) PA, b/a, `mod0` — `tools/parsers/hyperledaMeandata.ts`, `tools/fetch/fetchHyperLeda.ts`, `tools/fetch/buildPgcAliases.ts`.
- **2MASS XSC** (Jarrett+2000) — `tools/fetch/fetch2massXsc.ts` (VizieR TAP).
- **Cosmicflows-4** (Tully+2023) distances by PGC — `tools/parsers/cosmicflows4.ts`.

**Stars (SKST):** Gaia DR3 G<14 (`tools/fetch/fetchGaia.ts`) + Bailer-Jones EDR3 distances + GCNS 100 pc (Smart+2021) + Hipparcos-2 (van Leeuwen 2007, `tools/parsers/hipparcos2.ts`); d3-celestial constellation lines (BSD-3, vendored), resolved to real stars by `tools/stars-rs`.

**Structures (CCAT):** MCXC (Piffaretti+2011, `tools/parsers/parseMcxc.ts`), MSCC (Chow-Martínez+2014, `tools/parsers/parseMscc.ts`), plus hand-curated `data/seeds/structure_anchors.seed.json` (15 cluster / 16 group / 8 supercluster / 3 void).

**Volumes (SCFD):** CF4++ density + velocity (Courtois 2025; `tools/volumes/buildCf4Density.ts`, `tools/flow/buildFlowField.ts`); MCPM SDSS Cosmic Slime VAC (Wilde+2023 / Elek+2021 / Burchett+2020; `tools/volumes/extractMcpmCube.py` → `buildMcpmVolume.ts`); Polyphorm 2MRS local export (`buildRhizomeVolume.ts`); Edenhofer+2024 dust (`extractDustCube.py` → `buildDustVolume.ts`); mcpm-workbench promoted cubes.

**Bodies / ephemeris** (hand-transcribed into `src/data/bodies/`): JPL SSD planetary + satellite mean elements; Gillessen+2017 S-star orbits (+ Plewa+2015); Abd El Dayem+2026 S301; GRAVITY 2019 R₀ and M; Pecaut & Mamajek 2013; JPL Horizons for mesh-body orbits.

**Imagery / textures:** Solar System Scope (CC BY 4.0); NASA Blue Marble NG, Black Marble 2016, BMNG water mask, GEBCO_08, Blue Marble clouds; NASA SVS CGI Moon Kit; USGS Astrogeology Galilean and Pluto/Charon mosaics; NASA PIA11707 + "True Colors of Pluto" (chroma calibration only); EOX s2cloudless 2025 z8–13 (CC BY-NC-SA, written permission); GeoDanmark ortho z14–19; DESI Legacy cutouts; Wikipedia REST; curated famous-galaxy press images indexed in `data/seeds/famous_curated_overrides.json`.

**Heights / terrain:** ETOPO 2022 30″ (NOAA), skadi 1″ (AWS), DHM/Terræn 0.4 m, DHM Punktsky LAS, Skråfoto oblique frames — `tools/fetch/fetchHeightSources.ts`, `fetchDhm.ts`, `fetchSkraafoto.ts`, one `data/raw/<src>/README.md` each.

**Meshes:** Sketchfab Livyatan melvillei and Flowers Petunia White (CC BY 4.0, verbatim strings); NASA 3D Resources Voyager, Perseverance, Curiosity, MER, Hubble. **Fonts:** Cormorant Garamond (OFL 1.1). **Shaders:** mrange "Spiral galaxy" (CC0); Bruneton & Neyret 2008, Hillaire 2020, Bruneton 2020 as method references only.

## 2. Pipeline stages and binary formats

- **Stages:** `fetch-*` (raw → `data/raw/<catalog>/`, gitignored; README + `.sha256` committed) → parsers (`tools/parsers/*`) → cross-match / dedup / tier-select (`tools/catalog/*`) → encoders in `src/data/*/…Format.ts` → `public/data/<family>/v<N>/` → `buildDataManifest` content-hashes and writes `manifest.json` last → `syncR2` → browser `dataManifest.ts` / `dataUrl()` → typed-array decode → GPU buffers.
- **SKMP v9** — galaxy point cloud, 16 B header + 64 B/galaxy (`src/data/galaxyCatalog/galaxyCatalogFormat.ts`); tiers small / medium / large per `src/data/tierTargets.ts`.
- **SKST v1** — Morton star octree, 6 B records, 64 B header + 16 B/node, flux-mip interior nodes.
- **CCAT v1** — `structures.ccat` + `structures_meta.json`, 28 B/record.
- **SCFD v3** — self-describing scalar/vector cube, 96 B header + f16 voxels.
- **FILA v1** — variable-length polyline strips.
- **SHGT** — height tiles: lossless 129² Terrain-RGB WebP with a custom RIFF chunk (`src/data/scene/heightTileFormat.ts`); albedo tiles 512 px lossy WebP with alpha-as-land-mask.
- Also: `.mesh` binary + PNG slots, `splats.bin` / `points.bin` / `mesh.glb` + `scenes.json` (`tools/scene-recon/pack/*`), MSDF font atlas, envBrdf LUT, version-ungated JSON sidecars.
- Allow-list of what is tracked / hashed / synced: `tools/deploy/r2/allowDataFile.ts`.

## 3. Non-trivial pipeline algorithms

- `tools/catalog/crossMatch.ts` — priority dedup SDSS > 2MRS > GLADE > DESI; 5″ + |Δz/(1+z)| < 1 %; DESI patches not deduped against each other; Milliquas bypasses.
- `tools/catalog/subsampleByAbsMag.ts` + `selectTierRecords.ts` — volume-limited brightest-N backbone unioned with a flux-limited local supplement (avoids a visible shell).
- `tools/catalog/catalogDistanceFor.ts` + `localVolumeCutoff.ts` (30 Mpc) — seed → CF4 (PGC) → HyperLEDA `mod0`; blueshifted rows placed at |cz|/H₀.
- `tools/catalog/estimateLog10StellarMass.ts` — Bell et al. 2003 colour–M/L.
- `tools/catalog/dropFamousMatches.ts`, `tools/curation/dedupeByProximity.ts` — famous and curated-anchor dedup.
- `src/utils/math/redshiftToDistanceMpc.ts` — flat ΛCDM comoving distance, Simpson's rule.
- `tools/catalog/desiPatches.ts` / `desiConeCensus.ts` — cone / dec-band / ellipsoid-union drill geometries.
- `tools/filaments/buildFilaments.ts` + `tools/parsers/ndskl.ts` — DisPerSE (Sousbie 2011), 5σ persistence, 2 smooths, SDSS excluded (wedge-boundary artefact).
- `tools/stars/resolveStarDistancePc.ts` — photogeo → geo → GCNS; 1/parallax rejected (Bailer-Jones+2021).
- `tools/stars/selectStars.ts` — `((gaia ∖ hipMatched) ∪ hipBright) ∖ famous`; `supplementTaper.ts` — deterministic hash taper for TS/Rust parity.
- `tools/stars/buildStarOctree.ts` + `mergeFluxAggregate.ts` — Morton octree, fat leaves, mean-flux aggregates; `tools/stars-rs/src/main.rs` — parallel deterministic port with per-tier binary search on gzipped byte budget.
- `tools/flow/buildFlowField.ts`; `src/utils/volume/packLogTraceVoxels.ts` (shared log f16 normaliser); `tools/utils/volume/logNormalMedian.ts` (dust de-biasing).
- `tools/textures/buildSurfaceTiles.ts` + `bakeHeightLevel.ts` — global-lattice post addressing, decimation-not-averaging for parents, `flattenWaterComponents`; `colourMatchedImagerySource.ts` — EOX → Blue Marble colour matching.
- `tools/textures/bakeNormalMap.ts` (Sobel); `tools/textures/fitPlutoChroma.ts` — regression inverting PIA11707's ~6.4× chroma stretch (Olkin+2017).
- `tools/famous/deprojectDisk.ts`, `squareDeprojectCrop.ts`, `famousImageProcessor.ts`, `buildThumbTile.ts` — affine disk deprojection, sky-corner transparency, StarNet2 star removal.
- `tools/meshes/generateTangents.ts`; `tools/lut/buildEnvBrdfLut.ts` (split-sum); `tools/fonts/buildFontAtlas.ts` (msdfgen).
- `tools/scene-recon/` — known-pose COLMAP model from Skråfoto + LiDAR seed → Brush Gaussian-splat training, PDAL LiDAR pipeline, OpenMVS mesh.
- `tools/deploy/buildDataManifest.ts` — idempotent content-hash rename + manifest-last write.

## 4. READMEs liftable nearly as-is

- `tools/stars-rs/README.md` — the best single "how a builder works" page.
- `tools/mcpm-workbench/README.md`, `tools/flow-workbench/README.md`, `tools/famous-curator/README.md`, `tools/galaxy-renderer/README.md` (+ `src/engine/README.md`), `tools/scene-workbench/README.md`, `tools/record/README.md`, `tools/perf/README.md`.
- The 19 per-source `data/raw/*/README.md` provenance pages.

## 5. Gaps — in code, documented nowhere public

- **Milliquas has no `ATTRIBUTIONS.md` entry** despite being a shipped layer.
- **Hubble mesh** is in `rawDataRegistry.ts` + `MESH_SOURCES` but has no attribution section (every other mesh does).
- **StarNet2** is credited nowhere.
- **`tools/scene-recon/` is absent from `DATA.md` and `ATTRIBUTIONS.md`** — toolchain, Skråfoto, DHM Punktsky, and the `scenes.json` / `splats.bin` / `points.bin` formats.
- **`data/seeds/planet_facts.seed.json` → `buildPlanetFacts.ts` → `bodyFacts.generated.ts`** — InfoCard fact sheets with no provenance for the numbers.
- `famous_stars.seed.json` / `build-famous-stars` — one line in `DATA.md`.
- `buildPgcAliases.ts` / `pgc_aliases.json` (the Cmd+K search corpus) — no build/refresh story.
- **Void and group categories** have no catalogue provenance; `DATA.md` names only clusters and superclusters.
- **Zone of Avoidance** shape constants (`src/data/sources/zone-of-avoidance.ts`) have no documented source.
- `fitPlutoChroma.ts` — no user-facing "derived colour" note.
- GeoDanmark z14–19 has no fetcher; a fresh checkout silently falls back to EOX z13.
- Undocumented outputs: `filaments-sdss.bin`; `edenhofer-dust-*.scfd` ships with no `SOURCE_REGISTRY` row; the HyperLEDA R2 cache is deliberately partial.
- **Redistribution blocker:** three `famous_curated_overrides.json` entries carry `"license": "unknown"` (c17, c18, c29).
