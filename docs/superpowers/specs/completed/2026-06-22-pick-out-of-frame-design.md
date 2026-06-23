# Hover & Click Picking as a Pointer-Driven Service — Design

**Date:** 2026-06-22
**Status:** Draft (awaiting review)

## Problem

GPU picking is currently kicked off from inside the render frame (`runFrame.ts`),
and it does so by **corrupting the visual render's shared uniform buffer**.

`pickRenderer.recordPickPass` reaches into `pointRenderer.uniformBuffer` and
writes three fields in place every pick (`pickRenderer.ts:298–310`):

- `selectedPacked` → none-sentinel (stops the 8× selection-ring scale from
  inflating the hit area),
- `pointSizePx` → padded (`+ PICK_PADDING_PX`),
- `pickPass` → 1 (the shared vertex shader skips procedural-disk crossfade-out
  and the intensity-floor cull, so disk-sized galaxies stay pickable).

The load-bearing comment at `pickRenderer.ts:289` admits the cleanup mechanism:
*"all reset by the next visual frame's full-buffer rewrite."* In other words,
picking scribbles on the visual uniform buffer and **depends on the render loop
to undo the damage on the next frame**. That is why picking is wedged into
`runFrame` right after `queue.submit()`, and why every `pointermove` over the
canvas calls `scheduler.requestRender()` (`inputBindings.ts:110`) — not to
display anything, but to rewrite the buffer the previous pick dirtied. The
"idle CPU at zero on hover" claim in `runFrame.ts:480` is therefore false: a
hover over a static scene re-renders the whole scene (~2.5M points) *and* that
re-render is required to un-corrupt the uniforms.

This is one buffer with two writers, where the cleanup obligation is pushed onto
an unrelated subsystem (the render loop). Both pick callers are affected:

- **Hover pick** — `runFrame.ts:404–491`, fire-and-forget inside the frame.
- **Click pick** — `clickHandler.ts:52` via `runPickAtCss` (`wireInput.ts:237`),
  which calls the same `pickRenderer.pick(...)` and relies on the same
  last-frame-wrote-the-buffer assumption.

A secondary smell rides along: the pick-buffer **debug overlay**
(`runFrame.ts:352–402`) is a whole second render pass (own encoder + submit)
sitting inline in the orchestrator, and it shares `recordPickPass`, so it
corrupts the shared buffer too.

## Goal

Make picking an **independent, pointer-driven concern** that does not touch the
visual render's uniform buffer and does not require a full-scene re-render to
service a hover. Both hover and click converge on one shape.

## Core principle

**Snapshot only what cannot be re-derived live.**

The camera pose is derived exactly once per frame by `runCameraDrivers` — a
single-writer that advances a clock once per frame (`runFrame.ts:124–145`). A
pick triggered at pointer-event time (outside a frame) therefore **cannot**
legally re-derive its own `viewProj`; doing so would re-run the drivers and
corrupt the clock / commit-on-edge logic. So the per-frame camera image is the
*only* thing the pick must capture from the frame.

Everything else a pick needs — the visible-source targets, the viewport size,
the point-size setting — is derivable from live engine state at pick time. The
click path already proves this (`wireInput.ts:253–258` derives its pick mask
fresh at click time, "strictly fresher than the per-frame value").

So the frame hands picking exactly one thing: a CPU copy of the uniform bytes it
last rendered with.

## Architecture

```
                  ┌─ hoverPickDriver (pointermove) ─┐
                  │     targets: derived live        │
 frame tail ──▶ state.picking.lastFrameUniformBytes ─┼─▶ pickRenderer.pick(…, uniformBytes)
                  │     targets: derived live        │        │ uploads bytes to its OWN buffer
                  └─ runPickAtCss (click) ───────────┘        │ + applies the 3 overrides there
                                                              ▼
                                                  async readback → resolvePick → store.dispatch
```

The render loop and picking are connected by **one data handoff** (the uniform
bytes), not by execution ordering inside the frame.

## Components

### 1. `packPointUniforms(viewProj, viewportPx, settings) → ArrayBuffer`

*New pure helper.* `src/utils/gpu/packPointUniforms.ts` (one function per file,
per repo convention).

The 176-byte uniform layout currently inlined in `pointRenderer.draw`
(`pointRenderer.ts:733–775`) is extracted verbatim into this pure function and
becomes the **single source of truth** for the byte layout. `pointRenderer.draw`
calls it instead of packing inline, then uploads the returned buffer as it does
today.

Rationale: the visual write and the pick write must produce byte-identical
images, and a layout mismatch is exactly the class of bug that silently freezes
iOS WebGPU (a malformed uniform → invalid pipeline → dropped frame, no error).
One tested packer makes drift structurally impossible. This is the keystone of
the design's safety.

**Signature** (consumes the existing `PointDrawSettings` shape plus the two
positional args `draw` already takes):

```ts
export function packPointUniforms(
  viewProj: mat4,
  viewportPx: readonly [number, number],
  settings: PointDrawSettings,
): ArrayBuffer;
```

The override fields the pick path needs (`selectedPacked`, `pointSizePx`,
`pickPass`) are written at the existing exported byte offsets
(`SELECTED_PACKED_BYTE_OFFSET`, `POINT_SIZE_BYTE_OFFSET`, `PICK_PASS_BYTE_OFFSET`)
**after** the base upload by the pick renderer — `packPointUniforms` itself packs
the *visual* values (`pickPass = 0`, real `selectedPacked`, unpadded
`pointSizePx`), exactly as `draw` does today.

### 2. PickRenderer owns its uniform buffer

*Change to `src/services/gpu/renderers/pickRenderer.ts`.*

- The factory allocates its own `pickUniformBuffer` (`UNIFORM_BYTES`, usage
  `UNIFORM | COPY_DST`), and builds the @group(0) bind group against it once.
- `pick()` and `renderForDebug()` gain a `uniformBytes: ArrayBuffer` parameter
  (the last frame's packed image). Because a required parameter cannot follow
  the existing optional `pointSizePx?`, `pointSizePx` becomes **required** in the
  new signature (both callers already pass `state.settings.galaxyCatalogs.sizePx`
  unconditionally), with `uniformBytes` required and `timingDescriptor?` the
  trailing optional: `pick(viewportPx, x, y, targets, pointSizePx, uniformBytes,
  timingDescriptor?)`.
- `recordPickPass`:
  - **No longer reads `pointRenderer.uniformBuffer`.**
  - Uploads `uniformBytes` to `pickUniformBuffer` in full
    (`device.queue.writeBuffer(pickUniformBuffer, 0, uniformBytes)`).
  - Applies the **same three overrides** (`selectedPacked` → none, `pointSizePx`
    → `+ PICK_PADDING_PX`, `pickPass` → 1) via `writeBuffer` at the known
    offsets, **onto `pickUniformBuffer`** rather than the shared buffer.
  - Binds `pickUniformBuffer` at @group(0).
- The `pointRenderer` constructor parameter is **dropped** — its only use was
  `pointRenderer.uniformBuffer`. The byte-offset constants and
  `POINT_STRIDE`/`POINT_VERTEX_ATTRIBUTES` remain imported from the
  `pointRenderer` module (static values, no instance coupling).
- `destroy()` also destroys `pickUniformBuffer`.

Because `renderForDebug` shares `recordPickPass`, the **pick-debug overlay is
fixed for free** — it stops corrupting the shared buffer as a side effect.

The existing comment in `pointRenderer.ts:768–773` about `pickRenderer` flipping
`pickPass` "in place" on the shared buffer and the visual frame resetting it is
removed — that contract no longer exists.

### 3. Frame-tail uniform-bytes capture

*Change to the frame.*

The visual point pass already holds `viewProj`, `viewportPx`, and the assembled
`PointDrawSettings` at the moment it draws. After the visual frame's point pass
has packed its uniform image, that same `ArrayBuffer` is stashed on
`state.picking.lastFrameUniformBytes`.

To avoid a layering violation (the renderer must not know about `EngineState`),
`pointRenderer.draw` **returns** the `ArrayBuffer` it packed and uploaded; the
**point sprites pass** (which already touches engine state) stashes that return
value into `state.picking.lastFrameUniformBytes`. So the snapshot is the exact
image the visual frame rendered with — no second pack, and no copy needed (each
frame's `draw` allocates a fresh `ArrayBuffer`, so the stashed reference is
immutable once the frame returns). When the point pass is skipped (no catalogs
loaded), `draw` returns early today; in that case nothing is stashed and the
previous value remains — acceptable, because with zero catalogs there is nothing
to pick (both pick paths gate on `catalogs.size > 0`).

`EnginePickingState` gains:

```ts
/** Packed PointUniforms image from the last visual frame (see
 * packPointUniforms). The pick paths upload this to the pick renderer's
 * own buffer so a pick reproduces the last frame's camera without
 * re-running the per-frame camera drivers. Null until the first frame. */
lastFrameUniformBytes: ArrayBuffer | null;
```

Initialised to `null` at engine bootstrap (`engine.ts` picking-state literal).

### 4. `createHoverPickDriver` — the pointer-driven scheduler

*New module.* `src/services/engine/interaction/hoverPickDriver.ts`.

Owns hover-pick scheduling end to end, decoupled from rAF (the Option-1 model:
the `mapAsync` readback latency, 1–2 frames, is itself the natural throttle —
`pickInFlight` cannot clear until the GPU finishes, so picks physically cannot
fire faster than once per readback regardless of mouse speed).

```ts
function createHoverPickDriver(deps: HoverPickDeps) {
  let latest: CssPx | null = null; // newest pointer pos (every move)
  let picked: CssPx | null = null; // pos of the pick we last kicked

  function onPointerMove(pos: CssPx): void { latest = pos; maybeFire(); }

  function maybeFire(): void {
    if (deps.state.picking.pointerDown) return;        // skip hover picks mid-drag (orbiting, not hovering)
    if (deps.state.picking.pickInFlight) return;       // coalesce
    if (latest === null || latest === picked) return;  // nothing new
    fire(latest);
  }

  function fire(pos: CssPx): void {
    const bytes = deps.state.picking.lastFrameUniformBytes;
    if (bytes === null) return;                         // no frame yet
    const targets = deps.collectTargets();              // derived LIVE
    if (!targets.hasAny) return;
    picked = pos;
    deps.state.picking.pickInFlight = true;
    deps.pickRenderer
      .pick(deps.viewportPx(), cssToTexPx(pos.x), cssToTexPx(pos.y),
            targets.visibleSources, deps.pointSizePx(), bytes, deps.timingDescriptor())
      .then((hit) => deps.store.dispatch(updateSelectionHover(resolvePick(hit, deps.resolveDeps))))
      .finally(() => {
        deps.state.picking.pickInFlight = false;
        maybeFire();                                    // trailing edge: catch the resting pos
      });
  }

  return { onPointerMove };
}
```

The trailing-edge `maybeFire()` inside `.finally` replaces the per-frame retry
the old in-frame loop provided (`latestMouseCss !== lastPickedMouseCss`):
without it, a fast flick followed by a stop would never pick the resting
position (all mid-flight moves dropped, no further `pointermove` to re-trigger).

**No `requestRender()` here** — hover feeds only the React InfoCard text; there
is no hover halo in the rendered scene, so a hover change requires no re-render.
(This was already the documented intent in `runFrame.ts:480`; now it is actually
true, because the trigger no longer wakes a frame either.)

The dep bag (`HoverPickDeps`) carries: `state`, `pickRenderer`, `store`,
`resolveDeps`, and the live-read thunks `collectTargets` / `viewportPx` /
`pointSizePx` / `timingDescriptor`. The thunks keep the driver free of direct
`EngineState` traversal so it stays unit-testable with a fake.

### 5. Click pick re-pointed to the snapshot

*Change to `wireInput.ts:runPickAtCss` + `clickHandler.ts` + the
`ClickResolveInput` type.*

`runPickAtCss` keeps deriving its targets fresh (unchanged) and additionally
reads `state.picking.lastFrameUniformBytes`, passing it through `resolveClick`
→ `pick()`. `ClickResolveInput` gains a `uniformBytes: ArrayBuffer` field.

Behaviour is identical to today: the bytes read equal what the shared buffer
held (the last visual frame's image), only sourced from the CPU copy instead of
the live GPU buffer. If `lastFrameUniformBytes` is `null` (no frame yet), the
click resolves to `null` (background) — the same outcome as a pre-first-frame
click today.

### 6. Input wiring

*Change to `inputBindings.ts` + `wireInput.ts`.*

- `inputBindings.ts` pointermove handler: stop calling
  `scheduler.requestRender()`; call `onPointerMove` (now routed to the hover
  pick driver) only. The `pointerType !== 'mouse'` gate is unchanged.
- `pointerleave` keeps its `requestRender()` (it clears hover state via
  `onPointerLeave`, unrelated to this change).
- `wireInput.ts` constructs the `hoverPickDriver` and wires
  `onPointerMove → hoverPickDriver.onPointerMove`. The driver is a teardown
  target if it holds any disposable state (it does not in Option 1, so a no-op
  `destroy` or none).
- Camera-mutation wakes (`onChange`, `onZoom`, `onGestureEnd` in the orbit
  controls) are **unchanged** — they re-render because the scene actually
  changes.

### 7. `runFrame` slimming

- Delete the hover-pick block (`runFrame.ts:404–491`).
- Extract the pick-debug overlay (`runFrame.ts:352–402`) to a
  `drawPickDebugOverlay(state, ctx, masks, deps)` helper
  (`src/services/engine/frame/drawPickDebugOverlay.ts`). It stays called from
  the frame (it composites on the swap chain, after `renderFrame`'s submit), but
  leaves the orchestrator body. It now passes
  `state.picking.lastFrameUniformBytes` into `renderForDebug`.
- Update the `renderFrame.ts:64` "What stays in `runFrame()`" docblock: hover
  pick is gone; the debug overlay is a helper.
- Remove the now-dead `resolvePick` / `updateSelectionHover` imports from
  `runFrame.ts` (they move to the driver).

## Data flow (end to end)

1. Each visual frame's point pass packs its uniform image via
   `packPointUniforms` and stashes it on `state.picking.lastFrameUniformBytes`.
2. **Hover:** `pointermove` (mouse) → `hoverPickDriver.onPointerMove` → derive
   targets live + read the stashed bytes → `pickRenderer.pick(..., bytes)` →
   own-buffer upload + overrides → readback → `resolvePick` →
   `updateSelectionHover`. Trailing edge catches the resting position. No frame
   wake.
3. **Click:** `onClick` → `runPickAtCss` → derive targets live + read the
   stashed bytes → `resolveClick` → `pickRenderer.pick(..., bytes)` → readback →
   `resolvePick` → `updateSelectionSelect`. Selection change wakes a frame via
   the existing `selectionWakeSaga` (for the halo) — unchanged.
4. **Debug overlay:** when `showPickBuffer` is on, the frame calls
   `drawPickDebugOverlay`, which calls `renderForDebug(..., bytes)` → own-buffer
   upload → composite on the swap chain. No shared-buffer corruption.

## Testing

- **`packPointUniforms`** (pure): byte-for-byte assertions at every written
  offset — viewProj (0), viewportPx (64), `selectedPacked` (80), `pointSizePx`
  (88), `brightness` (92), `camPosWorld` (96), `pxPerRad` (108), the
  highlight/realOnly/depthFade flags, `biasMode` (128), `absMagLimit` (132),
  `pxFadeStart`/`pxFadeEnd` (160/164), and that `pickPass` (168) packs as 0 and
  pad slots stay zero. This is the layout-drift guard.
- **`pickRenderer`**: with a fake `GPUDevice`, assert `pick()` issues its full
  `writeBuffer` against the renderer's **own** buffer and **never** against any
  externally supplied point-renderer buffer (the regression that proves
  decoupling); assert the three override `writeBuffer` calls land at the right
  offsets on the own buffer; assert `pick()` returns `null` when `uniformBytes`
  reflects an empty scene (no targets) and when a pick is already in flight.
- **`hoverPickDriver`** (pure logic, no GPU): drive `onPointerMove` with a fake
  `pick` returning a deferred promise; assert (a) a move while `pickInFlight`
  does not start a second pick, (b) the trailing-edge `maybeFire` fires the
  final resting position after the in-flight pick resolves, (c) `null`
  `lastFrameUniformBytes` is a no-op, (d) an empty-target scene is a no-op, (e)
  the `.then` dispatches `updateSelectionHover` and there is no `requestRender`
  call anywhere in the driver's deps.
- **`runPickAtCss` / click**: assert it threads `lastFrameUniformBytes` into
  `resolveClick`, and resolves to `null` when the bytes are `null`.
- **`renderFrame` integration**: assert the hover-pick block is gone (no pick
  call inside the frame body), `lastFrameUniformBytes` is populated at frame
  tail, and the debug overlay still draws when `showPickBuffer` is on (now via
  the helper).
- **`inputBindings`**: assert mouse `pointermove` no longer calls
  `requestRender` and does call `onPointerMove`; `pointerleave` still wakes.

## Out of scope

- The pick *encoding* / resolution boundary (`resolvePick`,
  `selectionEncoding`) — unchanged.
- The pick GPU pipeline / WGSL shaders — unchanged (same vertex module, same
  `r32uint` target, same depth state).
- Touch/pen interaction — unchanged (the mouse-only gate stays).
- Double-click → focus — unchanged (reads the already-written select ref).
- Sharing a single throttle/coalescer between hover and click — click stays a
  one-shot per user click (no throttle), as today.

## Risks & mitigations

- **Byte-layout drift between visual and pick writes** → mitigated by the single
  `packPointUniforms` source of truth + byte-level unit test. This is the
  highest-severity risk (silent wrong picks or an iOS canvas freeze) and the
  reason the packer extraction is non-negotiable.
- **Stale camera in the snapshot** → not a real risk: a static hover reuses the
  last frame's pose (camera unchanged since), and a moving camera is running
  frames that refresh the snapshot every tick; drags are gated out of hover via
  `pointerDown`.
- **First-pick-before-first-frame** → `lastFrameUniformBytes === null` resolves
  to background for both hover and click, matching today's pre-first-frame
  behaviour.
- **Dropped `pointermove → requestRender` breaking some other consumer** →
  verified the canvas pointermove handler exists *only* to feed the hover pick
  (`inputBindings.ts:106`); no other consumer depends on that wake.
