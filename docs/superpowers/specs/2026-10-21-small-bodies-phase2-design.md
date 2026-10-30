# Vesta, Ceres and Bennu as shape-model bodies — design

**Status:** rulings taken in session 2026-10-20/21; re-targeted 2026-10-29 at the
`body` Layer after Body Layers landed (#946, #959, #960; #941's tagged ids).
The shape held: only file homes moved. Phase 2 of the small-body
programme ([backlog: phases 3–4](../../backlog/2026-10-19-small-body-shape-models.md));
phase 1 (Phobos, Deimos) shipped in #926/#927
([spec](completed/2026-10-19-phobos-deimos-mesh-design.md)). One PR, the ground
preparation as its first commit. Source facts, URLs and the measurements behind
them: `.superpowers/sdd/small-bodies/data-recon.md` (gitignored; checked at the
primary sources 2026-10-20).

## Goal

Three bodies a visitor can find and fly to: Vesta, Ceres and Bennu, each on its
real heliocentric orbit, drawn from its mission shape model with baked relief and
its USGS map, the way Phobos is now. From the solar-system view their names are
always on, under their own **Small bodies** checkbox in Labels & Guides.

## Rulings (user)

- **Real places.** Heliocentric orbits like Pluto, focus and fly-to like Phobos.
- **Labels always on**, under a new "Small bodies" checkbox that hides **labels
  only**; the bodies always draw. (No checkbox hides any body today; a body
  show-toggle is out of scope.)
- **Orbit lines** come from the existing Orbit trails checkbox (automatic for a
  celestial row, `coreTrailElements.ts:18`).
- **Camera** as at Phobos: the floor is the bounding sphere
  (`bodyGroundRadiusAtM`), whole-body views. Over Vesta's south pole that leaves
  the camera ~80 km above the floor of Rheasilvia — accepted.
- **Orbit accuracy:** all three join the Horizons correction fit the planets use
  (`tools/bodies/horizonsBodies.ts`, `fittedBodies.ts`).
- **Bennu's spin:** a constant rate fitted at 2026; no spin-acceleration field.
- **Checkbox shape:** "Small bodies" is a source-registry row with no table of
  its own (below). Its panel position after the Milky Way rows is accepted.
- **Packaging:** one PR, ground preparation as the first commit.
- **Home:** rows in the `body` Layer, beside the planets and moons (waited for
  Body Layers rather than building on the core tables it moved).
- **Bennu fallback:** if Bennu draws wrong at 250 m, this PR ships Vesta and
  Ceres, and Bennu moves to its own PR with the renderer work.

## Ground preparation (first commit, behaviour-neutral)

From a refactor-ground pass (2026-10-20; a fresh greenfield cross-check reached
the same per-row shape independently).

- **G1 — a celestial row declares its caption kind.** Every `SCENE_PLANETS` row
  captions as the literal `'planet'` (`src/layers/body/present/sceneBodyLabels.ts:49`),
  which is why moons, Pluto and Phobos all sit under "Planets". A small body would
  need an id check inside that loop. Prep: `PlanetBody.captionKind: 'planet'`
  (`src/@types/scene/PlanetBody.d.ts`), set by the `body` Layer's row-makers
  (`src/layers/body/bodies/makers/heliocentricPlanet.ts`, `satelliteBody.ts`),
  read by `sceneBodyLabels` in place of the literal. No output changes. (The
  star Layer already maps its source items to caption kinds the same way:
  `starCaptionKinds.ts:11`.)

Re-checked after Body Layers (2026-10-29): the verdicts stand. A second body
source with its own table would now touch ~20 `SCENE_PLANETS` readers (roster,
slab rows, glint cap, both pick-packing sites), so the empty-table source entry
remains the growth path. Everything else lands as growth at existing seams.

## The sources

| Body | Shape (NAIF DSK, km, IAU body frame, origin at centre of mass) | Plates | Radius | Map (USGS, planetocentric, east-positive) |
| --- | --- | --- | --- | --- |
| Vesta | `DAWN/kernels/dsk/dawn_vesta_grv_icq0512_v1.bds`, 112,483,328 B | 3,145,728 | 212.4–292.4 km | `Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif`, 356,659,263 B, left edge −180° |
| Ceres | `DAWN/kernels/dsk/dawn_ceres_grv_icq0256_v2.bds`, 30,365,696 B | 786,432 | 442.4–487.0 km | `Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif`, 27,280,830 B, left edge **0°** |
| Bennu | `pds/pds4/orex/orex_spice/spice_kernels/dsk/bennu_g_00880mm_alt_obj_0000n00000_v020.bds`, 112,964,608 B | 3,145,728 | 213.7–291.5 m | `Bennu/Bennu_global_ShapeV20_GndControl_ROLOphase_ALBEDO_8bit_v6.tif`, 315,960,161 B, left edge **0°**, covers ±55° only (0 = NoData) |

About 960 MB of downloads; all gitignored under `data/raw/meshes/<id>/`.

- **Frames agree, no longitude offsets.** Vesta's shape (grv221108 frame) and
  its USGS mosaic both use Claudia″ (= IAU 2015); only raw Dawn-Claudia
  products need +150°, and none is used. Ceres keeps Kait at 0° in every
  system. Bennu's v020 shape and ShapeV20 mosaic share one frame. The
  prototype's cross-correlation found all three at 0°.
- **None of the maps is shaded relief** (avoid Vesta's "ClrShade" product).
  Vesta and Ceres are clear-filter mosaics with some illumination left in;
  Bennu's is true normal albedo.
- **Licences:** NASA PDS archive, no licence stated (as Phobos); USGS maps
  "please cite authors" (Vesta, Ceres) and public domain (Bennu). Credits per
  the recon file.
- **Ceres as a mesh too.** It is 7.5 % flattened: a sphere misses its silhouette
  by 27 km at the poles, and body rows have no oblateness. The mesh path is the
  one that adds nothing.

## Design

### Data rows

- **One `LayerBody` file per body** in `src/layers/body/bodies/` (`vesta.ts`,
  `ceres.ts`, `bennu.ts`, templated on `pluto.ts`: body, position, rotation in one
  row), **appended** to `BODY_BODY_ROWS` in `bodyBodyRows.ts` — pick index is
  array position. Core folds them into `ORBITAL_ELEMENTS`, `ROTATION_ELEMENTS`,
  `SCENE_PLANETS` and `SCENE_BODIES` (`src/data/bodies/layerBodyRows.ts`).
- **Orbits** — `position: { kind: 'orbit', elements }` from Horizons osculating
  elements at JDTDB 2461333.5 (2026-10-20), heliocentric ecliptic J2000, mean
  anomaly back-propagated to J2000 unwrapped, `focusId: asSceneBodyId('sun')`,
  written inline in Pluto's form (no `plane`, so ecliptic), with the recon's
  1900–2100 secular Ω̇/ω̇ rates and Ω, ω back-propagated by them. (Plan-time
  call, 2026-10-30: `orbiter()` is the spacecraft maker and pins ω̇ = 0.) The
  query and full-precision elements are in the recon file.
- **Correction fit** — `HORIZONS_BODIES` rows (targets `'1;'`, `'4;'`,
  `'101955;'`, centre `'500@10'`, daily step) and `FITTED_BODIES` rows with
  `outside: 'hold'`. Bennu's Horizons record starts 1900-01-02, so its span
  starts there. A fixed conic misses these bodies by far more than any planet
  (Ceres/Vesta 16–34M km, Bennu ~300M km at the span ends, mostly along-track),
  and the Cartesian fit stops at 900 km and throws above 1,000 km
  (`buildEphemerisCorrections.ts:115` runs the ΔM pre-fit only for rows with a
  non-Sun focus). *Builder's call:* extend the ΔM pre-fit to these heliocentric
  rows, which also keeps each body on its drawn trail, as an explicit
  `FittedBody.fitMeanAnomaly` flag (planets false, so their corrections
  regenerate unchanged); if Bennu still misses
  the stop, shorten its span to the decades it does fit (`outside: 'hold'`).
  Commit the regenerated corrections.
- **Rotation** — each row's `rotation` field, IAU pole form as Pluto's (not
  `tidallyLocked`, which throws without a host planet):
  | Body | α₀ | δ₀ | W₀ | Ẇ (°/d) | Source |
  | --- | --- | --- | --- | --- | --- |
  | Ceres | 291.418 | 66.764 | 170.650 | 952.1532 | IAU 2015 (pck00011) |
  | Vesta | 309.0611 | 42.2324 | 284.6431 | 1617.3331292 | `dawn_vesta_grv221108_v1.tpc` (the shape's own frame; IAU's rate drifts 1.1° by 2026) |
  | Bennu | 85.45864 | −60.36468 | 318.8603 | 2011.1822127 | `bennu_v17.tpc`, linearised about 2026-10-20 (YORP W₂ folded in; 27° off at ±10 yr) |
- **Bodies** — a `smallBody(spec)` row-maker in
  `src/layers/body/bodies/makers/` (as `heliocentricPlanet`, with
  `captionKind: 'smallBody'`). Datum = mean radius (Vesta 261.4 km, Ceres
  469.7 km, Bennu 242 m); `reliefM` = the baked mesh's measured extremes minus
  the datum, rounded outward. Seed albedos chosen by eye against the existing
  rows, keeping the physical order Vesta ≫ Ceres > Bennu.
- **Palette tints, body facts** (`planet_facts.seed.json`: Rheasilvia, Ahuna
  Mons, the OSIRIS-REx sample), **search aliases** if needed.

### Labels

- `CaptionKind` gains `'smallBody'`: priority 18, below `planet` (20) and above
  `meshBody` (12); fade `SOLAR_SYSTEM_REACH`, as planets.
- `Source.SmallBody = 38` (the satellites Layer took 37 after this spec was
  first written) and `src/layers/body/sources/smallBody.ts`
  (`BodySourceEntry`, label "Small body", plural "Small bodies", `bearsLabel`),
  added to `BODY_SOURCE_ROWS` (`bodySourceRows.ts`); `BodySourceId`, the
  `bodies.items` slot and the checkbox follow from that row.
  `BODY_CAPTION_ITEM` (`src/layers/body/present/produceSceneBodyCaptions.ts`)
  maps `smallBody` → `'small-body'`.
- `BODY_PICK_ROWS['small-body'] = []` (`src/data/bodies/bodyPickRows.ts`, total
  over `BodySourceId`): the one body source with no table of its
  own. Its bodies live in `SCENE_PLANETS` and pick as `Source.Planet` + index,
  like every celestial row; the entry exists only to carry the checkbox. A
  comment at the row says so. (The alternative, caption categories split from
  the source registry, was weighed and declined.)
- Exhaustive switches over `Source` gain a case; `docsSettings.ts` gains the
  checkbox row.

### Shape models

- **DSK → OBJ** is a documented one-off per body in its README, beside the curl
  line (SPICE `dskexp -format 3`, or `spiceypy`'s `dskv02`/`dskp02`); no
  converter enters the repo. `meshes.sha256` pins the `.bds` downloads.
- `importMesh.py`: three `SOURCES` rows (OBJ, `scale=1000`) with
  `lonlat_albedo`. No new fields: a 0° left edge (Ceres, Bennu) is a 180° shift
  in the existing `lon_offset_deg`, and `rock_image` already fills pixels below
  1/255 with the median, which covers Bennu's NoData caps.
- **Map size:** Vesta's mosaic alone is ~5.7 GB as a float RGBA buffer in
  `rock_image`. *Builder's call:* the README step downsamples any map wider
  than 8192 px before import (`sips` or `gdal_translate`); the atlas is 4096.
- `meshPrebake.py`: `source(<id>, relief=True)` for each.
- `MESH_SOURCES` rows with `bodyFromSource` (the glTF Y-up undo, as Phobos) and
  `origin: 'source'`; `SHAPE_MODEL_BODY_IDS` gains the three ids;
  `npm run build-meshes`; `RAW_DATA` rows, READMEs, `ATTRIBUTIONS.md` and
  website `dataSourceNotes` entries.

### Who runs what

Downloads, the DSK conversion (`spiceypy` in a scratch venv), the Blender bake
and `build-meshes` run on the maintainer's Mac in the session, as for Phobos;
CI cannot gate them. Publishing the baked assets (`npm run sync-r2-secure`)
happens before merge, with the user's go at that moment.

### Runtime

Nothing new. Each body self-hosts its slab row (`meshBodySlabHostId`); the
slab and glint caps derive from `SCENE_PLANETS.length`
(`layerSlabRowHeadroom.ts:13`, `bodyGlintRenderer.ts`), so they grow on their
own. Glints (planet class), trails, regions, search and focus come from the rows. Load radius stays bounding radius × 1e5.

## Tests

- Extend the phase-1 tests by pattern: `meshPresentations.test.ts`,
  `meshSources.shapeModels.test.ts`, `bodyGroundRadiusAtM.test.ts`.
- `produceSceneBodyCaptions.test.ts`: a small body captions under
  `'small-body'`, and unticking it hides only the small bodies.
- `tests/fixtures/bodyStatesJ2000.json` regenerated for the three new ids
  (existing rows unchanged).
- One-off orientation check per body, recorded here as for Stickney: a named
  feature on the baked mesh (Vesta: Rheasilvia's centre near the south pole;
  Ceres: Occator at 20°N, 239°E; Bennu: its equatorial ridge) lands at its
  catalogue lon/lat.

## Risks

- **Bennu at 250 m** is 20× smaller than Deimos, the smallest celestial row
  today; body-metre slab precision and the glint→mesh handoff are unproven at
  that size. Eye-check it first. **Ruling:** if it draws wrong, this PR ships
  Vesta and Ceres and Bennu moves to its own PR with the renderer work (and its
  perf gates).
- **Clear-filter mosaics** keep some shading; the median rescale and the
  99.7th-percentile cap (Phobos) apply.

## Out of scope

Phases 3–4 (backlog), a body show-toggle, featured cards for the new bodies, a
DSK reader, a spin-acceleration rotation term, the website object catalogue's
grouping (it would list the three under "Sun, planets and dwarf planets").
