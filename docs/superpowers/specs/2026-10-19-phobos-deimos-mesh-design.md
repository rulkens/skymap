# Phobos and Deimos as shape-model meshes — design

**Status:** rulings taken in session 2026-10-19. Phase 1 of the small-body
programme ([backlog: phases 2–4](../../backlog/2026-10-19-small-body-shape-models.md)).
Two PRs: the ground preparation first (behaviour-neutral), then this feature.

## Goal

Phobos and Deimos stop being lambert-lit spheres. Close up they draw the
mission shape models — Gaskell's 3.1M-facet Phobos, Thomas' Deimos — decimated
to the mesh triangle budget, with a relief (normal) map baked from the full
model, and Phobos with its Viking colour map. Everything they are as moons
stays: orbit, tidal lock, trail, planet-tier caption, info-card Radius row,
surface camera, planet pick slot.

Prototype of the look: <https://claude.ai/artifact/789req9L8sFa4UWH6eHPSz>.

## The sources

| Body | Shape (NAIF `ROSETTA/kernels/dsk/`) | Facets | Radius (measured) | Colour |
| --- | --- | --- | --- | --- |
| Phobos | `PHOBOS_M003_GAS_V01.OBJ` (Gaskell) | 3,145,728 | 8.10–13.94 km | USGS `Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif`, 14400×7200, planetocentric, east-positive, left edge −180° |
| Deimos | `DEIMOS_K005_THO_V01.OBJ` (Thomas) | 5,184 | 3.58–8.71 km | none (the USGS basemap is shaded relief, lighting baked in) |

Both models are in km, body-fixed, origin at the centre of mass, +X along the
long axis (the sub-Mars direction in the IAU frame), +Z the spin pole. NAIF
serves the OBJ variants directly, so no DSK reader is needed for phase 1.
Licence: NAIF/PDS products are public domain; credit Gaskell (PSI) and Thomas
(Cornell) per the PDS citations; USGS mosaic public domain.

Colour registration (prototype, 2026-10-16): high-passed Viking albedo
cross-correlated against the baked relief peaks at **+4.5°** longitude (ratio
5.5 vs 4.5 mirrored); confirmed by eye on Stickney and its neighbours.

## Rulings

- **Identity:** a moon drawn as a mesh. Phobos/Deimos stay in `SCENE_PLANETS`
  (celestial bodies); only their *presentation* changes. Not converted to
  `SCENE_MESH_BODIES` rows (that path loses trail, surface camera, caption
  tier, Radius row, pick slot and shrinks the glint cap).
- **Relief bake:** Blender hi→lo. A new pass in `meshPrebake.py` decimates a
  copy and bakes a tangent-space normal map from the full-resolution source
  onto the smart-projected atlas (selected-to-active ray cast). Works on any
  shape, so phases 2–3 (67P, Arrokoth) need no second method. Runs on the
  maintainer's Mac like every prebake; not in CI.
- **Camera:** floor at the bounding sphere. `reliefM` carries the measured
  extremes, so the outer bound is the true maximum radius and the surface
  camera cannot clip the mesh. No mesh height query.
- **Colour:** Phobos ships the Viking mosaic at +4.5°; Deimos is flat albedo.
- **Packaging:** ground preparation is its own PR, merged first.

## Ground preparation (PR 1, behaviour-neutral)

Found by a refactor-ground pass over the mesh path (session 2026-10-19):

- **G1 — mesh presentation keyed by body id, not by `MeshBody` type.**
  Today the partition routes on `isMeshBody(body)` (`'meshKey' in body`,
  `sceneBodyPartition.ts:43`), and the mesh draw/pick/demand path takes
  `MeshBody[]` drawn from `SCENE_MESH_BODIES`, with pick packing
  `Source.MeshBody` + a `SCENE_MESH_BODIES` index (`meshBodiesPass.ts`).
  A celestial row cannot reach the mesh draw without becoming a `MeshBody`.
  Prep: one lookup `meshPresentationOf(id)` → `{ meshKey, boundingRadiusM } | null`
  (mission rows answer from `SCENE_MESH_BODIES`; no celestial row answers yet),
  the partition routes on it, and the mesh pass takes a narrow draw record that
  carries its own pick `{ source, index }`. Mission meshes draw, pick and load
  exactly as before; no test changes beyond the moved symbols.
- **G2 — per-source mesh origin.** `buildMeshes` recentres every mesh on its
  area-weighted surface centroid (`buildMeshes.ts:338-352`). A shape model's
  origin is the centre of mass the orbit tracks; recentring would offset the
  drawn body from its orbital position. Prep: `MeshSourceEntry.origin?:
  'surfaceCentroid' | 'source'` (absent = today's centroid), honoured by the
  bake; no existing row changes.

## Design (PR 2)

### Data

- `data/raw/meshes/phobos/`, `data/raw/meshes/deimos/`: the NAIF OBJ (gitignored),
  README in the Voyager README's shape (source URL, licence, fetch date, bytes,
  sha256, curl line), added to `meshes.sha256`; `RAW_DATA` rows
  `meshes.phobos`, `meshes.deimos`; `textures.phobosViking` for the mosaic.
- `importMesh.py` imports the OBJ (km → m, the existing `scale=` row field),
  writes `<key>.blend`. Body frame = source frame: no `bodyFromSource`.
- `MESH_SOURCES` rows with `origin: 'source'`.
- `scenePlanets.ts`: Phobos `reliefM: [-2901, 2941]`, Deimos
  `reliefM: [-2418, 2707]` (measured extremes minus the 11000 / 6000 m datums,
  rounded outward).

### Bake (`meshPrebake.py`)

- Relief pass: keep the full-resolution object as the bake *source*, decimate a
  copy to `MESH_TRIANGLE_BUDGET` as the *target*, `bake_type='NORMAL'`,
  `normal_space='TANGENT'`, `use_selected_to_active`, cage extrusion sized from
  the source↔target Hausdorff distance (logged). Atlas px per tier from
  `tierToTexturePx`.
- Albedo pass (Phobos only): the Viking mosaic is a lon/lat image, so the bake
  samples it through a lon/lat lookup on the *source* surface (planetocentric,
  east-positive, +4.5° roll) — a node setup feeding the existing emission-swap
  albedo bake. Deimos bakes a constant albedo from its seed.
- Metal-rough: constant (rock), as the bake already substitutes.

### Runtime

- A new `meshPresentationOf` answer for `phobos` / `deimos` (G1's lookup), keyed
  on the mesh assets row. The partition puts a resolved moon with a resident
  mesh in `meshes`; not yet resident → `flat` as today (a sphere until the mesh
  decodes, never nothing).
- Draw: the moons own their slab row already (`SCENE_PLANETS`), so they
  self-host in the mesh pass — `posM = 0`, their own axes; no change to
  `meshBodySlabHostId`.
- Pick: `Source.Planet` + its `SCENE_PLANETS` index, carried on the draw record.
- Load radius: `meshBodyLoadRadius` (bounding radius × 1e5) applies unchanged.
- Glint, caption, trail, card, camera rung: untouched — they read the
  celestial row, whose outer bound now includes `reliefM`.

## Tests

- `orientationForBody` / mesh frame: Stickney's centre (≈1°S, 49°W in the IAU
  frame; the test reads its body-frame direction from the baked mesh) lands
  49° from the sub-Mars point toward the leading apex at a fixed epoch — the
  model frame agrees with `rotationTidallyLocked`'s +X-to-Mars.
- `sceneBodyPartition`: Phobos with a resident mesh → `meshes`; without → `flat`
  (replaces `sceneBodyPartition.presence.test.ts:207`'s flat expectation).
- `meshBodiesPass` pick: a moon packs `Source.Planet` and its planet index.
- Bake output (tools test over the generated row): Phobos' `boundingRadiusM`
  within 50 m of 13,941 m and its origin within 50 m of the source origin
  (guards G2's `origin: 'source'`).
- Golden `bodyStatesJ2000.json` unchanged (positions/rotations do not move).

## Risks

- **Reflection probe inside the body:** probes are captured from the body
  centre with a 1 m near plane and meshes draw unculled, so a 26 km mesh may
  capture its own interior. Verify in the first eye-check; if it does, exclude
  the body from its own probe capture.
- **Hi→lo cage on Stickney's walls:** steep walls can miss rays at a small
  cage; the logged Hausdorff distance sizes it. Eye-check Stickney.
- **Viking mosaic gaps:** poles are lower quality; caps at the 99.7th
  percentile as the prototype did.

## Out of scope

Heliocentric small bodies (phases 2–4), mesh-surface camera following,
mesh-body sun shadows (existing backlog line), Deimos colour, DSK reader.
