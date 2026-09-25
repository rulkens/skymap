---
name: add-mission
description: Use when adding a spacecraft, lander, telescope, station or probe to skymap as a mesh body — a real object drawn from a GLB on an orbit or a landing site. Triggers like "/add-mission", "add New Horizons", "put the ISS in", "add the Apollo 11 site", "add a Mars orbiter", or re-sourcing an existing mission's mesh. Not for planets, moons or galaxies.
---

# `/add-mission` — add a spacecraft or landing site

## Overview

A mission is a **mesh body** (`SCENE_MESH_BODIES`) plus **one position driver**
and **one rotation row**, all keyed on the same id. Nothing is fetched at build
time: the mesh is a gitignored download imported to an editable `.blend` and
pre-baked once with Blender, and the orbit is seven JPL Horizons numbers
transcribed into a maker call. Adding one touches ten sites; this skill is
the checklist so none is missed and the numbers are transcribed, never
recomputed.

Read `docs/DATA.md` "Adding a new raw data source" first if `data/raw/` is new
to you. The reference implementations are `voyager1` (escape probe) and
`curiosity` (landing site); `hubble` (Earth orbiter) is on PR #718, together
with the `orbiter()` maker — until it merges an orbiter cannot land.

## Input

A mission name. Decide three things before touching code:

| Question                 | Answer decides                                          |
| ------------------------ | ------------------------------------------------------- |
| How does it move?        | Which position driver (table below)                     |
| What does it face?       | Which `RotationElements` arm                            |
| Is there a textured GLB? | Whether the mission can land at all — see "Mesh source" |

### Position driver

| Motion                                                                                       | Driver                                               | Maker                          | Horizons query                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Heliocentric escape or cruise (Voyager, New Horizons, Pioneer, Parker)                       | `ORBITAL_ELEMENTS`                                   | `probe()` — `focusId: 'sun'`   | `EPHEM_TYPE='ELEMENTS'`, `CENTER='500@10'`, `REF_PLANE='ECLIPTIC'`, `OUT_UNITS='AU-D'`                                                       |
| Orbiting a planet or moon (Hubble, ISS, MRO, LRO)                                            | `ORBITAL_ELEMENTS`                                   | `orbiter()` — `focusId` = host | `EPHEM_TYPE='ELEMENTS'`, `CENTER='500@<host NAIF id>'`, `REF_PLANE='FRAME'`, `OUT_UNITS='KM-D'`, plus a multi-day span to read the node rate |
| Landed (rovers, Apollo, Viking, Huygens)                                                     | `SURFACE_FIXED_SITES`                                | none — a literal row           | none; lat/lon from the mission page, **east-positive planetocentric**                                                                        |
| Halo/Lissajous orbit at L1/L2 (JWST, Roman, Gaia, SOHO), or a cruise with flybys still ahead | **not supported** — one Keplerian set cannot hold it |                                | stop and say so                                                                                                                              |

Horizons ids: spacecraft are negative (`-31` Voyager 1, `-32` Voyager 2,
`-98` New Horizons, `-48` Hubble, `-125544` ISS); hosts are `399` Earth,
`301` Moon, `499` Mars. Query template (swap COMMAND/CENTER/planes as above):

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-48'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='ELEMENTS'&CENTER='500@399'&START_TIME='2026-09-15'&STOP_TIME='2026-09-25'&STEP_SIZE='5d'&REF_PLANE='FRAME'&OUT_UNITS='KM-D'
```

Both makers take Horizons' columns **verbatim at the fetch epoch** and shift to
this table's J2000 themselves: `probe()` derives M from `Tp`; `orbiter()` takes
`epochJd` plus the node rate (Δ`OM` per day across the span — negative for a
prograde orbiter) and back-propagates Ω and M. Never fold M into 0–360 or drop a
hyperbola's negative `A`. Record the epoch and the refresh query in the mesh
README so the row can be re-fetched.

For an Earth orbiter pass `poleRaDeg: 270, poleDecDeg: 90`: `planeFrameFromPole`
puts the frame's x-axis at pole RA + 90°, and 270 lands it on the equinox where
Horizons' `FRAME` measures Ω. Other hosts: `REF_PLANE='B'` (body equator) and
the host's IAU pole — unverified so far; add the position test below.

An orbiter's plane drifts with drag and the elements are osculating, so the
phase is right at the fetch epoch and the plane is right for months; that is
the fidelity on offer. It is also the fidelity of the test.

### Rotation row

- `lookAt` for a probe with a dish or boresight that tracks a body (Voyager → Earth).
- `surfaceLocked` for a lander; the heading is **authored presentation**, spread
  so neighbours do not face the same way.
- `iau-pole` with `spinRateDegPerDay: 0` for a fixed attitude (Hubble, a station).
  The body's +X is the boresight, +Z the reference up; the row picks where they
  point. Authored, not surveyed — say so in the comment.

### Mesh source

NASA 3D Resources (<https://science.nasa.gov/3d-resources/>) is public domain,
so it is the first stop; the GitHub mirror
`nasa/NASA-3D-Resources` (`3D Models/<name>`) sometimes holds textured variants
(`(A)`, `(B)`) the site does not list. Sketchfab CC-BY models need a browser
login: hand the download to the user, then register `<key>Source` as the
whale/petunias READMEs do. **Check before committing to a model:**

```bash
npx --yes @gltf-transform/cli inspect "data/raw/meshes/<key>/<file>.glb" | sed 's/\x1b\[[0-9;]*m//g'
```

Read MATERIALS, TEXTURES, ANIMATIONS and the scene bbox. No materials or no
textures = an untextured print model; it bakes flat grey — find another source
or stop. Extents tell you the **units**: compare the longest axis with the fact
sheet (Hubble: 13.2 m; if the bbox reads 525, it is inches). Units off by a
constant get a `scale=` on the importer row (step 3), never a hand rescale of
the download. Then dump each material's Principled values (`metallic`,
`roughness`) — NASA's models type every surface matte whatever it is made of,
and the bake copies that verbatim. Foil, polished metal and glass get a
per-material `materials=` override on the same row; the mesh's `README.md`
says which material is which surface.

Then find the **axes** — which source axis is the boresight/dish/forward and
which is up — by rendering the source down all six axes and looking:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python .claude/skills/add-mission/sixviews.py -- "data/raw/meshes/<key>/<file>" /tmp/<key>-views
```

The script prints Blender-frame bounds and writes `view_pX.png` … `view_mZ.png`
(camera on that axis, image up = Blender +Z for the four side views, +Y for
`pZ`/`mZ`, which is what the script's `up='Y'` resolves to). Blender is Z-up;
the glTF the prebake exports is Y-up, and `bodyFromSource` is in **glTF** axes:
Blender +Z = glTF +Y, Blender +Y = glTF −Z, X unchanged. Record the table of
features → glTF axes in the README exactly as the Voyager README does.

## Procedure

Every step is a literal edit site. Tick them all.

1. **Raw asset** — `data/raw/meshes/<key>/`: the download (gitignored), a
   `README.md` copied in shape from `voyager/README.md` (model, author, source
   URL, licence, fetch date, byte size, sha256, curl line, "the `.blend` — the
   edited source" listing every hand edit, "what the pre-bake does", attribution
   string, "as inspected" units + axes, and the Horizons refresh query for an
   orbit row), and a line in `data/raw/meshes/meshes.sha256` for the download.
   The directory is named for the mesh key, which names the MODEL (`mer`, not
   `spirit`), not the mission that flew it.
2. **Registry** — `tools/utils/io/rawDataRegistry.ts`: four rows
   `meshes.<key>Source` (the download, `upstream:` the model page),
   `meshes.<key>Blend` (`<key>.blend`, `fetcher:` the import script),
   `meshes.<key>` (the `<key>.prebaked.glb`, `fetcher:` the prebake script) and
   `meshes.<key>.readme`, copied from the voyager quartet.
3. **Import** — `tools/meshes/prebake/importMesh.py` `SOURCES`: one
   `"<key>": source("<file>", frame=…, drop_materials=…, scale=…, materials=…)`
   row. `frame` only for a source with deploy animations; `drop_materials` for
   rig-pivot and fake shadow materials; `scale` multiplies the root objects
   (the join applies it before anything measures); `materials` maps a source
   material name to `metallic` / `roughness` / `gain` (Base Color multiplier —
   a mid-grey texture becomes a metal's reflectance once metallic, so foil
   wants ~2) / `bump` (metres of relief per unit of the colour map's luminance,
   for a source with no normal map; a low-contrast texture needs several
   centimetres). `npm run import-mesh -- <key>` writes `<key>.blend`; add its
   line to `meshes.sha256`. Edits the row cannot express are hand edits in
   Blender 5.2 LTS that a re-import overwrites, so the README lists each one.
4. **Prebake** — `tools/meshes/prebake/meshPrebake.py` `SOURCES`: one
   `source("<key>")` row, no per-row `triangles=`: the prebake decimates to the
   one `MESH_TRIANGLE_BUDGET` (`src/data/mesh/meshTriangleBudget.ts`).
   Run `npm run prebake-mesh -- <key>` (Blender 5.2, ~10–30 s) and read the
   log: extent in metres must match the fact sheet.
5. **Mesh source row** — `tools/utils/io/meshSources.ts`: `tiers: { small: {
raw: 'meshes.<key>' } }`, licence, the attribution string, and `bodyFromSource` as a
   column-major **proper** rotation (det +1) from the axis table. Same source
   frame as a rover (up +Y, forward +Z) → `[0, 1, 0, 0, 0, 1, 1, 0, 0]`;
   dish/boresight on +Y, up +Z → `[0, -1, 0, 1, 0, 0, 0, 0, 1]`.
6. **Bake** — `npm run build-meshes` rewrites `meshAssets.generated.ts` (all
   keys; the others must not change) and per-tier
   `public/data/meshes/<key>-<tier>.mesh` / `<key>-<tier>_{albedo,mr,normal}.webp`
   plus the untiered `<key>_contact.webp`. Check the
   row: `substituted: []` for a PBR-baked source, `boundingRadiusM` plausible,
   `groundOffsetM` for a lander. In a worktree every OTHER key's prebaked GLB
   must be copied in from the main checkout first, or this step DELETES their
   generated rows; and with `/link-data` the `.mesh` output lands in main's
   `public/data` — but the browser resolves logical names through
   `manifest.json`, which `build-data-manifest` REFUSES to rebuild through a
   symlink, so every rebake is invisible until you run it against main's tree:
   `npx tsx -e "import { buildDataManifest } from './tools/deploy/buildDataManifest.ts'; buildDataManifest('<main>/public/data');"`
   then hard-refresh.
7. **Seed** — `src/data/bodies/sceneMeshBodies.ts`: `{ id, label, meshKey }`.
   `standoffRadii` only when a boom or array sets the bounding sphere; no
   `captionRevealM` for a real object.
8. **Driver** — `src/data/bodies/orbitalElements.ts` (`probe()` / `orbiter()`
   row + a `palette.ts` tint, comment naming the Horizons epoch) **or**
   `src/data/bodies/surfaceFixedSites.ts` (`altitudeM: groundOffsetM('<key>')`,
   host must be an IAU-pole body in `SCENE_CELESTIAL_BODIES`).
9. **Rotation** — `src/data/bodies/rotationElements.ts`: one row per the arm
   chosen. On the `iau-pole` arm the row's pole IS body +Z, so aiming the
   boresight (+X) somewhere means putting the pole PERPENDICULAR to it and
   phasing with W₀ — `rotationFromIau` composes `Rz(90 + α₀)·Rx(90 − δ₀)·Rz(W₀)`.
10. **Names + facts** — `bodySearchNames.ts` `AUTHORED` (designations and
    nicknames a reader types), `data/seeds/planet_facts.seed.json` (id,
    `wikiTitle`, `description`; `yearLength`/`distance`/`dayLength` as the
    neighbours do), then `npm run build-planet-facts`. A figure on the card must
    agree with the ROW rather than the fact sheet — the card sits beside the body
    the elements actually draw (Hubble: `A` = 6852 km, so 480 km up and 94 min,
    not the 540 km/95 min of its better years).

**Tests.** The structural suites (`deriveBodyStates`, `surfaceFixedSites`,
`bodyRegions`, `timedSlots`) cover a new row by existing — with one exception: an
`ORBITAL_ELEMENTS` row must ALSO be appended to `tests/fixtures/bodyStatesJ2000.json`
(`deriveBodyStates.test.ts` asserts a fixture entry per element id, so the suite
fails until it is there). Append the new id's J2000 state at full f64 precision;
never touch an existing entry. Add exactly one
external check per orbit row in `tests/data/bodies/`: the body's position
relative to its focus at the fetch epoch against Horizons `VECTORS`
(`REF_PLANE='FRAME'` for an orbiter, ECLIPTIC range for a probe) — that is the
one test that fails on a frame, phase or node-convention slip nothing in the
repo can detect. Then `npm test`, `npm run typecheck`.

**Look.** `/dev`, search the label, engage the follow: dish at the target,
lander upright and on the ground, orbiter over the right hemisphere. Ask the
user for the eye check; headless captures cannot orbit a mesh body.

**Ship.** Branch + draft PR. After merge, from the **main checkout**: copy the
download, `<key>.blend` and the prebaked GLB + atlases into main's
`data/raw/meshes/<key>/`, `npm run build-meshes`, `npm run sync-r2-secure`
(which also backs the download and the `.blend` up to R2); restart any
worktree dev server that symlinks `public/data`.

## Gotchas

| Gotcha                                   | Why it matters                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Units are whatever the modeller used     | Inches, centimetres and 0.7-scale documentary models all exist; a wrong scale is invisible until the camera standoff feels off |
| `bodyFromSource` must have det +1        | A mirror turns the model inside out; cycle axes, never flip one                                                                |
| A hostless body costs a slab row         | A `focusId: 'sun'` mesh body grows `BODY_SLAB_CAPACITY`; an Earth/Mars orbiter rides its host                                  |
| Mesh bodies draw no orbit trail          | By design (`trailElements.ts`); an orbiter shows only the moving mesh                                                          |
| All mesh captions share one label toggle | `src/data/sources/mesh-body.ts` is one row; per-body muting is a separate change                                               |
| `meshBody()` throws on a missing asset   | Seed rows land only after step 6; a seed without a bake breaks every import                                                    |
| Prebake is not CI                        | Blender output is gitignored; deploy re-bakes on main, so the download and the `.blend` must exist there too                   |
| `import-mesh` overwrites the `.blend`    | Every hand edit goes; the README's edit list is what lets them be redone                                                       |
| Horizons osculating elements             | Fine for an escape; for an orbiter the node rate carries the plane, and the phase is exact only at the epoch                   |

## Red flags — STOP

- About to author a halo-orbit or flyby-cruise mission with one element set.
- About to bake a model with no textures ("it is only a speck anyway").
- Recomputing M, Ω or A by hand instead of transcribing Horizons columns.
- A `bodyFromSource` you did not derive from the six renders.
- Skipping the Horizons-vector test because "the numbers are copied".
- Running `build-meshes` or the R2 sync from a worktree.

## Related skills

- `/link-data` — worktree `public/data` → main, so the bake and the catalogs coexist.
- `/dev` — start the server for the eye check.
- `/add-famous` — the equivalent pipeline for galaxies.
