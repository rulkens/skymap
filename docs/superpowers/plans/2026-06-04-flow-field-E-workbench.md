# Flow-Field Integration — Phase E: Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Sister documents:**
> - [`docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`](../specs/2026-06-04-flow-field-integration-design.md) — the approved design. Source of truth.
> - [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) — contract code yes, implementation code no.
>
> **Depends on:** Phases A–D — the canonical `src/` flow implementation must exist and render in the main app before the workbench can drive it. Specifically: `createFlowFieldRenderer` + `encodeFlowCompute` + the `flow/*.wesl` shaders (Phase C), `createFlowField` loader (Phase B), `FlowFieldStore` (Phase B). This is the **final** plan step (decision §12).
>
> **Conventions** (from `CLAUDE.md` + memory):
> - Be meticulous with WESL — the workbench must link against the **canonical** `src/` shaders, not a copy.
> - **Use the `wesl-shaders` skill** — the wesl-plugin-reads-cwd gotcha (the `weslToml` must be passed explicitly; sub-tools keep cwd at the repo root) is the load-bearing detail here.
> - No barrel exports; one component per file; deep relative imports.
> - Ask before leaving a worktree/tool as a zombie — this task DELETES the duplicated tree, so confirm nothing unique is lost first.
> - Background subagents can't run npm/git; the main thread runs tests/typecheck/commits. Never `git add -A`.
> - **Commits:** conventional-commits style (shown per task); use the user's git identity (never `--author=Claude…`); end every commit body with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Goal

`tools/cosmic-flow/` is rewired into a thin `tools/flow-workbench/` that drives
the **canonical** `src/` flow renderer + compute + shaders through a new
`createFlowHarness.ts` adapter. The duplicated `visualizations/` tree (the
flow-field class, its shaders + constants, the density-volume viz, the
`Visualization`/registry interface, and the spike's `convertCf4ppVfield.py`) is
deleted. There is exactly **one** flow implementation; the workbench *consumes*
`src/`.

## Architecture

Decision §12: cosmic-flow's value as a tuning/presentation harness is kept, its
duplication is deleted. The new `createFlowHarness.ts` mirrors *just the relevant
slice* of cosmic-flow's `createEngine`: device init, a camera-uniforms feed, a
bare HDR target + tonemap (`blit.wesl`), and the field load — but instead of
instantiating `FlowFieldVisualization`, it constructs `createFlowFieldRenderer`
(from `src/`), drives `encodeFlowCompute` + the renderer's `draw`, and reads a
small local `FlowFieldStore` the controls panel mutates. The harness keeps the
Vite app (port 5300), the HDR render graph, the orbit-camera wiring, and the
controls panel. Because the harness imports the canonical shaders under
`src/services/gpu/shaders/flow/`, the workbench's `wesl.toml` `root` must cover
that path (or it reuses the runtime toml), and `weslToml` is passed explicitly in
the Vite config (the wesl-plugin-reads-cwd gotcha).

## Tech Stack

Vite + React + TypeScript + WESL (wesl-plugin `?static`). The workbench is a
sibling dev tool (not in the runtime bundle), on port 5300. Verification is a
headless Playwright `page.screenshot()` (NOT canvas readback — ANGLE-on-Mac
returns black) confirming ribbons render against the workbench backdrop.

---

## File Structure

**Renamed (dir):** `tools/cosmic-flow/` → `tools/flow-workbench/`

**Created:**

| File | Responsibility |
|---|---|
| `tools/flow-workbench/src/createFlowHarness.ts` | The adapter: device + HDR + camera + field load, driving the canonical `src/` flow renderer + `encodeFlowCompute`. |
| `tools/flow-workbench/src/createWorkbenchStore.ts` | A minimal `FlowFieldStore`-shaped local store the controls panel mutates (or reuse `createFlowFieldStore` from `src/`). |

**Modified:**

| File | Change |
|---|---|
| `tools/flow-workbench/vite.config.ts` | Point `root`/`publicDir` at the renamed dir; keep port 5300; keep explicit `weslToml`. |
| `tools/flow-workbench/wesl.toml` | `root` covers the canonical `src/services/gpu/shaders/flow/**` (or delete + reuse the runtime toml via the Vite config's `weslToml`). |
| `tools/flow-workbench/src/engine/createEngine.ts` | Replace the `Visualization`/registry drive with `createFlowHarness`. |
| `tools/flow-workbench/src/ui/ControlsPanel/ControlsPanel.tsx` | Bind controls to the workbench store (the same param set the DebugPanel exposes). |
| `package.json` | Rename the `cosmic-flow` npm script → `flow-workbench`; point at the renamed dir. |

**Deleted:**

| File / dir | Reason |
|---|---|
| `tools/flow-workbench/src/visualizations/flowField/` | Duplicated flow class + shaders + constants — superseded by `src/`. |
| `tools/flow-workbench/src/visualizations/densityVolume/` | Out of scope (the main app has its own volume layer). |
| `tools/flow-workbench/src/visualizations/registry.ts` + the `Visualization`/`VisualizationFactory` `@types` | The Strategy/registry interface the harness replaces. |
| `tools/flow-workbench/data/convertCf4ppVfield.py` | Superseded by the pure-TS `tools/flow/buildFlowField.ts` → `flowfield.scfd` (Phase A). |
| `tools/flow-workbench/src/field/createVelocityField.ts` | Superseded by `src/services/gpu/loaders/createFlowField.ts` (Phase B). |

---

## Task 1: Rename the directory + npm script + Vite/WESL config

**Files:** `tools/cosmic-flow/` → `tools/flow-workbench/` (rename), `tools/flow-workbench/vite.config.ts` (modify), `tools/flow-workbench/wesl.toml` (modify), `package.json` (modify)

The rename avoids confusion with the retired duplicate (decision §12). Do this
first so subsequent tasks edit the final paths.

- [x] `git mv tools/cosmic-flow tools/flow-workbench` (preserves history; stage the specific path). Also `git mv tests/tools/cosmic-flow tests/tools/flow-workbench` (test tree the plan missed; 29 path fixups).
- [x] In `vite.config.ts`: update `root`/`publicDir` `resolve(__dirname, …)` calls (they're `__dirname`-relative, so the rename mostly carries; confirm the comment text + any hard-coded `cosmic-flow` strings are updated). Keep `server.port: 5300`. Keep the explicit `weslToml`.
- [x] In `wesl.toml`: chose **(a)** — kept a workbench toml with `root = "../../src/services/gpu/shaders"` (the canonical flow shaders import `package::flow::flowConstants`, which only resolves at that root) and `include` adding the workbench's one leaf `src/engine/shaders/blit.wesl`. Option (b)/repo-root toml would not cover blit. Documented in the toml comment.
- [x] In `package.json`: rename the `cosmic-flow` script to `flow-workbench`, pointing at `tools/flow-workbench/vite.config.ts`.
- [x] `npm run typecheck` → clean (the rename shouldn't change types yet; the duplicated tree still compiles until Task 3 deletes it).
- [x] Commit: `refactor(flow): rename cosmic-flow → flow-workbench`.

## Task 2: `createFlowHarness` driving the canonical renderer

**Files:** `tools/flow-workbench/src/createFlowHarness.ts` (create), `tools/flow-workbench/src/createWorkbenchStore.ts` (create), `tools/flow-workbench/src/engine/createEngine.ts` (modify)

The harness mirrors *just the relevant slice* of the old `createEngine`'s
`initGpu` (device, camera uniforms, bare HDR target + tonemap via `blit.wesl`,
field load) and drives the canonical `src/` flow renderer. It does NOT
instantiate any `Visualization`.

```ts
// tools/flow-workbench/src/createFlowHarness.ts
export type FlowHarness = {
  start(): void;
  stop(): void;
  dispose(): void;
};

export async function createFlowHarness(
  canvas: HTMLCanvasElement,
  store: FlowFieldStore,          // the workbench store the controls mutate
): Promise<FlowHarness>;
```

Per-frame loop (one command encoder, mirroring the main engine's order):
1. read the orbit camera → `viewProj`;
2. `encodeFlowCompute({ encoder, flowFieldRenderer, store, frame })` (the canonical pre-HDR dispatch — seed rides the encoder on `reseedPending`);
3. open the HDR accumulation pass; `flowFieldRenderer.draw(pass, viewProj, viewportPx, store)`;
4. tonemap the HDR target to the swap chain via the kept `blit.wesl`;
5. submit.

`createWorkbenchStore` is the minimal `FlowFieldStore`-shaped object the controls
panel mutates — **reuse `createFlowFieldStore` from `src/`** if it satisfies the
harness needs (it does: getters + setters), so the workbench exercises the exact
store the engine uses. The harness calls `flowFieldRenderer.maybeReseed()` when
the controls change mode/count (the panel's callbacks do this, mirroring the
Phase-D handle).

- [x] ~~Create `createWorkbenchStore.ts`~~ — DROPPED. The plan's premise (reuse `createFlowFieldStore`) was stale: that store is **status-only** (a `loaded` bit), but `encodeCompute`/`draw` take a flat `FlowSettings`. So the existing `createStore(defaultAppState)` IS the workbench store — its `flow` slice now holds a `FlowSettings`. No extra file (simpler).
- [x] Create `createFlowHarness.ts` per the contract: `initGpu` → `createRenderGraph` (HDR + `blit.wesl`) → `createFlowFieldRenderer`; orbit-camera; field load via `fetch` → `decodeScalarField` → `setField` (NOT `createFlowField` — `setField` takes the decoded `ScalarCube` and owns the upload); the per-frame loop (store-driven reseed → `encodeFlowCompute` → HDR draw → tonemap).
- [x] Replaced `engine/createEngine.ts` (deleted) with `createFlowHarness`; `Viewport`/`main.tsx` updated; the `listFactories`/`DRAW_ORDER`/`Visualization` plumbing is gone.
- [x] Field URL `/data/flowfield.scfd` via `publicDir → ../../public` (serves the repo's `public/data/`, the same `.scfd` the runtime fetches — single asset source, no copy/symlink).
- [x] `npm run typecheck` → clean. Also verified `vite build` links the canonical shaders + `blit.wesl`, and `npm test` green (2355).
- [x] Commit: `feat(flow): createFlowHarness driving the canonical flow renderer`.

## Task 3: Delete the duplicated tree + rewire the controls panel

**Files:** delete `visualizations/flowField/`, `visualizations/densityVolume/`, `visualizations/registry.ts`, the `Visualization`/`VisualizationFactory` `@types`, `data/convertCf4ppVfield.py`, `field/createVelocityField.ts`; modify `ui/ControlsPanel/ControlsPanel.tsx`

With the harness driving `src/`, the duplicated implementation is dead. Delete it
(decision §12). Rewire the controls panel to the workbench store's setters (the
same param set the DebugPanel exposes: enable, mode, intensity, count, trail,
flowSpeed, densityBias, wander).

> **Confirm before deleting** (per the worktree-zombie-cleanup memory, applied to
> code): grep the workbench for any remaining import of the deleted files; ensure
> nothing unique (a tuning value, a comment, a UI affordance) is lost that isn't
> already captured in `src/` or the Phase-C `constants.ts`. The spike's tuned
> default param values were migrated into Phase-C/Phase-D — verify they match
> before deleting `visualizations/flowField/constants.ts`.

- [x] Grep `tools/flow-workbench/` for imports of each to-be-deleted file (via an Explore dependency sweep); confirmed the viz tree + several `@types` were referenced ONLY by the obsolete viz tests, so those tests are deleted alongside.
- [x] Verify the spike's tuned defaults are preserved in `flowFieldConstants.ts` + the Phase-D UI ranges. (`MAX_PARTICLES` retuned to 50000 on user request this session.)
- [x] Deleted: `src/visualizations/**` (incl. the duplicate flow shaders), `registry.ts`, the `Visualization`/`VisualizationFactory` + `EngineContext`/`FrameContext`/`Engine` `@types`, the `FlowSlice`/`FlowModeParams`/`ViewSlice`/`VolumeSlice`/workbench-`FlowMode` `@types` + `view`/`volume` slices, `data/convertCf4ppVfield.py`, `field/createVelocityField.ts` + `VelocityField*` `@types`, `ui/LayerToggles`, and the 3 obsolete viz tests. `ModeTabs` repointed to canonical `src/` `FlowMode`.
- [x] ControlsPanel rewire landed in Task 2 (the store reshape forced it then). `maybeReseed` on mode/count is store-driven in the harness, mirroring the Phase-D handle.
- [x] `npm run typecheck` → clean (no dangling imports). `npm test` → full suite green (2348).
- [x] Commit: `refactor(flow): delete flow-workbench's duplicated visualizations tree`.

## Task 4: Verify the workbench renders against the canonical renderer

**Files:** `tests/tools/flow-workbench/flowWorkbench.visual.test.ts` (create, or a manual verification step)

The acceptance criterion is that the workbench renders ribbons via the canonical
`src/` renderer. Per the testing strategy, use a headless Playwright + WebGPU
`page.screenshot()` (NOT canvas readback — ANGLE-on-Mac returns black) to confirm
non-black pixels appear once flow is enabled.

- [x] **Manual** verification (no Playwright/WebGPU harness in the repo): ran `npm run flow-workbench`, user confirmed ribbons render via the canonical renderer and respond to the mode/count/intensity sliders. Camera reframed to Mpc scale + count retuned during this check.
- [x] Confirmed ONE shader source: the duplicate `flowField/shaders/*.wesl` were deleted; the workbench links the canonical `src/services/gpu/shaders/flow/*.wesl` (verified by the `vite build` succeeding against only the canonical set).
- [x] `npm test` → green (2348); manual-verification result recorded here + for the PR description.
- [x] No separate commit — verification is the manual check above; the camera/count tuning rode their own commits.

---

## Spec coverage (Phase E)

- Decision §12 (rewire cosmic-flow → `tools/flow-workbench/`; new `createFlowHarness` driving the canonical `src/` module; the harness consumes `src/`, one implementation) → Tasks 1, 2.
- Decision §12 (delete the duplicated `visualizations/` tree + `convertCf4ppVfield.py`) → Task 3.
- Decision §12 (keep the Vite app on port 5300, the HDR render graph + `blit.wesl` tonemap, orbit-camera, controls panel) → Tasks 1, 2, 3.
- Testing strategy: visual probe via headless Playwright `page.screenshot()` (not canvas readback) → Task 4.
- Non-goal honoured: the density-volume + structure-catalog visualizations are deleted, not ported (decision non-goals).
