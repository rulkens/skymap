# Body Layers P1: Layer body rows fold into core's body tables

**Spec:** [`specs/2026-10-20-body-layers-design.md`](../specs/2026-10-20-body-layers-design.md) §6 P1
(the P1 design), §5 ruling 3.

**Strategy.** Copy the `Layer.sources` precedent for bodies. A Layer's body rows are static leaf files
under its `bodies/`. `src/data/bodies/layerBodyRows.ts` folds them by direct import, and three static
tables append their projection after core's own rows. A coverage test pins the fold to
`APP_COMPOSITION`. The joint ships with its first writer: a bodies-only `earthScenes` Layer that takes
Søndermarken. Søndermarken is the last row of all three tables today, so table order, pick indexes and
draw order are unchanged.

**Execution:** lean SDD, one Sonnet dispatch for both tasks, one commit per task. No perf gate: nothing
renders differently. One plan in flight.

## Task 1: The `LayerBody` contract

**Files:**

- `src/@types/engine/layer/LayerBody.d.ts` (create)
- `src/@types/engine/layer/BodyPosition.d.ts` (create)
- `src/@types/engine/layer/Layer.d.ts` (modify: the `bodies` member beside `sources`, line ~60)
- `src/layers/README.md` (modify: a `bodies?` row in the member table; the Status paragraph)
- `tests/conventions/layerImportBoundary.test.ts` (modify: `REVERSE_IMPORT_TARGET_RE` also covers
  `bodies/.+`, as it covers `sources/.+`)

**Contract:**

```ts
// LayerBody.d.ts
export type LayerBody = {
  readonly body: SceneBody;
  readonly position: BodyPosition;
  readonly rotation?: RotationElements;
};

// BodyPosition.d.ts. Later PRs add `orbit`, `sampled` and `anchor` when they first move such a row.
export type BodyPosition = { readonly kind: 'site'; readonly site: SurfaceFixedSite };

// Layer.d.ts, directly under `sources`, in the static-contributions block
/** Typing only: `data/bodies/layerBodyRows.ts` folds the same rows into the body tables by import. */
readonly bodies?: readonly LayerBody[];
```

README member-table row: `bodies?` | `bodies/` | "One body row per file, + the rows array. Leaf data:
imports types and `src/data` makers only; `data/bodies/layerBodyRows.ts` folds them into the static
body tables by import." Status paragraph: `earthScenes` is a bodies-only Layer (its rows fold into the
tables; core still draws them).

No new test. Types only; the boundary-regex change extends an existing sweep.

- [x] Types, member, README, boundary regex; `npm run typecheck:fast` green.

## Task 2: The fold, and Søndermarken into `earthScenes`

**Files:**

- `src/layers/earthScenes/layer.ts` (create)
- `src/layers/earthScenes/bodies/soendermarken.ts` (create)
- `src/layers/earthScenes/bodies/earthScenesBodyRows.ts` (create)
- `src/data/bodies/layerBodyRows.ts` (create)
- `src/data/bodies/sceneMeshBodies.ts` (modify: drop the Søndermarken seed, `:69-71`; append the fold's
  mesh-body seeds)
- `src/data/bodies/surfaceFixedSites.ts` (modify: drop the Søndermarken site, the last row with its comment; append the
  fold's `site` positions)
- `src/data/bodies/rotationElements.ts` (modify: drop `:285-287`; append the fold's rotations)
- `src/compositions/app.ts` (modify: compose `earthScenesLayer`, value list and `satisfies` tuple)
- `tests/compositions/layerBodyRowsCoverage.test.ts` (create)

**Contract:**

- `soendermarken.ts` exports `SOENDERMARKEN: LayerBody` with these fields:
  - `body`: `meshBody({ id: 'soendermarken', label: 'Søndermarken', meshKey: 'soendermarken', standoffRadii: 1.5 })`.
  - `position`: `{ kind: 'site', site: <the site row, verbatim> }`.
  - `rotation`: `{ kind: 'surfaceLocked', id: 'soendermarken', headingDeg: 90 }`.

  The three comments that sit above those rows today (standoff, crop-bounds centre and altitude, scan
  axes) move with them. The file imports only types and `src/data/bodies/makers/meshBody`, never
  anything that reads a body table.
- `earthScenesBodyRows.ts` exports `EARTH_SCENES_BODY_ROWS: readonly LayerBody[] = [SOENDERMARKEN]`.
- `layer.ts` is `defineLayer({ name: 'earthScenes', bodies: EARTH_SCENES_BODY_ROWS, create: () => undefined, destroy: () => {}, passes: () => [] })`,
  with a header comment of at most 3 lines: a bodies-only Layer, and core still draws its rows.
- `layerBodyRows.ts` exports `LAYER_BODY_ROWS: readonly LayerBody[] = [...EARTH_SCENES_BODY_ROWS]`. Its
  header names the `data/sources.ts` precedent and the one rule: append-only per Layer, in composition
  order.
- Each table appends its projection after core's own rows:
  - `SCENE_MESH_BODIES`: the rows whose `body` is a mesh body (`isMeshBody`).
  - `SURFACE_FIXED_SITES`: the `site` positions.
  - `ROTATION_ELEMENTS`: the defined `rotation`s.

  No other table and no reader changes.
- Move nothing by hand that `npm run move-files` should move. This task creates and deletes rows; it
  moves no files.

**Test** (`layerBodyRowsCoverage.test.ts`, shaped on `tests/compositions/sourceRegistryCoverage.test.ts`):

- `LAYER_BODY_ROWS covers every composed Layer's bodies, by identity`. Flat-map `APP_COMPOSITION.layers`
  to `layer.bodies ?? []`, assert the result is non-empty, and assert each row is `toBe` an element
  of `LAYER_BODY_ROWS`. The header explains why: `Layer.bodies` is inert, so a Layer could declare
  rows, skip the `layerBodyRows.ts` edit and ship green with its bodies absent.

The existing suite is the behaviour-neutral check: Søndermarken's position, region, clips and mesh
presentation tests read the same tables. Run the targeted tests under `tests/data/bodies/`,
`tests/compositions/` and `tests/conventions/layerImportBoundary.test.ts`.

- [x] Fold, Layer, composition, coverage test; targeted tests and `npm run typecheck:fast` green.

## Definition of Done

**Deliverables**

- `LayerBody`, `BodyPosition`, `Layer.bodies`, `src/data/bodies/layerBodyRows.ts`.
- The `earthScenes` Layer composed in `APP_COMPOSITION`, holding Søndermarken's one row.
- `layerBodyRowsCoverage.test.ts`; README member row and status.

**Observable behaviour (smoke)**

- `#focus=body-soendermarken` flies to the park on Earth, which draws as before, seated on the
  terrain, uncaptioned and unpicked.
- `#focus=body-curiosity` and `#focus=body-hubble` are unchanged. Their rows stay in core.

**Out of scope:** drawing, slots and passes for `earthScenes` (its own PR); the `orbit`, `sampled` and
`anchor` position variants (the missions and seeded-stars PRs); P2–P5.
