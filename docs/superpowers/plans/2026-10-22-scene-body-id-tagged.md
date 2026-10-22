# Scene body ids as tagged strings

`BodyId` (`src/@types/data/body/BodyId.d.ts`) is `'earth' | 'planet'`: the `type: 'body'`
source-registry ids, the keys of `settings.bodies.items`. About 52 src files use it to mean any
scene body's id (planets, moons, craft, Søndermarken, stars) and two use it for surface site ids.
The mismatch costs 24 `as BodyId` casts in src, 6 `as ReadonlyMap<BodyId, BodyState>` over
`deriveBodyStates()` and 142 `as BodyId` casts in tests. This plan gives the two domains their
own names and makes a scene id a tagged string, stamped once where a row is made and checked
where a raw string enters. Branch `scene-body-id-tagged`, one draft PR. Design approved by the
owner 2026-10-22.

## Ground preparation

None needed: this IS the ground work. Types only, plus a handful of `Set` lookups at the input
boundaries, so no perf gate.

## Contracts

```ts
// src/@types/utils/Tagged.d.ts — type-fest's shape, local (no dependency); stackable.
export type Tagged<Base, Tag extends string> = Base & { readonly [tag]: { [K in Tag]: void } };

// src/@types/scene/SceneBodyId.d.ts
export type SceneBodyId = Tagged<string, 'sceneBodyId'>;
// src/@types/scene/SurfaceSiteId.d.ts — a site is a mesh body whose id is also its driver id.
export type SurfaceSiteId = SceneBodyId & Tagged<string, 'surfaceSiteId'>;

// src/utils/scene/asSceneBodyId.ts, asSurfaceSiteId.ts — the only stamps (the asUserId pattern).
export function asSceneBodyId(id: string): SceneBodyId;
export function asSurfaceSiteId(id: string): SurfaceSiteId;

// src/utils/scene/isSceneBodyId.ts — membership in SCENE_BODIES; the raw-string boundary guard.
export function isSceneBodyId(s: string): s is SceneBodyId;
// src/utils/surfaceTiles/isSurfaceTileBodyId.ts
export function isSurfaceTileBodyId(id: SceneBodyId): id is SceneBodyId & SurfaceTileBodyId;
```

- `BodyId` → `BodySourceId`, kept only on source/settings-key uses (`BodySettings.items`,
  `BODY_PICK_ROWS`, `layers/body/state/bodies/{initialState,slice}.ts`, `bodySelectionRow`,
  `sceneBodyPickId`).
- `FocusId` becomes `Tagged<string, 'focusId'>`.
- Every scene-body `id` (EarthBody, PlanetBody, StarBody, MeshBody, OrbitalElements,
  SampledBody, PositionDriver) is `SceneBodyId`; `SurfaceFixedSite.id` is `SurfaceSiteId` and
  its `hostId` `SceneBodyId`. Authoring seeds (`BodySpec`, `MeshBodySeed`, maker specs, the
  generated star rows) stay `string`; the maker stamps.
- `AnchorBody.id` and `OrbitalElements.focusId` are `SceneBodyId | PlaceId`: the Galactic Centre
  anchor is a place, so `deriveBodyStates` returns `ReadonlyMap<SceneBodyId | PlaceId, BodyState>`
  and its readers take that key. `RungCtx.focusBodyId` and `SlabHostId` are `SceneBodyId | PlaceId`.

## Tasks

### Task 1: `Tagged` + `FocusId`

**Files:** `src/@types/utils/Tagged.d.ts` (new), `src/@types/animation/FocusId.d.ts`.
No test: a type alias swap the compiler checks.

### Task 2: rename `BodyId` → `BodySourceId`

**Files:** every `BodyId` importer. `npm run refactor -- rename src/@types/data/body/BodyId.d.ts#BodyId BodySourceId`,
then Task 3 moves the scene uses off it.

### Task 3: `SceneBodyId` through types, makers and tables

**Files:** `src/@types/scene/*.d.ts` listed above, `src/@types/camera/*`, `src/@types/engine/**`,
`src/data/bodies/**` (makers + literal tables), `src/layers/{missions,earthScenes}/bodies/*`,
`src/services/engine/**`, `src/utils/camera/**`. `review: yes` (camera/pose code).

- Makers stamp `id` (and `focusId`/`hostId`) through `asSceneBodyId`/`asSurfaceSiteId`; literal
  tables (`orbitalElements.ts`, `sceneEarth.ts`, site literals in Layer rows) stamp per field.
- Every class-(b)/(c) `BodyId` position becomes `SceneBodyId`/`SurfaceSiteId`; all
  `as BodyId` and `as ReadonlyMap<…>` casts in src go.
- Note for review: `LayerBody`'s row `id` narrows to `SceneBodyId` through the makers (a
  narrowing, not a widening of the Layer contract).

### Task 4: boundaries + guards

**Files:** `src/utils/url/decodeFramedPose.ts`, the `body-<id>` focus resolver,
`src/state/camera/{flyToLonLatActions,watchFlyToLonLatSaga}.ts`,
`src/components/DebugPanel/SurfaceTileAtlasSection.tsx` + container,
`src/services/engine/subsystems/surfaceTileSubsystem.ts`, guards above + tests. `review: yes`.

- [ ] Test `decodeFramedPose rejects an unknown body id` (`#pose=b,bogus,…` → `null`): catches a
      deep link that names no body being decoded into a pose the rung then throws on.
- [ ] Test `isSceneBodyId` accepts `'mars'` and rejects `'bogus'`.

### Task 5: test cast sweep

**Files:** `tests/**`. The 142 casts become `asSceneBodyId(…)`; no new tests.

### Task 6: deletions

**Files:** `src/data/bodies/bodyIds.ts` (delete; the one test reader gets a fixture), unused
`BodyId` imports in `surfaceTilesPass.ts`, `cloudShellPass.ts`, `earthPass.ts`, `ringsPass.ts`,
wrong-domain comments (`SimBodyId.ts`, `earthPass.test.ts`, `stepRung.test.ts`,
`planetRenderer.test.ts`, `planSurfaceCut.ts`).

## Definition of Done

- `rg -n "as BodyId|\bBodyId\b" src tests` is empty; `rg -n "as SceneBodyId" src` hits only the
  stamp helper.
- `deriveBodyStates` is read with no cast anywhere.
- `#pose=b,bogus,…` decodes to `null`.
- Out of scope: tagging `RotationElements.id`, `MeshPresentation.id`, pick-row ids; a closed
  union of scene ids.
