# Renderer conventions

> **Audience.** You're adding a new GPU renderer to skymap, or modernising an existing one.
> This doc pins the shape every renderer should follow so the next person reading the code
> doesn't have to relearn a different factory signature and lifecycle convention per file.
>
> **Status.** Codifies the dominant pattern across the renderers under
> `src/services/gpu/renderers/`. Where an existing renderer drifts, the doc says what's
> prescribed and what's a known outlier — the outliers are tracked at the bottom.

## TL;DR

```ts
// 1. Define a public type that extends Renderer.
export type FoobarRenderer = {
  readonly label: string;          // From Renderer
  destroy(): void;                 // From Renderer
  draw(pass: GPURenderPassEncoder, viewProj: Mat4, viewportPx: Vec2 /*, …extras */): void;
  // …setters, getters, uploads as needed.
};

// 2. Construct it via a factory. Closure-captured state, no classes.
export function createFoobarRenderer(ctx: GpuContext): FoobarRenderer {
  const pipeline = /* … */;
  const uniformBuffer = /* … */;

  function draw(pass: GPURenderPassEncoder, viewProj: Mat4, viewportPx: Vec2) { /* … */ }
  function destroy() { /* release GPU resources */ }

  const renderer: FoobarRenderer = { label: 'foobarRenderer', draw, destroy };

  renderer satisfies Renderer;     // Compile-time latch on the base contract.
  return renderer;
}
```

That's the whole shape. Everything below explains _why_ each piece is there and which
boxes to tick when your renderer needs more.

## The `Renderer` base type

```ts
// src/@types/rendering/Renderer.d.ts
export type Renderer = {
  readonly label: string;
  destroy(): void;
};
```

Every renderer must conform via `satisfies Renderer` at the factory return site.
The base is intentionally minimal — just enough to give the engine a uniform
identity (the `label` is used in debug overlays and error messages) and a uniform
teardown hook.

The `satisfies` clause matters: it makes "I forgot to add `label`" or "I removed
`destroy()` while refactoring" a compile-time error rather than a runtime surprise
when `engine.destroy()` walks the GPU bag.

## Where the file lives — family folders

`src/services/gpu/renderers/` holds **no loose files**. Every renderer sits in a _family_
folder, and a family means one thing only: **these files change together.** The families
are drawn along real coupling edges — a shared vertex layout, a shared shader, a shared
feeder subsystem, a shared data table — never along subject-matter kinship.

```
renderers/
  galaxyCatalog/    the LOD chain of one "draw a galaxy catalog" renderer:
                    galaxyPointRenderer → proceduralDiskRenderer → texturedDiskRenderer,
                    plus instancedQuadRenderer (the shared quad pipeline the two
                    disk stages wrap), galaxyPickRenderer, galaxyPointVertexLayout, catalogStore
  bodies/           the true-scale solar-system foreground: earth, planet, star,
                    starPoint, orbitTrail
  milkyWay/         cloud + pick — the pick footprint must match the cloud
  labels/           labelRenderer + markerLineRenderer (label stems) — one feeder
  filaments/        filamentRenderer + its pure CPU instance builder
  devTools/         debugLineRenderer, diskRadiusRing — debug draws that are renderers
  volumeField/  flowField/  horizonShell/  selectionRing/  structureMarker/
                    genuine singletons — a one-file folder says "this one is alone"
```

Two rules follow from that:

- **Put a new renderer in the family it will change with.** If none fits, give it its own
  folder. A one-file folder is information, not a smell; a renderer dumped into a family it
  shares no edge with is a lie the next reader has to disprove.
- **Nest a family's shader dirs only when nesting adds meaning.** `shaders/` is a flat
  namespace by default. Nest under `shaders/<family>/` when both hold: the family owns those
  dirs **exclusively**, and their names only read _in context_ —
  `shaders/galaxyCatalog/{points,proceduralDisks,texturedDisks}/` and
  `shaders/bodies/{earth,planet,star,starPoints,orbitTrail}/` qualify, because a bare
  `points/` or `star/` at the top level says nothing about which renderer it belongs to.
  `shaders/milkyWay/{sprites,field,sfMap,pick}/` qualifies for a second reason: the child
  names carry the **tier** — `sprites/` is the star-sprite tier scheduled for deletion,
  `field/` + `sfMap/` the analytic field replacing it — which no prefixed top-level name
  said. Trading three repetitions of the prefix for one parent segment is what buys that.
  Dirs that already **name themselves** stay flat: `selectionRing/`, `structureMarker/`,
  `horizonShell/` need no parent folder to be unambiguous, and wrapping them in one would
  only add a path segment that repeats the prefix. Dirs **shared across
  families** cannot nest at all without lying about ownership — `shaders/markerLines/` is
  consumed by both `labels/markerLineRenderer.ts` and `devTools/debugLineRenderer.ts`, so
  filing it under either family would mislead the next reader who greps for its other caller.
  `milkyWay/sprites/` is not that case despite two callers: its draw pair is
  `renderers/milkyWay/`'s and its three generation shaders are
  `engine/galaxyGenerator/v1/`'s, but both are the one point-cloud tier — a renderer and the
  producer feeding it, not two families.

  Two renderer↔shader-dir names are deliberately _not_ the same word: `volumeField/` reads
  `shaders/scalarVolume/`, and `flowField/` reads `shaders/flow/`. Both are known mismatches
  (the shader dirs pre-date the renderer names), harmless because the import path in the
  renderer file is the only way anyone finds a shader anyway.

  Genuinely shared WESL stays in `shaders/lib/`; genuinely shared TS primitives (camera-uniform
  prefix, unit quad, blend states, dummy fade group) stay in `gpu/lib/`, a sibling of
  `renderers/` and `passes/` — they serve `gpu/` broadly, so they can't sit below one of their
  consumers.

`renderers/` is also not `passes/`: a renderer draws **world-space content** and appears in
`CONTENT_LAYERS`; a pass operates on **textures** (compositor, volume upsample, pick-debug
overlay). Draw the geometry → you're a renderer, wherever it feels like it belongs.

## File anatomy

Every renderer file reads top-to-bottom in the same order. Following it means a reviewer can
find the pipeline build, the byte map, or the draw call in any renderer without a search:

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

The ordering isn't arbitrary — it's dependency order, so nothing is referenced before it's
built, and the reader meets the _shape of the data_ (the byte map) before the code that
packs it.

**Methods are named functions, not inline literal members.** A named `function draw(...)`
above the return literal gets a real name in stack traces and profiles, can be documented
with its own docblock, and doesn't push the return object past a screenful. The return
literal then reads as a table of contents for the renderer's public surface:

```ts
const renderer: FoobarRenderer = { label: 'foobarRenderer', upload, draw, destroy };
renderer satisfies Renderer;
return renderer;
```

`flowFieldRenderer` and `volumeFieldRenderer` still define their methods inline in the return
literal. Normalize them to named functions when you next touch them — not as a standalone
sweep, which would be a large diff with zero behavioural payload.

## Factory shape

### Function, not class

Every renderer is constructed via `createXRenderer(...)` returning a plain object.
GPU resources are captured in the closure; the returned object's methods read those
resources directly.

**Why function-and-closure over class:** `this` binding through `pass.setPipeline(this.pipeline)`
in a hot per-frame loop has surprised more than one reviewer; the closure version reads
the same after a year. It also keeps the public type honest — what the engine can call
is exactly what the type declares.

**Don't:** Export a class. Don't return an object whose methods reference `this`.

### Argument shape — named bag

```ts
// Prescribed:
export function createFoobarRenderer(ctx: GpuContext, config?: FoobarConfig): FoobarRenderer;
// or
export function createFoobarRenderer(init: {
  device: GPUDevice;
  format: GPUTextureFormat; /*, … */
}): FoobarRenderer;

// Discouraged (old style):
export function createFoobarRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  foo: number,
): FoobarRenderer;
```

Take a single context bag — typically the shared `GpuContext` (`{ device, context, format, canvas }`)
plus an optional per-renderer config object. Positional `(device, format, ...)` ages badly:
every new dependency reorders the call site and reviewers can't tell `(device, format)`
from `(format, device)` at a glance.

Three older renderers (`galaxyPickRenderer`, `filamentRenderer`, `volumeFieldRenderer`) still use
the positional style. Don't extend them with more positional args — convert to a named bag
if you need a new dependency.

## Where state lives

### GPU resources: in the closure

Pipelines, bind-group layouts, uniform buffers, samplers, shader modules — built once
at factory time and captured by the closure. They aren't part of the public type because
nobody outside the renderer should touch them.

```ts
export function createFoobarRenderer(ctx: GpuContext): FoobarRenderer {
  const pipeline = ctx.device.createRenderPipeline(/* … */);
  const uniformBuffer = ctx.device.createBuffer(/* … */);
  const bindGroup = ctx.device.createBindGroup(/* …, resource: { buffer: uniformBuffer } */);
  // …
}
```

### Per-frame inputs: arguments to `draw()`

Camera matrices, viewport size, per-frame settings — passed in by the caller. The
renderer is _stateless across frames_ with respect to the camera and the visual
configuration. This is what makes the renderer easy to test and easy to retire when
the engine's frame-loop shape changes.

```ts
draw(
  pass: GPURenderPassEncoder,
  viewProj: Mat4,
  viewportPx: Vec2,
  settings: { intensity: number; fadeAlpha: number },   // pure projection from EngineState
): void;
```

### Per-asset state: setters / uploads

Data that arrives asynchronously (point clouds, label sets, atlas textures, volume
cubes) goes through setter methods:

```ts
upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog): Promise<void>;
unload(id: GalaxyCatalogId): void;
bindAtlas(atlasView: GPUTextureView): void;
setLabels(labels: Label[]): void;
```

These mutate closure-captured `Map`s or scratch buffers. The renderer owns its own
storage and lifecycle for this data — it doesn't reach into `EngineState` for it.

### No mirror state

A renderer must NOT cache values that have an authoritative home in `EngineState`.
If the engine knows the current `galaxyCatalogs.sizePx`, the renderer should receive it
through `draw()` — not store its own copy.

The reason this matters is straightforward: every cached duplicate adds a "did the
setter fire?" failure mode. Render-on-demand makes this worse — a forgotten
`requestRender()` after a setter call means the mirror lags the source.

`volumeFieldRenderer` is the worked example of getting this right under pressure: it draws
many independently-configured fields, and rather than mirroring each field's enablement,
intensity, contrast and palette, it takes a `settingsOf(id)` projection in `draw()` and
reads the live values per frame. The GPU resources it _owns_ (the volume texture, the
palette LUT, the uniform buffer) live in its per-field entry; the user's knobs do not.

## The `draw()` method

### Naming

The per-frame entrypoint is called `draw` on every renderer. Use `draw`.

### Signature shape

```ts
draw(
  pass: GPURenderPassEncoder,
  viewProj: Mat4,
  viewportPx: Vec2,
  /* …per-renderer extras: cameraPosWorld, fadeAlpha, settings projection, instances */
): void;
```

The first three arguments are common to every renderer. Per-renderer extras come
after, in order of decreasing "every-frame-ness": camera-derived values, then
settings, then transient instance arrays.

### One responsibility

`draw()` does exactly one thing: encodes the renderer's draw call(s) into the pass.
It does not call `pass.beginRenderPass`, does not call `queue.submit`, and does
not call `requestRender()` (that's the caller's job).

## Wiring into the engine

### Storage on `state.gpu`

Each renderer has a typed slot on `EngineGpuHandles`:

```ts
// src/@types/engine/handles/EngineGpuHandles.d.ts
export type EngineGpuHandles = {
  renderer: PointRenderer | null;
  pickRenderer: PickRenderer | null;
  foobarRenderer: FoobarRenderer | null;
  // …
};
```

Nullable until `initGpu` writes the handle. Consumers null-check at use sites.

### Construction in `initGpu`

Add the construction call in `src/services/engine/phases/initGpu.ts`. Don't
construct renderers anywhere else — the bootstrap phase order matters (shared
resources like the HDR context have to exist first).

### Feeding settings: the layer's `draw`, not a setter

A renderer's appearance knobs are **not** pushed in through setters. Each renderer is driven
by exactly one `ContentLayer` in `src/services/engine/frame/passes/`, whose `draw(pass, view,
ctx, state)` projects the relevant `state.settings.*` leaves into the renderer's `draw()`
argument bag each frame:

```ts
// pointSpritesLayer.ts
renderer.draw(pass, view.vp, view.viewportPx, {
  pointSizePx: state.settings.galaxyCatalogs.sizePx,
  brightness: state.settings.galaxyCatalogs.brightness,
  // …the rest of the per-frame projection
});
```

The layer is where the settings tree meets the GPU. Pushing the same values in through
setters would give every knob two homes and a "did the setter fire?" failure mode, and under
render-on-demand a missed `requestRender()` would leave the renderer's copy stale — the "no
mirror state" rule above, enforced by construction.

Data that _isn't_ a settings leaf — catalog uploads, per-cloud splices, atlas bindings —
still goes through explicit renderer methods, called by the subsystem that owns that data
flow.

## Multi-handle renderers

A renderer is "multi-handle" when it manages multiple independent instances of
the same conceptual thing, each with its own lifecycle. `volumeFieldRenderer` is the
canonical one — it owns a `Map<VolumeFieldId, FieldEntry>` where each field has its own
volume texture, palette LUT, uniform buffer, and bind group. (`catalogStore` — the
per-catalog GPU-buffer index `galaxyPointRenderer` composes — is the same pattern keyed by
galaxy-catalog id.)

The shape:

```ts
export type VolumeFieldRenderer = {
  readonly label: string;
  destroy(): void;
  upload(id: VolumeFieldId, cube: ScalarCube): void;
  unload(id: VolumeFieldId): void;
  listIds(): VolumeFieldId[];
  // Walks every field; per-field knobs arrive through the `settingsOf` projection.
  draw(pass, viewProj, viewportPx, cameraPosWorld, settingsOf, fadeOpacityOf): void;
};
```

**Only reach for this pattern if you have a real per-instance lifecycle.** The disk stages
weren't worth multi-handling: they're constructed once and live for the engine's lifetime —
two sibling renderers wrapping a shared `instancedQuadRenderer` was the right call.

If you do go multi-handle:

- The id is the public identity; `Map<Id, Entry>` is the internal index.
- `upload` returns nothing; never return the entry — that would hand the caller a
  mutable reference to renderer-internal state.
- The entry holds GPU resources only. Per-instance _settings_ come in through `draw()` (see
  "No mirror state"), so there are no per-instance setters to fall out of sync. Looking up a
  missing id is a silent no-op — an id can be unloaded between a settings write and the
  frame that reads it.
- `draw()` iterates the map in insertion order — there is no z-sort yet because
  every multi-handle case so far is additive.

## Sharing infrastructure

`instancedQuadRenderer` is a deliberate exception to several of the rules above:
it's not constructed in `initGpu` and it has a `draw` that takes a named-parameter
bag instead of positional args. That's because it's _shared infrastructure_ — the two
disk stages (`texturedDiskRenderer`, `proceduralDiskRenderer`) wrap it to get the same
atlas-quad pipeline with different per-instance encodings.

If you find yourself writing two renderers that differ only in instance-encoding
shape, factor out a shared factory like this rather than duplicating the
pipeline-build code. The shared factory should still satisfy `Renderer` itself
(it has a `label` and a `destroy` that frees the pipeline), but it doesn't show
up as a separate field on `state.gpu`.

## Checklist for a new renderer

- [ ] Lives in the family folder it changes with (its own, if none fits). Shader dirs stay flat
      in `shaders/` unless the family owns them exclusively AND their names only read in
      context — never nest a dir two families share.
- [ ] File reads in anatomy order; methods are named functions.
- [ ] Public type extends `Renderer` (`label`, `destroy`).
- [ ] `satisfies Renderer` clause at the factory return.
- [ ] Factory takes a named bag, not positional args.
- [ ] Shared primitives (camera prefix, unit quad, blend states, dummy fade) come from
      `gpu/lib/` rather than being re-typed inline.
- [ ] GPU resources built once at factory time, captured in the closure.
- [ ] Per-frame inputs threaded through `draw()` — no mirror state.
- [ ] Per-asset data goes through explicit `upload` / `set*` / `bind*` methods.
- [ ] Slot added to `EngineGpuHandles` (nullable until `initGpu`).
- [ ] Constructed in `initGpu.ts`.
- [ ] Settings projected in by its `ContentLayer`'s `draw` (not pushed in from components).
- [ ] `destroy()` releases every GPU resource the closure captured.
- [ ] At least one test that exercises construction + a representative call.

## Known outliers (work in progress)

These pre-date the convention. Don't model new code on them; clean up incidentally
when you're already editing the file.

- **Positional factory args.** `createGalaxyPickRenderer`, `createFilamentRenderer` and
  `createVolumeFieldRenderer` take `(device, format, …)` instead of a context bag. Convert
  when you next need to add a constructor arg — that's the occasion the conversion pays for
  itself, and `createGalaxyPointRenderer`'s named-bag conversion is the worked precedent.
- **Methods inline in the return literal.** `flowFieldRenderer` and `volumeFieldRenderer`
  define their public methods inside the returned object rather than as named functions
  above it. Normalize on next touch (see "File anatomy").
