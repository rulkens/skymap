# Pick out of frame: picking as a pointer-driven service

> **Spec:** [`docs/superpowers/specs/2026-06-22-pick-out-of-frame-design.md`](../specs/2026-06-22-pick-out-of-frame-design.md). This plan implements exactly that spec — read it first; it carries the rationale, the byte-offset table, the out-of-scope list, and the risk analysis.
>
> **REQUIRED SUB-SKILL.** Execute this plan with `superpowers:subagent-driven-development` — a fresh implementer subagent per task, dispatched `run_in_background: true`. The main thread runs `npm test` / `npm run typecheck` and commits; implementers only edit. Tick each task's `- [ ]` to `- [x]` in the same response as the TaskUpdate. Front-load constraints in every dispatch (sequential bash, Read/Grep not sed/awk/grep, absolute worktree paths, typed `vi.fn`). Implementers: if a clean implementation is blocked, STOP and report — don't hack around it.

## Goal

Sever the shared-buffer corruption that wedges picking into the render frame. Today `pickRenderer.recordPickPass` scribbles three fields into `pointRenderer.uniformBuffer` (`pickRenderer.ts:298-310`) and depends on the next visual frame to undo the damage — which is why a hover over a static scene re-renders ~2.5M points (`inputBindings.ts:110`'s `requestRender`) and why both pick paths must run *after* `queue.submit()`.

After this plan: the frame hands picking **one** thing — a CPU copy of the uniform bytes it last rendered with (`state.picking.lastFrameUniformBytes`). The pick renderer uploads that to its **own** uniform buffer and applies the three overrides there. Targets and viewport stay **derived live** at pick time (the click path already proves this is correct). Hover becomes a pointer-driven driver with an in-flight coalescer + trailing-edge fire — no rAF, no `requestRender`.

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

The render loop and picking are connected by **one data handoff** (the uniform bytes), not by execution ordering inside the frame.

**The keystone is `packPointUniforms`** (Task 1): the 176-byte layout currently inlined in `pointRenderer.draw` (`pointRenderer.ts:733-775`) becomes one tested pure function. The visual write and the pick write must produce byte-identical images — a layout mismatch is the exact class of bug that silently freezes iOS WebGPU (malformed uniform → invalid pipeline → dropped frame, no error). One packer makes drift structurally impossible.

**Ordering rationale.** The risky coupling (the two-writer buffer) is removed in Task 4, but only *after* the packer exists (Task 1), the snapshot field exists (Task 2), and the frame stashes into it (Task 3). Each task is independently green: Tasks 1-3 are additive (the old in-frame pick still reads `pointRenderer.uniformBuffer`); Task 4 flips the pick renderer onto its own buffer and the callers onto the snapshot; Tasks 5-8 move the trigger out of the frame; Task 9 is the entanglement-radar review. The suite stays green at every task boundary.

## Tech stack

TypeScript + Vitest, raw WebGPU. No new dependencies. **No WGSL change** — the pick pipeline, `r32uint` target, depth state, and vertex module are untouched (the bytes are identical; only their source buffer moves). The on-disk binary format is untouched.

## Global Constraints

- One function per file in `src/utils/` (filename = export name); one type per file in `src/@types/` (filename = type name); deep relative imports, no barrels.
- Use `Vec2`/`Vec3` aliases from `src/@types/math`, never raw tuples, in any new TS.
- Tests: typed `vi.fn<() => void>()`, never bare `vi.fn()` (bare fails tsc against typed callback fields).
- Didactic comments (why + the alternative the design rejected), `type` not `interface`.
- Commands: `npm test` (vitest run), `npm run typecheck` (both src + tools tsconfigs). Keep the full suite green at every task boundary (baseline 590+ tests; the real number is higher — state "full suite green", not a hard count).
- **The byte layout has ONE source of truth (`packPointUniforms`).** The visual write and the pick write MUST produce byte-identical images. Never re-inline the packing, and never widen `PointDrawSettings` without a matching `packPointUniforms` edit + offset-table test.
- **Do not re-braid.** This work *removes* couplings — preserve that. Specifically: the pick path must NOT read `pointRenderer.uniformBuffer` again (it owns its own buffer now); the hover driver must NOT snapshot the live-derivable targets/viewport (only `lastFrameUniformBytes` is snapshotted); hover must NOT call `requestRender`. Each task that touches the boundary repeats the relevant "don't re-braid" line.
- Stage specific paths — never `git add -A` / `git add .`. Prettier only touched files. Implementers run bash sequentially and use Read/Grep, not sed/awk/grep.

---

## Task 1: Extract `packPointUniforms` (the byte-layout single source of truth)

**Files:** `src/utils/gpu/packPointUniforms.ts` (new), `src/services/gpu/renderers/pointRenderer.ts` (modify `draw`, export `UNIFORM_BYTES`), `src/@types/rendering/PointRenderer.d.ts` (modify `draw` return type), `tests/utils/gpu/packPointUniforms.test.ts` (new). The byte-offset consts stay in `pointRenderer` (already exported at `:154-156`); no new offsets type file.

**Signature** (consumes the existing `PointDrawSettings` shape plus the two positional args `draw` already takes; mirrors `draw`'s current arg list):

```ts
export function packPointUniforms(
  viewProj: mat4,
  viewportPx: readonly [number, number],
  settings: PointDrawSettings,
): ArrayBuffer;
```

**Behaviour:** allocates `new ArrayBuffer(UNIFORM_BYTES)` (176) and writes the *visual* values exactly as `pointRenderer.draw` does today at `pointRenderer.ts:733-773` — `pickPass` packs as **0**, real `selectedPacked`, **unpadded** `pointSizePx`, pad slots stay zero. It is the override-free packer; the pick renderer applies its three overrides *after* the upload (Task 4). `mat4` is imported the same way `pointRenderer.ts` imports it (gl-matrix ambient type — check the existing import at the top of `pointRenderer.ts`).

`pointRenderer.draw` is repointed: call `packPointUniforms(viewProj, viewportPx, settings)`, `device.queue.writeBuffer(uniformBuffer, 0, buf)` as today, and **return** the `ArrayBuffer` (Task 3 stashes it). `draw` currently returns `void` and early-returns `return;` when `galaxyCatalogs.size === 0` (`pointRenderer.ts:728`) — that early branch returns `null` now (no bytes packed this frame). Make the new return type `ArrayBuffer | null` in both the impl and `PointRenderer.d.ts:86-91`.

**`UNIFORM_BYTES`** is currently a module-private const (`pointRenderer.ts:211`, no `export`). Add `export` so `packPointUniforms` and the pick renderer share the one definition (constraint: one source of truth for the size, same as the offset consts already exported at `:154-156`).

**Do not re-braid:** `packPointUniforms` knows nothing about EngineState, the pick path, or overrides — it is a pure packer. Keep it that way.

- [ ] Write `tests/utils/gpu/packPointUniforms.test.ts` first (failing). Assert, against a known `viewProj`/`viewportPx`/`settings` fixture, the bytes at every written offset by reading the result through `Float32Array`/`Uint32Array` views:
  - viewProj at float index 0 (16 floats) equals the input matrix.
  - `viewportPx.x`/`.y` at byte 64/68 (float index 16/17).
  - `selectedPacked` (u32) at byte 80 (`SELECTED_PACKED_BYTE_OFFSET`).
  - `pointSizePx` at byte 88 (`POINT_SIZE_BYTE_OFFSET`), `brightness` at byte 92.
  - `camPosWorld` x/y/z at bytes 96/100/104; `pxPerRad` at byte 108.
  - `highlightFallback`/`realOnlyMode`/`depthFadeEnabled` flags at bytes 112/116/120 (1/0).
  - `biasMode` (u32) at byte 128; `absMagLimit` at byte 132.
  - `pxFadeStart`/`pxFadeEnd` at bytes 160/164.
  - `pickPass` at byte 168 (`PICK_PASS_BYTE_OFFSET`) packs as **0**; the pad slots (84, 124, the reserved Schechter floats, 172) stay **0**.
  - The returned buffer's `byteLength === UNIFORM_BYTES` (176).
- [ ] Confirm the test names map to the spec's "Testing" → `packPointUniforms` bullet (every written offset is the layout-drift guard).
- [ ] Run `npm test -- packPointUniforms` → fails (module missing).
- [ ] Implement `packPointUniforms` (move the packing body out of `draw` verbatim). Export `UNIFORM_BYTES`. Repoint `draw` to call it + return the buffer; change `draw`'s return to `ArrayBuffer | null`. Update `PointRenderer.d.ts` `draw` return type + the early-return-null docnote. Remove the now-stale `pointRenderer.ts:768-773` comment about pickRenderer flipping `pickPass` "in place" (that contract dies in Task 4 — but the comment about the *visual* pack writing `pickPass = 0` can stay; just drop the "pickRenderer flips it / visual frame resets it" sentence).
- [ ] `npm test -- packPointUniforms pointRenderer` green; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 2: `EnginePickingState.lastFrameUniformBytes`

**Files:** `src/@types/engine/state/EnginePickingState.d.ts` (modify), `src/services/engine/engine.ts` (`:238-244` picking literal), `tests/...` — no new test (the field is populated/consumed by Tasks 3-8 whose tests cover it; tsc + the bootstrap literal are the gate).

**Type addition** (didactic docblock per spec §3):

```ts
/**
 * Packed PointUniforms image from the last visual frame (see
 * packPointUniforms). The pick paths upload this to the pick renderer's
 * own buffer so a pick reproduces the last frame's camera without
 * re-running the per-frame camera drivers. Null until the first frame.
 */
lastFrameUniformBytes: ArrayBuffer | null;
```

Initialise to `null` in the `engine.ts` picking literal (`:238`).

**Interfaces — Produces:** `state.picking.lastFrameUniformBytes: ArrayBuffer | null` (read by Tasks 3, 4, 5, 6, 8).

- [ ] Add the field + docblock to `EnginePickingState.d.ts:40-45`.
- [ ] Add `lastFrameUniformBytes: null` to the `engine.ts` picking literal.
- [ ] `npm run typecheck` clean; `npm test` full suite green (no behaviour change yet).
- [ ] Commit.

---

## Task 3: Point sprites pass stashes the packed bytes

**Files:** `src/services/engine/frame/passes/pointSpritesPass.ts` (modify the `draw` body at `:88-118`), `tests/services/engine/frame/passes/passes.test.ts` (the `pointSpritesPass.draw` describe block — match the existing style there).

The pass already calls `renderer.draw(pass, vp, [width, height], { … })`. Capture the return value and stash it: `const bytes = renderer.draw(...); if (bytes !== null) state.picking.lastFrameUniformBytes = bytes;`.

**Why the pass, not the renderer:** the renderer must not know about `EngineState` (layering). The pass already reaches `state`, so the stash lives here. No second pack, no copy — `draw` allocates a fresh `ArrayBuffer` each frame, so the stashed reference is immutable once the frame returns. When the point pass packs nothing (zero catalogs → `draw` returns `null`), the previous value remains; acceptable because both pick paths gate on `catalogs.size > 0`.

**Do not re-braid:** stash ONLY the returned bytes. Do not also snapshot targets, viewport, or anything else into picking state.

**Interfaces — Consumes:** `PointRenderer.draw` returns `ArrayBuffer | null` (Task 1). **Produces:** populates `state.picking.lastFrameUniformBytes` (Task 2).

- [ ] In `passes.test.ts`, add a test `pointSpritesPass.draw stashes the packed uniform bytes onto state.picking.lastFrameUniformBytes` — drive a `draw` whose stubbed `renderer.draw` returns a sentinel `ArrayBuffer`, assert `state.picking.lastFrameUniformBytes === thatBuffer`. Add a sibling test asserting a `null` return leaves the prior value untouched. Extend the existing `STATE_STUB` with a `picking: { lastFrameUniformBytes: null, … }` slice.
- [ ] Run `npm test -- passes` → the new tests fail.
- [ ] Implement the stash in `pointSpritesPass.draw`.
- [ ] `npm test -- passes` green; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 4: PickRenderer owns its uniform buffer (the decoupling)

**Files:** `src/services/gpu/renderers/pickRenderer.ts` (modify), `src/@types/rendering/PickRenderer.d.ts` (modify `pick` + `renderForDebug` signatures), `src/services/engine/phases/wireInput.ts` (`:76-96` drop the `renderer` arg to `createPickRenderer`), `src/@types/rendering/PointRenderer.d.ts` (`:75-84` delete the `@internal uniformBuffer` field), `src/services/gpu/renderers/pointRenderer.ts` (stop exposing `uniformBuffer` on the public `PointRenderer` object — keep the local `uniformBuffer` binding `draw`/`destroy` use), `tests/services/gpu/renderers/pickRenderer.test.ts` + `pickRenderer.diskPick.test.ts` + `pickRenderer.structure.test.ts` (modify), `src/services/engine/interaction/clickHandler.ts` (thread `uniformBytes` through `resolveClick` → `pick` — see Task 6 for the type; sequence Task 6 *with* this if the signatures must land together, but the override-on-own-buffer change here is independent of the click *caller*).

**The change.** Per spec §2:

- The factory allocates `pickUniformBuffer = device.createBuffer({ size: UNIFORM_BYTES, usage: UNIFORM | COPY_DST })` and builds the @group(0) bind group against it **once** at construction (drop the per-pass `device.createBindGroup` at `pickRenderer.ts:334-338`; bind the prebuilt group in `recordPickPass`).
- `pick()` and `renderForDebug()` gain a `uniformBytes: ArrayBuffer` parameter. Because a required param can't follow the existing optional `pointSizePx?`, **`pointSizePx` becomes required** and `uniformBytes` required, with `timingDescriptor?` trailing:

```ts
pick(
  viewportPx: Vec2, pickXPx: number, pickYPx: number,
  sources: Iterable<PickSourceDraw>,
  pointSizePx: number,
  uniformBytes: ArrayBuffer,
  timingDescriptor?: GPURenderPassTimestampWrites,
): Promise<PickResult | null>;

renderForDebug(
  viewportPx: Vec2, sources: Iterable<PickSourceDraw>,
  pointSizePx: number, uniformBytes: ArrayBuffer,
): GPUTexture | null;
```

Both existing callers already pass `state.settings.galaxyCatalogs.sizePx` unconditionally (`runFrame.ts:462`, `wireInput.ts:268`, `runFrame.ts:378`), so requiring `pointSizePx` is safe.
- `recordPickPass`:
  - **No longer reads `pointRenderer.uniformBuffer`** — delete the `const sharedUniformBuffer = pointRenderer.uniformBuffer;` at `:284`.
  - First `device.queue.writeBuffer(pickUniformBuffer, 0, uniformBytes)` — full upload of the last frame's image.
  - Then the **same three overrides** at the known offsets, **onto `pickUniformBuffer`**: `selectedPacked` → `SELECTION_NONE_SENTINEL` (byte `SELECTED_PACKED_BYTE_OFFSET`), `pointSizePx + PICK_PADDING_PX` (byte `POINT_SIZE_BYTE_OFFSET`), `pickPass` → 1 (byte `PICK_PASS_BYTE_OFFSET`). `pointSizePx` is now always defined, so drop the `if (pointSizePx !== undefined)` guard at `:303`.
  - Bind the prebuilt `pickUniformBuffer` bind group at @group(0).
  - `recordPickPass`'s own `pointSizePx` param becomes `number` (no longer `| undefined`).
- **Drop the `pointRenderer` constructor parameter** (`createPickRenderer`'s 2nd arg at `pickRenderer.ts:69`). Keep importing `POINT_STRIDE`, `POINT_VERTEX_ATTRIBUTES`, and the byte-offset consts plus `UNIFORM_BYTES` from the `pointRenderer` *module* (static values, no instance coupling). Remove the now-unused `import type { PointRenderer }`.
- `destroy()` also `pickUniformBuffer.destroy()`.
- Update the module header (`pickRenderer.ts:14-18`) and the `PickRenderer.d.ts` "Uniform buffer contract" JSDoc (`:44-53`): the pick pass uploads the passed `uniformBytes` to its OWN buffer; it no longer reads the point renderer's buffer; callers pass last-frame's packed image.
- `wireInput.ts`: drop the `renderer` arg from the `createPickRenderer(...)` call (`:76-96`). The `renderer` local is still used for the `!renderer` guard at `:70` and for `createPickRenderer`'s removal — verify it's still referenced (it is, via the guard); keep it.
- `PointRenderer`: delete the public `uniformBuffer` field (`PointRenderer.d.ts:75-84`) and stop assigning it on the returned object in `pointRenderer.ts` (the `const renderer: PointRenderer = { … }` literal at `:827`). The local `uniformBuffer` GPUBuffer binding stays — `draw` writes it and `destroy` frees it.

**Do not re-braid:** this IS the decoupling. The pick renderer must never again reach into another renderer's buffer. Two writers on one buffer is the bug being deleted.

**Interfaces — Consumes:** `state.picking.lastFrameUniformBytes` (the `uniformBytes` arg, threaded by Tasks 5/6/8); `UNIFORM_BYTES` export (Task 1). **Produces:** the new `pick`/`renderForDebug` signatures (consumed by Tasks 5, 6, 8); `createPickRenderer` drops its `pointRenderer` arg (consumed by `wireInput`).

- [ ] In `pickRenderer.test.ts`: rewrite the construction test (`:69` "takes a PointRenderer at construction") to assert `createPickRenderer` no longer takes a point renderer. Add the **decoupling regression test**: with the stub device, call `pick(..., uniformBytes)` and assert (a) the renderer's `writeBuffer` is called with the renderer's OWN pick uniform buffer (the one returned by its own `createBuffer`, NOT any externally supplied buffer — there is no external buffer anymore), and (b) the three override `writeBuffer` calls land at `SELECTED_PACKED_BYTE_OFFSET` / `POINT_SIZE_BYTE_OFFSET` / `PICK_PASS_BYTE_OFFSET` with `SELECTION_NONE_SENTINEL` / `pointSizePx + PICK_PADDING_PX` / `1`. Add a test asserting `pick` returns `null` for an empty scene (no targets) and when a pick is already in flight (drive a deferred `mapAsync`). Thread the new `pointSizePx` (required) + `uniformBytes` args through every existing `pick(...)` call in all three pickRenderer test files.
- [ ] Run `npm test -- pickRenderer` → fails.
- [ ] Implement the own-buffer change in `pickRenderer.ts`; update both type files; update `wireInput.ts` + `pointRenderer.ts` (drop the public `uniformBuffer`); thread `uniformBytes` through `clickHandler.resolveClick` → `pick` (the `ClickResolveInput.uniformBytes` field is added in Task 6 — if landing Task 4 first, pass a placeholder `args.uniformBytes` and let Task 6 add the field; OR fold Task 6's type edit into this task. Prefer folding the `ClickResolveInput.uniformBytes` field + the `clickHandler` thread here so the suite is green, and let Task 6 wire the *reader* in `wireInput`).
- [ ] `npm test -- pickRenderer clickHandler` green; `npm run typecheck` clean (the dropped `uniformBuffer` field will surface any stray reader as a tsc error — fix at the source).
- [ ] `grep -rn "uniformBuffer" src/services/gpu/renderers/pickRenderer.ts` shows only `pickUniformBuffer`; `grep -rn "\.uniformBuffer" src/` shows no consumer reading a point-renderer buffer.
- [ ] Commit.

---

## Task 5: `createHoverPickDriver` — the pointer-driven scheduler

**Files:** `src/services/engine/interaction/hoverPickDriver.ts` (new), `src/@types/engine/interaction/HoverPickDeps.d.ts` (new), `tests/services/engine/interaction/hoverPickDriver.test.ts` (new).

**Type** (`HoverPickDeps.d.ts`, one type per file). The dep bag carries `state`, `pickRenderer`, `store`, `resolveDeps`, and live-read thunks so the driver never traverses `EngineState` directly (keeps it unit-testable with a fake):

```ts
export type HoverPickDeps = {
  readonly state: { picking: EnginePickingState };
  readonly pickRenderer: PickRenderer;
  readonly store: { dispatch: (action: unknown) => void };
  readonly resolveDeps: ResolvePickDeps;
  /** Live-derived pick targets at fire time (same rule as the click path). */
  readonly collectTargets: () => PickTargets;
  /** Physical canvas size in backing-store px. */
  readonly viewportPx: () => Vec2;
  /** Current `state.settings.galaxyCatalogs.sizePx`. */
  readonly pointSizePx: () => number;
  /** GPU-timing descriptor for the 'pick' slot (or undefined). */
  readonly timingDescriptor: () => GPURenderPassTimestampWrites | undefined;
};
```

(Import `EnginePickingState`, `PickRenderer`, `ResolvePickDeps`, `PickTargets` (from `collectPickTargets.ts`), `Vec2` deep-relative. `store` is typed structurally to keep the test fake light — match the narrowest shape that compiles against the real store's `dispatch`.)

**Module** (`hoverPickDriver.ts`) — the Option-1 model (the `mapAsync` readback latency is itself the throttle: `pickInFlight` can't clear until the GPU finishes). The driver is the spec §4 shape; the implementer writes the body from the test + the spec's reference sketch (spec §4, `pick-out-of-frame-design.md:196-227`):

```ts
export function createHoverPickDriver(deps: HoverPickDeps): {
  onPointerMove(pos: CssPx): void;
};
```

`CssPx` (`src/@types/input/CssPx.d.ts`, `{ x: number; y: number }`) is the CSS-pixel position the `onPointerMove` input callback already delivers (`AttachEngineInputsOptions.d.ts:19`) — use it; do NOT use `MousePos`, which exists only for the `latestMouseCss`/`lastPickedMouseCss` dedupe that Task 8 removes. Internal logic per spec: `latest`/`picked` locals; `onPointerMove` records `latest` then `maybeFire()`; `maybeFire` returns early if `pickInFlight` or `latest === picked` or `latest === null`; `fire` reads `state.picking.lastFrameUniformBytes` (null → no-op), derives targets via `collectTargets()` (`!hasAny` → no-op), sets `picked`/`pickInFlight`, calls `pickRenderer.pick(viewportPx(), cssToTexPx(pos.x), cssToTexPx(pos.y), targets.visibleSources, pointSizePx(), bytes, timingDescriptor())`, then `.then(hit → store.dispatch(updateSelectionHover(resolvePick(hit, resolveDeps))))` and `.finally(→ { pickInFlight = false; maybeFire() })`.

**Trailing edge:** the `maybeFire()` inside `.finally` replaces the per-frame retry the old in-frame loop gave (`latestMouseCss !== lastPickedMouseCss`). Without it, a fast flick + stop never picks the resting position (all mid-flight moves dropped, no further `pointermove`).

**No `requestRender()` here.** Hover feeds only the React InfoCard; there is no hover halo in the scene, so a hover change requires no re-render. The driver's deps contain no scheduler.

**Do not re-braid:** snapshot nothing. `collectTargets`/`viewportPx`/`pointSizePx` are live thunks; only `lastFrameUniformBytes` is the snapshot, and it's read off `state`, not captured.

**Interfaces — Consumes:** `pickRenderer.pick(..., pointSizePx, uniformBytes, timingDescriptor?)` (Task 4); `state.picking.lastFrameUniformBytes` (Task 2); `resolvePick` + `updateSelectionHover` (existing); `cssToTexPx` (existing helper). **Produces:** `createHoverPickDriver` (consumed by Task 7's `wireInput`).

- [ ] Write `hoverPickDriver.test.ts` first (failing), pure-logic with a fake `pick` returning a controllable deferred promise (no GPU). Tests (map 1:1 to spec "Testing" → `hoverPickDriver`):
  - `a move while a pick is in flight does not start a second pick` (one `pick` call after two rapid moves).
  - `the trailing-edge maybeFire fires the resting position after the in-flight pick resolves` (resolve the deferred, assert a second `pick` at the latest pos).
  - `null lastFrameUniformBytes is a no-op` (no `pick` call).
  - `an empty-target scene is a no-op` (`collectTargets` → `hasAny: false`, no `pick` call).
  - `the resolved pick dispatches updateSelectionHover` (assert `store.dispatch` got the `updateSelectionHover(resolvePick(...))` action).
  - `the driver never calls requestRender` (assert no scheduler in deps / no requestRender invoked — structural: the deps bag has no scheduler field).
- [ ] Run `npm test -- hoverPickDriver` → fails.
- [ ] Implement `HoverPickDeps.d.ts` + `hoverPickDriver.ts`.
- [ ] `npm test -- hoverPickDriver` green; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 6: Click path reads the snapshot

**Files:** `src/@types/engine/ClickResolveInput.d.ts` (add `uniformBytes` — if not already added in Task 4, add it here), `src/services/engine/phases/wireInput.ts` (`runPickAtCss` at `:237-278` reads `state.picking.lastFrameUniformBytes` + threads it into `resolveClick`; the `onClick` wiring at `:329` unchanged), `src/services/engine/interaction/clickHandler.ts` (already threads `args.uniformBytes` into `pick` from Task 4), `tests/services/engine/interaction/clickHandler.test.ts` (modify).

**Type addition** (`ClickResolveInput.d.ts`):

```ts
/**
 * The packed PointUniforms image from the last visual frame
 * (state.picking.lastFrameUniformBytes). Forwarded to pickRenderer.pick,
 * which uploads it to its own buffer and applies the pick overrides — so
 * the click reproduces the last frame's camera without re-running the
 * per-frame camera drivers.
 */
uniformBytes: ArrayBuffer;
```

`runPickAtCss`: after the `collectPickTargets` gate, read `const bytes = state.picking.lastFrameUniformBytes;` and `if (bytes === null) return null;` (no frame yet → background, matching today's pre-first-frame behaviour). Pass `uniformBytes: bytes` into the `cr.resolveClick({ … })` literal (`:261-277`).

**Behaviour parity:** the bytes read equal what the shared buffer held (the last visual frame's image), only sourced from the CPU copy. Targets stay derived fresh (`deriveSourceMasks(state).pick` at `:255`) — unchanged.

**Do not re-braid:** the click keeps deriving its targets live. Only the *camera bytes* come from the snapshot.

**Interfaces — Consumes:** `state.picking.lastFrameUniformBytes` (Task 2); `ClickResolveInput.uniformBytes` (this task / Task 4); `pick(..., uniformBytes, …)` (Task 4).

- [ ] In `clickHandler.test.ts`, add `resolveClick threads uniformBytes into pickRenderer.pick` (assert the `pick` mock's 6th arg === the passed `uniformBytes`). Thread `uniformBytes` into every existing `resolveClick({ … })` fixture in that file.
- [ ] Run `npm test -- clickHandler` → fails (if the field/thread aren't in yet).
- [ ] Add the `ClickResolveInput.uniformBytes` field (if not from Task 4); wire `runPickAtCss` to read + thread the snapshot + null-guard.
- [ ] `npm test -- clickHandler` green; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 7: Input wiring — pointermove stops waking the frame

**Files:** `src/services/engine/interaction/inputBindings.ts` (`:99-111` pointermove handler), `src/services/engine/phases/wireInput.ts` (construct the driver; wire `onPointerMove → hoverPickDriver.onPointerMove` at `:190-192`), `tests/services/engine/interaction/inputBindings.test.ts` (modify).

- `inputBindings.ts` pointermove handler: **delete the `scheduler.requestRender()` call** at `:110`. Keep the `pointerType !== 'mouse'` gate (`:108`) and the `onPointerMove({ x, y })` call. Update the module-header comment block (`:91-97`) — the pointermove listener feeds the hover pick driver; it no longer wakes the loop because hover requires no re-render.
- `pointerleave` keeps its `requestRender()` (`:117-120`) — it clears hover state, unrelated to this change.
- `wireInput.ts`: construct `const hoverPickDriver = createHoverPickDriver({ … })` with the dep bag (state slice, `state.gpu.pickRenderer`, `store`, `resolveDeps: { structures: state.data.structures }`, and the live thunks: `collectTargets: () => collectPickTargets(renderer, deriveSourceMasks(state).pick, state.gpu.structureMarkerRenderer, milkyWayPickVisible(state))`, `viewportPx: () => [canvas.width, canvas.height]`, `pointSizePx: () => state.settings.galaxyCatalogs.sizePx`, `timingDescriptor: () => state.gpu.timingService.descriptorFor('pick')`). The driver must be constructed *after* `state.gpu.pickRenderer` is assigned (`:97`). Wire the `attachEngineInputs` `onPointerMove` callback (`:190-192`) to call `hoverPickDriver.onPointerMove(cssPx)` (it currently only sets `state.picking.latestMouseCss`; the driver supersedes that throttle — but check whether `latestMouseCss` is still read anywhere after Task 8 removes the in-frame block; if not, it can be removed in Task 8).
- The driver holds no disposable state (Option 1), so no `destroy` is needed; if `attachEngineInputs`/teardown expects a handle, a no-op is fine.

**Do not re-braid:** the pointermove path must not wake a frame. The whole point is that hover no longer requires a re-render.

**Interfaces — Consumes:** `createHoverPickDriver` (Task 5); `collectPickTargets` / `deriveSourceMasks` / `milkyWayPickVisible` (existing). **Produces:** the live trigger that replaces the in-frame hover block (removed in Task 8).

- [ ] In `inputBindings.test.ts`, add/modify: `mouse pointermove does NOT call scheduler.requestRender` and `mouse pointermove calls onPointerMove`; keep `pointerleave still calls requestRender`. (The existing wake-ownership tests at the "Wake ownership" coverage area, `:13-15`, are the place to edit.)
- [ ] Run `npm test -- inputBindings` → the no-requestRender test fails (it currently wakes).
- [ ] Remove the `requestRender()` from the pointermove handler; construct + wire the driver in `wireInput.ts`.
- [ ] `npm test -- inputBindings` green; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 8: `runFrame` slimming + `drawPickDebugOverlay` extraction

**Files:** `src/services/engine/frame/runFrame.ts` (delete hover block `:404-491`; extract debug overlay `:352-402`; remove dead imports `:57-59,66`), `src/services/engine/frame/drawPickDebugOverlay.ts` (new), `src/services/engine/frame/renderFrame.ts` (update the "What stays in `runFrame()`" docblock `:64-71`), `tests/services/engine/frame/renderFrame.test.ts` + `renderFrame.timing.test.ts` + any `runFrame` test (modify).

- **Delete the hover-pick block** (`runFrame.ts:404-491`) entirely — the driver (Task 5/7) owns it now.
- **Extract the pick-debug overlay** (`runFrame.ts:352-402`) to `drawPickDebugOverlay(state, ctx, masks, deps)` in its own module. It still runs from the frame (composites on the swap chain, after `renderFrame`'s submit), but leaves the orchestrator body. Inside, it now passes `state.picking.lastFrameUniformBytes` into `renderForDebug(...)` (the 4th required arg, Task 4) — and must null-guard: if `lastFrameUniformBytes === null`, skip (no frame yet). The signature: pick the narrowest dep shape the overlay needs (device, context/swap-chain getter, `pickRenderer`, `pickDebugOverlay`, canvas, `collectPickTargets` inputs) — mirror how the inline block reads them today.
- **Remove now-dead imports** from `runFrame.ts`: `resolvePick` (`:57`), `updateSelectionHover` (`:66`) move to the driver; `collectPickTargets` / `milkyWayPickVisible` / `cssToTexPx` are now used only by `drawPickDebugOverlay` (move with it) and by `wireInput` (already imported there) — verify each import in `runFrame.ts` has no remaining user before deleting. If `state.picking.latestMouseCss` / `lastPickedMouseCss` are now unread anywhere, remove them from `EnginePickingState` + the `engine.ts` literal too (check with grep first).
- **Update the `renderFrame.ts:64-71` docblock** ("What stays in `runFrame()`"): hover pick is gone; the pick-debug overlay is now a helper (`drawPickDebugOverlay`), still called from the frame.

**Do not re-braid:** the debug overlay reads the snapshot bytes like the pick paths — it must NOT reach into any point-renderer buffer (that buffer is no longer public after Task 4).

**Interfaces — Consumes:** `state.picking.lastFrameUniformBytes` (Task 2); `renderForDebug(..., uniformBytes)` (Task 4). **Produces:** `drawPickDebugOverlay` (called from `runFrame`).

- [ ] In `renderFrame.test.ts` (or the `runFrame` test if separate), add/modify: `the frame body issues no hover pick` (assert no `pickRenderer.pick` call inside the frame), `lastFrameUniformBytes is populated at frame tail` (covered via the point-sprites stash — assert the value is set after a frame), and `the pick-debug overlay still draws when showPickBuffer is on` (now via `drawPickDebugOverlay`, passing the snapshot bytes). Add a `drawPickDebugOverlay` unit test if the helper warrants one (null-bytes → no draw; non-null → `renderForDebug` called with the bytes).
- [ ] Run the relevant tests → the new assertions fail (hover block still present).
- [ ] Delete the hover block; extract `drawPickDebugOverlay`; remove dead imports + (if unread) the `latestMouseCss`/`lastPickedMouseCss` fields; update the docblock.
- [ ] `npm test -- renderFrame runFrame` green; `npm run typecheck` clean (both tsconfigs); full `npm test` green.
- [ ] `grep -rn "resolvePick\|updateSelectionHover\|latestMouseCss" src/services/engine/frame/runFrame.ts` is empty.
- [ ] Commit.

---

## Task 9: Entanglement-radar review (review task, no code)

**This is a review pass, not a code change.** Run the `entanglement-radar` skill/lens over the whole branch diff (`git diff main...HEAD`). Confirm the decomplection actually happened and no new accidental coupling was introduced. Per `docs/superpowers/conventions/simplicity.md`.

- [ ] The shared-buffer **two-writer coupling is gone**: `grep -rn "pointRenderer.uniformBuffer\|\.uniformBuffer" src/` shows no cross-renderer reader; `PointRenderer` no longer exposes `uniformBuffer`; the pick renderer writes only its own `pickUniformBuffer`.
- [ ] `packPointUniforms` is the **sole packer**: the 176-byte layout is inlined nowhere else (`grep -rn "ArrayBuffer(UNIFORM_BYTES)\|new Float32Array(buf)" src/` points only at `packPointUniforms.ts`); the offset-table test is present.
- [ ] **No re-braid**: the hover driver snapshots only `lastFrameUniformBytes` (targets/viewport/pointSize stay live thunks); the click path still derives targets fresh; hover does not call `requestRender`.
- [ ] **No new accidental coupling**: `drawPickDebugOverlay`'s dep bag is the narrowest shape it needs (not the whole `RunFrameDeps` if avoidable); `HoverPickDeps` is thunks-not-EngineState; no renderer imports `EngineState`.
- [ ] Capture any finding as a follow-up note in the plan (or fix inline if trivial + green).

---

## Definition of Done

- [ ] `npm test` — full suite green, no pass-count reduction, output pristine.
- [ ] `npm run typecheck` clean (both src + tools tsconfigs).
- [ ] **The decoupling regression test is present** (pickRenderer never writes an external buffer; overrides land on its own buffer at the right offsets) and green.
- [ ] **The pointermove-no-longer-wakes-a-frame test is present** (mouse pointermove does not call `requestRender`; pointerleave still does) and green.
- [ ] `packPointUniforms` offset-table test is present (every written byte offset asserted; `pickPass` packs 0; pads stay 0).
- [ ] `renderFrame.ts` "What stays in `runFrame()`" docblock updated (hover pick gone; debug overlay is a helper).
- [ ] No dead imports in `runFrame.ts` (`resolvePick`/`updateSelectionHover`/`latestMouseCss` removed where unread).
- [ ] Spec out-of-scope respected: no change to the pick *encoding*/`resolvePick`/`selectionEncoding`, no change to the pick GPU pipeline / WGSL, no touch/pen behaviour change (mouse-only gate stays), no double-click/focus change, no shared hover↔click throttle (click stays one-shot).
- [ ] `git diff main...HEAD` reviewed via `entanglement-radar` (Task 9) — the two-writer coupling is gone, `packPointUniforms` is the sole packer, no new accidental coupling.

## Plan-style self-review

- Contract code only (signatures, the new type shapes, byte offsets, test names); no implementation bodies. ✓
- Existing code cited by `file.ts:line`, not pasted. ✓
- One independently-testable deliverable per task; each ends green + committed; the risky decoupling (Task 4) is sequenced after its prerequisites. ✓
- "Do not re-braid" notes on every boundary-touching task; entanglement-radar as the final gate. ✓
