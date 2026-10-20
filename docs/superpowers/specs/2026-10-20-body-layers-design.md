# Body code into Layers

Status: brainstorm converged 2026-10-20; refactor-ground checkpoint signed off the same day.

## 1. Intent

`src/layers/body/` holds only the body settings clusters and their visibility entries. The body render
and load code is still in core: 13 content passes, both `CORE_COMPUTES`, 12 GPU handle rows,
`EngineData.bodies`, all three remaining `EngineAssetSlots` fields, and the surface-tile subsystem. It
belongs in Layers, like every other content family since the layer-composition spec
(`specs/2026-09-09-layer-composition-design.md`, which named `body` as one Layer).

The body code turned out to be three things, not one: the celestial bodies, the craft, and things
placed on Earth at human scale. That last group grows next, with the Powers-of-Ten descent (Chris lying
in Søndermarken, his eye, the cells in it), so it gets its own Layer now.

## 2. Goals, non-goals, anti-goals

**Goals**

- Three Layers own their bodies end to end: their rows, positions, drawing, assets, selection, search,
  captions and detail card.
- Adding a body (Chris, a new craft, a new moon) is a row in its Layer, with no core table to edit.
- Core keeps only what every body-bearing Layer shares (§4).

**Non-goals**

- No visual change. Every pass draws what it draws today, in the same frame order.
- starCatalog and blackHoles keep reaching into core tables for their bodies (`SCENE_ANCHORS`,
  `ORBITAL_ELEMENTS`) until a later pass moves their rows. The roster joint (§6, P1) allows that move
  but does not require it.
- The remaining core exhibits (Cosmic Flows, Cosmic Web, Zone of Avoidance, Observable Universe) stay
  where they are. Only Solar System moves.
- The pass names stay hand-listed in `frameSections.ts`. Making the frame order declarative is the
  separate declarative-frame-program brainstorm.

**Anti-goals**

- A Layer whose content is other Layers' rows. Core keeps the orbit-trail pass for that reason (§5.4).
- A store or table keyed by body kind gaining a field per Layer.
- Namespaced body ids (`layer/id`). They would break every `#focus=body-…` deep link.

## 3. The three Layers

| Layer                         | Bodies                                                                                     | Takes from core                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body` (exists, settings only) | Earth, Sun?, planets, moons (Phobos and Deimos drawn as meshes), rings                     | Passes `earth`, `surface-tiles`, `terrain-pick-marker`, `cloud-shell`, `planets`, `textured-bodies`, `rings`, `body-glints`, `atmosphere-shell`, `aerial-perspective`. Computes `sky-view`, `aerial-perspective`. Their renderers. Body texture slots, ring slots, the atlas. The surface-tile subsystem and its planner. Phobos/Deimos mesh slots. The Solar System exhibit. Its planet trail rows. |
| `missions` (exists)           | Voyager 1/2, Hubble, Curiosity, Perseverance, Spirit, Opportunity, the whale, the petunias | Their mesh slots, mesh draw pass, contact shadows (only rovers carry a contact decal), glints for sub-pixel craft, captions, selection, search aliases, presence gating (`presentFromIso`, `spacecraftPresent`). Keeps its trails, exhibit, mission camera and trajectory loading. |
| `earthScenes` (new)           | Søndermarken                                                                               | Its mesh slot and mesh draw pass. Søndermarken is an anchored site (`surfaceFixedSites.ts:76`): uncaptioned (`sceneBodyLabels.ts:102-107`) and unpicked (`meshBodiesPass.ts:97-118`), and it stays that way, so the Layer contributes no caption, selection kind or card yet. Later: Chris, his eye, its cells. |

"Sun?" is open: the builder places the Sun's row where its readers point, in `body` unless the trace
shows it belongs with the stars.

The craft merge into `missions` because a mission is a craft, its trajectory and its events, and the
two halves already read each other: `produceMissionCaptions.ts:9` reads the craft roster, and
`sceneMeshBodies.ts:3` reads missions data. A separate `spacecraft` Layer would turn those into two
Layer-to-Layer reads.

## 4. What core keeps

- The position solver (`deriveBodyStates`, `sceneBodyStates`), now fed by the composed roster (P1).
- The pick encoding and the shared `bodyPickRenderer`.
- Occluder spheres, the sampled-depth binding, and the ordered foreground roster in `frameSections.ts`.
- **One mesh renderer handle** (`gpuHandleRegistry.ts:265`) with the env BRDF LUT, the probe schedule
  and the cube-face blit. `body`, `missions` and `earthScenes` each draw their own ids through it, the
  way every Layer already draws picks through `bodyPickRenderer`. The probe schedule, partition
  residency and `drawableMeshBodies` all assume one renderer (9 hits in 7 files of
  `state.gpu.meshBodyRenderer`), so one handle needs no new joint.
- The orbit-trail pass and renderer (§5.4).
- The terrain-height seam (P4): core reads a Layer-provided lookup, never the tile subsystem.

## 5. Rulings

1. Three Layers, as in §3. Terrain and atmosphere stay inside `body`.
2. Craft live in `missions`, under that name. Its settings keys, toggles and exhibit ids are unchanged.
3. Layers declare their bodies with a new `bodies` contract member (P1). The user consented to this
   widening on 2026-10-20.
4. Orbit trails: core keeps the pass. Each Layer's `guides.orbitTrails` rows carry that Layer's own
   show key. The S-star trails get their own toggle on `starCatalog`. This widening was also consented.
5. The mesh renderer stays one core handle (§4). This revises an earlier per-Layer-instance ruling
   after the trace found the probe schedule and partition residency assume one renderer.
6. The surface-tile subsystem moves into `body`, and core gets a terrain-height seam (P4). Consented.
7. Order: the mesh-drawing Layers (`missions`, `earthScenes`) form first, then `body`.
8. Craft captions: `missions`' label entry (`missions/visibility.ts`) claims every craft, not only the
   two Voyagers. The body Layer's "Mesh bodies" label item and the `mesh-body` source row
   (`data/sources/mesh-body.ts:14`) go. A persisted `mesh-body` label setting is dropped, not
   migrated, so a reader who had muted it sees the craft captions again under the missions switch.
9. The inside-atmosphere row is declared by the body Layer as a tagged `slabs` row, like the lens row
   (P5). Core keeps no atmosphere code.

## 6. Ground preparation

The refactor-ground sketch found that no Layer can declare a scene body today. Core reads every body
from static tables (`SCENE_BODIES`, `sceneBodies.ts:23`) and from a store shaped by kind
(`state.data.bodies {earth, planets, meshBodies}`, `createEngineData.ts:25`). The show entry's
`bodies` map (`ShowEntry.d.ts:9`) admits a body to the frame but gives it no position, pick, store
entry or card. Without the joint, each new Layer adds a kind-field to the store and a table to
`src/data/bodies/`: a bolt-on per Layer.

### P1. Scene bodies are a composed roster (own spec, own PR)

A new Layer member `bodies?: readonly LayerBody[]` (static rows: the body, its position source, its
presence window, its search aliases). Core folds `CORE_BODIES` and every Layer's rows into one roster,
following the `CORE_COMPUTES` / `CORE_EXHIBITS` pattern where core's rows shrink as Layers take theirs.
The P1 PR is behaviour-neutral: every row is still contributed by core.

These readers switch to the fold:

| Concern               | Reader today                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Positions             | `deriveBodyStates.ts:38,60,78,105` (four static tables)                                           |
| Identity lookup       | `bodyRowAt.ts:12`, `bodyDriverGeometry.ts:17`, `bodySelectionRow.ts:39`                           |
| Store                 | `createEngineData.ts:25-27` and its 7 reader files                                                |
| Picks                 | `bodyPickRows.ts:13`, `sceneBodyPickId.ts:14`                                                     |
| Mesh presentation     | `meshPresentations.ts:21`                                                                         |
| Presence, slab hosts  | `spacecraftPresent.ts:19`, `meshBodySlabHostId.ts:20`                                             |
| Captions              | `sceneBodyLabels.ts:82-110`                                                                       |
| Search                | `rankPaletteMatches.ts:99`                                                                        |
| Regions and reach     | `bodyRegions.ts:43`, `data/bodies/orbitReachByRegion.ts:21`                                       |

P1 gets its own brainstorm and spec before this feature's plan. That spec settles:

- the `LayerBody` and position-source shapes;
- how static readers outside the engine (palette ranking, sagas calling `deriveBodyStates`) reach the
  fold;
- whether `SceneBody`'s kind union survives once each Layer owns its own bodies.

It also resolves the backlog item "Seeded stars still live in the body tables", whose detail file this
change deletes.

### P2. The partition takes a roster

`sceneBodyPartition(state, ctx)` (`sceneBodyPartition.ts:24`, 10 files) sorts every body into one set
of buckets. An unresolved craft lands in `glints`, which the body Layer's glint pass draws
(`bodyGlintsPass.ts:143`). After P2 the partition takes a roster, so each Layer partitions its own
bodies. The glint renderer is shared code, and `missions` builds its own instance as blackHoles does
(`blackHoles/create.ts:13`). The partition is behaviour-neutral while core passes the whole roster.

The partition also asks two renderers about residency: `meshBodyRenderer.hasMesh`
(`sceneBodyPartition.ts:45`, which stays core) and `texturedBodyRenderer.hasMap` (`:51`, which moves
into `body`). After P2 the caller passes the texture-residency check in, so the partition reads no
Layer-owned handle.

### P3. Trail rows grouped with a show key

```ts
// src/@types/engine/layer/LayerGuides.d.ts:16, today
readonly orbitTrails?: readonly OrbitalElements[];
// after
readonly orbitTrails?: { readonly show: ShowKey; readonly rows: readonly OrbitalElements[] };
```

`state.orbitTrailRows` (`createLayers.ts:200`) keeps the groups, and `orbitTrailsPass` applies one fade
per group. `gatePassByFade` resolves one address per pass (`gatePassByFade.ts:21`), so the pass
resolves each group's fade itself; the pass-level gate covers "every group is zero". `starCatalog`
declares an S-star trails show entry, with a toggle row beside the body Layer's. Once P1 lands, a
body row may carry its trail instead of a separate rows list. That is the from-scratch shape, so the
builder may fold P3 into P1's shape if P1 is written first.

### P4. Terrain-height seam

The camera reads terrain through the core subsystem: `terrainHeightAtOf(state.subsystems.surfaceTiles)`
at `engine.ts:530`, `frameContext.ts:99`, `runFrame.ts:133` and `liveWorldPose.ts:22`, plus
`residentHeightLevelAt` at `engine.ts:532`. P4 adds a runtime-bound Layer member returning
`{ heightAt: TerrainHeightAtLookup; residentHeightLevelAt }`. At most one Layer may provide it; boot
throws on two. With none, core reads flat ground. Core's four readers take the lookup, and the tile
subsystem then moves into `body` with no camera change.

Core reads the subsystem in three more places, settled as follows (builder-check finding):

- `makeReconcileEffects.ts:30` reads `getDebugSnapshot().subCamera` for `logCameraState`. This is a
  camera fact, so the seam carries it as a third member, `subCamera()`. It is within the consented
  "terrain-height seam": everything core's camera reads from terrain, and nothing else.
- `engine.ts:504` feeds the DebugPanel's surface-tile section. That section moves to the body Layer's
  `ui` debug slot, which is growth.
- `engine.ts:436-437` tears the subsystem down. That moves into `body`'s `destroy`.

### P5. The inside-atmosphere row is declared, like the lens row

Core's frame expansion places the aerial-apply line on the body row whose atmosphere holds the camera.
Today core computes that row itself, through atmosphere code:

```ts
// src/services/engine/frame/bodyRowSlabs.ts
const lensHostIds = new Set(ctx.snapshot.slabBodyCandidates.filter((row) => row.source === 'lens') …);
const inside = atmosphereDrawList(state, ctx).find((entry) => entry.inside);
```

The `lens` half is already declared: blackHoles contributes a static `SlabRow` tagged `source: 'lens'`
with an `activeBand` (`blackHoleSlabRow.ts:20-21`), so the row exists only while the camera is inside
the band. P5 gives the atmosphere the same shape:

- `SlabRow.source` (`SlabRow.d.ts`) gains `'insideAtmosphere'`. The user consented to this widening of
  the `slabs` member's type on 2026-10-20.
- The body Layer declares one `slabs` row per atmosphere body, banded at `INSIDE_PATH_ENTER_RATIO`
  (1.005) times that body's atmosphere top. That matches today's test, a sphere
  (`isInsideAtmosphereShell.ts`). The plan verifies that the band's edge reproduces the hard `<`.
- `bodyRowSlabs` reads both tags the same way and calls no atmosphere code.
- `ATMOSPHERE_PARAMS` and `atmosphereDrawList` move into `body` with the rest of the atmosphere.

P5 rides the `body` PR as its first commit, because the body Layer is the joint's only writer. A
temporary core writer would only be thrown away.

### Growth, per touchpoint

| Touchpoint                                 | Lands as                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Content passes                             | `passes`, with names added to `frameSections.ts`. Per-Layer mesh pass names: `mesh-bodies` splits into one per Layer, and `contact-shadows` joins the one existing `sampleDepth` entry under `missions`. |
| Sky-view and aerial computes               | `computes`                                                                                                     |
| Texture, ring, atlas and mesh slots        | `assets`. Core's body-family branches then delete: `AssetKey.d.ts:23-26`, `EngineAssetSlots.d.ts:25-40`, `slotFor.ts:51-63`, `installSlots.ts:41`, `installLoadProgress.ts:44-62`, `wireSlots.ts:87-88`, and the whole `ASSET_WIRING`. |
| Atmosphere reconcile (`runFrame.ts:101`)   | `planners`, if a planner runs early enough. The plan verifies this; if not, it is a fifth joint to report.     |
| Tile planner (`runFrame.ts:260-333`)       | `planners`                                                                                                     |
| Selection, detail card                     | `selection` plus `ui.detailCard`, one selection kind per Layer (`detailCardTable.ts:62` keys cards by kind)    |
| Search aliases (`bodySearchNames.ts`)      | `search`                                                                                                       |
| Captions                                   | `guides.screenLabels`, with the claim path (`claimedLabelItemsOf.ts`) as `missions` already uses it           |
| Source codes                               | `sources`. `mesh-body` (`data/sources/mesh-body.ts:14`) is replaced by a `missions` code (ruling 8). `Source` codes are append-only within the pick encoding's 6-bit code field. |
| Solar System exhibit                       | `exhibits`                                                                                                     |
| GPU handle rows                            | deleted from `gpuHandleRegistry.ts`, minted in each Layer's `create`. The mesh, pick, trail and cube-face-blit handles stay core. |

## 7. Packaging and order

1. P1 spec, then the P1 PR. This feature's plan is written after the P1 spec, because P2's roster
   type, the Layers' `bodies` rows and how the palette and selection reach Layer bodies all follow from
   P1's shapes.
2. One prep PR carrying P2, P3 and P4 as separate commits. This is the reading of "other prep: own
   PR"; the plan may split it if review wants.
3. The `missions` craft PR, then `earthScenes`.
4. The `body` PR, opening with P5, or two PRs if the plan finds the globe and atmosphere half large
   enough to stand alone.

Each Layer PR deletes what it empties from core in the same change.

## 8. Left to the builder

- Per-Layer pass names and their order inside the existing `frameSections.ts` groups. The order must
  be the same as today's.
- Whether the Phobos/Deimos mesh draw is its own `body` pass or rides `textured-bodies`' residency
  fall-through.
- The Sun's home (§3).
- Test shape, per `conventions/testing.md`. The existing frame-order and pass-name boot checks
  (`checkFrameOrder.ts`, `concatUniqueRows`) already catch a half-moved pass.

## 9. Adjacent findings (backlog, not this effort)

- Sub-pixel mesh bodies are dropped from picking: they sit in `glints`, but the glint pick only stamps
  `SCENE_PLANETS` rows (`bodyGlintsPass.ts:345-346`).
- `near0SphereBodies.ts:2` is marked for deletion by this work. The plan should check whether P1 or the
  body PR removes it.
