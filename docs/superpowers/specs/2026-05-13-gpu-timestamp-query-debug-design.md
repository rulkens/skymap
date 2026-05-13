# GPU Timestamp-Query Debug Instrumentation — Design

**Status:** Draft
**Date:** 2026-05-13
**Branch:** `gpu-timestamp-query`
**Foundation:** PR #126 (impostor subsystem split) — merged into `main` on 2026-05-13. This design builds on the per-LOD `Pass` modules that work delivered.

## Goal

Expose per-pass GPU timing in a dev-mode debug panel so we can see, frame
by frame, which render pass is eating the budget. The same code path
runs in production and debug — there is no debug-only rendering branch.

## Motivation

The 22M-object scaling thought experiment from a few weeks back surfaced
a hole in our profiling story: we can read `requestAnimationFrame`
deltas (wall-clock end-to-end) and we can guess at CPU vs GPU split with
Chrome's profiler, but we cannot attribute wall-clock GPU time to
individual passes (point sprites vs filaments vs scalar volume vs
textured impostors). Without that attribution, optimization work is
unguided.

WebGPU's `timestamp-query` feature gives us per-pass start/end
timestamps cheaply. The constraint is that timestamps land on render-
pass _boundaries_ (descriptors), not arbitrary points inside an open
pass. Today, all 8 HDR sub-passes share one `beginRenderPass`. To get
per-sub-pass timing without a debug-only rendering branch, we split
that one shared pass into 8 separate render passes (same target, all
but the first using `loadOp: 'load'`, plus a dedicated initial clear
pass). Production and debug now share that architecture.

## Architecture

### Split rendering: one pass per `HDR_PASSES` entry

Before: `renderFrame` opens one `beginRenderPass` with
`loadOp: 'clear'`, iterates `HDR_PASSES`, calls `pass.draw(...)` on each
into the shared encoder, then `pass.end()`.

After: `renderFrame` opens **9** render passes per frame in this order:

1. **Clear pass.** Empty (no draws). `loadOp: 'clear'`,
   `clearValue: { r:0, g:0, b:0, a:1 }`, `storeOp: 'store'`. Wipes the
   HDR target to black. Begin + end immediately.
2. **One pass per `HDR_PASSES` entry** (8 of them). Each opens its own
   `beginRenderPass` against the same HDR view with `loadOp: 'load'`,
   `storeOp: 'store'`, then calls `pass.draw(...)`, then ends.

The `Pass` interface contract is unchanged from a pass author's
perspective: `draw(pass, ctx, state, settings, deps)` still receives an
open render-pass encoder and still MUST NOT call `pass.end()`. The
orchestrator (renderFrame) now owns nine begin/ends instead of one, but
the per-pass code is untouched.

### Why a dedicated clear pass instead of `clear` on pass 1

If we made the first `HDR_PASSES` entry `loadOp: 'clear'` and the rest
`load`, the clear would silently disappear whenever pass 1 was gated
off by its `enabled()` predicate. In practice `point-sprites` is
effectively always on, but the coupling is fragile: gating logic should
be orthogonal to whether the framebuffer gets cleared. A no-draw clear
pass at the top of `renderFrame` keeps the clear as a frame-lifecycle
concern (always runs, regardless of which `HDR_PASSES` are enabled).
The cost of an empty render pass on desktop GPUs is in the µs range
and well-amortized.

### Timestamp wiring

WebGPU `RenderPassDescriptor.timestampWrites` accepts:

```ts
type RenderPassTimestampWrites = {
  querySet: GPUQuerySet;
  beginningOfPassWriteIndex?: number;
  endOfPassWriteIndex?: number;
};
```

Per frame, we attach a `timestampWrites` object to every pass we want
to measure. 10 timed sections × 2 slots = 20 slots. We size the
`GPUQuerySet` at **32** for headroom (a future
`texturedImpostorsPass` split into quad/disk sub-passes wouldn't force
a re-sizing). The clear pass is **not** measured — it's a frame-
lifecycle artefact, not an interesting draw cost.

Static slot assignment (the indices are compile-time constants, not
allocated dynamically):

| Slot name            | Begin idx | End idx |
| -------------------- | --------- | ------- |
| `point-sprites`      | 0         | 1       |
| `procedural-disks`   | 2         | 3       |
| `textured-impostors` | 4         | 5       |
| `filaments`          | 6         | 7       |
| `scalar-volume`      | 8         | 9       |
| `milky-way`          | 10        | 11      |
| `marker-lines`       | 12        | 13      |
| `labels`             | 14        | 15      |
| `tone-map`           | 16        | 17      |
| `pick`               | 18        | 19      |
| _reserved_           | 20–31     |         |

### `gpuTimingService` module

New module at `src/services/gpu/timing/gpuTimingService.ts`. Owns:

- One `GPUQuerySet` of `type: 'timestamp'`, count 32.
- One resolve buffer (`COPY_DST | QUERY_RESOLVE`, 32 × 8 bytes).
- Two staging buffers (`COPY_DST | MAP_READ`, 32 × 8 bytes each).
  Double-buffered so a frame's `mapAsync` doesn't stall the next
  frame's resolve. Ring-rotated by frame index.
- A slot-name map: `'point-sprites' → [0, 1]`,
  `'procedural-disks' → [2, 3]`, …, `'pick' → [18, 19]`.

Per-frame API:

```ts
beginFrame(): TimingFrameContext
descriptorFor(slot: TimingSlotName): RenderPassTimestampWrites | undefined
endFrame(ctx: TimingFrameContext, encoder: GPUCommandEncoder): void
```

- `beginFrame` returns a `TimingFrameContext` carrying the
  frame-rotation cursor (which staging buffer this frame writes into).
- `descriptorFor` returns a `timestampWrites` object the orchestrator
  drops directly into a pass descriptor. The slot→index mapping is
  static (see table above), so this method doesn't need the frame
  context. Returns `undefined` when the feature is unsupported, so
  call sites can spread `...maybe` cleanly.
- `endFrame` records the `resolveQuerySet` + `copyBufferToBuffer` calls
  into the supplied encoder, using `ctx` to pick the destination
  staging buffer. After `device.queue.submit(...)` runs, the service
  queues a `mapAsync` on that staging buffer; when the map completes
  (1–2 frames later), the service decodes the `BigUint64Array`,
  multiplies by `timestampPeriod`, and pushes a `GpuTimingFrame` to
  subscribers.

The query set and resolve buffer are reused across frames — they're
transient transports. Only the staging buffers are double-buffered,
because their `mapAsync` lifetimes overlap (a frame's resolve runs
while the previous frame's map is still pending).

Subscriber channel:

```ts
subscribe(listener: (frame: GpuTimingFrame) => void): () => void
```

`GpuTimingFrame` shape:

```ts
type GpuTimingFrame = {
  readonly frameIndex: number;
  readonly perPassMs: ReadonlyMap<TimingSlotName, number>;
};
```

The `DebugPanel` subscribes; the panel does its own rolling-average and
sparkline ring-buffer (10–20 lines of React). No averaging in the
service — keeping it transport-only makes it easier to test and
reuse.

### Feature negotiation

`timestamp-query` is an optional WebGPU feature. Most desktop browsers
support it; Safari and some mobile adapters do not.

Bootstrap flow:

1. `adapter.features.has('timestamp-query')` → if false, skip the
   feature in the `requestDevice` call.
2. `requestDevice({ requiredFeatures: device.features.has('timestamp-query') ? ['timestamp-query'] : [] })`.
3. `gpuTimingService` constructor checks `device.features.has('timestamp-query')`.
   If false, every method becomes a no-op: `descriptorFor` returns
   `undefined`, `endFrame` does nothing, subscribers never fire.
4. The DebugPanel renders a one-line "GPU timings unavailable on this
   adapter" string in place of the section body when this happens.

### URL gate abstraction

Three URL gates exist today and the predicate is duplicated:

- `?debug=loading` — App.tsx:96 (`get('debug') === 'loading'`)
- `?volumes` — App.tsx:243, wireSlots.ts:161 (`has('volumes')`)
- `?anchors` — wireSlots.ts:197 (`has('anchors')`)

We add `?gpuTimings` for this feature, and lift the boilerplate into
a tiny utility:

```ts
// src/utils/url/urlGate.ts
export function hasUrlGate(name: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has(name);
  } catch {
    return false;
  }
}
```

All three existing `has(...)` call sites migrate to `hasUrlGate(name)`.
The one `get('debug') === 'loading'` call site converts to
`hasUrlGate('debug')` — the `=loading` value distinction has no current
consumers and the new `DebugPanel` (which subsumes the old
`LoadingDevPanel`) is what the URL gate enables anyway.

The migration is one commit, three call sites, zero behaviour change.

### Why "always on when feature is available" was rejected

A bare-cost-of-instrumentation argument said keep it always on. But:

1. `mapAsync` on a buffer per frame keeps a small ring of pending
   promises alive. Trivial, but not free.
2. The Chrome WebGPU implementation has historically had performance
   anomalies around frequent `resolveQuerySet` calls on some adapters.
3. The user prefers explicit opt-in via URL gates for dev features
   (consistent with `?volumes` and `?anchors`).

So: timing service is constructed only when `hasUrlGate('gpuTimings')`
is true. The query set, buffers, mapAsync pump, and subscriber
plumbing — all of that ships only when the gate is active.

## UI

### Component tree

```
DebugPanel/
├── DebugPanel.tsx           (umbrella; mount predicate; section orchestration)
├── AssetLoadingSection.tsx  (body extracted from current LoadingDevPanel)
├── GpuTimingsSection.tsx    (new; subscribes to gpuTimingService)
└── Sparkline.tsx            (5-char unicode block sparkline)
```

`LoadingDevPanel.tsx` is deleted; its body moves into
`AssetLoadingSection.tsx`. `App.tsx` mounts `DebugPanel` instead.

### Mount predicate

```ts
hasUrlGate('debug') || import.meta.env.DEV;
```

In dev, the panel is always mounted. In production builds, it ships
only when `?debug` is present in the URL. Vite's static
`import.meta.env.DEV` replacement still lets Rollup drop the panel
from production bundles when the production URL doesn't include the
gate.

### Section visibility

Both sections always render when the panel is mounted. The GPU timings
section body shows:

- "GPU timings unavailable on this adapter" — when feature is missing.
- "Add `?gpuTimings` to the URL to enable" — when feature is available
  but the gate is not set.
- The timings list — when both are true.

The asset loading section behaves exactly like today's `LoadingDevPanel`.

### Layout sketch

```
┌─ Skymap Debug ────────────────────────┐
│ ▼ Asset Loading (3 in flight)         │
│   sdss-medium    loading  43%         │
│   filaments      ready    —           │
│   ...                                 │
│                                       │
│ ▼ GPU Timings (last frame: 12.4 ms)   │
│   point-sprites       2.1 ms  ▁▂▁▁▂   │
│   procedural-disks    0.3 ms  ▁▁▁▁▁   │
│   textured-impostors  4.8 ms  ▃▄▃▄▃   │
│   filaments           1.2 ms  ▂▂▂▂▂   │
│   scalar-volume       2.4 ms  ▂▂▂▃▂   │
│   milky-way           0.8 ms  ▁▁▁▁▁   │
│   marker-lines        0.1 ms  ▁▁▁▁▁   │
│   labels              0.1 ms  ▁▁▁▁▁   │
│   tone-map            0.4 ms  ▁▁▁▁▁   │
│   pick                0.2 ms  ▁▁▁▁▁   │
└───────────────────────────────────────┘
```

- Per row: pass name (12-char column), rolling average over 60 frames
  (right-aligned, fixed-width), 5-character unicode block sparkline of
  last 8 frames.
- Header row of the GPU section shows the sum of last-frame timings.
- Sparkline characters: `▁▂▃▄▅▆▇█`. Each cell normalized against the
  row's max-of-last-8.
- Both sections are `<details open>` collapsibles.

### Sparkline implementation

`Sparkline.tsx` accepts `samples: readonly number[]` (length up to 8).
Maps each sample to a block character based on its position in the
range `[0, max(samples)]`. 8 buckets → 8 block characters. Pure
function, ~15 lines.

## Pick-render handling

The pick renderer runs on hover (an event-driven cadence, not per
frame), inside its own encoder + submit. Including it in timing means:

- The pick encoder needs a `timestampWrites` descriptor on its
  internal `beginRenderPass`. `pickRenderer.draw` signature extends to
  accept an optional `timingDescriptor: RenderPassTimestampWrites |
undefined` argument.
- The pick `resolveQuerySet` + `copyBufferToBuffer` ride on the same
  encoder, alongside the HDR/tone-map resolves of whichever frame the
  pick happens to land in. The staging buffer doesn't care which
  passes contributed.
- The slot pair for `pick` is `[18, 19]`. The service initializes
  these slots to a sentinel ("not measured this frame") so the
  subscriber knows when to skip the row.

The cadence-mismatch concern is real but small: pick runs at most once
per frame, often less. When it doesn't run, `descriptorFor('pick')`
isn't called and the staging-buffer slots for pick stay at sentinel.
The decode logic treats sentinel slots as "no sample" and the panel
shows `—` for the row's current value (the sparkline still shows
historical samples).

## File layout

### New

```
src/services/gpu/timing/
├── gpuTimingService.ts                  (300 lines)
├── TIMING_SLOT_NAMES.ts                 (slot enum + index map)
└── decodeTimestampBuffer.ts             (BigUint64 → ms, pure, well-tested)

src/@types/gpu/timing/
├── GpuTimingService.d.ts
├── GpuTimingFrame.d.ts
├── TimingSlotName.d.ts
└── TimingFrameContext.d.ts

src/components/DebugPanel/
├── DebugPanel.tsx
├── AssetLoadingSection.tsx
├── GpuTimingsSection.tsx
└── Sparkline.tsx

src/utils/url/
└── urlGate.ts                            (hasUrlGate helper)
```

### Modified

```
src/services/engine/frame/renderFrame.ts  (split mega-pass into 9 passes;
                                           thread timing service in)
src/services/gpu/postProcess.ts           (accept optional timestampWrites)
src/services/gpu/renderers/pickRenderer.ts (accept optional timestampWrites)
src/services/engine/bootstrap/*           (request 'timestamp-query' feature;
                                           construct timing service)
src/components/App/App.tsx                (mount DebugPanel instead of
                                           LoadingDevPanel; use hasUrlGate)
src/services/engine/phases/wireSlots.ts   (use hasUrlGate)
```

### Deleted

```
src/components/LoadingDevPanel/LoadingDevPanel.tsx
```

## Testing strategy

### Unit

- `decodeTimestampBuffer.test.ts` — pure function. Feed it
  BigUint64Array fixtures + a known `timestampPeriod` and verify the
  per-slot millisecond outputs.
- `urlGate.test.ts` — stub `window.location.search` and assert
  `hasUrlGate(name)` returns the expected boolean.
- `Sparkline.test.tsx` — render with known sample arrays, snapshot the
  output string.

### Integration

- `renderFrame.split-pass-equivalence.test.ts` — same approach as the
  visual baseline test from the impostor-split work. Stub the GPU
  device, render N frames pre-split vs post-split, hash-compare the
  draw-command stream byte for byte. Goal: zero rendered-output drift
  from splitting the HDR pass into 9.
- `gpuTimingService.test.ts` — mock device with a feature toggle.
  Verify the no-op path when feature is missing; verify the
  `descriptorFor` index map; verify `endFrame` records the resolve
  calls.

### Manual

- Open with `?gpuTimings` and confirm the panel shows live values.
- Toggle `?volumes` and confirm scalar-volume row populates while
  others adapt.
- Force-hover to fire pick and confirm pick row updates intermittently.
- Test on a Safari adapter (or simulated `features.has` returning
  false) and confirm the panel renders the unavailable message.

## Risks

1. **HDR target draw-order semantics across split passes.** Pre-split,
   the GPU sees one big sequence of additive draws into one render
   pass. Post-split, it sees 8 begin/end render-pass boundaries with
   `loadOp: 'load'` between them. Functionally identical, but it
   theoretically gives the driver more flexibility to flush
   tile/cache between passes. On desktop discrete this is negligible;
   on tile-based mobile, it could be a real cost — out of scope for
   this design but worth flagging.
2. **`timestampPeriod` is per-queue, not per-adapter.** Read it from
   `device.queue` at service construction. Some browsers gate the
   value to a coarse number for fingerprinting; a coarse period
   doesn't break correctness, just resolution.
3. **`mapAsync` on a destroyed device.** If the device is lost
   mid-frame (rare), pending maps reject. The service catches and
   silently drops; subscribers see no frame for that index.
4. **Increased encoder verbosity.** `renderFrame.ts` grows from one
   `beginRenderPass` to nine. Worth refactoring the begin/end loop
   into a small helper inside `renderFrame.ts` if it gets unwieldy.

## Open questions

None blocking implementation. The two design micro-decisions worth
revisiting after first use:

1. Whether to expose `min/max over last N` in the panel in addition
   to rolling average. Easy to add; deferred to v2 to keep v1 small.
2. Whether `texturedImpostorsPass` should be split into
   `textured-quads` + `textured-disks` sub-passes. Currently one slot;
   `instanced-quad` and `textured-disk` pipelines are dispatched in
   sequence inside one pass. Could be valuable to split once we see
   real numbers — query set has headroom.

## Out of scope

- CPU-side timing (RAF-to-RAF wall clock, per-subsystem CPU work). The
  user has `chrome://tracing` for that.
- Histogram views of GPU timings over time.
- Per-draw-call timing within a pass. WebGPU doesn't support it
  standardly; the experimental `timestamp-query-inside-passes`
  feature would be required and we explicitly rejected the
  experimental path.
- Saving / exporting timing data. Live readouts only.

## Next step

After this spec is reviewed and approved, the writing-plans skill
produces the implementation plan at
`docs/superpowers/plans/2026-05-13-gpu-timestamp-query-debug.md`.
