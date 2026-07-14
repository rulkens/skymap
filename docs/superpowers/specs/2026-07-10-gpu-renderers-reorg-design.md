# GPU renderers folder reorganization — family folders, lib primitives, pointRenderer split — design

> **Status.** Approved design (fully decided), **regrounded 2026-07-14**
> against the post-zoom-to-earth tree — plans 02–04 all landed (#425, #429,
> #432). TDD plans are next.
> **Date.** 2026-07-10. **Regrounded.** 2026-07-14.
> **Relationship to prior work.** Codifies the family boundaries that
> renderer-unification (plans 01–04, all shipped 2026-07-09) left implicit,
> and lands the last known outliers in
> [`renderers.md`](../conventions/renderers.md). The **sequenced-after
> zoom-to-earth-plan-02** gate is now **satisfied**: plans 02–04 shipped their
> body renderers (#425, #429, #432), so this reorg regrounds onto their final
> file citations rather than waiting on them — see §11.

## 1. What we're building

`src/services/gpu/renderers/` is **21 flat files** ranging up to ~840 lines
(`pointRenderer` is now 840). The count grew from 17 to 21 as zoom-to-earth
plans 02–04 landed their body renderers (earth, planet, star, star-point,
orbit-trail). Flat is fine at five files; at twenty-one it stops telling you
which renderers are _one conceptual thing split across files_ (the galaxy LOD
chain, the solar-system bodies) versus _genuine singletons_ (the horizon
shell). This reorganization does four things:

1. **Family folders** whose boundaries follow **real coupling edges** — code
   imports, shared shaders, shared feeders — not one-folder-per-file and not
   subject-matter kinship. A folder means "these files change together."
2. **`gpu/lib/`** for the genuinely-shared primitives that are
   currently copy-pasted byte-identically across 3–8 sites each.
3. **Split `pointRenderer.ts`** (840 lines, 13 methods, the system's first
   renderer) into draw / layout / store — the one real surgery in this reorg.
4. **Codify a canonical file anatomy** in
   [`renderers.md`](../conventions/renderers.md) so the next renderer author
   doesn't reinvent a 15th factory shape, and refresh two stale claims that
   doc still carries.

Everything else is mechanical file movement. The reorg is **behaviour-neutral**:
zero runtime logic changes except the `pointRenderer` named-bag signature and
the `catalogStore` composition — both covered by existing tests whose imports
move with them.

### Why family folders, not one-folder-per-file

One-folder-per-file re-encodes the flat list with more indentation and teaches
nothing. The value is in naming the coupling: when a folder groups
`pointRenderer` + `proceduralDiskRenderer` + `texturedDiskRenderer`, a reader
learns "these are the LOD stages of one renderer" for free. A folder that holds
a single file (`horizonShell/`, `filaments/`) is honest: it says "this one is
genuinely alone," which is also information.

## 2. Non-goals (explicitly out of scope)

This reorg is deliberately narrow. It does **not**:

- **Touch the `EngineGpuHandles` nullability backlog item**
  ([`docs/backlog/2026-06-29-gpu-handle-nullability.md`](../../backlog/2026-06-29-gpu-handle-nullability.md)).
  That's engine-side (`state.gpu.*` slots) and stays on the backlog. Note its
  `PassDeps` half already shipped via renderer-unification plan 02, so the
  detail file is **half-stale** — flag it, don't act on it here.
- **Unify the `if (device)` CPU-only construction split.** 6 renderers accept a
  null device (for CPU-only unit tests); 11 don't. Consolidating that is a
  separate design conversation, and the **2026-05-08 black-screen incident**
  (an over-eager ready-predicate consolidation) is the standing warning against
  merging construction/ready predicates casually. Left exactly as-is.
- **Rename `markerLineRenderer` → `labelStemRenderer`.** The rename is correct
  _in spirit_ (it draws label stems; it has nothing to do with structure
  markers), but the name is woven into the `marker-lines` `ContentLayer` key
  (`markerLinesLayer.ts:44`) and the DebugPanel toggle list derived from
  `CONTENT_LAYERS`. Record it as a docblock note + a follow-up, don't rename
  in this reorg.
- **Add a galaxy-catalog facade object.** The engine's `autoLod` already
  composes the point → procedural-disk → textured-disk LOD stages; wrapping
  them in a facade would add an indirection nobody asked for. **The folder is
  the unification** — grouping is the only "facade" here.

## 3. Relationship map — the coupling edges that define families

Each family below is justified by a **verified** edge, not a vibe.

### `galaxyCatalog/` — the LOD chain of ONE conceptual renderer

`pointRenderer` (far: sprites) → `proceduralDiskRenderer` (mid: generated
disks) → `texturedDiskRenderer` (near: thumbnails) are the three LOD stages of
a single "draw a galaxy catalog" renderer, per the user's own framing. The
coupling is concrete:

- **`instancedQuadRenderer` is the shared quad pipeline wrapped ONLY by the two
  disk stages.** Its only `src` consumers are `texturedDiskRenderer.ts:47` and
  `proceduralDiskRenderer.ts:71` (both `import { ... } from
'./instancedQuadRenderer'`). `rebuildHiResFamousForTier.ts` mentions it in a
  _comment_ (line 26) but imports nothing from it. This is the
  `instancedQuadRenderer`-shared-by-N precedent `renderers.md` already
  documents.
- **`pickRenderer` imports the point layout from `pointRenderer`.**
  `pickRenderer.ts:38` does `import { POINT_STRIDE, POINT_VERTEX_ATTRIBUTES,
UNIFORM_BYTES } from './pointRenderer'`, and both compile
  `shaders/points/vertex.wesl`. They are two passes over the same vertex
  format. (Post-split, `pickRenderer` imports from `pointVertexLayout.ts`
  instead — see §6.)
- **Members:** `pointRenderer.ts`, `proceduralDiskRenderer.ts`,
  `texturedDiskRenderer.ts`, `instancedQuadRenderer.ts`, `pickRenderer.ts`,
  plus the two files the split extracts: `pointVertexLayout.ts`,
  `catalogStore.ts`.

### `labels/` — a shared feeder, not shared mechanics

`labelDirectorSubsystem.ts` feeds **both** `labelRenderer.setLabels` and
`markerLineRenderer.setLines` (its module header, lines 2–3, names both).
Marker lines are **label stems** — `passes/index.ts:39` literally documents the
`marker-lines` layer as "screen-space thick-line overlay (e.g. label stems)."
The family is chosen by **purpose** (they're the label subsystem's two draw
calls), not by **mechanics**: `debugLineRenderer` shares the _same_ marker-line
shader but serves clip-path/tour debug (fed by the `presentation/`
builders `buildClipPathLines` and `cameraGizmoLines`), so it lives in
`devTools/`, not here.

- **Members:** `labelRenderer.ts`, `markerLineRenderer.ts`.

### `milkyWay/` — shared calibration truth + matched footprint

Both `milkyWayCloudRenderer` and `milkyWayPickRenderer` read shared truth from
`gpu/galaxy/milkyWayCalibration` — `milkyWayPickRenderer.ts:48` imports
`MILKY_WAY_RADIUS_MPC`. The pick footprint **must** match the cloud, so they
change together. `gpu/galaxy/` (19 files of Milky-Way generation compute) stays
a **sibling supplier**, not a member: folding 19 compute files into a renderer
folder muddies ownership (the folder would stop meaning "renderers").

- **Members:** `milkyWayCloudRenderer.ts`, `milkyWayPickRenderer.ts`.

### `devTools/` — debug draws that happen to be renderers

- `debugLineRenderer` — clip-path routes + camera-gizmo debug lines.
- `diskRadiusRing` — the catalog-disk-radius calibration ring. It **currently
  lives in `gpu/passes/`** but it is a _renderer_ by the registry's own
  definition: it draws world-space content and sits in `CONTENT_LAYERS`
  (`passes/index.ts:159`, `diskRadiusRingLayer`), whereas true passes operate on
  _textures_. Its own docblock self-describes as `selectionRing`'s sibling
  (`diskRadiusRing.ts:26`, "same split as `selectionRing`"). It moves out of
  `passes/` into `devTools/`.

### `bodies/` — the solar-system foreground, shipped as one unit

The five renderers zoom-to-earth plans 02–04 added draw the local
foreground — Earth, the planets, nearby star spheres, the far-star LOD points,
and the planetary orbit trails. Each edge below is verified 2026-07-14.

- **earth + planet + star form an exclusive sphere cluster.** They are the
  ONLY repo consumers of `shaders/lib/sphere.wesl` — earth imports
  `SphereUniforms` + `clip_from_local` (`shaders/earth/vertex.wesl:31–32`),
  planet the same (`shaders/planet/vertex.wesl:40`), star pulls
  `TintedSphereUniforms` + `clip_from_local` (`shaders/star/vertex.wesl:30–31`,
  `shaders/star/fragment.wesl:28`). They are equally the only importers of the
  `utils/math/uvSphereMesh` mesh builder (`earthRenderer.ts:67`,
  `planetRenderer.ts:48`, `starRenderer.ts:36`). All three draw opaque,
  depth-tested, into the `foreground:0` slab (`earthLayer.ts:56–57`,
  `planetsLayer.ts:59–60`, `starSpheresLayer.ts:72–73`).
- **`starPointRenderer` joins by PURPOSE coupling — the same argument that
  formed `labels/`.** It is the point half of ONE star partition whose sphere
  half is `starRenderer`: `partitionStarsByResolution` splits
  `state.data.bodies.stars` between the sphere layer (`starSpheresLayer.ts:96`)
  and the point layer (`starPointsLayer.ts:114`). Mechanically it shares no
  bespoke code edge with the sphere trio — it rides the house-standard
  `lib::camera` + `lib::billboard` stack (`shaders/starPoints/vertex.wesl:47–50`)
  and HDR-additive blend. So the family claim rests honestly on the **shared
  partition + feeder**, not on a shader or a struct they hold in common.
- **`orbitTrailRenderer` joins as the fifth member.** It has zero cross-imports
  with the other four, but its data source `SCENE_ORBIT_CONICS` (read at
  `orbitTrailsLayer.ts:47`) is DERIVED from the same `src/data/bodies/`
  single-source tables the sphere renderers draw:
  `sceneOrbitConics.ts:60–74` maps `ORBITAL_ELEMENTS` through
  `keplerianEllipse`, resolving each parent from `SCENE_BODIES`. Its trails are
  pinned to the very planets the family draws. The renderer computes no
  geometry — `composeOrbitConic` (`src/utils/camera/composeOrbitConic.ts`)
  builds the f64 `Ginv` homography in the layer
  (`orbitTrailsLayer.ts:121–128`).
- **The change-together clincher.** All five are constructed together
  (`initGpu.ts:66–70`), gated by the same `FOREGROUND_MAX_DISTANCE_MPC` +
  `NEAR0` slab (`earthLayer.ts:51,65`; `planetsLayer.ts:49,69`;
  `starSpheresLayer.ts:67,79`; `starPointsLayer.ts:84,96`;
  `orbitTrailsLayer.ts:51,77`), each has a dedicated `ContentLayer`, and
  zoom-to-earth plans 02–04 shipped them as one unit in every PR — the
  strongest change-together evidence in the repo.
- **Render-profile sub-split (an observation, not a folder boundary).** Inside
  the family, earth/planet/star are opaque `foreground:0`, while
  starPoints/orbitTrail are HDR additive and depthless
  (`starPointRenderer.ts:148–151`, `orbitTrailRenderer.ts:142–145`). That two
  profiles coexist under one family is worth noting, but it does NOT justify
  splitting the folder — the coupling edges above (shared sphere lib, shared
  star partition, shared body tables, one-unit construction) all cut across the
  profile line.

- **Members:** `earthRenderer.ts`, `planetRenderer.ts`, `starRenderer.ts`,
  `starPointRenderer.ts`, `orbitTrailRenderer.ts`.
- **`selectionRingRenderer` stays a singleton** — verified zero coupling to any
  body renderer.

### Deliberately NOT grouped — subject kinship without code coupling

- **`volumeField` ↔ `flowField`.** They share only the `buildCubeModelMatrix`
  util (`volumeFieldRenderer.ts:61`, `flowFieldRenderer.ts:57`, both from
  `utils/math/`) — a util, not each other. **Zero cross-imports** (their only
  mutual mentions are comments at `flowFieldRenderer.ts:253` and
  `volumeFieldRenderer.ts:235`). Grouping them would encode "both are volumes,"
  which is subject-matter, not coupling. They stay separate singles.
- **`filaments/`, `horizonShell/`, `structureMarker/`** are genuine singletons.
  Their folders hold one file each — honest loneliness.

### `gpu/labels/` → `gpu/labelLayout/` rename

Renaming the **supplier** folder kills the confusing name-twin with the new
`renderers/labels/` (renderer) folder while preserving the sibling-supplier
pattern. Its helpers (`fontMetrics`, `labelLayout`, `loadFontAtlases`,
`measureLabel`, `milkyWayLabelVisibility`) are consumed by the `labelRenderer`
(`labelRenderer.ts:76–77`) **and** non-renderer callers
(`presentation/produceMilkyWayLabel`, `data/fonts`), which is exactly why it
stays a sibling supplier rather than folding into the renderer folder.

## 4. Target tree

```
src/services/gpu/
  lib/                    cameraUniforms.ts, unitQuad.ts, blendStates.ts, dummyFade.ts
                          (gpu-wide shared primitives — sibling to renderers/ AND passes/)
  labelLayout/            renamed from gpu/labels/ (fontMetrics, labelLayout,
                          loadFontAtlases, measureLabel, milkyWayLabelVisibility)
  galaxy/                 unchanged — sibling supplier to renderers/milkyWay/
  passes/                 compositor, volumeUpsample, pickDebugOverlay only
                          (true texture-operators; diskRadiusRing moves out)
  renderers/
    galaxyCatalog/        pointRenderer.ts, proceduralDiskRenderer.ts, texturedDiskRenderer.ts,
                          instancedQuadRenderer.ts, pickRenderer.ts, pointVertexLayout.ts, catalogStore.ts
    milkyWay/             milkyWayCloudRenderer.ts, milkyWayPickRenderer.ts
    labels/               labelRenderer.ts, markerLineRenderer.ts
    structureMarker/      structureMarkerRenderer.ts
    filaments/            filamentRenderer.ts, buildSegmentInstances.ts (extracted from filamentRenderer.ts)
    volumeField/          volumeFieldRenderer.ts
    flowField/            flowFieldRenderer.ts
    selectionRing/        selectionRingRenderer.ts
    horizonShell/         horizonShellRenderer.ts
    devTools/             debugLineRenderer.ts, diskRadiusRing.ts (moved from gpu/passes/)
    bodies/               earthRenderer.ts, planetRenderer.ts, starRenderer.ts,
                          starPointRenderer.ts, orbitTrailRenderer.ts
  shaders/
    galaxyCatalog/        points/, proceduralDisks/, texturedDisks/ (nested — see §7)
    bodies/               earth/, planet/, star/, starPoints/, orbitTrail/ (nested — see §7)
    lib/                  camera.wesl, billboard.wesl, sphere.wesl, … (unchanged)
```

## 5. `lib/` extractions — exactly four

Each extraction is a byte-identical duplicate today, verified site-by-site. The
skeptic's bar: **extract only what is genuinely identical AND load-bearing to
keep in sync.** Where a near-duplicate is _semantically_ different, it stays
inline — folding it in would invite a silent visual bug.

The lib lives at `gpu/lib/`, a sibling to `renderers/` and `passes/`, not
nested under `renderers/`: the passes/ audit found four more byte-identical
blend sites (`volumeUpsample`, `pickDebugOverlay`, `diskRadiusRing`, the
compositor's additive `BLEND_TABLE` entry), so the shared primitives serve
`gpu/` broadly and can't sit below one of their consumers (user-decided
2026-07-14).

### 5.1 `cameraUniforms.ts`

`CAMERA_UNIFORM_BYTES = 80` + `writeCameraPrefix(f32Array, viewProj, viewportPx)`.

The 80-byte `CameraUniforms` prefix (viewProj 64 B + viewportPx 8 B + 2 pad) is
packed with a byte-identical 5-line write in **six** files:

| File                         | Line     | Local const name       |
| ---------------------------- | -------- | ---------------------- |
| `debugLineRenderer.ts`       | ~211     | `UNIFORM_BYTES`        |
| `labelRenderer.ts`           | ~557     | `UNIFORM_BYTES`        |
| `markerLineRenderer.ts`      | ~337     | `UNIFORM_BYTES`        |
| `selectionRingRenderer.ts`   | ~140     | `CAMERA_UNIFORM_BYTES` |
| `structureMarkerRenderer.ts` | ~510     | `UNIFORM_BYTES`        |
| `starPointRenderer.ts`       | ~221–224 | `uniformScratch` write |

The `starPointRenderer` row is the sixth site: it packs the 80-byte
`CameraUniforms` scratch at `starPointRenderer.ts:80` and writes it identically
at `:221–224`. **Caveat — `starRenderer` is NOT a sixth-and-a-half site.**
`starRenderer.ts:155–158` is superficially the same three-op shape but packs
MVP + tint into `TintedSphereUniforms`, not a camera prefix; it has no shared
80-byte span to extract and stays inline. This is exactly the §5.5
near-duplicate rule — fold the genuinely-identical, leave the look-alike.

Every other site is the same three-op sequence: `uni.set(viewProj, 0);
uni[16] = viewportSize[0]; uni[17] = viewportSize[1];`. The same 80-byte prefix
is _also_ documented as the leading struct of five more (filament 96 B,
instancedQuad 96 B, point 176 B, milkyWayCloud 208 B, volumeField 256 B) — those
keep their bespoke tails but can call `writeCameraPrefix` for the first 80. The
shader side already extracted this (`shaders/lib/camera.wesl`); this is the TS
twin. It mirrors the single-source-of-truth convention `packPointUniforms.ts`
(`src/utils/gpu/packPointUniforms.ts`) already established.

### 5.2 `unitQuad.ts`

`UNIT_QUAD_STRIP_CORNERS` (`[0, 0, 1, 0, 0, 1, 1, 1]`) + the matching
`GPUVertexBufferLayout`. Byte-identical `CORNER_DATA` in `debugLineRenderer.ts`
~49, `labelRenderer.ts` ~143, `markerLineRenderer.ts` ~108 —
`markerLineRenderer`'s own comment already flags "Identical to
labelRenderer.ts's CORNER_DATA."

**Not** the same as `milkyWayCloudRenderer`'s `CORNER_QUAD`
(`milkyWayCloudRenderer.ts:84`): that is a 6-vertex triangle-**list** in NDC
`[-1, 1]` — different topology and coordinate space. It stays put.

The five body renderers were audited and contribute **no** site here:
earth/planet/star draw `uvSphereMesh` geometry, not quads, and
`starPointRenderer` synthesizes its billboard corners shader-side via
`lib::billboard` rather than binding a corner buffer.

### 5.3 `blendStates.ts`

`ADDITIVE_BLEND` (10 byte-identical sites — the `one`/`one`/`add` descriptor
appears across `pointRenderer`, `filamentRenderer`, `flowFieldRenderer`,
`horizonShellRenderer`, `volumeFieldRenderer`, `structureMarkerRenderer`'s halo
pipeline, `milkyWayCloudRenderer`'s `STAR_BLEND`, `instancedQuadRenderer`'s
additive branch, `starPointRenderer.ts:148–151`, and
`orbitTrailRenderer.ts:142–145`) + `PREMULTIPLIED_OVER_BLEND` (5 byte-identical
sites —
`debugLineRenderer`, `labelRenderer`, `markerLineRenderer`,
`selectionRingRenderer`, `structureMarkerRenderer`'s ring pipeline).

**CRITICAL exclusion:** `instancedQuadRenderer.ts:~164` uses a **straight-alpha**
over-blend (color `srcFactor: 'src-alpha'`, not `'one'`) — semantically
different, single-site. It **stays inline**; folding it into a shared
`OVER_BLEND` would invite a silently double-applied alpha. Likewise
`milkyWayCloudRenderer`'s dust-multiply blend (dst/zero) stays put — it is
physically load-bearing and test-pinned.

### 5.4 `dummyFade.ts`

`createDummyFadeBindGroup(device, fadeBgl, label)`: the inert 16-byte
UNIFORM-only zeroed buffer + bind group, allocated so a pipeline whose layout
lists `fadeBgl` at `@group(1)` has a layout-compatible group to bind even though
the shader never reads fade. Byte-identical at `pickRenderer.ts:~90`,
`milkyWayPickRenderer.ts:~175`, `structureMarkerRenderer.ts:~344` — all
`size: 16`.

The five body renderers were audited and contribute **no** site here: none of
earth/planet/star/starPoints/orbitTrail declare a fade bind group, so there is
no dummy fade group to allocate.

### 5.5 Explicitly-rejected extractions

This section is load-bearing **against future scope creep**: it names what NOT
to extract, so a later reviewer doesn't "finish the job" by generalizing
something that is only superficially similar.

- **Generic uniform struct-packer.** Would reinvent WGSL memory layout in JS;
  every struct's _tail_ past the shared camera prefix is bespoke. The camera
  prefix (§5.1) is the only genuinely shared span.
- **Explicit-pipeline-layout wrapper.** The binding lists differ at every site;
  a wrapper would just mirror `GPUPipelineLayoutDescriptor` with no reduction.
- **Grow-on-demand buffer helper.** Two _genuinely different_ growth
  strategies: exact-fit (`instancedQuadRenderer.ts:~334`, `Math.max(count, 64)`)
  vs capacity-doubling (`structureMarkerRenderer.ts` `growTo`, ~419,
  `while (capacity < n) capacity *= 2`). Merging them would force one policy on
  both.
- **Fade-buffer lifecycle.** Ownership varies (single / per-id / lazy). The only
  thing to note here is a **consistency fix**, not an extraction:
  `structureMarkerRenderer`'s CPU fade _scratch_ is a 4-byte `ArrayBuffer`
  (`structureMarkerRenderer.ts:180`) where everyone else uses 16 — normalize to
  16 when the file is touched.
- **`destroy()` teardown.** Each renderer's resource set is unique; a shared
  teardown would be a loop over a per-renderer list, i.e. no shared code.
- **`if (device)` CPU-only construction split.** See §2 non-goals — a separate
  design conversation, guarded by the 2026-05-08 incident.

## 6. The `pointRenderer` split (the one real surgery)

`pointRenderer.ts` is 840 lines and its return object exposes **13 methods**
(`upload`, `unload`, `setBiasUploadCallback`, `setBiasUnloadCallback`,
`spliceSchechterRatios`, `spliceAngularWeights`, `clearBiasOverlays`,
`totalCount`, `countOf`, `hasCatalog`, `loadedSources`, `draw`, `destroy`)
braiding **three concerns**: pipeline+draw, vertex/uniform layout, and
per-catalog GPU storage/upload orchestration. Split three ways:

- **(a) `pointRenderer.ts`** keeps the pipeline build + `draw` + `destroy`
  (~350 lines). `draw()` iterates the catalog store's entries.
- **(b) `pointVertexLayout.ts`** gets `POINT_STRIDE`, `POINT_VERTEX_ATTRIBUTES`,
  the per-vertex byte-offset constants (`AXIS_RATIO_BYTE_OFFSET` …
  `ABS_MAG_BYTE_OFFSET`), and the pick uniform byte offsets
  (`SELECTED_PACKED_BYTE_OFFSET`, `POINT_SIZE_BYTE_OFFSET`,
  `PICK_PASS_BYTE_OFFSET`, and the re-exported `UNIFORM_BYTES`). **`pickRenderer`
  imports THIS**, no longer reaching into `pointRenderer` for layout.
- **(c) `catalogStore.ts`** gets the worker-bake upload/unload orchestration,
  the per-catalog GPU-buffer `Map`, `totalCount` / `countOf` / `hasCatalog` /
  `loadedSources`, and the bias-splice surface (`spliceSchechterRatios`,
  `spliceAngularWeights`, `clearBiasOverlays`, plus the bias upload/unload
  callbacks). `createCatalogStore(device, …)` **owns the `Map`**; `pointRenderer`
  composes it and `draw()` iterates `store` entries.

### Two known-outliers cleared in the same surgery

- **Named-bag conversion.** `createPointRenderer`'s positional args
  (`device, targetFormat, fadeBgl, sourceBgl, focusBgl`) become a single named
  bag. This clears the `renderers.md` known-outlier "convert [positional] when
  you next need to add a constructor arg" — the split is that occasion.
- **Kill the `setBuildBufferRunner` module-global.** The worker runner is
  currently injected via a module-level `setBuildBufferRunner`
  (`pointRenderer.ts:290`) — a test-injection hatch. Make it a **`catalogStore`
  constructor parameter** instead; tests inject via the factory, and the
  module-global disappears.

### Stale-claim note (feeds §9)

`renderers.md`'s known-outliers section still says "`pickRenderer` shares
`pointRenderer.uniformBuffer`." **This is STALE** — renderer-unification plan 03
gave pick its own `pickUniformBuffer` (`pickRenderer.ts:155`, `:203`; the module
header at `:11` documents it owns its OWN uniform buffer). Flag `renderers.md`
for refresh; do not preserve the sharing.

## 7. Shader moves (lockstep, approved)

`shaders/points/`, `shaders/proceduralDisks/`, `shaders/texturedDisks/` nest
under a new `shaders/galaxyCatalog/`. WESL import paths change accordingly:
`package::points::io` becomes `package::galaxyCatalog::points::io`, etc. — **14**
`package::` import lines across the `.wesl` files under
points/proceduralDisks/texturedDisks, plus **9** `?static` TS import lines
(`pointRenderer.ts:51–52`, `pickRenderer.ts:30–31`,
`proceduralDiskRenderer.ts:57–59`, `texturedDiskRenderer.ts:45–46`).

`shaders/earth/`, `shaders/planet/`, `shaders/star/`, `shaders/starPoints/`,
`shaders/orbitTrail/` likewise nest under a new `shaders/bodies/` (USER-APPROVED,
2026-07-14) — the family's shaders move in lockstep with its renderers. The
exact surface: **8** WESL self-import lines change
(`package::<dir>::io::VSOut` → `package::bodies::<dir>::io::VSOut`) at
`earth/vertex.wesl:30`, `earth/fragment.wesl:50`, `planet/vertex.wesl:39`,
`planet/fragment.wesl:37`, `starPoints/vertex.wesl:46`,
`starPoints/fragment.wesl:17`, `orbitTrail/vertex.wesl:43`,
`orbitTrail/fragment.wesl:67` (`star` has no self-import), plus **10** `?static`
TS lines (2 per renderer). The `package::lib::` imports are **UNTOUCHED** — the
shared lib stays at `shaders/lib/`, so `lib::camera`, `lib::billboard`,
`lib::sphere` still resolve unchanged.

`wesl.toml` is **untouched**: its include glob is
`src/services/gpu/shaders/**/*.wesl` (`wesl.toml:31`), which already covers
arbitrary nesting. The wesl-plugin links at build time, so a bad shader path
**fails the build loudly** — the risk is a broken build, not a silently broken
canvas. Per house rules (and the iOS-shader landmine in `CLAUDE.md`), shader
changes still get a dev-server **visual smoke check** even though the linker
would catch a path typo.

All **other** shader dirs stay put. The documented name mismatches
(`volumeField` ↔ `scalarVolume`, `flowField` ↔ `flow`) remain documented
mismatches — renaming shader dirs to match renderer folders is out of scope.

## 8. Blast radius inventory

Verified counts (numbers corrected against the repo during spec authoring):

| Surface                                              | Count                           | Where                                                                                            |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `?static` shader imports gaining one `../`           | **47** across 20 renderer files | `structureMarker` has 6, `point`/`proceduralDisk`/`flowField` 3 each, the rest 2                 |
| `vi.mock('.../renderers/<name>')` literals           | **20** (19 + 1)                 | `tests/services/engine/phases/initGpu.destroyReachability.test.ts` (19), `wireInput.test.ts` (1) |
| Renderer test files moving to mirror `src`           | **23**                          | `tests/services/gpu/renderers/*`                                                                 |
| `initGpu.ts` renderer-factory imports                | **19**                          | `phases/initGpu.ts:46–70` (pick lives in `wireInput`, not here)                                  |
| `wireInput.ts` importing `createPickRenderer`        | 1                               | `phases/wireInput.ts:33` (+ its test's `vi.fn` stub)                                             |
| `flow-workbench` importing `createFlowFieldRenderer` | 1                               | `tools/flow-workbench/src/createFlowHarness.ts:48`                                               |

Cross-folder **constant** consumers to re-point (folder move adds `../`):

- `HORIZON_RADIUS_GPC` ← `frame/passes/horizonShellLayer.ts:48`.
- `LABEL_*_DEFAULT` (`MIN_PX`, `MAX_PX`, `WORLD_EM_MPC`) ←
  `subsystems/labelDirectorSubsystem.ts:83–86`.
- `FLOATS_PER_INSTANCE` ← the two disk renderers (`texturedDiskRenderer.ts:47`,
  `proceduralDiskRenderer.ts:67`) + their tests. (Not
  `rebuildHiResFamousForTier` — comment-only reference.)
- `pointRenderer` layout constants ← `pickRenderer` (→ `pointVertexLayout` after
  the split) + 3 test files.
- `MAX_ORBITS` + `INSTANCE_FLOATS` ← `frame/passes/orbitTrailsLayer.ts:50`.
- `MAX_PLANETS` + `INSTANCE_FLOATS` ← `frame/passes/planetsLayer.ts:48`.

`src/@types/rendering/*` renderer type files **do NOT move** — the
one-type-per-file `@types` convention keeps them where they are; only the
implementation `.ts` files relocate. The five new renderer types
(`EarthRenderer` / `PlanetRenderer` / `StarRenderer` / `StarPointRenderer` /
`OrbitTrailRenderer` `.d.ts`) and the scene body types follow the same rule —
they stay in `@types`, only the `bodies/` `.ts` files relocate.

## 9. Consistent file anatomy — new `renderers.md` section

Codify the canon (which most renderers already follow) so authors stop
reinventing factory shapes:

```
module docblock
  → imports
  → layout / uniform constants (with byte-map comments)
  → factory:
      shader modules
      → BGLs + pipeline layout + pipeline
      → buffers
      → methods as named functions
      → return object literal `satisfies Renderer`
```

The two files that define methods **inline in the return literal**
(`flowFieldRenderer`, `volumeFieldRenderer`) normalize to named functions **when
next touched**, not in this reorg.

The same doc-update pass **refreshes two stale claims**:

1. The `pickRenderer` uniform-sharing outlier (§6 — pick owns its own buffer
   since plan 03).
2. The `instancedQuadRenderer` "three downstream renderers (thumbnail, disk,
   procedural disk)" phrasing → **two** (textured-disk, procedural-disk); the
   thumbnail path is the textured-disk stage, and `rebuildHiResFamousForTier` is
   not a code consumer.

## 10. Also fixed in passing

The original passing-fix here — `debugSphereRenderer` was the only renderer with
zero tests — has **self-resolved**. That placeholder renderer was deleted when
zoom-to-earth landed, and every one of the current 21 renderers now has at least
one test (`tests/services/gpu/renderers/` holds 23 test files). So nothing
remains to fix in passing under this heading. The one live consistency fix — the
`structureMarkerRenderer` 4-byte fade scratch normalized to 16 on touch — is
already recorded in §5.5 and stays there.

## 11. Migration plan — four independently shippable steps

The zoom-to-earth sequencing gate is **satisfied**: plans 02–04 landed (#425,
#429, #432), so the reorg now regrounds onto their final citations rather than
waiting behind them.

Each step is independently shippable and lands with the suite green:

1. **Extract `lib/` primitives** into the still-flat folder (no file moves;
   re-point the 3–8 duplicate sites each; suite green).
2. **Split `pointRenderer` in place** — named-bag conversion, `pointVertexLayout`
   and `catalogStore` extraction, and killing `setBuildBufferRunner` (suite green).
3. **Folderize**: `git mv` into family folders (including the new `bodies/`) +
   mechanical import / `vi.mock` rewrites (47 `?static` shader imports, 20
   `vi.mock` literals, 23 renderer test files) + shader nesting under
   `shaders/galaxyCatalog/` **and** `shaders/bodies/` + `gpu/labels/` →
   `gpu/labelLayout/` rename + `diskRadiusRing` move out of `passes/`
   (typecheck + suite + **visual smoke**).
4. **Codify anatomy + refresh stale claims** in `renderers.md` (pickRenderer
   uniform-sharing outlier; `instancedQuad` "three consumers" → two).

Doing lib-extraction and the point-split _before_ the folder move means those
two content-changing steps happen against stable paths; step 3 is then pure
mechanical movement with no logic change.

## 12. Testing / verification

- **Every step** lands with `npm run typecheck` + `npm test` green (per project
  memory, the main thread runs `npm` — background subagents can't).
- **Step 3 additionally** gets a dev-server **visual smoke check**: galaxies,
  procedural + textured disks, labels, marker-lines (label stems), Milky Way
  cloud + pick, volume field, flow field, pick/hover, and the `bodies/`
  foreground — Earth (Blue Marble texture via `earthTextureSlot`), the planets,
  the star spheres + star points (the LOD partition), and the orbit trails —
  because ~57 import lines of shader plumbing move across two nests
  (`shaders/galaxyCatalog/` + `shaders/bodies/`) and the iOS-shader landmine
  means a broken pipeline can present a black canvas with no thrown error.
- The reorg is **behaviour-neutral**: the only runtime changes are the
  `pointRenderer` named-bag signature and the `catalogStore` composition, both
  covered by existing tests whose imports move with them. No new behaviour to
  characterize — the one-time debugSphere test gap noted in earlier drafts is
  moot (§10).

## References

- [`renderers.md`](../conventions/renderers.md) — the convention this reorg
  codifies + refreshes (known-outliers section, new file-anatomy section).
- [`simplicity.md`](../conventions/simplicity.md) — folders-follow-coupling is
  the "un-braid concerns that vary independently" principle applied to files.
- [`docs/backlog/2026-06-29-gpu-handle-nullability.md`](../../backlog/2026-06-29-gpu-handle-nullability.md)
  — adjacent, out of scope, PassDeps half already shipped (half-stale).
- Renderer-unification plans 01–04 (shipped 2026-07-09) — `ContentLayer`
  registry + FrameStep + pick fold-in that made these families legible.
- Zoom-to-earth plans 02–04 (shipped: #425, #429, #432; plan 04 = conic orbit
  trails, 2026-07-14) — the predecessor gate this reorg sequenced after, now
  satisfied. Their five renderers make the `bodies/` family **real**, not
  eventual.
