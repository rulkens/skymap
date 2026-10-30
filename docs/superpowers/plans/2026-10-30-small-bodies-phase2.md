# Small bodies phase 2 (Vesta, Ceres, Bennu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vesta, Ceres and Bennu as places you can fly to: each body is a row in the `body` Layer with a heliocentric orbit, joins the Horizons correction fit, is drawn from its mission shape model, and has an always-on label behind a new **Small bodies** checkbox.

**Architecture:** The three bodies are appended to `BODY_BODY_ROWS`, so core folds them into `SCENE_PLANETS` and they pick, glint, trail and focus like every other celestial row. A per-row `captionKind` (prep G1) lets them caption under their own `'smallBody'` kind. That kind maps to a label-only `Source.SmallBody` registry row with an empty pick table. Meshes follow phase 1's shape-model path exactly.

**Tech stack:** TS, Vitest, Blender (bake, on the Mac), SPICE via `spiceypy` (one-off DSK→OBJ conversion, scratch venv), JPL Horizons API.

**Spec:** `docs/superpowers/specs/2026-10-21-small-bodies-phase2-design.md`. Source facts: `.superpowers/sdd/small-bodies/data-recon.md` (gitignored, in the worktree).

## Global constraints

- One PR (#986, branch `small-bodies`), with Task 1 as its first commit.
- No Co-Authored-By trailer on any commit; never `git add -A`; format with `npx prettier --write <files>`.
- `SCENE_PLANETS` is append-only: a pick decodes by array position. The new rows go after `NEREID`, in the order Vesta, Ceres, Bennu.
- Ids: `'vesta'`, `'ceres'`, `'bennu'`; labels `Vesta`, `Ceres`, `Bennu`. The source id is `'small-body'`.
- **`Source.SmallBody = 38`.** Main's satellites Layer took 37 after the spec was first written; the spec is corrected.
- R2 publishing (`npm run sync-r2-secure`) waits for the user's go at that moment.
- Bennu fallback (ruling 1aBU): if Bennu draws wrong at 250 m, this PR ships Vesta and Ceres, and Bennu moves to its own PR with the renderer work.

## Plan-time calls (deviations from the spec's letter, already recorded in it)

- **Orbits are written inline in the `pluto.ts` form, not through `orbiter()`.** `orbiter()` is the planet-orbiting-spacecraft maker and pins ω̇ = 0. The recon's 1900–2100 secular Ω̇/ω̇ rates start the correction fit much closer.
- **The ΔM pre-fit becomes an explicit per-row field** (`FittedBody.fitMeanAnomaly: boolean`) instead of the inferred `row.focusId !== 'sun'`. Planets set `false`, moons and small bodies `true`, so every existing correction regenerates byte-identical.
- **One shared trail tint** (`SMALL_BODY_ROCK` in `palette.ts`) for all three.
- `CAPTION_PRIORITY.smallBody = 18`.

## Review focus

1. **Time slider at the span ends and beyond (1900, 2100, 2300):** small bodies stay on a sane orbit and nothing throws. Bennu holds its correction outside its span. Task 3's ephemeris fixture spans both ends.
2. **Unticking Planets leaves small-body labels on, and vice versa:** Task 3's caption test asserts both directions.
3. **Picking Bennu selects Bennu, not a neighbour:** the rows are appended and the pick index is the array position. This is a smoke item in the DoD, and is pinned by the J2000 fixture's row set.
4. **The camera near a 250 m body** stays outside the mesh. Task 4 extends `bodyGroundRadiusAtM.test.ts` to the three ids.
5. **Bennu's polar caps** (map NoData above ±55°) read as rock, not black. This is an eye-check item in Task 4.

---

### Task 1: G1 — a celestial row declares its caption kind (prep)

**Files:**
- Modify: `src/@types/scene/PlanetBody.d.ts`
- Modify: `src/layers/body/bodies/makers/heliocentricPlanet.ts`
- Modify: `src/layers/body/bodies/makers/satelliteBody.ts`
- Modify: `src/layers/body/present/sceneBodyLabels.ts` (the `'planet'` literal in the `SCENE_PLANETS` map)

**Contract:**

```ts
// PlanetBody
/** Which caption kind (and so which label checkbox) the row's name rides. */
readonly captionKind: 'planet';
```

- [ ] Add the field; both makers set `captionKind: 'planet'`; `sceneBodyLabels` passes `planet.captionKind` where it passes the literal `'planet'` today.
- [ ] No new test: this is behaviour-neutral plumbing, and `sceneBodyLabels.test.ts` and `produceSceneBodyCaptions.test.ts` already pin the output.
- [ ] `npm run typecheck:fast` and `npm test -- sceneBodyLabels produceSceneBodyCaptions` pass.
- [ ] Commit: `prep: a celestial row declares its caption kind`.

### Task 2: The Small bodies caption kind and label source

**Files:**
- Modify: `src/@types/scene/PlanetBody.d.ts` (widen `captionKind`)
- Modify: `src/services/engine/presentation/captionPriority.ts`
- Modify: `src/services/engine/presentation/captionFadeRules.ts`
- Modify: `src/data/source.ts`
- Create: `src/layers/body/sources/smallBody.ts`
- Modify: `src/layers/body/sources/bodySourceRows.ts`
- Modify: `src/layers/body/present/produceSceneBodyCaptions.ts` (`BODY_CAPTION_ITEM`)
- Modify: `src/data/bodies/bodyPickRows.ts`
- Modify: `src/utils/math/galaxyType.ts` and any other exhaustive `Source` switch the compiler flags
- Create: `src/layers/body/bodies/makers/smallBody.ts`
- Modify: `packages/website/src/data/docsSettings.ts`

**Contracts:**

```ts
// PlanetBody
readonly captionKind: 'planet' | 'smallBody';

// CaptionKind gains 'smallBody'
// CAPTION_PRIORITY: smallBody: 18  — below planet (20), above sgrAStar (15) and meshBody (12)
// captionFadeRules: smallBody: { fadeTarget: SOLAR_SYSTEM_REACH }

// source.ts, after Satellite: 37
/** Vesta, Ceres and Bennu's label checkbox; they pick as `Planet` rows, nothing stamps 38. */
SmallBody: 38,
// …and OpenCluster's "Codes 38..62 remain" becomes "Codes 39..62 remain".

// smallBody.ts
export const SMALL_BODY_ENTRY = {
  type: 'body', code: Source.SmallBody, id: 'small-body',
  label: 'Small body', detailLabel: 'Small body', shortLabel: 'Small body', plural: 'Small bodies',
  allSky: true, bearsLabel: true, bearsMarker: false,
} as const satisfies BodySourceEntry;

// bodyPickRows.ts
'small-body': [],  // comment: the one body source with no table of its own — its bodies
                   // live in SCENE_PLANETS and pick as Source.Planet; the row carries the checkbox.

// BODY_CAPTION_ITEM
smallBody: SMALL_BODY_ENTRY.id,

// makers/smallBody.ts — heliocentricPlanet's record with captionKind: 'smallBody'
export function smallBody(spec: BodySpec): PlanetBody;
```

- [ ] Make the edits above. `BodySourceId`, `bodies.items['small-body']` (default `{ enabled: true, labelEnabled: true }`) and the Labels & Guides checkbox all derive from the registry row; check the checkbox lands after the Milky Way structure rows.
- [ ] `docsSettings.ts`: add `label('Small bodies', 'bodies.items.small-body.labelEnabled', 'the asteroids Vesta and Bennu and the dwarf planet Ceres')` at the position matching the panel. "twenty-one" becomes "twenty-two" in both master-switch strings.
- [ ] No new test here: this task is constant plumbing the compiler checks (`satisfies` on the priority and fade tables, `Record<BodySourceId, …>` on the pick rows). Task 3's caption test is where the kind meets a body.
- [ ] `npm run typecheck` (both projects plus the website) and `npm test` pass.
- [ ] Commit.

### Task 3: Rows, orbits, rotation and the correction fit — `review: yes`

(The rotation poles are named in the domain landmines memory.)

**Files:**
- Create: `src/layers/body/bodies/vesta.ts`, `ceres.ts`, `bennu.ts`
- Modify: `src/layers/body/bodies/bodyBodyRows.ts` (append the three rows)
- Modify: `src/data/bodies/palette.ts` (`SMALL_BODY_ROCK`)
- Modify: `tools/bodies/horizonsBodies.ts`
- Modify: `tools/bodies/fittedBodies.ts` and `tools/bodies/@types/FittedBody.d.ts`
- Modify: `tools/bodies/buildEphemerisCorrections.ts:113`
- Regenerate: `src/data/bodies/ephemerisCorrections.generated.ts`
- Modify: `data/seeds/planet_facts.seed.json`; regenerate `src/data/bodies/bodyFacts.generated.ts`
- Modify: `tests/fixtures/horizonsPlanets.json`, `tests/fixtures/bodyStatesJ2000.json`
- Modify: `tests/data/bodies/ephemerisCorrections.test.ts`, `tests/layers/body/present/produceSceneBodyCaptions.test.ts`

**Rows** (template: `pluto.ts`; `body: smallBody({...})`; omit `plane`, so the angles are ecliptic J2000; `focusId: asSceneBodyId('sun')`; `semiMajorMpc: A * SCALE_UNITS.AU_TO_MPC`; rates per Julian century; `color: SMALL_BODY_ROCK`).

The elements are Horizons osculating values at JDTDB 2461333.5 (2026-10-20), heliocentric ecliptic J2000. Write the back-propagation to J2000 inline, with Δ = (2461333.5 − 2451545.0) / 36525 cty, as Pluto writes ω = ϖ − Ω: Ω₀ = OM − Ω̇·Δ, ω₀ = W − ω̇·Δ. M₀ is the recon's unwrapped value. Ṁ = N · 36525. Cite the query (recon §1) in a comment.

| | A (au) | EC | IN (°) | OM (°) | W (°) | M₀ at J2000, unwrapped (°) | N (°/d) | Ω̇ (°/cty) | ω̇ (°/cty) |
|---|---|---|---|---|---|---|---|---|---|
| Vesta | 2.361199714781604 | 0.09023445618156323 | 7.143880727732682 | 103.6995984387553 | 151.4254109736264 | −2541.6560982404 | 0.2716470485403621 | −0.8610 | +2.0370 |
| Ceres | 2.766141043028709 | 0.07978996792436145 | 10.58714343122850 | 80.24883443379728 | 73.16151016629702 | −1793.9942367995 | 0.2142360700153075 | −1.4529 | +2.6639 |
| Bennu | 1.125916959208119 | 0.2036757328642475 | 6.033002899161105 | 1.966283774222238 | 66.40096674623172 | −7893.1517613510 | 0.8249821136016373 | −1.3496 | +3.0156 |

| | datumRadiusM | reliefM (DSK radius extremes − datum, outward) | albedo (starting seed; tuned at Task 4's eye-check) |
|---|---|---|---|
| Vesta | 261400 | [−49041, 30977] | [0.45, 0.43, 0.4] |
| Ceres | 469700 | [−27282, 17313] | [0.3, 0.29, 0.28] |
| Bennu | 242 | [−29, 50] | [0.24, 0.23, 0.22] |

The seeds are not geometric albedos (Phobos is seeded at 0.30). Keep the order Vesta ≫ Ceres > Bennu.

**Rotation** (IAU pole form, as Pluto; minor-body positive-pole convention):

| | poleRaDeg | poleDecDeg | primeMeridianDeg | spinRateDegPerDay | Comment source |
|---|---|---|---|---|---|
| Vesta | 309.0611 | 42.2324 | 284.6431 | 1617.3331292 | `dawn_vesta_grv221108_v1.tpc` (the shape's own frame, Claudia″; IAU's rate drifts 1.1° by 2026) |
| Ceres | 291.418 | 66.764 | 170.65 | 952.1532 | IAU 2015, pck00011 BODY2000001 |
| Bennu | 85.45864 | −60.36468 | 318.8603 | 2011.1822127 | `bennu_v17.tpc`, linearised about 2026-10-20: W₀′ = W₀ − W₂d², Ẇ′ = W₁ + 2W₂d, W₂ = 2.0e-6 °/d²; 27° off at ±10 yr |

**Correction fit:**

```ts
// FittedBody
/** Fit a ΔM phase series before the Cartesian channel — needed where a fixed conic drifts
 *  far along-track (moons, small bodies); the planets' conics don't. */
fitMeanAnomaly: boolean;
```

- `HORIZONS_BODIES`: `fitted('vesta', '4;', '500@10', 1440)` and `fitted('ceres', '1;', '500@10', 1440)`. Bennu is a literal row with `span: ['1900-01-02', '2100-01-01']`, because its Horizons record starts 1900-01-02.
- `FITTED_BODIES`: the three ids with `outside: 'hold'`, `fitMeanAnomaly: true`, and a `fitStep` keeping ≥ ~20 samples per shortest residual period. Start at 10, as the outer planets; Bennu's Earth encounters may need 4.
- `buildEphemerisCorrections.ts:113`: `if (fitted.fitMeanAnomaly)` replaces `if (row.focusId !== 'sun')`.

Steps:

- [ ] **Test first (fit):** add `ceres`, `vesta` and `bennu` to `horizonsPlanets.json` at the fixture's six JDs. Use the query in the test header with `COMMAND='1;'` / `'4;'` / `'101955;'`. Rename the case to `every heliocentric body is within 1,000 km of Horizons at the fixture dates` and update the header comment. Run it and see it fail: the ids don't exist yet.
- [ ] Add `fitMeanAnomaly` to every existing `FITTED_BODIES` row (planets `false`, moons `true`) and switch the condition. Run `npm run build-ephemeris-corrections` and check `git diff --stat` on the generated file shows **no change**. That proves the refactor is neutral.
- [ ] Write the three rows, the palette tint and the `BODY_BODY_ROWS` appends. Add the Horizons and fitted rows. `npm run fetch-horizons` fetches the new rows (three daily 1900–2100 series; announce the fetch first). Then run `npm run build-ephemeris-corrections`.
- [ ] If a row hits the 1,000 km throw: for Bennu, shorten its span to the decades it fits (keeping `outside: 'hold'`, and moving its fixture dates inside the span with a header note). For Ceres or Vesta, lower `fitStep`. Record what was done in the spec's Correction fit bullet.
- [ ] The ephemeris test passes.
- [ ] **Test (captions):** in `produceSceneBodyCaptions.test.ts`, add `a small body captions under the Small bodies item, not Planets`. Assert that `sceneBodyLabels` emits `sceneBody-vesta`, `-ceres` and `-bennu` with `kind: 'smallBody'`. Add `unticking Small bodies hides only the small bodies`: with `fade['small-body'] = 0` and `fade.planet = 1`, the three candidates' `fadeAlpha` is 0 and Mars's is > 0. With `fade.planet = 0` and `fade['small-body'] = 1`, the reverse holds. Follow the file's existing fade-fixture pattern.
- [ ] `tests/fixtures/bodyStatesJ2000.json`: add the three ids from `deriveBodyStates(CONST_J2000)` with a scratch script. Every existing row stays byte-identical (check `git diff`).
- [ ] Facts: add the three entries to `planet_facts.seed.json` (recon §5, field shapes as `pluto`). Vesta's description names Rheasilvia (~500 km across, its central peak 20–25 km high); Ceres's names Ahuna Mons (a ~4 km ice volcano); Bennu's names the OSIRIS-REx sample (121.6 g, returned 2023-09-24). The figures must come from the recon's cited sources only. Then `npm run build-planet-facts`.
- [ ] `npm run typecheck` and `npm test` pass.
- [ ] Commit.

### Task 4: Shape models, bake and orientation checks — `review: yes`

(Mesh frame maths, and the landmine memory's AO/mesh bake entry.) This runs in the main session on the Mac (Blender, ~960 MB of downloads, announced first). CI cannot gate it.

**Files:**
- Create: `data/raw/meshes/{vesta,ceres,bennu}/README.md`
- Modify: `data/raw/meshes/meshes.sha256`
- Modify: `tools/meshes/prebake/importMesh.py` (`SOURCES`), `tools/meshes/prebake/meshPrebake.py` (`SOURCES`)
- Modify: `tools/utils/io/meshSources.ts` (`MESH_SOURCES`), `tools/utils/io/rawDataRegistry.ts`
- Modify: `src/data/bodies/meshPresentations.ts` (`SHAPE_MODEL_BODY_IDS`)
- Regenerate: `src/data/bodies/meshAssets.generated.ts` (`npm run build-meshes`)
- Modify: `ATTRIBUTIONS.md`, `packages/website/src/data/dataSourceNotes.ts`
- Modify: `src/layers/body/bodies/{vesta,ceres,bennu}.ts` (albedo seeds after the eye-check)
- Modify: `tests/data/bodies/meshPresentations.test.ts`, `tests/tools/utils/io/meshSources.shapeModels.test.ts`, `tests/utils/scene/bodyGroundRadiusAtM.test.ts`
- Modify: the spec (orientation-check record)

**Sources** (URLs in the spec's sources table and recon §3–4):

| id | importMesh row | prebake row |
|---|---|---|
| vesta | `source("dawn_vesta_grv_icq0512_v1.obj", scale=1000.0, rock=lonlat_albedo("<downsampled HAMO mosaic>", 0.0, <seed>))` | `source("vesta", relief=True, triangles=150000)` |
| ceres | `source("dawn_ceres_grv_icq0256_v2.obj", scale=1000.0, rock=lonlat_albedo("Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif", 180.0, <seed>))` | `source("ceres", relief=True)` |
| bennu | `source("bennu_g_00880mm_alt_obj_0000n00000_v020.obj", scale=1000.0, rock=lonlat_albedo("<downsampled ShapeV20 mosaic>", 180.0, <seed>))` | `source("bennu", relief=True, triangles=150000)` |

- Ceres and Bennu use 180.0 because their maps' left edge is 0°, not −180°. The frames themselves agree with zero offset.
- `<seed>` is the row's albedo.
- `lonlat_albedo`'s docstring gains a line saying the offset also absorbs a 0°-left-edge map.
- `MESH_SOURCES` rows copy Phobos's row (`meshSources.ts:111-122`): both tiers on `meshes.<id>`, `bodyFromSource: [1, 0, 0, 0, 0, 1, 0, -1, 0]`, `origin: 'source'`, and licence/attribution from the recon. Bennu's map is "public domain".

Steps:

- [ ] Download the three `.bds` files and three maps into `data/raw/meshes/<id>/`, and add their SHA-256 sums to `meshes.sha256`.
- [ ] Convert DSK→OBJ with `spiceypy` in a scratch venv (`dasopr` → `dlabfs` → `dskz02`/`dskv02`/`dskp02` → `v`/`f` lines; plate indices are 1-based already). Document it as a one-off in each README beside the curl lines. No converter enters the repo.
- [ ] Downsample Vesta's and Bennu's maps to 8192 px wide before import (`sips --resampleWidth 8192`, or `gdal_translate -outsize 8192 0`). Ceres's 7383 px map is used as is. Record the step in the README.
- [ ] Add the `RAW_DATA` rows (source, map, `.blend`, `.prebaked.glb`, readme per body, modelled on `meshes.phobos*` at `rawDataRegistry.ts:1580-1660`).
- [ ] Run `npm run import-mesh -- <id>`, then `npm run prebake-mesh -- <id>`, for each body.
- [ ] Add the `MESH_SOURCES` rows and `SHAPE_MODEL_BODY_IDS = ['phobos', 'deimos', 'vesta', 'ceres', 'bennu']`, then `npm run build-meshes`.
- [ ] **Tests:** extend `meshPresentations.test.ts`, `meshSources.shapeModels.test.ts` and `bodyGroundRadiusAtM.test.ts` to the three ids by their existing pattern. The ground-radius case asserts the floor is the bounding radius from `MESH_ASSETS`, ≥ datum + reliefM[1].
- [ ] **Orientation checks** (one-off, recorded in the spec as the Stickney check was), on the baked mesh and atlas:
  - Vesta: the lowest-radius region sits near Rheasilvia's centre (≈ 75°S, 301°E).
  - Ceres: Occator's bright spot sits at 20°N, 239°E in the albedo atlas.
  - Bennu: the maximum-radius band sits on the equator.
- [ ] **Eye-checks** (main vs branch pairs, one `#focus=body-<id>&t=2026-10-20T00:00:00Z` link each, shot with `npm run shot`, sent as dash checks):
  - Vesta, Ceres and Bennu up close.
  - Bennu's polar caps read as rock.
  - Tune the albedo seeds and the `lonlat_albedo` mean values together.
  - **If Bennu draws wrong, apply ruling 1aBU:** drop Bennu's rows here and carry them to a new branch for its own PR.
- [ ] Add the `ATTRIBUTIONS.md` sections (id `mesh-<id>`, keys `meshes.<id>*`, hosts `naif.jpl.nasa.gov`, `planetarymaps.usgs.gov`) and the `dataSourceNotes` entries.
- [ ] `npm run typecheck` and `npm test` pass.
- [ ] Commit, then ask the user's go for `npm run sync-r2-secure`.

## Definition of Done

**Deliverables**
- [ ] `PlanetBody.captionKind`, set by all three makers (`heliocentricPlanet`, `satelliteBody`, `smallBody`).
- [ ] `Source.SmallBody = 38`, `SMALL_BODY_ENTRY`, `BODY_PICK_ROWS['small-body'] = []`, `CaptionKind 'smallBody'`.
- [ ] `vesta.ts`, `ceres.ts` and `bennu.ts` appended to `BODY_BODY_ROWS`, fitted in `ephemerisCorrections.generated.ts`, with facts entries.
- [ ] Three `MESH_SOURCES` rows, prebaked GLBs and atlases, `MESH_ASSETS` entries, READMEs, attributions and site notes.
- [ ] Baked assets published to R2 (with the user's go).

**Smoke (deep links to the worktree server)**
- [ ] From the solar-system view, Vesta, Ceres and Bennu are named, with Mars and Jupiter for reference.
- [ ] The Small bodies checkbox hides exactly those three names; the Planets checkbox leaves them on.
- [ ] Orbit trails toggle draws their orbits, and each body sits on its trail.
- [ ] Focus and fly-to land outside the mesh at a whole-body view; Vesta's south-pole hover is accepted.
- [ ] Hover, select ring and detail card show the right body and its facts; search finds each by name.
- [ ] The time slider at 1900 and 2100 keeps all three on their trails.

**Deferred (out of scope)**
Phases 3–4 (backlog), a body show-toggle, featured cards for the new bodies, a DSK reader, a spin-acceleration rotation term, and the website object catalogue's grouping.
