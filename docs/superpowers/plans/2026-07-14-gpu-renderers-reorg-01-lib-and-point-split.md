# GPU renderers reorg 01 — lib/ primitives + pointRenderer split

> **For agentic workers:** REQUIRED SUB-SKILL `superpowers:subagent-driven-development`.
> Execute this plan one task per fresh subagent; the main thread runs `npm run
typecheck` + `npm test` and commits (background subagents can't run `npm`).

**Goal.** Extract the four byte-identical `renderers/lib/` primitives (spec §5) and
split the 840-line `pointRenderer` into draw / layout / store (spec §6), all in the
still-flat `renderers/` folder, with the suite green after every task.

**Architecture.** Migration steps 1–2 of the reorg spec
([`2026-07-10-gpu-renderers-reorg-design.md`](../specs/2026-07-10-gpu-renderers-reorg-design.md)).
Phase A adds `renderers/lib/{cameraUniforms,unitQuad,blendStates,dummyFade}.ts` and
re-points the 3–10 copy-paste sites each. Phase B splits `pointRenderer.ts` into
`pointVertexLayout.ts` (layout constants), `catalogStore.ts` (per-catalog GPU
storage + upload orchestration, worker runner as a constructor param), and a slimmed
`pointRenderer.ts` (pipeline + draw + destroy) with a named-bag factory. No file
moves and no shader-path changes — those are plan 02.

**Tech stack.** TypeScript + WebGPU, Vitest, wgpu-matrix. No new deps.

## Global constraints

- **Suite green after EVERY task.** `npm run typecheck` + `npm test` both pass
  before each commit. The **main thread** runs `npm` and commits — implementer
  subagents edit files only.
- **Behaviour-neutral.** The ONLY runtime changes in this whole plan are (a) the
  `createPointRenderer` positional→named-bag signature, (b) killing the
  `setBuildBufferRunner` module-global in favour of a factory param, and (c) the
  `catalogStore` composition. Every extraction is a byte-identical re-point.
- **House conventions.** `type` aliases never `interface`; didactic comments
  (explain _why_, match the existing module-header density). **The one-symbol-per-file
  `utils/` rule does NOT apply to `gpu/lib/`** — the spec deliberately locks
  multi-export files there (`cameraUniforms` exports a const + a fn, `blendStates`
  two consts, `unitQuad` two consts). Deep relative imports, no barrels.
- **Cite, don't paste.** The current code is the source of truth; every task points
  at line ranges to read, not snapshots to copy.
- **`gpu/lib/` is a NEW folder** — a sibling to `renderers/` and `passes/` (hoisted
  there once the passes/ audit found four more byte-identical blend sites; see spec
  §5). Renderers stay flat this plan; folderizing (`git mv` into family folders) is
  plan 02.

---

## Phase A — `renderers/lib/` extractions (spec §5)

Order within the phase is free; each task is independent. All four new files live
under `src/services/gpu/renderers/lib/`.

### Task A1 — `lib/cameraUniforms.ts`

**Files:** `src/services/gpu/renderers/lib/cameraUniforms.ts` (new); re-point 10
write sites (below).

**Public surface:**

```ts
export const CAMERA_UNIFORM_BYTES = 80; // viewProj 64 + viewportPx 8 + 2 pad
export function writeCameraPrefix(
  target: Float32Array,
  viewProj: Float32Array | Mat4,
  viewportPx: Vec2,
): void;
```

**Behaviour:** `target.set(viewProj, 0); target[16] = viewportPx[0]; target[17] =
viewportPx[1];` — writes floats 0..17 ONLY. Does not touch pads (18/19), does not
allocate (caller passes a fresh `new Float32Array(CAMERA_UNIFORM_BYTES / 4)` or a
reused scratch), does not `writeBuffer` (caller keeps its own upload). This is the TS
twin of `shaders/lib/camera.wesl`; mirrors the single-source-of-truth pattern
`packPointUniforms.ts` set.

**Six pure-prefix sites** (local const → `CAMERA_UNIFORM_BYTES`; three-op write →
`writeCameraPrefix(target, viewProj, viewportPx)`, keep the existing `writeBuffer`):

| File                         | Write site                           | Local size const to delete          |
| ---------------------------- | ------------------------------------ | ----------------------------------- |
| `selectionRingRenderer.ts`   | `:140–143`                           | `CAMERA_UNIFORM_BYTES` (`:47`)      |
| `debugLineRenderer.ts`       | `:211–214`                           | `UNIFORM_BYTES` (`:37`)             |
| `markerLineRenderer.ts`      | `:337–340`                           | `UNIFORM_BYTES` (`:80`)             |
| `labelRenderer.ts`           | `:557–560`                           | `UNIFORM_BYTES` (its 80-byte const) |
| `structureMarkerRenderer.ts` | `:510–514`                           | `UNIFORM_BYTES` (its 80-byte const) |
| `starPointRenderer.ts`       | `:221–224` (reused `uniformScratch`) | `UNIFORM_BUFFER_SIZE` (`:80`)       |

**Four larger-struct sites** — convert the first-80-byte prefix write to
`writeCameraPrefix`, keep every bespoke tail write untouched (the buffer is >80 B; the
helper only touches 0..17):

| File                       | Prefix write                                             | Note                                                                     |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `filamentRenderer.ts`      | `:291–293`                                               | 96 B struct; keep tail                                                   |
| `milkyWayCloudRenderer.ts` | `:212–214` (`f32.set(vp, 0)…`)                           | 208 B struct; keep tail                                                  |
| `instancedQuadRenderer.ts` | `:354–356` (`uniformScratch.set(args.viewProj, 0)…`)     | 96 B struct; **keep** the explicit `[18]=0;[19]=0` pad lines that follow |
| `volumeFieldRenderer.ts`   | `:~418–421` (`scratch.set(…); scratch[16]; scratch[17]`) | 256 B struct; keep tail                                                  |

**Two CRITICAL exclusions — do NOT convert:**

- `starRenderer.ts:154–160` packs `mvp` + an RGB `color` tint into
  `TintedSphereUniforms` (slots 16/17/18 are colour, not `viewportPx`). It is NOT a
  camera prefix — leave inline.
- `packPointUniforms.ts` (the point 176-B pack). Its prefix write is in a `utils/gpu/`
  leaf util with dedicated byte-offset parity tests; importing `renderers/lib/` from
  `utils/` inverts the layering. Leave it. (Resolves spec §5.1's "point can call
  writeCameraPrefix" — the point prefix isn't a renderer inline site.)

**Test** (one focused test — earns its place per `testing.md`'s WGSL/TS byte-layout
keep-rule: a drifted `viewportPx` offset is the iOS-silent-frame-drop class):

- `tests/services/gpu/renderers/lib/cameraUniforms.test.ts` (new):
  - `writeCameraPrefix writes viewProj to floats 0..15 and viewportPx to floats
16/17` — build `target = new Float32Array(20)`, a `viewProj` of 16 distinct
    hand-set values and `viewportPx = [800, 600]`; assert `target[i]` equals the
    viewProj value for `i` 0..15, `target[16] === 800`, `target[17] === 600`, and
    `target[18] === 0 && target[19] === 0` (pads untouched on a zero-init target).

Do NOT add blend/const-restatement tests.

**Verification & commit:**

- [x] Create `lib/cameraUniforms.ts` with the two exports.
- [x] Re-point the six pure-prefix sites; delete each local 80-byte const.
- [x] Re-point the four larger-struct prefix writes; keep tails + explicit pad lines.
      (Execution note: an 11th site — `proceduralDiskRenderer` pick path — was
      found and converted in the same style; `texturedDiskRenderer` verified
      to have none.)
- [x] Add the one `cameraUniforms.test.ts` test.
- [x] Confirm `starRenderer.ts:154–160` and `packPointUniforms.ts` are untouched.
- [x] Main thread: `npm run typecheck` + `npm test` green. (653 files / 3923 tests)
- [x] Commit: `refactor(renderers): extract lib/cameraUniforms writeCameraPrefix` (`1f268d28`)

### Task A2 — `lib/unitQuad.ts`

**Files:** `src/services/gpu/renderers/lib/unitQuad.ts` (new); re-point three sites.

**Public surface:**

```ts
export const UNIT_QUAD_STRIP_CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
export const UNIT_QUAD_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 8,
  stepMode: 'vertex',
  attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
};
```

Both the `[0,0,1,0,0,1,1,1]` strip data AND the matching corner-buffer layout are
byte-identical at three sites (verified: `debugLineRenderer` `CORNER_DATA:49` +
layout `:105–108`; `labelRenderer` `CORNER_DATA:143` + layout `:277–280`;
`markerLineRenderer` `CORNER_DATA:108` + layout `:191–195`).

- [x] Create `lib/unitQuad.ts`.
- [x] Replace each `const CORNER_DATA = new Float32Array([…])` with the imported
      `UNIT_QUAD_STRIP_CORNERS` (keep each site's local `CORNER_BYTES =
UNIT_QUAD_STRIP_CORNERS.byteLength` if it reads it).
      (Execution note: a fourth byte-identical site — `filamentRenderer`'s
      `quadCorners` + layout — was found and folded, user-confirmed; its
      triangle-list topology/index buffer untouched.)
- [x] Replace each inline corner-buffer `{ arrayStride: 8, … }` layout literal with
      `UNIT_QUAD_VERTEX_LAYOUT`.
- [x] **Exclusion:** `milkyWayCloudRenderer`'s `CORNER_QUAD` (`:84`) is a 6-vertex
      triangle-**list** in NDC `[-1,1]` — different topology + coordinate space. Leave it.
- [x] No test (behaviour-neutral; the three renderers' existing tests cover
      construction, and this is a constant — no runtime test earns its place).
- [x] `npm run typecheck` + `npm test` green. (3923 tests)
- [x] Commit: `refactor(renderers): extract lib/unitQuad corners + layout` (`4c5a5828`)

### Task A3 — `lib/blendStates.ts`

**Files:** `src/services/gpu/renderers/lib/blendStates.ts` (new); re-point 15 sites.

**Public surface:**

```ts
export const ADDITIVE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};
export const PREMULTIPLIED_OVER_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};
```

**`ADDITIVE_BLEND` — 10 sites** (enumerated from spec §5.3): the `blend:` descriptor
in the render-pipeline of `pointRenderer.ts:428–432`, `filamentRenderer`,
`flowFieldRenderer`, `horizonShellRenderer`, `volumeFieldRenderer`,
`structureMarkerRenderer` (halo pipeline), `milkyWayCloudRenderer`'s `STAR_BLEND`,
`instancedQuadRenderer`'s additive branch (`:159–162`),
`starPointRenderer.ts:148–151`, `orbitTrailRenderer.ts:142–145`.

**`PREMULTIPLIED_OVER_BLEND` — 5 sites** (spec §5.3): `debugLineRenderer.ts:127–130`,
`labelRenderer`, `markerLineRenderer.ts:220–223`, `selectionRingRenderer.ts:97–100`,
`structureMarkerRenderer` (ring pipeline).

Grep each renderer's `blend:` descriptor and replace only where the four factor/op
fields are byte-identical to one of the two shared consts.

**Two CRITICAL exclusions — leave inline (folding either invites a silent visual
bug):**

- `instancedQuadRenderer.ts:164–167` — the **straight-alpha** over branch
  (`color.srcFactor: 'src-alpha'`, not `'one'`). Not premultiplied; single-site.
- `milkyWayCloudRenderer`'s dust-multiply blend (`dst`/`zero`) — physically
  load-bearing + test-pinned.

- [ ] Create `lib/blendStates.ts`.
- [ ] Re-point the 10 additive + 5 over sites; verify byte-identity before each swap.
- [ ] Confirm the two exclusions stay inline.
- [ ] No test — do NOT restate the blend-state constants back at themselves
      (`testing.md`: constant restatement is a change-detector, not a bug-catcher).
- [ ] `npm run typecheck` + `npm test` green.
- [ ] Commit: `refactor(renderers): extract lib/blendStates additive + over`

### Task A4 — `lib/dummyFade.ts`

**Files:** `src/services/gpu/lib/dummyFade.ts` (new); re-point three sites +
one consistency fix.

**Public surface:**

```ts
export function createDummyFadeBindGroup(
  device: GPUDevice,
  fadeBgl: FadeUniformsBgl,
  label: string,
): { buffer: GPUBuffer; bindGroup: GPUBindGroup };
```

**Behaviour:** allocate a `size: 16`, `GPUBufferUsage.UNIFORM`-only zeroed buffer +
its bind group against `fadeBgl` at `binding: 0`. The inert group a pipeline whose
layout lists `fadeBgl` at `@group(1)` binds even though the shader never reads fade.
Returns both so the caller can `destroy()` the buffer in its teardown. The `label`
prefixes both resource labels (buffer `${label}-fade-dummy`, group
`${label}-fade-bg-dummy`, or the existing per-site strings).

**Three sites** (all `size: 16`, `UNIFORM`-only):

| File                         | Buffer + group                                                | Destroy site  |
| ---------------------------- | ------------------------------------------------------------- | ------------- |
| `pickRenderer.ts`            | `:90–99` (`dummyFadeBuffer` / `dummyFadeBindGroup`)           | `:248`        |
| `milkyWayPickRenderer.ts`    | `:175–184` (`dummyFadeBuffer` / `dummyFadeBindGroup`)         | its `destroy` |
| `structureMarkerRenderer.ts` | `:344–353` (`pickDummyFadeBuffer` / `pickDummyFadeBindGroup`) | its `destroy` |

Each site keeps its own nullable local + destroy call; only the alloc pair is replaced
with `const { buffer, bindGroup } = createDummyFadeBindGroup(device, fadeBgl, '…')`.

**Consistency fix — the touch** (spec §5.5): while in `structureMarkerRenderer.ts`,
normalize its CPU fade _scratch_ at `:180` from a 4-byte `ArrayBuffer` to 16 (`new
ArrayBuffer(16)`), matching every other renderer. Behaviour-neutral — the extra 12
bytes stay zero and the 16-byte fade buffer's tail was already zero-init. This is
NOT the dummy-fade extraction; it's the "normalize when touched" fix riding along.

- [ ] Create `lib/dummyFade.ts`.
- [ ] Re-point the three alloc sites; keep each site's nullable local + destroy.
- [ ] Normalize `structureMarkerRenderer.ts:180` fade scratch to 16 bytes.
- [ ] No test (behaviour-neutral GPU-resource helper; the three pick renderers'
      existing tests cover construction).
- [ ] `npm run typecheck` + `npm test` green.
- [ ] Commit: `refactor(renderers): extract lib/dummyFade + normalize fade scratch`

---

## Phase B — `pointRenderer` split (spec §6)

Sequenced B1 → B2 → B3; each lands green. `pointRenderer.ts` starts at 840 lines
(read it whole — `src/services/gpu/renderers/pointRenderer.ts`).

### Task B1 — extract `pointVertexLayout.ts`

**Files:** `src/services/gpu/renderers/pointVertexLayout.ts` (new); `pointRenderer.ts`
(remove the moved exports, import them back); `pickRenderer.ts` + 4 test files
(re-point); `pointRenderer.test.ts` (move the layout describe block out).

**Move to `pointVertexLayout.ts`** (all currently in `pointRenderer.ts`):

- `SLOTS_PER_POINT` (`:82`, currently **private** — export it; `catalogStore` needs it
  in B3 for the splice stride).
- `POINT_STRIDE` (`:89`), the seven per-vertex byte-offset consts
  (`AXIS_RATIO_BYTE_OFFSET` `:92` … `ABS_MAG_BYTE_OFFSET` `:133`),
  `POINT_VERTEX_ATTRIBUTES` (`:154–165`).
- Pick uniform byte offsets `SELECTED_PACKED_BYTE_OFFSET` (`:184`),
  `POINT_SIZE_BYTE_OFFSET` (`:185`), `PICK_PASS_BYTE_OFFSET` (`:186`).
- Re-export `UNIFORM_BYTES` from `packPointUniforms` (the `export { UNIFORM_BYTES }`
  currently at `pointRenderer.ts:61`) so consumers keep one import path. (No cycle:
  `packPointUniforms.ts` is a `utils/gpu/` leaf and imports nothing from renderers.)

`pointRenderer.ts` then imports `POINT_STRIDE`, `POINT_VERTEX_ATTRIBUTES`,
`UNIFORM_BYTES` from `./pointVertexLayout` for its pipeline build.

**Re-point consumers** (folder-flat, so just the module specifier changes to
`./pointVertexLayout` / the new path):

- `src/services/gpu/renderers/pickRenderer.ts:38` — `POINT_STRIDE`,
  `POINT_VERTEX_ATTRIBUTES`, `UNIFORM_BYTES` from `./pointVertexLayout`.
- `tests/utils/gpu/packPointUniforms.test.ts:16–19` — the three pick byte offsets.
- `tests/services/gpu/renderers/pickRenderer.test.ts:3` — `UNIFORM_BYTES`.
- `tests/services/gpu/shaders/milkyWayPickUniformParity.test.ts:35–37` —
  `SELECTED_PACKED_BYTE_OFFSET`, `POINT_SIZE_BYTE_OFFSET` (+ `UNIFORM_BYTES` if
  imported).
- `tests/services/engine/helpers/pickUniformBytesOf.test.ts:26–28` — the three pick
  byte offsets.

**Test-file reshuffle:**

- Move the `describe('POINT_VERTEX_ATTRIBUTES — shared layout export', …)` block
  (`pointRenderer.test.ts:863–905`) into a new
  `tests/services/gpu/renderers/pointVertexLayout.test.ts`, importing from
  `pointVertexLayout`. Keep its assertions verbatim — this is a load-bearing WGSL/TS
  layout-parity test (`testing.md` keep-rule: `POINT_STRIDE === 52`,
  `POINT_VERTEX_ATTRIBUTES` has 10 entries with the exact `shaderLocation`/`offset`/
  `format` triples that must stay locked with `pickRenderer` + the shader).

- [ ] Create `pointVertexLayout.ts`; move the constants + `POINT_VERTEX_ATTRIBUTES` +
      the re-export; export `SLOTS_PER_POINT`.
- [ ] `pointRenderer.ts` imports the layout consts it still uses; delete the moved
      exports + the `export { UNIFORM_BYTES }` line.
- [ ] Re-point `pickRenderer.ts:38` + the four test files.
- [ ] Move the layout describe block to `pointVertexLayout.test.ts`.
- [ ] `npm run typecheck` + `npm test` green.
- [ ] Commit: `refactor(pointRenderer): extract pointVertexLayout constants`

### Task B2 — named-bag `createPointRenderer` + kill `setBuildBufferRunner`

**Files:** `pointRenderer.ts`; `src/services/engine/phases/initGpu.ts`;
`tests/services/gpu/renderers/pointRenderer.test.ts`;
`tests/services/engine/phases/initGpu.destroyReachability.test.ts` (verify mock).

**New factory signature** (converts the positional outlier per spec §6; `renderers.md`
known-outlier "convert when you next add a constructor arg" — the `buildRunner` param
is that arg):

```ts
export function createPointRenderer(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  fadeBgl: FadeUniformsBgl;
  sourceBgl: SourceUniformsBgl;
  focusBgl: FocusUniformsBgl;
  buildRunner?: BuildRunner; // defaults to the worker-spawning defaultWorkerRunner
}): PointRenderer;
```

The `PointRenderer` public type (`src/@types/rendering/PointRenderer.d.ts`) is
**unchanged** — only the factory's argument shape changes.

**Kill the module-global** (`pointRenderer.ts:283` `let buildRunner`, `:290`
`setBuildBufferRunner`): inside the factory, `const runner = init.buildRunner ??
defaultWorkerRunner;` and have `upload` close over `runner`. Delete the exported
`setBuildBufferRunner`. `defaultWorkerRunner` + the `BuildRunner` type stay
module-level in `pointRenderer.ts` for now (they relocate to `catalogStore.ts` in B3).

**Re-point construction:** `initGpu.ts:160–166` becomes the named bag —
`createPointRenderer({ device, targetFormat: 'rgba16float', fadeBgl:
state.gpu.fadeBgl!, sourceBgl: state.gpu.sourceBgl!, focusBgl: state.gpu.focusBgl! })`.

**Test changes** (`pointRenderer.test.ts`): every `createPointRenderer(device,
'rgba16float', fade, source, focus)` call becomes the named bag. Replace the
`beforeAll`/`afterAll` `setBuildBufferRunner` (`:43–53`) with a shared local
`const testRunner: BuildRunner = async (input) =>
buildPointInterleavedBuffer(input);` passed as `buildRunner` in each bag. The
parallel-race test (`:438–487`) constructs its renderer with the per-source-delayed
runner in the bag instead of calling `setBuildBufferRunner` mid-test.

**Verify the mock:** `initGpu.destroyReachability.test.ts:103`
`vi.mock('.../pointRenderer', …)` fully replaces the module; the signature change
doesn't affect a full mock, but confirm the mock still exports `createPointRenderer`
(and no longer references `setBuildBufferRunner`).

- [ ] Convert `createPointRenderer` to the named bag; add `buildRunner`.
- [ ] Delete the `buildRunner` module-global + `setBuildBufferRunner` export.
- [ ] Update `initGpu.ts:160`.
- [ ] Update all `pointRenderer.test.ts` call sites + runner injection.
- [ ] Confirm the `destroyReachability` mock still lines up.
- [ ] `npm run typecheck` + `npm test` green.
- [ ] Commit: `refactor(pointRenderer): named-bag factory, drop setBuildBufferRunner`

### Task B3 — extract `catalogStore.ts`; compose it in `pointRenderer`

**Files:** `src/services/gpu/renderers/catalogStore.ts` (new); `pointRenderer.ts`
(compose); `tests/services/gpu/renderers/catalogStore.test.ts` (new — moved blocks);
`pointRenderer.test.ts` (keep pipeline/draw/destroy blocks).

**`catalogStore.ts` owns** (moved out of `pointRenderer.ts`): the `BuildRunner` type
(`:279–281`) + `defaultWorkerRunner` (`:264–274`), the `ID_OF_CODE` / `CODE_OF_ID` /
`CATALOG_DRAW_ORDER` maps (`:309–326`), the private `LoadedSource` type (`:330–351`),
the per-catalog `Map` (`:459`), the bias callbacks (`:465–476`), `upload` /
`unload` (`:498–608`), the splice surface (`spliceSchechterRatios` /
`spliceAngularWeights` / `clearBiasOverlays`, `:631–685`), `totalCount` / `countOf`
/ `hasCatalog` (`:690–711`), and `loadedSources` (`:718–742`). It imports
`SLOTS_PER_POINT` from `./pointVertexLayout` for the splice stride (`entry.interleaved[i

- SLOTS_PER_POINT + 10/11]`).

**Public surface:**

```ts
export type BuildRunner = (
  input: BuildPointInterleavedBufferInput,
) => Promise<BuildPointInterleavedBufferResult>;

/** One loaded catalog's GPU resources, in GALAXY_CATALOG_SOURCES draw order,
 *  as pointRenderer.draw() binds them. */
export type CatalogDrawEntry = {
  source: SourceType;
  count: number;
  vertexBuffer: GPUBuffer;
  fadeBuffer: GPUBuffer;
  fadeBindGroup: GPUBindGroup;
  sourceBindGroup: GPUBindGroup;
};

export type CatalogStore = {
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog): Promise<void>;
  unload(id: GalaxyCatalogId): void;
  setBiasUploadCallback(cb: ((source: SourceType, cloud: GalaxyCatalog) => void) | null): void;
  setBiasUnloadCallback(cb: ((source: SourceType) => void) | null): void;
  spliceSchechterRatios(source: SourceType, ratios: Float32Array): void;
  spliceAngularWeights(source: SourceType, weights: Float32Array): void;
  clearBiasOverlays(source?: SourceType): void;
  totalCount(): number;
  countOf(source: SourceType): number;
  hasCatalog(id: GalaxyCatalogId): boolean;
  /** Narrow public projection consumed by the pick program (unchanged shape). */
  loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }>;
  /** Full per-source draw essentials, in draw order, for pointRenderer.draw(). */
  entries(): IterableIterator<CatalogDrawEntry>;
  destroy(): void;
};

export function createCatalogStore(init: {
  device: GPUDevice;
  fadeBgl: FadeUniformsBgl;
  sourceBgl: SourceUniformsBgl;
  buildRunner?: BuildRunner; // defaults to defaultWorkerRunner
}): CatalogStore;
```

`loadedSources()` keeps the exact shape `PointRenderer.loadedSources()` exposes today
(the pick program's `PickSourceDraw` feed — `sourceBuffer`, not `sourceBindGroup`).
`entries()` is the richer draw-time iterator (`fadeBuffer` + `fadeBindGroup` +
`sourceBindGroup`) so `draw()` binds without reaching into store internals.
`store.destroy()` releases every per-source `buffer` / `fadeBuffer` / `sourceBuffer`
and clears the map (the point-renderer's own per-frame uniform buffer is NOT the
store's — `pointRenderer.destroy()` releases that).

**`pointRenderer.ts` after B3** keeps: shader modules + pipeline-layout + pipeline
build, the `@group(0)` uniform buffer + bind group, the per-frame `fadeScratch`
(`:453–454`), `draw` (`:756–796`), and `destroy`. It composes the store:

- `const store = createCatalogStore({ device, fadeBgl, sourceBgl, buildRunner: init.buildRunner });`
- Delegate `upload` / `unload` / `setBias*` / `splice*` / `clearBiasOverlays` /
  `totalCount` / `countOf` / `hasCatalog` / `loadedSources` straight to `store`.
- `draw()` iterates `store.entries()` instead of `CATALOG_DRAW_ORDER` + the local map;
  the `visibleSourceMask` gate + per-source `fadeScratch → fadeBuffer` write stay in
  `draw()` (they're per-frame, not storage).
- `destroy()` calls `store.destroy()` then `uniformBuffer.destroy()`.

The `BuildRunner` type + `defaultWorkerRunner` now live in `catalogStore.ts`;
`pointRenderer.ts` imports `BuildRunner` from `./catalogStore` to type its bag's
`buildRunner?`.

**Test-file reshuffle** — move these describe blocks from `pointRenderer.test.ts` into
`catalogStore.test.ts`, retargeting the factory from `createPointRenderer(bag)` to
`createCatalogStore({ device, fadeBgl, sourceBgl, buildRunner: testRunner })` and
dropping `targetFormat`/`focusBgl` (the store has no pipeline). Keep every assertion
verbatim (they pin real regressions — replace-not-append, empty-cloud unload,
parallel-rebake race, splice byte semantics):

- `PointRenderer.totalCount` (`:174`) → `catalogStore.test.ts`
- `PointRenderer.hasCatalog` (`:217`)
- `PointRenderer.loadedSources` (`:250`)
- `PointRenderer.upload — regression: replace, not append` (`:304`)
- `PointRenderer.upload — regression: empty-cloud unload` (`:354`)
- `PointRenderer.upload — regression: parallel-upload rebake race` (`:438`)
- `PointRenderer.spliceSchechterRatios` (`:521`)
- `PointRenderer.spliceAngularWeights` (`:574`)
- `PointRenderer.clearBiasOverlays` (`:613`)

The moved blocks bring the shared helpers they need (`makeCloud`, `makeStubDevice`,
`makeCapturingDevice`, `idOf`, stub `fadeBgl`/`sourceBgl`) into `catalogStore.test.ts`.

**Stays in `pointRenderer.test.ts`** (retains its own copies of `makeStubDevice` +
stub BGLs + `makeDestroyTrackingDevice`):

- `PointRenderer colour target` (`:151`) — pipeline colour-target descriptor.
- `PointRenderer.draw — PointDrawSettings shape` (`:817`) — the composed draw call.
- `PointRenderer.destroy` (`:722`) — the composed teardown; the destroy-fan-out
  assertions still hold because `createPointRenderer` composes `createCatalogStore`
  with the SAME stub device, so `makeDestroyTrackingDevice` still observes every
  `createBuffer` (pipeline uniform + per-source vertex/fade/source).

- [ ] Create `catalogStore.ts` with `createCatalogStore` + `CatalogStore` +
      `CatalogDrawEntry` + `BuildRunner`; move `defaultWorkerRunner` + the ID maps +
      `LoadedSource` + upload/unload/splice/counts/loadedSources/entries/destroy.
- [ ] Rewrite `pointRenderer.ts` to compose the store; `draw()` iterates
      `store.entries()`; `destroy()` calls `store.destroy()` + `uniformBuffer.destroy()`.
- [ ] Move the nine store-bookkeeping describe blocks to `catalogStore.test.ts`,
      retargeting to `createCatalogStore`.
- [ ] Keep colour-target / draw / destroy blocks in `pointRenderer.test.ts`.
- [ ] `npm run typecheck` + `npm test` green.
- [ ] Commit: `refactor(pointRenderer): extract catalogStore, compose in draw`
