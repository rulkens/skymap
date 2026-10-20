# Phobos and Deimos as shape-model meshes — plan

Spec: [`2026-10-19-phobos-deimos-mesh-design.md`](../../specs/completed/2026-10-19-phobos-deimos-mesh-design.md).
Two stacked PRs: **PR 1** (branch `ccr-e4a53f08-qcsijn`) = Ground preparation G1 + G2,
behaviour-neutral; **PR 2** (branch `ccr-e4a53f08-qcsijn-moons`, based on PR 1) = the moons.

## PR 1 — Ground preparation

### Task 1 — `MeshPresentation`: the mesh path keyed by body id (G1)

Contract:

```ts
// src/@types/scene/MeshPresentation.d.ts
export type MeshPresentation = {
  readonly id: string; // scene body id: slot key, renderer Map key, body-state key
  readonly meshKey: string;
  readonly boundingRadiusM: number;
};
// src/data/bodies/meshPresentations.ts
export const MESH_PRESENTATIONS: readonly MeshPresentation[]; // = SCENE_MESH_BODIES rows
// src/utils/meshBodies/meshPresentationOf.ts
export function meshPresentationOf(id: string): MeshPresentation | null;
```

Switch every consumer of "the bodies drawn as meshes" from `SCENE_MESH_BODIES`/`MeshBody`
to `MESH_PRESENTATIONS`/`MeshPresentation`; identity consumers (labels, trails, presence,
pick tables, `siteRung`, captions, `HOSTLESS_MESH_BODIES`) stay on `SCENE_MESH_BODIES`:

- `meshSlotRegistry.wireMeshBodySlots`, `assetWiring.meshBodyRow`, `meshBodyLoadRadius.loadRadiusMpc`
- `meshBodySlabHostId(id: string)` — **a body that owns a body-m row hosts itself**
  (checked first), else its driver's host if that owns a row, else itself.
- `meshBodiesAttachedTo` (keys `MESH_PRESENTATIONS` by `meshBodySlabHostId`)
- `sceneBodyPartition`: `meshes: readonly MeshPresentation[]` = resolved own bodies whose
  presentation's mesh is **resident** (`meshBodyRenderer.hasMesh`); a non-resident
  `MeshBody` draws nothing (no sphere to fall back to); any other body falls through to
  textured/flat as today. `drawableMeshBodies` drops its own `hasMesh` filter (now upstream).
- `meshBodiesPass`: draw/drawPick over `MeshPresentation`; pick packs `sceneBodyPickId(id)`
  (the body's own table — no pick field on the presentation);
  umbra host only when `hostId !== body.id` (a self-hosted body is its own row: no host
  shadow, and `sunVisibleFraction` is NaN at zero separation).
- `scheduleProbeCapture`: iterate `MeshPresentation` (its `hasMesh` check becomes redundant).

Tests:

- `meshBodySlabHostId`: `'whale'` → `'earth'`; a planet id → itself; `'voyager1'` → itself.
- `sceneBodyPartition`: existing mesh tests keep passing with the presentation type;
  new — a resolved mesh body whose mesh is not resident is in none of the four buckets.

### Task 2 — per-source mesh origin (G2)

```ts
// tools/utils/io/meshSources.ts — MeshSourceEntry
/** Where the baked mesh's origin sits. Absent = 'surfaceCentroid' (today). 'source' keeps
 *  the source frame's origin: a shape model's centre of mass, which its orbit tracks. */
readonly origin?: 'surfaceCentroid' | 'source';
```

`buildMeshes` skips the recentring when `origin === 'source'`. No row sets it in PR 1.
Test: the origin helper returns a zero offset for `'source'` and the area-weighted
centroid otherwise (extract the recentring offset to `tools/utils/meshes/meshOriginOffset.ts`).

## PR 2 — The moons

### Task 3 — sources, import, prebake relief + albedo

- `data/raw/meshes/{phobos,deimos}/` READMEs (+ `meshes.sha256` lines), `RAW_DATA` rows
  `meshes.phobos`, `meshes.deimos`, `textures.phobosViking`.
- `importMesh.py`: OBJ import (`scale=1000`, km → m), `SOURCES` rows.
- `meshPrebake.py`: `relief` bake — source = full-resolution object, target = decimated
  copy (`MESH_TRIANGLE_BUDGET`), `NORMAL`/`TANGENT`, `use_selected_to_active`, cage
  extrusion from the logged source↔target max distance. `lonlat_albedo` config for
  Phobos: equirect image sampled by planetocentric lon/lat of the source surface,
  `lonOffsetDeg: 4.5`; Deimos bakes its seed albedo flat.
- `MESH_SOURCES` rows `phobos`, `deimos` with `origin: 'source'`; `npm run build-meshes`.

### Task 4 — wire the moons

- `MESH_PRESENTATIONS` += Phobos, Deimos, `boundingRadiusM` from `MESH_ASSETS`.
- `scenePlanets.ts`: `reliefM` Phobos `[-2901, 2941]`, Deimos `[-2418, 2707]`.
- Tests: partition — Phobos resident → `meshes`, not resident → `flat`
  (rewrites `sceneBodyPartition.presence.test.ts:207`); pass pick packs `Source.Planet`;
  baked Phobos `boundingRadiusM` 13,941 ± 50 m and origin within 50 m of the source origin;
  Stickney (direction read from the baked mesh) 49° ± 5° from sub-Mars toward the leading apex
  under `orientationForBody` at J2000.

### Task 5 — verify and land

`npm run typecheck`, `npm test`, `npm run perf` before/after at a Mars-moon pose, shot of
Phobos and Deimos close-up; whole-branch review; both PRs opened (PR 2 based on PR 1).
