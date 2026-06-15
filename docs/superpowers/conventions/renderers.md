# Renderer conventions

> **Audience.** You're adding a new GPU renderer to skymap, or modernising an existing one.
> This doc pins the shape every renderer should follow so the next person reading the code
> doesn't have to relearn 11 different factory signatures and lifecycle conventions.
>
> **Status.** Codifies the dominant pattern across the 11 renderers in
> `src/services/gpu/renderers/` as of 2026-05-11 (post PR #99). Where the existing renderers
> drift, the doc says what's prescribed and what's a known outlier — the outliers are
> tracked at the bottom.

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

  const renderer: FoobarRenderer = {
    label: 'foobarRenderer',
    destroy() { /* release GPU resources */ },
    draw(pass, viewProj, viewportPx) { /* … */ },
  };

  renderer satisfies Renderer;     // Compile-time latch on the base contract.
  return renderer;
}
```

That's the whole shape. Everything below explains *why* each piece is there and which
boxes to tick when your renderer needs more.

## The `Renderer` base type

```ts
// src/@types/Renderer.d.ts
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
export function createFoobarRenderer(ctx: GpuContext, config?: FoobarConfig): FoobarRenderer
// or
export function createFoobarRenderer(init: { device: GPUDevice; format: GPUTextureFormat /*, … */ }): FoobarRenderer

// Discouraged (old style):
export function createFoobarRenderer(device: GPUDevice, format: GPUTextureFormat, foo: number): FoobarRenderer
```

Take a single context bag — typically the shared `GpuContext` (`{ device, context, format, canvas }`)
plus an optional per-renderer config object. Positional `(device, format, ...)` ages badly:
every new dependency reorders the call site and reviewers can't tell `(device, format)`
from `(format, device)` at a glance.

Four older renderers (`pointRenderer`, `pickRenderer`, `filamentRenderer`,
`scalarVolumeRenderer`) still use the positional style. Don't extend them with more
positional args — convert to a named bag if you need a new dependency.

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
renderer is *stateless across frames* with respect to the camera and the visual
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
upload(source: Source, cloud: PointCloud): void;
unload(source: Source): void;
bindAtlas(atlasView: GPUTextureView): void;
setLabels(labels: Label[]): void;
```

These mutate closure-captured `Map`s or scratch buffers. The renderer owns its own
storage and lifecycle for this data — it doesn't reach into `EngineState` for it.

### No mirror state

A renderer must NOT cache values that have an authoritative home in `EngineState`.
If the engine knows the current `points.sizePx`, the renderer should receive it
through `draw()` — not store its own copy.

The reason this matters is straightforward: every cached duplicate adds a "did the
setter fire?" failure mode. Render-on-demand makes this worse — a forgotten
`requestRender()` after a setter call means the mirror lags the source.

The current outlier here is `scalarVolumeRenderer`, which mirrors per-field
enablement, intensity, contrast, palette, etc. inside each `FieldEntry`. That
predates this convention and is being addressed by the queued "Option C on
scalarVolumeRenderer" work — don't model new renderers on it.

## The `draw()` method

### Naming

The per-frame entrypoint is called `draw` on 9 of the 11 renderers. The two
holdouts (`labelRenderer`, `markerLineRenderer`) call it `render`. Use `draw`.

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
// src/@types/EngineGpuHandles.d.ts
export type EngineGpuHandles = {
  pointRenderer: PointRenderer | null;
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

### Setting state via `settingsTable`

Renderer setters that map 1:1 to a settings leaf go through
`src/services/engine/wiring/settingsTable.ts`:

```ts
{
  path: ['settings', 'points', 'sizePx'],
  callback: ['points', 'setSize'],
  apply: (state, value) => {
    state.gpu.pointRenderer?.setSize(value);
    state.subsystems.scheduler.requestRender();
  },
},
```

This is the single-write path. Don't reach for `state.gpu.pointRenderer?.setSize(...)`
in component code; the settings table is what guarantees the public `engine.points.setSize()`
sub-handle, the React-side state, and the renderer call all stay in sync.

Setters that don't map to a single settings leaf (uploads, per-cloud splices,
atlas bindings) call the renderer directly from the subsystem that owns the
data flow.

## Multi-handle renderers

A renderer is "multi-handle" when it manages multiple independent instances of
the same conceptual thing, each with its own lifecycle. Currently `scalarVolumeRenderer`
is the only one — it owns a `Map<ScalarFieldHandle, FieldEntry>` where each
field has its own volume texture, palette, uniform buffer, and bind group.

The shape:

```ts
export type ScalarVolumeRenderer = {
  readonly label: string;
  destroy(): void;
  addField(handle: ScalarFieldHandle, cube: VolumeCube): void;
  removeField(handle: ScalarFieldHandle): void;
  setIntensity(handle: ScalarFieldHandle, value: number): void;
  // …other per-field setters
  draw(pass, viewProj, viewportPx, cameraPosWorld): void;   // walks all fields
};
```

**Only reach for this pattern if you have a real per-instance lifecycle.** Three
copies of "thumbnail / disk / proceduralDisk" weren't worth multi-handling because
they're constructed once and live for the engine's lifetime — three sibling
renderers reading from a shared `InstancedQuadRenderer` was the right call.

If you do go multi-handle:
- The handle is the public identity; `Map<Handle, Entry>` is the internal index.
- `addField` returns nothing or returns the handle; never return the entry — that
  would hand the caller a mutable reference to renderer-internal state.
- Setters take `(handle, value)`. Looking up a missing handle is a silent no-op
  (the field may have been removed between `addField` and the late-firing setter).
- `draw()` iterates the map in insertion order — there is no z-sort yet because
  every multi-handle case so far is additive.

## Sharing infrastructure

`instancedQuadRenderer` is a deliberate exception to several of the rules above:
it's not constructed in `initGpu` and it has a `draw` that takes a named-parameter
bag instead of positional args. That's because it's *shared infrastructure* —
three downstream renderers (thumbnail, disk, procedural disk) wrap it to get
the same atlas-quad pipeline with different per-instance encodings.

If you find yourself writing two renderers that differ only in instance-encoding
shape, factor out a shared factory like this rather than duplicating the
pipeline-build code. The shared factory should still satisfy `Renderer` itself
(it has a `label` and a `destroy` that frees the pipeline), but it doesn't show
up as a separate field on `state.gpu`.

## Checklist for a new renderer

- [ ] Public type extends `Renderer` (`label`, `destroy`).
- [ ] `satisfies Renderer` clause at the factory return.
- [ ] Factory takes a named bag, not positional args.
- [ ] GPU resources built once at factory time, captured in the closure.
- [ ] Per-frame inputs threaded through `draw()` — no mirror state.
- [ ] Per-asset data goes through explicit `upload` / `set*` / `bind*` methods.
- [ ] Slot added to `EngineGpuHandles` (nullable until `initGpu`).
- [ ] Constructed in `initGpu.ts`.
- [ ] Settings-driven setters added to `settingsTable.ts` (not called directly from components).
- [ ] `destroy()` releases every GPU resource the closure captured.
- [ ] At least one test that exercises construction + a representative call.

## Known outliers (work in progress)

These pre-date the convention. Don't model new code on them; clean up incidentally
when you're already editing the file.

- **`render` vs `draw` naming.** `labelRenderer.render(...)` and
  `markerLineRenderer.render(...)` should be `draw(...)`. Rename + update the two
  call sites in `youAreHereSubsystem.runFrame`.
- **Positional factory args.** `createPointRenderer`, `createPickRenderer`,
  `createFilamentRenderer`, `createScalarVolumeRenderer` take `(device, format)`
  instead of a context bag. Convert when you next need to add a constructor arg.
- **`pickRenderer` shares `pointRenderer.uniformBuffer`.** This is load-bearing
  (selection encoding has to round-trip through the same buffer the visual pass
  sees) but it's the only cross-renderer shared mutable resource in the codebase.
  If you find yourself reaching for the same pattern, talk to someone first —
  the second-architectural-audit's finding #3 (selection-pack module) is the
  cleaner long-term home.
