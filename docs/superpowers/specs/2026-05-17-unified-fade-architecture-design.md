# Unified fade architecture — design

A single registry-driven mechanism for fading any visible layer in or
out, replacing the per-renderer `CloudFade` class with a primitive
that's reusable across point surveys, filaments, scalar volumes,
labels, and other GPU overlays.

## Motivation

Today's `CloudFade` (`src/services/gpu/resources/cloudFade.ts`) is
fade-in-only, owned per-renderer, and entangled with a second concern
(packing the 5-bit `Source` enum into the picker's globally-unique
ID). Two renderers use it: `pointRenderer` constructs one per
survey, `filamentRenderer` constructs one lazily on first upload. The
volumetric renderer (CF4 + rhizome) doesn't fade at all; tier swaps
on point surveys momentarily drop opacity to 0, producing a visible
blink; labels never fade; and there's no way for a scripted tour to
animate any of this.

The three drivers for a unified mechanism:

1. **Loading polish.** Scalar volume fields land asynchronously like
   the point surveys do, but appear instantly when they arrive. Tier
   swaps blink. New asset types (labels, future overlays) need the
   same affordance without copy-pasting the fade plumbing.
2. **Tours.** Future scripted tour playback wants `fadeTo(layer,
   target, duration)` as a primitive — direction, target opacity,
   and duration all programmable, not just "fade in once on
   construction".
3. **Chunked galaxy loading.** A future plan splits the larger
   surveys into smaller data files that arrive over time. Each chunk
   needs its own fade-in. That extension shouldn't require
   re-architecting; the unified registry should accommodate it.

A clean separation between *the timing of an opacity ramp* and *what
the renderer does with it* also lets us delete the `sourceCode`
piggyback from the fade uniform. Pick-ID packing is a pointRenderer
concern; it doesn't belong in a class also used by filaments and
volumes.

## Scope

In scope:

- A new `FadeController` pure-timing primitive.
- A new `FadeRegistry` engine subsystem owning a map from
  `FadeHandle` → `FadeController`.
- A new canonical bind-group layout for fade uniforms, shared across
  all renderer pipelines.
- A new canonical bind-group layout for pointRenderer's `SourceUniforms`
  (the extracted sourceCode), bound at `@group(2)`.
- Migration of `pointRenderer` and `filamentRenderer` off `CloudFade`
  onto the new registry. Deletion of `CloudFade`.
- Volume fade-in on first upload, fade-out-then-fade-in on tier swap.
- Label fade-in on first label-set arrival.
- "Other overlays" (Milky Way impostor, procedural disks, textured
  impostors) register handles at opacity 1.0 — available to tour, not
  auto-faded.
- Sequential tier-swap orchestration in the AssetSlot commit step.
- Async UI layer-toggle: pickMask off immediately, drawMask off after
  fade-out completes.
- Single render-on-demand predicate
  (`state.subsystems.fades.isAnyAnimating()`) replacing the OR-chain
  of per-renderer `isFading()` calls.

Out of scope (deferred):

- Chunked galaxy loading. The fade-handle union and renderer-side
  draw-range mechanics are sketched in "Future extensions" but not
  implemented here.
- Tour playback / scripted sequences. The registry exposes the API
  tours will use, but the tour subsystem itself is separate work.
- Per-instance fade gradients (every galaxy fading at its own pace).
  Out of scope; the unit of fade is the layer (or future chunk),
  never the individual point.
- Cross-fade with two simultaneous buffers per layer. Considered and
  rejected in favour of sequential fade-out → upload → fade-in (see
  "Tradeoffs").
- Re-flowing today's bias-correction subsystem or other engine
  internals. The fade migration is plumbing only; no behavior change
  to bias maps, picker output, or selection halos.

## Architecture

### Core primitive: `FadeController`

A pure CPU class. Owns the animation state for a single opacity
value. No GPU resources.

```ts
class FadeController {
  constructor(initialOpacity: number = 0, nowMs?: number);

  fadeTo(target: number, durationMs: number, nowMs?: number): Promise<void>;
  setImmediate(value: number): void;
  currentOpacity(nowMs?: number): number;
  isAnimating(nowMs?: number): boolean;
}
```

Internal state: `sourceOpacity`, `targetOpacity`, `transitionStartMs`,
`transitionDurationMs`. `currentOpacity()` returns a smoothstep
between source and target, clamped after `start + duration`.

`fadeTo()` reads `currentOpacity(now)` as the new `sourceOpacity`,
records `targetOpacity` and `transitionStartMs`. This makes
mid-flight retargeting trivial — interrupting a fade-in with a
fade-out picks up from wherever the previous fade reached.

The returned `Promise<void>` resolves when the controller would next
report `!isAnimating(now)`. The slot orchestration code awaits this
to sequence fade-out → upload → fade-in. Implementation: the
controller maintains a list of `(resolveMs, resolve)` pairs and the
registry's per-frame tick fires resolutions whose `resolveMs` has
passed.

`setImmediate(value)` skips animation entirely — used at engine
bootstrap to register always-on overlays at opacity 1.0.

Two default durations are exported, reflecting an asymmetric UX
pattern: fade-out feels best when it's nearly instant (the user
asked for something to disappear; show it disappearing), fade-in
feels best when it's leisurely (the user wants the new thing to
arrive smoothly, not pop).

- `FADE_IN_DURATION_MS = 600` — replaces today's
  `CLOUD_FADE_DURATION_MS`. The "things flowing in" feel.
- `FADE_OUT_DURATION_MS = 100` — almost-instant smoothstep dim. Long
  enough to avoid a hard cut, short enough that the user perceives
  the response as immediate.

Callers pass durations explicitly to `fadeTo`; the constants are
defaults used by the loading slots and UI toggle handlers. Tours
will typically use larger values for dramatic transitions.

### Registry: `FadeRegistry`

Engine subsystem at `state.subsystems.fades`. Owns the map of all
fadeable layers.

```ts
type FadeHandle =
  | { kind: 'survey'; source: Source }
  | { kind: 'filaments' }
  | { kind: 'scalarField'; field: ScalarFieldHandle }
  | { kind: 'labelLayer'; layer: LabelLayerId }
  | { kind: 'overlay'; id: OverlayId };

class FadeRegistry {
  register(handle: FadeHandle, initialOpacity?: number): void;
  unregister(handle: FadeHandle): void;
  fadeTo(handle: FadeHandle, target: number, durationMs?: number): Promise<void>;
  setImmediate(handle: FadeHandle, value: number): void;
  opacityOf(handle: FadeHandle, nowMs?: number): number;
  isAnyAnimating(nowMs?: number): boolean;
  tick(nowMs?: number): void;
}
```

Internal storage: `Map<string, FadeController>` keyed by a stable
serialization of the handle (a short string like `"survey:sdss"` or
`"scalarField:rhizome-medium"`). Tests build handles inline; the
serialization is an implementation detail.

`opacityOf()` returns `1.0` for unregistered handles. This is the
fail-safe path: a renderer asking for a handle that hasn't been
registered yet (or has been unregistered during teardown) draws at
full opacity rather than disappearing. Registration happens early
enough that this should rarely matter in practice, but the fail-safe
keeps a half-finished bootstrap from black-screening.

`tick(now)` is called once per frame from `runFrame`. It walks the
controller list, fires any due `fadeTo` promise resolutions, and is
the place where future GC of completed-and-zero-opacity handles could
live.

`isAnyAnimating()` iterates the controllers; cost is `O(handles)` ≈
~20-30 controllers in the steady state, negligible per frame.

### Two separate uniforms, two separate bind groups

The fade and pick-ID concerns are deliberately split into separate
uniforms backed by separate bind groups.

| Concern | WGSL | TS BGL location | Owner |
|---|---|---|---|
| Fade (universal) | `@group(1) @binding(0) var<uniform> fade: FadeUniforms;` | `src/services/gpu/bindGroupLayouts/fadeUniforms.ts` | Renderer holds per-buffer GPU uniform (4 bytes opacity + 12 bytes pad); per-frame writes the registry-read value. |
| Source pick-ID (points only) | `@group(2) @binding(0) var<uniform> source: SourceUniforms;` | `src/services/gpu/bindGroupLayouts/sourceUniforms.ts` | `pointRenderer` only. Holds per-source GPU uniform (4 bytes sourceCode + 12 bytes pad); written once at upload. |

```wgsl
struct FadeUniforms {
  opacity: f32,
  _pad: vec3<f32>,
};
@group(1) @binding(0) var<uniform> fade: FadeUniforms;

struct SourceUniforms {
  sourceCode: u32,
  _pad: vec3<u32>,
};
@group(2) @binding(0) var<uniform> source: SourceUniforms;
```

Both BGLs are constructed once at engine bootstrap and exported as
module constants. Every pipeline that consumes them imports the same
BGL object. This sidesteps the `layout: 'auto'` trap — bind groups
built against the canonical BGL are valid across every pipeline that
includes it, not pipeline-specific as auto-derived layouts are.

The shaders' `_pad` fields are required because WebGPU's minimum
uniform buffer size is 16 bytes. We never write the pad fields; the
buffer is zero-initialized and stays that way.

`CloudUniforms` (the previous combined struct) is removed entirely.
`fragment.wesl` in points and filaments replaces `cloud.opacity`
with `fade.opacity`. `vertex.wesl` in points replaces
`cloud.sourceCode` with `source.sourceCode`.

**Pick pipeline layout compatibility.** The pick renderer doesn't
read `fade.opacity` — picking has no notion of partial visibility —
but its pipeline layout **must include the canonical `fadeBgl` slot
at `@group(1)`** to stay layout-compatible with the visual points
pipeline. Both pipelines consume the same vertex buffer + the same
per-source `sourceBindGroup` at `@group(2)`; if the pick pipeline
omitted the fade BGL, WebGPU validation would reject the shared
draw machinery. The pick fragment shader therefore declares
`FadeUniforms` as a no-op binding (declared but unread), and the
pick pass binds a small dedicated "always-1.0" fade uniform buffer
at `@group(1)`. That buffer is written once at construction and
never touched again.

### Renderer-side data model

`pointRenderer` keeps `Map<Source, BufferEntry>` — **one entry per
source**, exactly as today. No list of buffers per source. The
per-buffer fade uniform is owned by the renderer.

```ts
type BufferEntry = {
  buffer: GPUBuffer;             // vertex buffer (existing)
  count: number;                  // (existing)
  fadeBuffer: GPUBuffer;          // new — 16-byte fade uniform
  fadeBindGroup: GPUBindGroup;    // new — bound at @group(1)
  sourceBuffer: GPUBuffer;        // new — 16-byte source uniform
  sourceBindGroup: GPUBindGroup;  // new — bound at @group(2)
  // bias-related state preserved as-is
};
```

`scalarVolumeRenderer.FieldEntry` gains `fadeBuffer` +
`fadeBindGroup` and the pipeline gains a `@group(1)` layout. No
`SourceUniforms` here — volumes don't pick.

Filament `BufferEntry` (it's a single instance not a map) gains the
same fade fields. No `SourceUniforms`.

Labels are different from the other consumers: they're routed
through a `LabelDirector` subsystem that aggregates `LabelProducer`s
(`youAreHere`, cluster POIs, future galaxy names) and dispatches to
a single `labelRenderer` pipeline plus a `markerLineRenderer`. There
is **one label renderer pipeline, not four per-layer pipelines**.
This design predates the unified fade work.

For v1 the four label-layer handles are registered (so a tour can
address each conceptually), but the renderer draws every label at a
**single combined opacity** — typically `max(opacityOf(each layer
handle))`, falling back to the youAreHere handle's opacity when no
labels are routed through the director. Per-layer-aware draws
(where cluster POIs fade independently of galaxy names) require
restructuring the `setLabels` flush boundary in the director and
are explicitly deferred to a follow-up plan.

The mechanical pattern at the renderer is identical to the others:
the combined label pipeline gains a `@group(1)` fade BGL, a per-pass
fade uniform buffer, and a per-frame writeBuffer with the combined
opacity. The label fragment shader multiplies its alpha by
`fade.opacity` like every other consumer.

Per-frame draw flow for any participating renderer:

1. Read `opacity = state.subsystems.fades.opacityOf(handle, now)`.
2. If `opacity === 0`, skip the draw call entirely (this is a
   meaningful optimization once toggled-off layers exist).
3. Else, write the opacity into the renderer's fade GPU buffer.
4. `setBindGroup(1, fadeBindGroup)` (plus `setBindGroup(2,
   sourceBindGroup)` for points).
5. Draw.

The opacity write per frame is one 16-byte `writeBuffer` call per
visible layer. For ~10 visible layers in steady state that's
negligible.

### Sequential tier-swap orchestration

Transitions move out of the renderer entirely and live in the
AssetSlot commit step. The renderer becomes simpler: it knows how
to `upload()` and `clear()` for a source; it doesn't know about
tier swaps or fade timing.

```ts
async function commitGalaxyCatalog(source: Source, newCatalog: GalaxyCatalog) {
  const handle: FadeHandle = { kind: 'survey', source };
  if (renderer.hasData(source)) {
    await state.subsystems.fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
  }
  renderer.upload(source, newCatalog); // destroys old buffer, uploads new
  state.subsystems.fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
}
```

For the **first load** of a source there's no prior data; the
fade-out is skipped and the new buffer fades in from 0 (the
registry's initial opacity for survey handles).

For a **tier swap**, the sequence is:

1. `t=0`: user clicks tier change, slot commit awakened.
2. `t=0..100 ms`: `fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS)`
   quickly ramps the layer's opacity from its current value (typically
   1.0) to 0. The renderer keeps drawing the *old* buffer with the
   falling alpha. The fast fade-out makes the tier-change click feel
   immediately responsive.
3. `t=100 ms`: fade-out resolves. `renderer.upload(source,
   newCatalog)` destroys the old vertex buffer and writes the new
   one. The fade uniform is still at 0.
4. `t=100 ms..onwards`: `fades.fadeTo(handle, 1, FADE_IN_DURATION_MS)`
   ramps the layer back to full opacity over the next 600 ms. The
   renderer draws the new buffer.

Total: ~700 ms for a tier swap when the upload itself is quick.
Asymmetric durations: out is fast (responsive), in is slow (smooth).

For the largest tier (`glade-large`, ~130 MB), the upload + decode +
bake step in (3) may itself take 1-2 seconds. During this window the
layer is at opacity 0 and effectively invisible; nothing draws. This
is the cost of the single-buffer-per-source choice (see Tradeoffs).
Chunked galaxy loading is the long-term fix; for now the visible
"gap" is acceptable on large tier swaps because tier swaps are
infrequent user actions and the surrounding layers (2MRS, SDSS)
remain visible throughout.

For **volumes**, the same sequential model applies. Volume textures
are smaller (rhizome-medium is ~32 MB, CF4 similar) and the
`writeTexture` upload is typically fast, so the invisible-gap is
shorter — usually unnoticeable.

### UI layer-toggle (async fade-out)

Two visibility masks instead of one. Both initialise to "all on".

| Mask | Toggled by | Read by |
|---|---|---|
| `pickMask: number` | UI toggle flips bit *immediately* on click. | Picker — a fading-out layer is non-clickable. |
| `drawMask: number` | UI toggle starts a fade. Bit flips off only after `fades.opacityOf(handle) === 0 && !isAnimating`. | Renderer — keeps drawing alpha-multiplied through the ramp. |

Click handler (illustrative):

```ts
function toggleSurvey(source: Source, on: boolean) {
  const handle: FadeHandle = { kind: 'survey', source };
  state.sources.pickMask ^= (1 << source);
  const target = on ? 1 : 0;
  const duration = on ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS;
  await state.subsystems.fades.fadeTo(handle, target, duration);
  if (!on) state.sources.drawMask &= ~(1 << source);
  else state.sources.drawMask |= (1 << source);
}
```

Quick double-toggle (off → on within 200 ms) is handled by
`FadeController.fadeTo` retargeting mid-flight: the new fade starts
from whatever opacity the cancelled one had reached, so there's no
discontinuity.

A subtle race exists if two `toggleSurvey` calls are in flight
simultaneously — each awaits its own `fadeTo` and then writes
`drawMask`. The fade promises resolve in the order they were issued,
but only the *last-issued* fade reflects the user's final intent.
The handler resolves this by reading the registry's current target
opacity at promise-resolve time rather than the captured `on`
parameter: `drawMask` is set based on
`fades.opacityOf(handle) > 0` after the fade completes, so whichever
fade settles last wins.

The picker's response is immediate; a half-faded layer can't be
clicked. The renderer's response is deferred for visual smoothness.
After the fade-out completes, the `drawMask` flip skips the draw
call entirely — no per-frame GPU work for invisible layers.

### Render-on-demand integration

`runFrame.ts:479-480` simplifies:

```ts
// Before:
(ready && state.gpu.renderer.isFading()) ||
(state.gpu.filamentRenderer !== null && state.gpu.filamentRenderer.isFading())

// After:
state.subsystems.fades.isAnyAnimating(now)
```

`PointRenderer.isFading()` and `FilamentRenderer.isFading()` are
removed from their respective surfaces. The volume renderer never
had one. Labels never had one. All four converge on the registry as
the single source of "is anything still animating?"

### Handle registration at engine bootstrap

Each renderer/wiring module registers its handle(s) at construction,
with appropriate initial opacities:

| Layer | Handle | Initial opacity |
|---|---|---|
| Surveys (each of SDSS, 2MRS, GLADE, Famous, Synthetic) | `{kind:'survey', source}` | 0 — fade in on first load. |
| Filaments | `{kind:'filaments'}` | 0 — fade in on first load. |
| Scalar fields (CF4, rhizome-{small,medium,large}) | `{kind:'scalarField', field}` | 0 — fade in on first upload. |
| Label layers (cluster POI, galaxy names, you-are-here, scale bar) | `{kind:'labelLayer', layer}` | 0 — fade in on first label-set arrival. |
| Always-on overlays (Milky Way impostor, procedural disks, textured impostors) | `{kind:'overlay', id}` | 1.0 via `setImmediate(1)` — available to tour, never auto-faded. (Note: there is no HEALPix renderer in the codebase — `angularDensityWeight` is a per-galaxy attribute, not an overlay layer.) |

Registration is co-located with each renderer/subsystem's
construction so the engine bootstrap doesn't accumulate a registry-
side list of handles.

**Concrete registration sites:**
- Survey handles: `pointSourceRegistry`'s `wireGalaxyCatalogSourceSlot`
  (one `fades.register` call per row of the registry, alongside its
  existing per-source setup).
- Filament handle: `filamentSlot` construction in `initGpu` or
  wherever the filament slot is wired today.
- Scalar field handles: `scalarVolumeRenderer.addField()` registers
  on entry creation; `removeField()` unregisters.
- Label layer handles: each label subsystem's construction call.
- Always-on overlays: `initGpu` or each overlay's construction site,
  using `setImmediate(1)`.

**Bootstrap order:** `FadeRegistry` is constructed and attached to
`state.subsystems.fades` **before** any renderer is constructed, so
the registration calls during renderer setup find a valid registry.
Mechanically this means the registry's construction lives in the
same bootstrap phase as `tweens`/`scheduler`/`spaceMouse` — before
`initGpu` runs.

## Files

### New

```
src/@types/animation/FadeHandle.d.ts          # discriminated union
src/@types/animation/FadeController.d.ts      # class interface
src/@types/animation/FadeRegistry.d.ts        # class interface
src/services/animation/fadeController.ts      # pure timing class
src/services/animation/fadeRegistry.ts        # engine subsystem
src/services/gpu/bindGroupLayouts/fadeUniforms.ts    # canonical BGL
src/services/gpu/bindGroupLayouts/sourceUniforms.ts  # canonical BGL (points)
src/services/gpu/shaders/lib/fadeUniforms.wesl       # struct + binding
src/services/gpu/shaders/lib/sourceUniforms.wesl     # struct + binding (points)

tests/services/animation/fadeController.test.ts
tests/services/animation/fadeRegistry.test.ts
tests/services/loading/slots/galaxyCatalogSlotFade.test.ts
tests/services/gpu/renderers/pointRendererFade.test.ts
tests/services/gpu/renderers/scalarVolumeRendererFade.test.ts
tests/services/gpu/renderers/filamentRendererFade.test.ts
tests/components/SettingsPanel/toggleFade.test.ts
```

### Deleted

```
src/services/gpu/resources/cloudFade.ts
src/services/gpu/shaders/lib/cloudUniforms.wesl (if present standalone)
tests/services/gpu/resources/cloudFade.test.ts (if present)
```

### Modified

```
src/services/gpu/renderers/pointRenderer.ts      # extract sourceCode, swap fade source
src/services/gpu/renderers/filamentRenderer.ts   # swap fade source, drop CloudFade
src/services/gpu/renderers/scalarVolumeRenderer.ts  # add @group(1), per-field fade uniform
src/services/gpu/shaders/points/vertex.wesl      # source.sourceCode, fade.opacity
src/services/gpu/shaders/points/colorFragment.wesl   # fade.opacity
src/services/gpu/shaders/filaments/fragment.wesl     # fade.opacity
src/services/gpu/shaders/scalarVolume/fragment.wesl  # multiply by fade.opacity
src/services/gpu/shaders/labels/fragment.wesl        # multiply by fade.opacity
src/services/gpu/shaders/pick/pickFragment.wesl  # add no-op FadeUniforms decl for pipeline-layout compat
src/services/gpu/renderers/pickRenderer.ts       # bind always-1.0 fade buffer at @group(1); rename cloudFadeBuffer → sourceBuffer on PickSourceDraw
src/@types/rendering/PickSourceDraw.d.ts         # cloudFadeBuffer → sourceBuffer
src/services/engine/wiring/galaxyCatalogSourceRegistry.ts  # wireGalaxyCatalogSourceSlot: sequential fade-out/upload/fade-in (NOT a separate slot file)
src/services/loading/slots/filamentSlot.ts       # fade-in on commit
src/services/loading/slots/scalarFieldSlot.ts    # sequential commit (new or modified)
src/services/engine/frame/runFrame.ts            # collapse to fades.isAnyAnimating
src/services/engine/state/EngineSubsystems.d.ts  # add fades
src/services/engine/phases/initGpu.ts            # construct + register handles; build canonical BGLs
src/components/SettingsPanel.tsx (or wherever survey toggles live)  # async toggle
src/services/engine/helpers/engineReady.ts       # any references to pointRenderer.isFading
src/@types/rendering/PointRenderer.d.ts          # remove isFading from surface
src/@types/rendering/FilamentRenderer.d.ts       # remove isFading; draw() gains fadeOpacity param (public-surface change)
src/@types/rendering/ScalarVolumeRenderer.d.ts   # draw() gains fadeOpacityOf callback (public-surface change)
```

**Note on `galaxyCatalogSlot`:** There is no standalone `galaxyCatalogSlot.ts` file in the codebase. The per-survey asset-slot wiring lives in `wireGalaxyCatalogSourceSlot()` inside `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`. The sequential fade-out → upload → fade-in orchestration is implemented inside that helper, not in a new slot file.

**Note on renderer `draw()` signatures:** The migration is not pure plumbing — `FilamentRenderer.draw` and `ScalarVolumeRenderer.draw` gain new parameters (a fade opacity value or a fade-opacity callback). These are public-surface changes to the renderer interfaces. No behaviour change to picker output or selection halos.

## Testing

### Unit tests

- **`fadeController.test.ts`**: smoothstep timing, mid-flight
  retargeting (fadeTo while previous fade incomplete), `setImmediate`,
  promise resolution timing, `isAnimating` boundary cases (exactly
  at `start + duration`).
- **`fadeRegistry.test.ts`**: handle registration / unregistration,
  serialization stability (same handle shape produces same key),
  `opacityOf` unregistered fail-safe, `isAnyAnimating` aggregation
  across multiple controllers, `tick` resolves due promises.

### Integration tests

- **`galaxyCatalogSlotFade.test.ts`**: first commit triggers
  `fadeTo(handle, 1, FADE_IN_DURATION_MS)`. Second commit (tier swap)
  awaits `fadeTo(handle, 0, FADE_OUT_DURATION_MS)` before calling
  `renderer.upload`, then triggers
  `fadeTo(handle, 1, FADE_IN_DURATION_MS)`. Assert the durations are
  asymmetric (out faster than in).
- **`pointRendererFade.test.ts`**: per-frame draw reads opacity from
  registry; written into the per-source `fadeBuffer`; `sourceBuffer`
  written only at upload time, not per frame.
- **`scalarVolumeRendererFade.test.ts`**: per-field fade plumbing
  matches points; `setBindGroup(1, fadeBindGroup)` called per draw.
- **`filamentRendererFade.test.ts`**: single fade uniform; fade-in on
  first upload.
- **`toggleFade.test.ts`**: clicking a survey toggle off flips
  `pickMask` immediately, awaits `fadeTo(handle, 0, FADE_OUT_DURATION_MS)`,
  then flips `drawMask`. Toggle on uses `FADE_IN_DURATION_MS`.
  Double-toggle within the fade retargets cleanly.

### Visual baselines

- Existing `galaxyImpostorBaseline.test.ts` and
  `renderFrameSplitBaseline.test.ts` should pass unchanged once the
  fade plumbing replaces CloudFade — the steady-state opacity is
  still 1.0, the visual output is identical.
- New baseline: `scalarVolumeFadeIn.test.ts` renders a volume field
  100 ms into its fade-in and asserts the additive blend is
  proportionally dimmer.

## Tradeoffs

### Sequential vs cross-fade for tier swaps

The two viable models:

| Model | Pro | Con |
|---|---|---|
| **Sequential** (this design) | Single buffer per source; clean state; trivial renderer code; no picking ambiguity; matches existing single-`BufferEntry` model. | Brief invisible gap on large tier swaps (~1-2 s for `glade-large`). |
| **Cross-fade** | No invisible gap; both tiers visible during swap. | Two buffers per source during transition; ~260 MB VRAM peak on `glade-large`; per-buffer fade plumbing in renderer; picking ambiguity (which buffer's indices?). |

Chosen: **sequential**. Cleaner renderer state, modest VRAM, and the
invisible-gap problem is fully fixed by the planned chunked-loading
work — chunks arrive continuously and the layer fades back in as
soon as the first chunk lands. The sequential model is also the
natural fit for chunked-loading: each chunk gets its own
per-chunk-range fade without buffer juggling.

### Promise-based vs callback-based `fadeTo`

Chosen: promise. The slot orchestration code is naturally
sequential (`await fadeTo(...)` before `upload`), and callbacks
would make that path uglier. The cost is a small allocation per
fade — negligible.

### Registry owns timing, renderer owns GPU

Considered alternative: registry owns the GPU fade buffer per handle,
all consumer pipelines bind it. Rejected because:

1. Future chunked loading needs per-chunk fade uniforms within a
   single layer; a registry-owned single buffer per handle can't
   express that.
2. The renderer already iterates its per-source state per frame;
   adding a `writeBuffer(fadeBuffer, ...)` is trivial. The cost of
   the writeBuffer per visible layer is negligible (~10
   `writeBuffer` calls per frame).
3. Renderer ownership of GPU resources matches every other
   renderer-internal uniform in the codebase. No new ownership
   discipline to learn.

### Why split `FadeUniforms` and `SourceUniforms`

Could be co-located in one 16-byte buffer (4 bytes opacity, 4 bytes
sourceCode, 8 bytes pad) but they have different update cadences and
different audiences:

- `fade.opacity` is written every frame for every visible layer.
- `source.sourceCode` is written once at upload time, only for
  point surveys.

Co-locating would require pointRenderer's per-frame fade write to
read-modify-write the sourceCode bytes (or use a 4-byte-offset
writeBuffer, which is fine but couples the layouts). Volumes and
labels would have a never-written `sourceCode` slot they don't care
about. Separating them makes each renderer pay only for the
uniforms it actually needs.

The two bind groups (`@group(1)` and `@group(2)` on points; just
`@group(1)` on volumes/filaments/labels) add a small descriptor-set
binding cost but no measurable runtime overhead.

## Future extensions (not in this spec)

### Chunked galaxy loading

The renderer's `BufferEntry` can grow a `chunkRanges` field listing
per-range start instance, count, and fade handle:

```ts
type BufferEntry = {
  buffer: GPUBuffer;
  chunkRanges: Array<{
    startInstance: number;
    count: number;
    chunkFadeBuffer: GPUBuffer;
    chunkFadeBindGroup: GPUBindGroup;
    chunkHandle: FadeHandle; // { kind: 'surveyChunk', source, chunkId }
  }>;
};
```

Each chunk arrival appends a new range and registers a new chunk
handle starting at opacity 0; the slot fades it to 1. The renderer
issues one draw call per range, binding the chunk-specific fade
buffer. After the full survey loads, the renderer can compact
ranges into a single draw (or leave them — N small draws is cheap).

The `FadeHandle` union already accommodates the new kind without a
breaking change.

### Tour playback

A future `tourSubsystem` reads a declarative tour script (waypoints,
durations, layer visibility per step) and orchestrates the camera
tweens, label visibility, and fade transitions. The fade primitive
is `state.subsystems.fades.fadeTo(handle, target, duration)` — the
same API the loading slots use. No new fade machinery required.

### Per-layer crossfade for volumes (if needed)

If sequential fade for volumes proves visually unsatisfying (e.g.
the rhizome cosmic web "disappearing" briefly during tier swap),
`scalarVolumeRenderer` can independently adopt a two-`FieldEntry`-
per-handle cross-fade scheme without touching the registry. Volume
textures are smaller than survey vertex buffers, so the VRAM cost
is modest. This would be additive and isolated.

## Open questions

None at spec-write time. All five design forks were resolved during
brainstorming:

1. Where the fade lives → registry (cross-cutting), GPU buffers
   per-renderer.
2. Bidirectional fade → yes, `fadeTo(target, duration)` is the
   primitive; `fadeIn`/`fadeOut` are sugar.
3. Tier swap → sequential (fade-out → upload → fade-in), single
   BufferEntry per source.
4. Uniforms → separate `FadeUniforms` (@group(1), universal) and
   `SourceUniforms` (@group(2), points-only). No co-location.
5. UI toggle → async, dual mask (pickMask immediate, drawMask
   deferred).
