# Fade ownership — Plan C: renderers shed fade-adjacent state

**Feature:** Two independent, behaviour-preserving removals of fade-/load-/selection-adjacent
state mirrored inside renderers. Pure refactor, no visible change. This is **Plan C** of the
merged fade-ownership + visibility-seam design
(`docs/superpowers/specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md`, §4
"Renderers shed fade-adjacent state" — the two non-`onFieldAdded` bullets).

**REQUIRED SUB-SKILL:** Execute this plan with `superpowers:subagent-driven-development`
(fresh subagent per task + the spec + quality reviews). Dispatch implementer subagents
`run_in_background: true`; the main thread runs `npm test` / `npm run typecheck` and commits.
Implementers **EDIT ONLY — no npm/npx**. They run bash sequentially and use Read/Grep tools
(no `sed`/`awk`/`grep` via Bash). **Escalate before hacking** — if a clean implementation is
blocked, STOP and report rather than working around it. **Pause before the bigger change** —
prefer the minimal removal; do not widen scope into Plan A or Plan B.

**Goal:** No renderer holds fade-/load-/selection-adjacent state mirrored from `EngineState`.
The flow gate and the selection-ring input become **pull-not-push**:

- `flowFieldRenderer` drops the `hasField` boolean mirror; its internal self-guards **and the
  public `fieldLoaded()` method** read its own `field !== null` (which it already owns), and the
  engine's render-wake check reads `slotReady(state.assetSlots.flow)` (braid #1's predicate,
  shipped #309) instead of the renderer mirror. `fieldLoaded()` stays — it is the flow fade
  row's `guard` (added by Plan B's option-C flow-guard fix, `fadeLayers.ts:231`); only the
  cached boolean it reads goes away.
- `selectionRingRenderer` drops the stored `currentSelection` + `setSelection` + `hasSelection`;
  its `draw()` takes the per-frame `{worldPos, ringRadiusPx} | null` that `selectionRingPass`
  already derives from the tagged `FocusableTarget` via `SELECTION_HALO`.

**Architecture:** Both knots are the same anti-pattern — a renderer caching a fact whose source
of truth lives elsewhere (the asset slot's load-state; the selection subsystem's resolved
target). The entanglement-radar invariant Plan C restores: *no renderer mirrors `EngineState`/
selection; the gate/selection reads are pull, not push.* The flow gate's authoritative source
already shifted to `slotReady` at the **pass** layer (`flowFieldPass.enabled` reads it today);
Plan C removes the last renderer-local copy. The selection ring's value is already computed
fresh every frame by the pass; Plan C threads it in as a draw argument instead of stashing it.

**Tech stack:** TypeScript, Vitest, WebGPU. No WGSL/WESL changes are expected — the selection
ring's uniform byte layout is unchanged (the same `{worldPos, ringRadiusPx}` is written, just
passed as an argument rather than read from a field). If any `draw()` signature change is found
to cross into a shader uniform, STOP and escalate (it should not).

**Sequencing:** Independent of Plan A and Plan B — executable **anytime**. The two tasks below
are also independent of each other (different files, no shared symbol); either order is fine.

> **Read before starting:** the spec §4
> (`docs/superpowers/specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md:198-214`),
> `docs/superpowers/conventions/plan-style.md`, and the current code at each seam. Do not trust
> the line numbers below blindly — read the current file. Tick each `- [ ]` inline as you
> complete it, in the same response as the TaskUpdate.

**Skymap conventions:** `type` not `interface`; one type per file in `src/@types/`; one function
per file in `utils/`/`helpers/`; deep relative imports, no barrels; didactic comments (explain
*why* + the rejected alternative); `Vec2`/`Vec3` aliases, never raw tuples; immutability/
`readonly` by default; typed `vi.fn<() => void>()` for mocked callback fields.

---

## Task 0: Pre-flight — baseline green

**Files:** none (verification only).

- [ ] `npm test` — full suite green at HEAD (the current 590+ tests).
- [ ] `npm run typecheck` — clean across `src` and `tools` tsconfigs.
- [ ] Record the flow + selection-ring test files that must stay green:
  `tests/services/gpu/renderers/flowFieldRenderer.test.ts`,
  `tests/services/engine/frame/passes/selectionRingPass.test.ts`,
  `tests/services/gpu/renderers/selectionRingRenderer.test.ts`,
  `tests/services/engine/frame/encodeFlowCompute.test.ts`.

---

## Task 1: flowFieldRenderer — delete the `hasField` mirror

`hasField` (`flowFieldRenderer.ts:222`) is a redundant boolean mirror of the renderer's own
`field: FlowField | null` (`flowFieldRenderer.ts:223`). It is set true in `upload`
(`:252`) and read by **four** sites in the renderer: three internal self-guards — `isAnimating`
(`:294`), `encodeCompute` (`:302`), `draw` (`:359`) — and the **public `fieldLoaded()`** method
(`:297-298`), which Plan B's option-C fix exposes as the flow fade row's `guard`
(`fadeLayers.ts:231`: `state.gpu.flowFieldRenderer?.fieldLoaded() ?? false`). The renderer has no
`EngineState`, so its self-guards and `fieldLoaded()` derive from the field it owns; the
**engine-side** load gate is the spec's `slotReady(assetSlots.flow)`, which the pass layer
already reads (`flowFieldPass.ts:40`). The one consumer that reads the renderer mirror
*indirectly for the wake* is the render-wake check at `runFrame.ts:504`
(`flowFieldRenderer?.isAnimating(state.settings.flow)`).

> **Reconcile with Plan B:** Plan C was authored before Plan B's flow-guard fix added
> `fieldLoaded()`. Do **not** delete `fieldLoaded()` — it has a live consumer (the fade guard).
> Repoint its body (and the three self-guards) from `hasField` to `field !== null`; the boolean
> is what dies, not the accessor. `isAnimating` is the one method that *may* be deletable (see
> 1b), because the wake is moving off it — but verify, don't assume.

**Behaviour-preserving contract:** the flow layer animates/encodes/draws on exactly the same
frames as today; the render loop keeps ticking on exactly the same frames.

**Files:**
- `src/services/gpu/renderers/flowFieldRenderer.ts` (modify)
- `src/services/engine/frame/runFrame.ts` (modify — the wake check at `:499-505`)
- `src/services/engine/frame/encodeFlowCompute.ts` (modify — comment at `:25` names the now-gone
  `hasField`; reword to `field !== null`)
- `src/@types/rendering/FlowFieldRenderer.d.ts` (modify — only if `isAnimating` is deleted; plus
  `fieldLoaded`'s docblock reword)
- `tests/services/gpu/renderers/flowFieldRenderer.test.ts` (verify — existing `isAnimating`
  assertions at `:83-93` and the `fieldLoaded` test at `:95-101` must stay green unchanged unless
  `isAnimating` is deleted)

### 1a. Internal self-guards read `field`, not `hasField`

- [ ] Delete the `let hasField = false;` declaration (`flowFieldRenderer.ts:222`) and its
  `hasField = true;` assignment in `upload` (`:252`).
- [ ] `isAnimating` returns `flow.enabled && field !== null` (was `flow.enabled && hasField`).
- [ ] `fieldLoaded()` returns `field !== null` (was `return hasField`). **Keep the method** — the
  flow fade row's guard (`fadeLayers.ts:231`) calls it. The existing test `fieldLoaded is false
  before upload, true after` (`flowFieldRenderer.test.ts:95-101`) must pass unchanged.
- [ ] `encodeCompute`'s early return (`:302`) becomes `if (field === null || !computeBindGroup)
  return;` (was `!hasField || !computeBindGroup`). Note `computeBindGroup` is only built in
  `upload` alongside `field`, so `field !== null` ⇒ `computeBindGroup !== null` — but keep both
  guards for the bootstrap window (the implementer must not "simplify away" the bind-group guard).
- [ ] `draw`'s early return (`:359`) becomes `if (field === null) return;` (was `!hasField`).
- [ ] The existing tests `isAnimating is false before a field is set` and `isAnimating reflects
  enabled && loaded` (`flowFieldRenderer.test.ts:83-93`) must pass unchanged — they are the
  behaviour-preservation contract for this sub-task. Do **not** edit them.

### 1b. Render-wake reads `slotReady`, not the renderer mirror

The wake check at `runFrame.ts:504` currently asks the renderer
`flowFieldRenderer?.isAnimating(state.settings.flow)`. `isAnimating` = `enabled && loaded`, and
`loaded` is exactly `slotReady(state.assetSlots.flow)` (spec §4; the slot commit is what sets
`field`). Repoint the wake to the authoritative load source so the wake path no longer routes
through a renderer-held fact.

**Before/after (only the wake disjunct):**
```ts
// before
state.gpu.flowFieldRenderer?.isAnimating(state.settings.flow) === true;
// after
(state.settings.flow.enabled && slotReady(state.assetSlots.flow));
```

- [ ] Replace the `isAnimating(...)` disjunct at `runFrame.ts:504` with
  `state.settings.flow.enabled && slotReady(state.assetSlots.flow)`. Import `slotReady` from
  `../../loading/slotReady` (verify the relative path from `runFrame.ts`).
- [ ] Update the comment block at `runFrame.ts:486-489` (it currently narrates
  `flowFieldRenderer.isAnimating()`): the wake now reads `settings.flow.enabled &&
  slotReady(assetSlots.flow)` directly — same condition (`enabled && loaded`), no renderer
  round-trip. Keep it didactic (why this is the same set of frames).
- [ ] **Decision to confirm in-task — `isAnimating` only, NOT `fieldLoaded`:** does `isAnimating`
  have any *other* consumer? Grep confirms `runFrame.ts:504` is the sole runtime caller. If so,
  **delete `isAnimating` entirely** — from the renderer (`flowFieldRenderer.ts:293-296`), the
  type (`src/@types/rendering/FlowFieldRenderer.d.ts:64` + its docblock at `:59-63`), and the
  mock field in `tests/services/engine/frame/encodeFlowCompute.test.ts:12`. Then drop the
  `isAnimating` tests at `flowFieldRenderer.test.ts:83-93` (the load fact is now covered by the
  pass-level `slotReady` gate). If grep finds another consumer, STOP and escalate before
  removing the method. **Default expectation: removal** (the mirror's only purpose was the wake).
  `fieldLoaded()` is **out of scope for deletion** — it has a live consumer (the fade guard).
- [ ] If `isAnimating` is deleted, fix `fieldLoaded`'s docblock
  (`FlowFieldRenderer.d.ts:65-69`): it currently reads "the same flag `isAnimating` gates on …
  rather than slot lifecycle". Reword to stand on its own (`true once a velocity cube is uploaded
  and bound`) — no dangling reference to a deleted method, and drop the "rather than slot
  lifecycle" contrast now that the wake reads `slotReady` directly.

- [ ] `npm test -- flowFieldRenderer encodeFlowCompute runFrame` green. `npm run typecheck`
  clean. Commit.

---

## Task 2: selectionRingRenderer — `draw()` takes the per-frame selection input

`currentSelection` (`selectionRingRenderer.ts:55`), set via `setSelection` (`:119-121`), is a
renderer-held copy of a value the pass already computes fresh every frame. `selectionRingPass`
(post-#318) derives `{worldPos, ringRadiusPx}` from the tagged `FocusableTarget` via
`SELECTION_HALO[type]` (`selectionRingPass.ts:51-66`) and then calls `setSelection` + `render`.
Plan C fuses those into one `draw()` that takes the value as an argument, deleting the stored
mirror. The pass's `enabled()` is already the draw-gate (it gates on
`SELECTION_HALO[sel.type](sel) !== null` — `selectionRingPass.ts:37-42`), so `hasSelection()`
is dead.

**Behaviour-preserving contract:** the ring draws on the same selections, at the same world
position and radius, with the same uniform bytes (`worldPos` xyz + `ringRadiusPx` at offset 12).

**Files:**
- `src/@types/rendering/SelectionRingRenderer.d.ts` (modify — replace `setSelection` +
  `hasSelection` + `render` with one `draw`)
- `src/services/gpu/renderers/selectionRingRenderer.ts` (modify)
- `src/services/engine/frame/passes/selectionRingPass.ts` (modify — call site)
- `tests/services/gpu/renderers/selectionRingRenderer.test.ts` (modify)
- `tests/services/engine/frame/passes/selectionRingPass.test.ts` (modify — renderer spy +
  assertions)

### 2a. Pin the new renderer contract

**New public type (`SelectionRingRenderer.d.ts`):** replace `setSelection`, `hasSelection`, and
`render` with a single `draw` that takes the selection as a per-frame argument:
```ts
export type SelectionRingRenderer = {
  readonly label: string;
  /**
   * Draw the selection halo for `selection` into an in-flight render pass.
   * `selection === null` is a no-op (nothing selected this frame).
   * `ringRadiusPx` is the final CSS-pixel radius — the caller has already
   * baked in the halo factor. Must be called inside a `beginRenderPass`
   * block on the swap-chain texture (premultiplied-OVER expects an LDR target).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    selection: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null,
  ): void;
  destroy(): void;
};
```
- [ ] Use the `Vec2` alias for `viewportSize` (the old `render` used a raw `[number, number]` —
  fix it while here, per the Vec-alias convention). Confirm `Vec2`/`Vec3` import paths.
- [ ] Rewrite the type's module docblock: the renderer is now **stateless w.r.t. selection** —
  it holds no current selection; the caller passes the per-frame value. Drop the "Holds one
  selection at a time" framing.

### 2b. Implement the stateless draw

- [ ] Delete `currentSelection` (`selectionRingRenderer.ts:55`), `setSelection` (`:119-121`),
  and `hasSelection` (`:123-125`).
- [ ] Rename/rework the internal `render` (`:127-153`) into `draw(pass, viewProj, viewportSize,
  selection)`: early-return when `selection === null` (or any GPU handle is null, as today at
  `:132`); write the camera UBO unchanged; write the selection UBO from `selection.worldPos` +
  `selection.ringRadiusPx` (same 4-float layout as `:143-148`), then issue the same
  `pass.draw(6, 1, 0, 0)`.
- [ ] Update the renderer's module docblock — the "## Why two uniform bindings" rationale still
  holds (split cadence), but the selection is no longer renderer-held state; the upload cadence
  is now "once per frame the pass draws", which the pass already gates to selected frames.
- [ ] In the returned object (`:160-166`), expose `{ label, draw, destroy }` (drop
  `setSelection`, `hasSelection`, keep `satisfies Renderer`).

### 2c. Thread the value through the pass

- [ ] `selectionRingPass.draw` (`selectionRingPass.ts:66-71`): replace the
  `setSelection({ worldPos, ringRadiusPx })` + `render(...)` pair with one
  `draw(pass, ctx.vp, [width, height], { worldPos, ringRadiusPx })`. The `enabled()` gate
  (`:37-42`) is unchanged — it already owns the "is there a halo this frame" decision.
- [ ] Update the pass's "## Why one writeBuffer is fine" docblock note if it references
  `setSelection`/`hasSelection` (it gates `enabled()`-false when nothing is selected — still
  true).

### 2d. Tests

- [ ] `selectionRingRenderer.test.ts`: rework the renderer-level tests to call `draw` with a
  selection argument. Add/keep:
  - `draw is a no-op when selection is null` — assert `pass.setPipeline`/`pass.draw` are **not**
    called (under a real-ish mock device; the existing file builds the renderer with a mock —
    follow its pattern).
  - `draw writes the selection uniform and issues the 6-vertex draw` — assert `queue.writeBuffer`
    is called for the selection buffer with `ringRadiusPx` at float offset 3, and
    `pass.draw(6, 1, 0, 0)` fires once.
  - Delete any `hasSelection` / `setSelection` assertions.
- [ ] `selectionRingPass.test.ts`: update `makeRendererSpy` (`:46-54`) to expose
  `draw: vi.fn()` (drop `setSelection`/`hasSelection`/`render`). Rework the `draw` describe
  block (`:135-206`) to assert on the **single `draw` call's 4th argument**:
  - `computes ringRadiusPx from the target and forwards to renderer` — assert
    `draw.mock.calls[0][3].worldPos` is `[0,0,100]` and `.ringRadiusPx ≈ 24` (the same numbers
    as today at `:152-158`).
  - `uses apparentPxRadius when galaxy is closer` — `.ringRadiusPx ≈ 25.92` (`:178`).
  - `draws the ring at MILKY_WAY_CENTER_WORLD for a milkyWay selection` — assert
    `draw.mock.calls[0][3].worldPos` matches `MILKY_WAY_CENTER_WORLD` (`:189-194`).
  - `calls renderer.draw() exactly once with viewProj + viewport` — assert `draw` called once,
    `draw.mock.calls[0][2]` deep-equals `[1280, 720]` (was the `render` 3rd-arg check at `:204`).
  - The `enabled()` describe block (`:98-131`) is unchanged — `enabled` already lives in the
    pass and does not touch the renderer's removed methods.

- [ ] `npm test -- selectionRingRenderer selectionRingPass` green. `npm run typecheck` clean.
  Commit.

---

## Task 3: entanglement-radar on the diff

**Files:** none (review only). Run the `entanglement-radar` skill over the full Plan C diff.

- [ ] Confirm the invariant holds: **no renderer mirrors `EngineState`/selection** — grep the
  two renderers for any remaining cached load-state / selection field. `flowFieldRenderer`
  holds only its owned GPU resources (`field`, buffers, `computeBindGroup`, the reseed latch,
  `phase`/`frame` counters — all genuinely renderer-owned, not mirrors of state).
  `selectionRingRenderer` holds only GPU handles.
- [ ] Confirm the gate/selection reads are **pull, not push**: the flow load fact is read from
  `slotReady(assetSlots.flow)` at the wake site and the pass `enabled()`; the selection-ring
  value is computed by the pass and passed into `draw()` per frame — neither is stashed and
  read-back.
- [ ] Confirm no *new* mirror or indirection was introduced (e.g. no helper that re-caches the
  selection). If the radar surfaces anything, capture it (fix in-scope if tiny, else note for
  the backlog) — do not silently leave a flagged knot.

---

## Definition of Done

- [ ] `npm test` — full suite green (net: the flow `isAnimating` load-mirror tests and the
  selection-ring `setSelection`/`hasSelection` tests are gone or reworked; the
  behaviour-preservation assertions — same ring radius/position, same flow gate frames — pass).
- [ ] `npm run typecheck` — clean across `src` and `tools` tsconfigs.
- [ ] `flowFieldRenderer.hasField` is gone; the renderer's self-guards **and `fieldLoaded()`**
  read its own `field !== null`; `fieldLoaded()` survives (the flow fade guard's consumer); the
  render-wake reads `slotReady(state.assetSlots.flow)`. If `isAnimating` had no other consumer,
  it (and its type member + mock) are deleted too.
- [ ] `selectionRingRenderer.currentSelection` / `setSelection` / `hasSelection` are gone; the
  renderer is stateless w.r.t. selection; `draw(pass, viewProj, viewportSize, selection)` takes
  the per-frame `{worldPos, ringRadiusPx} | null` the pass derives from `SELECTION_HALO`.
- [ ] `selectionRingPass` threads the derived value through the single `draw()` call; its
  `enabled()` gate is unchanged.
- [ ] No WGSL/WESL change (selection-ring uniform bytes unchanged). If any was needed, it was
  escalated, not silently made.
- [ ] entanglement-radar invariant met: no renderer mirrors `EngineState`/selection; the
  gate/selection reads are pull, not push. No new mirror introduced.
- [ ] No behaviour change: the flow layer animates/draws and the loop wakes on the same frames;
  the selection ring draws on the same selections at the same radius/position.
- [ ] No new TODOs; comments naming removed symbols (`hasField`, `isAnimating`, `setSelection`,
  `hasSelection`, `currentSelection`) updated, not left stale.
