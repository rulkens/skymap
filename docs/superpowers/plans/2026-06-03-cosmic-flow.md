# Cosmic Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `tools/spike/` CF4++ peculiar-velocity flow prototype as a properly-architected Vite + TypeScript + React developer tool at `tools/cosmic-flow/`, to visual parity with the spike, then retire the spike. Flow (advect pathlines + static streamlines) is the identity; density-volume raymarch and structure labels are context layers.

**Architecture:** Hexagonal / three rings (spec §3). The `engine/` + `visualizations/` core import no React; the React `ui/` imports no GPU. They meet at two seams: the typed Observer **store** (`state/`) and the **`Visualization`** Strategy interface (`visualizations/Visualization.ts`). Patterns: Ports & Adapters, Strategy + Registry, Facade (Engine), Observer (store), Render-graph/Pipeline (passes), Factory + Disposable (GPU resources).

**Tech Stack:** Vite (own config, port 5300, `@vitejs/plugin-react`), TypeScript (folded into `npm run typecheck`), React 18 (`useSyncExternalStore`), raw WebGPU + inline WGSL template-literal modules, Vitest (mirrors repo test tree). Reuses `src/services/camera/orbitCamera`, `orbitControls`, `src/services/gpu/device`, `shaderCompileLogger`, `tools/utils/math/coordinates`, `src/data/superGalacticTransform`, `src/components/common/{Panel,Button,PillButton}`, and `src/styles/global.css` tokens. Data extractor is Python + numpy (`convertCf4ppVfield.py`).

**Source of truth:** spec `docs/superpowers/specs/2026-06-03-cosmic-flow-design.md`. Prototype to match behaviorally: `tools/spike/public/index.html` (cited below by line). Plan-style: `docs/superpowers/conventions/plan-style.md` — contract code only, no implementation bodies.

**Conventions (override defaults):** `type` aliases never `interface`; no barrel exports for components (import each `.tsx` directly); one folder per component with co-located `.module.css`, `function Name()` + `export default Name`; `Vec2`/`Vec3`/`Mat4` aliases from `src/@types/math` never raw tuples; CSS modules consume `var(--token)` from `global.css`; didactic multi-paragraph module headers; commit per task (human runs commits with their own identity — never pass author flags). Run bash sequentially, never in parallel; use Read/Grep tools not sed/awk/grep.

**TYPE-CONTRACT LOCATION (binding — overrides any src/ path shown in a task below):** every standalone exported `type` lives in `tools/cosmic-flow/@types/<path-mirroring-src>/TypeName.d.ts`, ONE type per file (mirrors the repo's `src/@types/` convention). Runtime modules in `src/` import them via `import type`. Single-function runtime modules are named after their export (`createVelocityField.ts`, `makeShaderFactory.ts`, `createDisposableTracker.ts`). The ONLY types that stay co-located are React component `Props` types (in the `.tsx`, matching the main app). So where a task says e.g. "create the type in `src/field/VelocityField.ts`", instead put the type in `@types/field/VelocityField.d.ts` and any factory in `src/field/createX.ts`. The tool's `tsconfig.json` `include`s `@types`.

**Test locations:** tests mirror the repo tree under `tests/tools/cosmic-flow/**` (e.g. `tests/tools/cosmic-flow/state/store.test.ts`, `tests/tools/cosmic-flow/ui/...`), matching the curator precedent at `tests/tools/famous-curator/`. Run with `npm test -- <pattern>`. Typecheck with `npm run typecheck`.

**TDD honesty:** Tasks for the store, slices, selectors, `structures.ts` mapping, and `paramSpecs`-range checks are genuine TDD (failing test → implement → pass). Tasks for GPU/WGSL/React-render are NOT unit-tested (consistent with the repo — renderers verified by eye); their step shape is implement-against-cited-reference → typecheck → visual-verify → commit. Do not fabricate GPU unit tests.

---

## Phase 1 — Build wiring ✅ DONE (commits 96f7fcd0..3717b857; typecheck + smoke green)

### Task 1: Scaffold the tool directory + Vite config

**Files:** `tools/cosmic-flow/vite.config.ts` (new), `tools/cosmic-flow/index.html` (new), `tools/cosmic-flow/src/main.tsx` (new, stub), `.gitignore` (modify).

**Contract — `vite.config.ts`:** export default `defineConfig({ root: resolve(__dirname, 'src'), publicDir: resolve(__dirname, '..', 'public') ... })`. Model the *wiring* on `tools/famous-curator/vite.config.ts:21-31` (NOT its layout): `root` = this tool's source dir, `publicDir` points at `tools/cosmic-flow/public` so the `.bin`/`.json` field assets are served at `/`, `server: { port: 5300 }`, `plugins: [react()]`. No API plugin (this tool reads static assets only — spec §2 non-goals).

- [ ] `index.html` — minimal shell: `<canvas>`-less; a single `<div id="root">` and `<script type="module" src="./main.tsx">`. (React owns the canvas via the Viewport component; main app's `index.html` is the style reference.)
- [ ] `main.tsx` — stub that imports `../../../src/styles/global.css` (spec §9 — import tokens once) and renders a placeholder `<div>` into `#root` via `createRoot`. Real `App` lands in Task 30.
- [ ] `.gitignore` — add `tools/cosmic-flow/public/cf4pp_vfield.bin` and `tools/cosmic-flow/public/cf4pp_vfield.json` (build artifacts, like `public/data/*.bin`). Add a one-line comment citing the regeneration path (`tools/cosmic-flow/data/convertCf4ppVfield.py`).
- [ ] `npm run typecheck` passes (the stub typechecks once Task 3 includes the dir; for now ensure no syntax error by `npx vite --config tools/cosmic-flow/vite.config.ts build --mode development` is NOT required — just that the file parses).
- [ ] Commit: `feat(cosmic-flow): scaffold tool dir + vite config (port 5300)`.

### Task 2: Add `npm run cosmic-flow` script

**Files:** `package.json` (modify).

- [ ] Add `"cosmic-flow": "vite --config tools/cosmic-flow/vite.config.ts"` to `scripts`, placed next to `"curate-famous"` (`package.json` scripts block — see `curate-famous` entry).
- [ ] Commit: `feat(cosmic-flow): add npm run cosmic-flow script`.

### Task 3: Vite-config smoke test + fold into typecheck

**Files:** `tools/cosmic-flow/tsconfig.json` (new), `tsconfig.tools.json` (verify includes `tools`), `tests/tools/cosmic-flow/viteConfig.smoke.test.ts` (new).

**Contract — `tsconfig.json`:** `{ "extends": "../../tsconfig.json", "compilerOptions": { "types": ["node","@webgpu/types","vite/client"], "lib": ["ES2022","DOM","DOM.Iterable"] }, "include": ["src","../../src","../../tools/utils"], "exclude": [] }`. Mirrors `tsconfig.tools.json:1-9` shape; includes `../../src` + `../../tools/utils` for the cross-dir reuse imports (spec §10). Note: `tsconfig.tools.json` already `"include": ["tools","src"]` so the tool is covered by `npm run typecheck`'s second pass — verify, no edit needed unless the tool dir is excluded.

**Contract — smoke test name + assertions** (model on `tests/tools/famous-curator/viteConfig.smoke.test.ts:10-37`):

```
describe('tools/cosmic-flow/vite.config.ts', () => {
  it('exports a config with port 5300 and a react plugin', ...)
})
```
Assert `resolved.server?.port === 5300`; `Array.isArray(resolved.plugins)`; flattened plugin names include a name containing `'react'`. Do NOT assert an api-plugin name (this tool has none).

- [ ] Write the failing smoke test.
- [ ] `npm test -- viteConfig.smoke` (cosmic-flow) → fails (config not yet matching / dir missing).
- [ ] Ensure config satisfies the assertions; `npm test -- viteConfig.smoke` → passes.
- [ ] `npm run typecheck` → passes (tool dir typechecks under tools pass).
- [ ] Commit: `test(cosmic-flow): vite-config smoke + tsconfig`.

### Task 4: Move the npz→rgba16f extractor into the tool

**Files:** `tools/cosmic-flow/data/convertCf4ppVfield.py` (new, moved from `tools/spike/convertCf4ppVfield.py`), `tools/cosmic-flow/data/findEdgeAttractors.py` (new, moved), `tools/cosmic-flow/README.md` (new).

**Behaviour (preserve exactly):** the extractor reads `data/raw/cf4pp/CF4pp_mean_std_grids.npz`, packs `RGBA16F` C-order `[z][y][x][c]` with `rgb = v_mean_CF4pp`, `a = d_mean_CF4pp` (overdensity δ), and writes a `.bin` + a `.json` meta with keys `n`, `boxMpcPerH` (1000.0), `format` (`"rgba16float"`), `layout`, `speedKmsMax`, `speedKmsP99`, `deltaMax`, `deltaP99` — see `tools/spike/convertCf4ppVfield.py:30-72`.

- [ ] Move both `.py` files; update the two output-path constants so they target `tools/cosmic-flow/public/cf4pp_vfield.{bin,json}` (was `tools/spike/public/...` at `convertCf4ppVfield.py:21-22`). SRC path unchanged (`data/raw/cf4pp/...`). Drop the "SPIKE — throwaway" framing in the docstring; document it as the tool's one-off extractor.
- [ ] `findEdgeAttractors.py` retained as a documented analysis script under `data/` (spec §10) — header note that it is NOT part of the runtime tool. No path edits needed (it only reads the npz).
- [ ] `README.md` — document: regeneration command (`python3 tools/cosmic-flow/data/convertCf4ppVfield.py` with numpy + the CF4++ npz present), the gitignored artifacts, the structure catalog needing no precomputed asset (positions derived at runtime — spec §10), and `npm run cosmic-flow` to launch.
- [ ] Do NOT delete `tools/spike/` yet — that is Task 32, gated on visual parity.
- [ ] Commit: `chore(cosmic-flow): move CF4++ extractor + attractor script into tool`.

---

## Phase 2 — Contracts / types (lock interfaces before consumers) ✅ DONE (commits 70886c10..fdf614b6; restructured into @types/; typecheck + disposable tests green)

### Task 5: `SliderSpec` and `Visualization` interface

**Files:** `tools/cosmic-flow/src/visualizations/SliderSpec.ts` (new), `tools/cosmic-flow/src/visualizations/Visualization.ts` (new).

These are the extensibility seam (spec §4). Type-only modules; no runtime logic.

**Contract — `SliderSpec.ts`** (verbatim from spec §4):
```ts
export type SliderSpec = {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format?: (v: number) => string;
};
```

**Contract — `Visualization.ts`** (verbatim from spec §4; imports `SliderSpec`, `EngineContext`, `FrameContext` from their modules — Task 6):
```ts
export type Visualization = {
  readonly id: string;
  readonly label: string;
  readonly paramSpecs: readonly SliderSpec[];
  init(ctx: EngineContext): Promise<void> | void;
  encodeCompute?(encoder: GPUCommandEncoder, frame: FrameContext): void;
  encode(pass: GPURenderPassEncoder, frame: FrameContext): void;
  dispose(): void;
};
```

- [ ] Create both files (didactic header on each: SliderSpec = single source the UI reads to build controls; Visualization = the Strategy contract, adding a layer = implement this + `register()`).
- [ ] `npm run typecheck` → passes (forward refs to EngineContext/FrameContext resolve once Task 6 lands; if implemented before Task 6, stub-import will fail — implement Task 6 first or in the same task. Prefer landing Task 6 before this; see ordering note).
- [ ] Commit: `feat(cosmic-flow): SliderSpec + Visualization Strategy contract`.

> **Ordering note:** Land Task 6 (EngineContext/FrameContext) in the same PR slot as Task 5 so the imports resolve. They are split for review clarity, not sequencing.

### Task 6: `EngineContext` and `FrameContext`

**Files:** `tools/cosmic-flow/src/engine/EngineContext.ts` (new), `tools/cosmic-flow/src/engine/FrameContext.ts` (new).

`Mat4`/`Vec2` imported from `../../../../src/@types/math/{Mat4,Vec2}` (relative deep import — no barrel). `VelocityField` imported from `../field/VelocityField` (Task 11).

**Contract — `FrameContext.ts`** (verbatim from spec §5):
```ts
export type FrameContext = {
  readonly viewProj: Mat4;
  readonly dt: number;
  readonly frame: number;
  readonly size: Vec2;
  readonly enabled: ReadonlySet<string>;
  readonly params: Readonly<Record<string, number>>;
};
```

**Contract — `EngineContext.ts`** (verbatim from spec §5):
```ts
export type EngineContext = {
  readonly device: GPUDevice;
  readonly hdrFormat: GPUTextureFormat;
  readonly field: VelocityField;
  readonly createShaderModule: (code: string, label: string) => GPUShaderModule;
};
```

- [ ] Create both files with didactic headers (FrameContext = everything a viz needs to draw this frame, nothing more; EngineContext = init-time services a viz acquires resources from).
- [ ] `npm run typecheck` → passes (the `VelocityField` import will dangle until Task 11; if so, temporarily type it as the eventual shape is risky — instead land Task 11's type signature stub first, OR accept that this task's typecheck closes only once Task 11 lands. Recommended: define the `VelocityField` *type* in Task 11 before wiring its factory body, so this import resolves early).
- [ ] Commit: `feat(cosmic-flow): EngineContext + FrameContext per-frame contracts`.

### Task 7: `Disposable` contract + resource tracker

**Files:** `tools/cosmic-flow/src/engine/gpu/disposable.ts` (new), `tests/tools/cosmic-flow/engine/disposable.test.ts` (new).

**Contract:**
```ts
export type Disposable = { dispose(): void };
export function createDisposableTracker(): {
  track<T extends Disposable | GPUBuffer | GPUTexture>(r: T): T;
  disposeAll(): void;
};
```
`track` registers a resource and returns it (for fluent use). `disposeAll` calls `.destroy()` on `GPUBuffer`/`GPUTexture` and `.dispose()` on `Disposable`, in reverse insertion order, then clears the list. This is the Factory + Disposable pattern (spec §3) — pure, unit-testable with fakes.

**Test names + assertions** (TDD):
- [ ] `track returns the resource it was given` — `expect(tracker.track(fake)).toBe(fake)`.
- [ ] `disposeAll calls destroy on GPU resources in reverse order` — push two fakes with a `destroy` spy recording order; assert calls fire LIFO.
- [ ] `disposeAll calls dispose on Disposable resources` — fake with `dispose` spy; assert called once.
- [ ] `disposeAll is idempotent` — second call is a no-op (list cleared).
- [ ] Run-fail → implement → `npm test -- cosmic-flow/engine/disposable` passes.
- [ ] Commit: `feat(cosmic-flow): Disposable contract + reverse-order resource tracker`.

### Task 8: `shaderFactory` wrapper

**Files:** `tools/cosmic-flow/src/engine/gpu/shaderFactory.ts` (new).

**Contract:** `export function makeShaderFactory(device: GPUDevice): (code: string, label: string) => GPUShaderModule`. Returns a closure that delegates to `createShaderModuleWithDevLog(device, code, label)` (cited: `src/services/gpu/shaderCompileLogger.ts:25-58` — dev-mode `getCompilationInfo` error logging, iOS-safe). This is the `EngineContext.createShaderModule` provider.

- [ ] Implement (thin adapter; didactic header notes the spike used raw `createShaderModule` + a manual compile-info loop at `tools/spike/public/index.html:466-473`, replaced here by the shared logger — spec §8 DRY row).
- [ ] `npm run typecheck` → passes.
- [ ] Commit: `feat(cosmic-flow): shaderFactory wrapping createShaderModuleWithDevLog`.

---

## Phase 3 — State store (Observer · TDD) ✅ DONE (commits 1a1638cd..9ae9617d; 14 tests green, typecheck green)

### Task 9: `createStore` + `useStore`

**Files:** `tools/cosmic-flow/src/state/store.ts` (new), `tests/tools/cosmic-flow/state/store.test.ts` (new).

**Contract** (verbatim from spec §6):
```ts
export type Store<S> = {
  getSnapshot(): Readonly<S>;
  subscribe(listener: () => void): () => void;
  setState(update: (prev: Readonly<S>) => Readonly<S>): void;
};
export function createStore<S>(initial: S): Store<S>;
export function useStore<S, T>(store: Store<S>, selector: (s: Readonly<S>) => T): T;
```
`setState` is copy-on-write (immutable — the `update` fn returns a new snapshot; the store never mutates `prev`). `useStore` binds via React `useSyncExternalStore` (spec §6). Listeners notified only when the snapshot reference changes.

**Test names + assertions** (TDD; `store.test.ts` can test `createStore` in plain Vitest; `useStore` needs `@testing-library/react` `renderHook` — check it's available, else test only `createStore` here and cover `useStore` selection in Task 10's selector test via a thin render harness):
- [ ] `getSnapshot returns the initial state` — `expect(store.getSnapshot()).toEqual(initial)`.
- [ ] `setState replaces the snapshot with the update result` — assert new reference and new value; assert `prev` object untouched (immutability).
- [ ] `subscribe is called when state changes` — spy listener; `setState`; assert called once.
- [ ] `subscribe is NOT called when the update returns the same reference` — `setState((p) => p)`; assert listener not called.
- [ ] `unsubscribe stops notifications` — call the returned teardown; `setState`; assert no further calls.
- [ ] Run-fail → implement → `npm test -- cosmic-flow/state/store` passes.
- [ ] Commit: `feat(cosmic-flow): Observer store (createStore + useStore via useSyncExternalStore)`.

### Task 10: Typed slices + root state shape

**Files:** `tools/cosmic-flow/src/state/slices/viewSlice.ts`, `cameraSlice.ts`, `flowSlice.ts`, `volumeSlice.ts`, `labelsSlice.ts` (new), `tools/cosmic-flow/src/state/AppState.ts` (new), `tests/tools/cosmic-flow/state/slices.test.ts` (new).

Each slice exports a `type` for its shape, a `default<Name>` const, and pure action creators (functions returning a new slice from a prev slice + arg). `Mat4` from the math alias. **Defaults must match the spike's per-mode `DEFAULTS` and the live density/volume constants** (cited below).

**Contract — slice shapes (spec §6):**
```ts
// viewSlice.ts
export type ViewSlice = { readonly flowField: boolean; readonly densityVolume: boolean };
// cameraSlice.ts
export type CameraSlice = {
  readonly yaw: number; readonly pitch: number; readonly distance: number;
  readonly autoRotate: boolean; readonly viewProj: Mat4;   // engine-written each frame
};
// flowSlice.ts
export type FlowMode = 'advect' | 'streamline';
export type FlowModeParams = {
  readonly count: number; readonly flowSpeed: number; readonly densityBias: number;
  readonly wander: number; readonly trail: number; readonly size: number;
  readonly exposure: number; readonly contrast: number;
};
export type FlowSlice = { readonly mode: FlowMode; readonly advect: FlowModeParams; readonly streamline: FlowModeParams };
// volumeSlice.ts
export type VolumeSlice = { readonly intensity: number; readonly dMax: number; readonly alpha: number };
// labelsSlice.ts
export type LabelsSlice = { readonly enabled: boolean };
// AppState.ts
export type AppState = { readonly view: ViewSlice; readonly camera: CameraSlice;
  readonly flow: FlowSlice; readonly volume: VolumeSlice; readonly labels: LabelsSlice };
```

**Default values (from the spike — these are load-bearing for parity):**
- `defaultFlowSlice.advect` = `{ count: 40000, flowSpeed: 0.06, densityBias: 1, wander: 0.15, trail: 0.003, size: 0.0012, exposure: 0.3, contrast: 2.3 }` (spike `DEFAULTS[0]`, `index.html:605`).
- `defaultFlowSlice.streamline` = `{ count: 40000, flowSpeed: 0.49, densityBias: 1, wander: 0, trail: 0.013, size: 0.001, exposure: 0.22, contrast: 3 }` (spike `DEFAULTS[1]`, `index.html:606`; wander unused in streamline mode — held at 0).
- `defaultFlowSlice.mode` = `'streamline'` (spike `let mode = 1`, `index.html:560`).
- `defaultCameraSlice` = `{ yaw: 0.6, pitch: 0.35, distance: 1.7, autoRotate: true, viewProj: <16-element identity Mat4> }` (spike `index.html:551`, `autoRotate=true` `index.html:556`).
- `defaultViewSlice` = `{ flowField: true, densityVolume: false }` (spike: trails always render, density button starts `off` `index.html:53`/`728`).
- `defaultVolumeSlice` = `{ intensity: 10, dMax: 1.2, alpha: 16 }` (spike `VOL_GAIN=10` `index.html:111`, `VOL_DMAX=1.2` `index.html:112`, `VOL_ALPHA=16` `index.html:113`; intensity is the live slider, range 1..40).
- `defaultLabelsSlice` = `{ enabled: false }` (spike labels start `off` `index.html:56`/`738`).

**Test names + assertions** (TDD — pure functions; pick representative actions, do not test all setters individually unless they differ in logic):
- [ ] `defaultFlowSlice matches the spike advect/streamline defaults` — assert the exact objects above.
- [ ] `setFlowParam updates only the named param of the active mode, immutably` — e.g. `setFlowParam(prev, 'advect', 'flowSpeed', 0.1)` returns a new slice; `advect.flowSpeed === 0.1`; `streamline` reference unchanged; `prev` unchanged.
- [ ] `setFlowMode switches mode without touching either mode's params`.
- [ ] `toggleLayer flips the named view boolean immutably`.
- [ ] `setCameraViewProj replaces only viewProj` (engine writes this each frame — spec §5 step 2).
- [ ] Run-fail → implement → `npm test -- cosmic-flow/state/slices` passes.
- [ ] Commit: `feat(cosmic-flow): typed state slices with spike-parity defaults`.

### Task 11: `VelocityField` type signature (stub for early import resolution)

**Files:** `tools/cosmic-flow/src/field/VelocityField.ts` (new — type + factory signature only; body lands in Task 17).

> **Why split:** EngineContext (Task 6) imports `VelocityField`. Land the *type* and the exported factory *signature* here early so Task 6 typechecks; fill the GPU-loading body in Task 17. The body is GPU/fetch work (not TDD); the type is contract.

**Contract:**
```ts
export type VelocityFieldMeta = {
  readonly n: number;            // grid dimension (128)
  readonly boxMpcPerH: number;   // 1000
  readonly speedKmsMax: number;
  readonly speedKmsP99: number;
  readonly deltaMax: number;
  readonly deltaP99: number;
};
export type VelocityField = {
  readonly textureView: GPUTextureView;   // rgba16float 3D: rgb=velocity, a=delta
  readonly sampler: GPUSampler;            // linear
  readonly meta: VelocityFieldMeta;
  dispose(): void;
};
export function createVelocityField(
  device: GPUDevice,
  binUrl: string,
  jsonUrl: string,
): Promise<VelocityField>;
```

- [ ] Create the file with the types + an exported `createVelocityField` declaration. Body may throw `new Error('not implemented')` until Task 17 — but mark clearly with a `// IMPLEMENTED IN TASK 17` comment so the executing agent knows.
- [ ] `npm run typecheck` → passes (Task 6 import now resolves).
- [ ] Commit: `feat(cosmic-flow): VelocityField type contract`.

### Task 12: Selectors

**Files:** `tools/cosmic-flow/src/state/selectors.ts` (new), `tests/tools/cosmic-flow/state/selectors.test.ts` (new).

Named selectors so components and the engine share one definition of derived state (spec §6).

**Contract:**
```ts
export function selectActiveFlowParams(s: Readonly<AppState>): FlowModeParams; // s.flow[s.flow.mode]
export function selectEnabledLayers(s: Readonly<AppState>): ReadonlySet<string>; // 'flowField'/'densityVolume' from view booleans
export function selectFrameParams(s: Readonly<AppState>): Readonly<Record<string, number>>; // flat record the FrameContext carries
```
`selectFrameParams` flattens the active flow params + the volume params into the `Record<string, number>` the `FrameContext.params` snapshot expects (keys the visualizations read — keep key names aligned with each viz's `params.ts` ids: Tasks 19, 26).

**Test names + assertions** (TDD):
- [ ] `selectActiveFlowParams returns the streamline params when mode is streamline` — assert deep-equals `defaultFlowSlice.streamline`.
- [ ] `selectActiveFlowParams returns the advect params when mode is advect`.
- [ ] `selectEnabledLayers contains flowField when view.flowField is true and excludes densityVolume when false` — assert set membership against `defaultViewSlice`.
- [ ] `selectFrameParams exposes count/flowSpeed/trail/size/exposure/contrast/densityBias/wander from the active mode` — assert the keys + values for the streamline default.
- [ ] `selectFrameParams exposes volume intensity/dMax/alpha` — assert against `defaultVolumeSlice`.
- [ ] Run-fail → implement → `npm test -- cosmic-flow/state/selectors` passes.
- [ ] Commit: `feat(cosmic-flow): state selectors (active flow params, enabled layers, frame params)`.

---

## Phase 4 — Domain (structures TDD; field is GPU) ✅ DONE (commits f985e6d7..cabc6874; 7 tests green)

> **Decisions resolved:** §B — `eqToSg` produces SG vectors IDENTICAL to the spike's `R_SG·R_G` (verified by direct comparison), so it's reused with NO axis permutation. §A — the spike's verified box mapping (`×h=0.77`, centre 63.5, `/127`) is reproduced in `structureWorld.ts`; `sgToVoxelIndex` is intentionally NOT used (no-h / centre-64 convention). **Plan correction:** the Task-14 guess "Shapley radius > 0.5" was WRONG — actual is ~0.31 (200 Mpc × h / 500-Mpc half-box); the anchor test pins the real value.

### Task 13: Structure catalog data

**Files:** `tools/cosmic-flow/src/field/structureCatalog.ts` (new).

**Contract:**
```ts
export type CatalogStructure = { readonly name: string; readonly raDeg: number; readonly decDeg: number; readonly distMpc: number };
export const STRUCTURE_CATALOG: readonly CatalogStructure[];
```
Port the spike's `STRUCTURES` list verbatim (`tools/spike/public/index.html:704-720`): us (MW) 0/0/0, Virgo 187.70/12.39/16.5, Centaurus 192.20/-41.31/45, Great Attractor 243.55/-60.84/67, Laniakea 243.55/-60.84/50, Hydra 159.18/-27.53/50, Coma 194.95/27.98/99, Perseus 49.95/41.51/73, Hercules 241.30/17.75/160, Shapley 201.99/-31.50/200, Pavo-Indus 310.40/-48.60/205, Columba 84.70/-48.20/217, Corona Borealis? 249.90/32.70/397. Data-only module; no logic. (Spec §7 says positions are derived at runtime — Task 14 — so no precomputed world coords here.)

- [ ] Create the catalog with the exact RA/Dec/dist values above.
- [ ] `npm run typecheck` → passes.
- [ ] Commit: `feat(cosmic-flow): curated structure catalog (RA/Dec/dist)`.

### Task 14: Structure world-position mapping (TDD — the key DRY win)

**Files:** `tools/cosmic-flow/src/field/structures.ts` (new), `tests/tools/cosmic-flow/field/structures.test.ts` (new).

This **replaces the spike's hand-rolled ICRS→Galactic→Supergalactic rotation matrices** (`tools/spike/public/index.html:687-703`) with the repo's verified transform (spec §7, §8). The map: RA/Dec/dist → equatorial Cartesian → `eqToSg` → `sgToVoxelIndex` → centred world cube `[-1,1]`.

**Contract:**
```ts
export type PlacedStructure = { readonly name: string; readonly world: Vec3 };  // world cube [-1,1]^3
export function placeStructures(catalog: readonly CatalogStructure[]): readonly PlacedStructure[];
export function structureWorld(raDeg: number, decDeg: number, distMpc: number): Vec3;
```

**Mapping the implementer must reproduce (the contract):**
1. RA/Dec/dist → equatorial Cartesian Mpc: `eq = [cos(dec)cos(ra), cos(dec)sin(ra), sin(dec)] * dist` (ra/dec in radians). `dist === 0` → `[0,0,0]`.
2. `sg = eqToSg(eq)` (cited `tools/utils/math/coordinates.ts:24-26`).
3. `vox = sgToVoxelIndex(sg)` — continuous voxel indices, 0..128, centre at index 64 (cited `coordinates.ts:51-57`; origin -500 Mpc, voxel = 1000/128 Mpc/h). **Note the unit subtlety:** `sgToVoxelIndex` divides by `CF4_VOXEL_SIZE_MPC = 1000/128` with NO Hubble-h factor, whereas the spike applied `SG_H = 0.77` (`index.html:687`,`701`). The spike's SG positions were in Mpc and it converted to Mpc/h by multiplying by h; CF4's box is 1000 Mpc/h. **Decision required — see Decisions §A.** Reproduce whichever the verification test pins.
4. world cube: `worldAxis = (voxIndex / 127.5 - 0.5) * 2` per axis (the renderer maps voxel `[0,1]` → world `[-1,1]`; spike used `SG_NIDX=127` `index.html:687`,`702`). The spike also permuted axes (world x←k(SGZ), y←j(SGY), z←i(SGX) — `index.html:697`,`702`); the repo's `sgToVoxelIndex` returns axes in SG order `[SGX,SGY,SGZ]` so the renderer-side permutation must match the texture upload's axis order (`convertCf4ppVfield.py` writes C-order `[z][y][x]`). **Decision required — see Decisions §B.**

**Test names + assertions** (TDD — assert known structures land at expected voxels, spec §10). Compute the expected world/voxel for 2–3 anchors by hand from the chosen mapping and pin them:
- [ ] `structureWorld maps the Milky Way (dist 0) to the cube centre` — `expect(structureWorld(0,0,0)).toEqual([0,0,0])`.
- [ ] `structureWorld places Virgo inside the box near the centre` — Virgo (16.5 Mpc, ~2% of the 500 Mpc half-box) lands within ~0.1 of centre on each axis; assert each `|world[i]| < 0.15`.
- [ ] `structureWorld places Shapley toward the box edge` — Shapley (200 Mpc) lands at radius `> 0.5` from centre; assert `hypot(world) > 0.5`.
- [ ] `placeStructures returns one PlacedStructure per catalog entry, names preserved`.
- [ ] (Anchor regression) `structureWorld for Shapley matches the verified voxel within tolerance` — pin the expected `Vec3` computed via the repo transform to 3 decimals so a later transform change is caught.
- [ ] Run-fail → implement → `npm test -- cosmic-flow/field/structures` passes.
- [ ] Commit: `feat(cosmic-flow): structure world placement via shared SG transform`.

---

## Phase 5 — Engine + RenderGraph (build + visual-verify, NOT TDD)

### Task 15: `RenderGraph` — HDR accum target + Reinhard tonemap blit

**Files:** `tools/cosmic-flow/src/engine/RenderGraph.ts` (new), `tools/cosmic-flow/src/engine/blit.wgsl.ts` (new).

Owns the `rgba16float` HDR accumulation texture (sized to the drawable), the fullscreen-triangle tonemap pipeline, and resize. Reinhard + contrast + gamma (spec §5 step 5). Preserve the spike's blit shader behavior (`tools/spike/public/index.html:382-401`): `vsFullscreen` 3-vertex triangle, `fsTonemap` samples accum with `uv.y` flipped, `hdr * exposure`, `hdr/(hdr+1)`, `pow(mapped, contrast)`, `pow(., 1/2.2)`.

**Contract — `blit.wgsl.ts`:** export a `const blitWgsl: string` template literal. **Blit uniform `Blit` struct byte layout** (spike `index.html:391`; std140-compatible since both are f32 at the front):

| field | type | byte offset | size |
|---|---|---|---|
| exposure | f32 | 0 | 4 |
| contrast | f32 | 4 | 4 |

Buffer size: 16 bytes (round up to 16 for uniform alignment — spike used `size:16` `index.html:149`).

**Contract — `RenderGraph.ts`:**
```ts
export type RenderGraph = {
  readonly hdrFormat: GPUTextureFormat;        // 'rgba16float'
  readonly accumView: GPUTextureView;          // current HDR target view
  resize(width: number, height: number): void; // recreate accum tex if size changed
  tonemap(encoder: GPUCommandEncoder, target: GPUTextureView, exposure: number, contrast: number): void;
  dispose(): void;
};
export function createRenderGraph(device: GPUDevice, swapFormat: GPUTextureFormat, makeShader: (code: string, label: string) => GPUShaderModule): RenderGraph;
```
`accumView` is read by the Engine to begin the shared HDR pass. `tonemap` writes `blitPrm` (exposure/contrast), begins a render pass into `target`, draws the fullscreen triangle. Blit pipeline `layout:'auto'`, swapchain `format` target (cited spike `index.html:513-516`). Bind group recreated on resize (depends on `accumView` — spike `index.html:542-546`).

- [ ] Implement `blit.wgsl.ts` (port the spike's `vsFullscreen`/`fsTonemap`, keep the `1.0 - uv.y` flip).
- [ ] Implement `RenderGraph.ts` against the cited spike pipeline/resize code; route module creation through `makeShader`.
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify: deferred to Task 31 (RenderGraph has no standalone visual; verified once the engine draws). Note this in the commit.
- [ ] Commit: `feat(cosmic-flow): RenderGraph HDR accum + Reinhard tonemap blit`.

### Task 16: `Visualization` registry

**Files:** `tools/cosmic-flow/src/visualizations/registry.ts` (new), `tests/tools/cosmic-flow/visualizations/registry.test.ts` (new).

Registry pattern (spec §3, §4) — `register()` / `list()`. Pure module-level registry; unit-testable with fake viz objects.

**Contract:**
```ts
export type VisualizationFactory = () => Visualization;
export function register(id: string, factory: VisualizationFactory): void;
export function listFactories(): readonly { readonly id: string; readonly factory: VisualizationFactory }[];
```
(Factories, not instances, so the Engine instantiates per-construction — spec §5: the Engine "holds the registry's instantiated visualizations".)

**Test names + assertions** (TDD):
- [ ] `register then listFactories returns the registered id` — assert the id is present.
- [ ] `register is idempotent / last-wins for a duplicate id` (pick one policy and assert it; recommend last-wins with no throw).
- [ ] `listFactories returns factories that produce independent instances` — call a factory twice, assert two distinct objects.
- [ ] Run-fail → implement → `npm test -- cosmic-flow/visualizations/registry` passes.
- [ ] Commit: `feat(cosmic-flow): visualization registry (register/listFactories)`.

### Task 17: `VelocityField` factory body

**Files:** `tools/cosmic-flow/src/field/VelocityField.ts` (modify — fill the body declared in Task 11).

Factory (spec §7): fetch `.json` meta + `.bin` ArrayBuffer, create the `rgba16float` 128³ `dimension:'3d'` texture, `writeTexture` with `bytesPerRow: n*4*2, rowsPerImage: n` (cited spike `index.html:121-130`), create a linear sampler (`index.html:131`), return `{ textureView, sampler, meta, dispose }`. `dispose` destroys the texture.

- [ ] Implement against the cited spike upload code. `binUrl`/`jsonUrl` default to `/cf4pp_vfield.bin` / `/cf4pp_vfield.json` (served from `publicDir`). Parse meta into `VelocityFieldMeta`.
- [ ] `npm run typecheck` → passes; remove the `// IMPLEMENTED IN TASK 17` marker.
- [ ] Visual-verify: deferred to Task 31 (no standalone visual).
- [ ] Commit: `feat(cosmic-flow): VelocityField factory — load + upload 128³ rgba16f`.

### Task 18: `Engine` — Facade + render loop

**Files:** `tools/cosmic-flow/src/engine/Engine.ts` (new).

Framework-agnostic class (spec §5). Constructed with canvas + store handle + the instantiated visualizations. Per-frame loop in ONE command encoder (spec §5 steps 1–6):
1. Read store snapshot → assemble `FrameContext` (via `selectFrameParams`, `selectEnabledLayers`).
2. Update orbit camera; write `viewProj` back to the store (`setCameraViewProj`) so `LabelsOverlay` projects in sync (spec §5 step 2).
3. For each enabled viz with `encodeCompute`, encode its compute pass.
4. Begin the shared HDR render pass (clear); each enabled viz `encode`s additive draws; end.
5. `RenderGraph.tonemap` → swapchain.
6. Submit.
Continuous `requestAnimationFrame`; pause when `document.hidden` (spec §5). Auto-rotate: when `autoRotate && !dragging`, advance yaw by `dtReal * 0.08` (spike `index.html:766`).

**Reuse (spec §8):**
- Camera: `createOrbitCamera`/`updatePosition`/`computeViewProj` (`src/services/camera/orbitCamera.ts:98,136,205`). Construct `OrbitCamera` from `OrbitCameraInit` (`src/@types/camera/OrbitCameraInit.d.ts:15-100`): `target:[0,0,0]`, `distance/yaw/pitch` from `cameraSlice`, `fovYRad: 1.0` (spike used fov `1.0` `index.html:769`), `near: 0.05`, `far: 50` (spike `index.html:769`), `aspect` from canvas. **Note:** `clampDistance` in orbitCamera enforces `[0.05, 30000]` Mpc which is fine; the spike clamped distance to `[0.6, 7]` (`index.html:555`) — that tighter envelope is a controls concern, see Task 28.
- Device: `initGpu`/`resizeCanvasToDisplay` (`src/services/gpu/device.ts:50,161`). **Caveat:** `initGpu` configures `alphaMode:'premultiplied'` (`device.ts:120`); the spike used `'opaque'` (`index.html:99`). Premultiplied is fine for the opaque tonemap output (alpha is written 1.0). Keep `initGpu`'s choice.
- Shader factory: `makeShaderFactory` (Task 8).

**Contract:**
```ts
export type Engine = { start(): void; stop(): void; dispose(): void };
export function createEngine(canvas: HTMLCanvasElement, store: Store<AppState>): Promise<Engine>;
```
`createEngine` is async (awaits `initGpu` + `createVelocityField` + each viz `init`). Holds the `RenderGraph`, the `OrbitCamera`, the `requestRender`/RAF handle, and the instantiated visualizations from `listFactories()`.

- [ ] Implement against the cited reuse modules and the spike loop (`index.html:762-829`), preserving the encode order: compute → HDR pass (density first if enabled, then trails — spec §5 / spike `index.html:804-807`) → tonemap blit. Apply exposure/contrast from the active flow params (spike reads `val('exp')`/`val('con')` `index.html:798`).
- [ ] Camera write-back: after `updatePosition` + `computeViewProj`, call `store.setState` with `setCameraViewProj` carrying the frame's `viewProj` (spec §5 step 2). Guard against an infinite notify loop — the engine reads `getSnapshot()` directly each frame, not via a React subscription, and `setCameraViewProj` only changes `viewProj` so React label re-render is the only consumer.
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify: deferred to Task 31 (needs a viz to draw; the FlowField lands in Tasks 19–25, density in 26–27).
- [ ] Commit: `feat(cosmic-flow): Engine facade + per-frame loop (camera reuse, HDR→tonemap)`.

---

## Phase 6 — FlowFieldVisualization (build + visual-verify)

> Preserve the spike's compute integrators + ribbon render + defaults EXACTLY. Tunable constants the spike injected into WGSL from JS stay as typed module constants co-located with the viz (spec §8). The two compute modes (advect/streamline) are ONE visualization selected by the `mode` flow param — NOT two visualizations (spec §4).

### Task 19: FlowField params module

**Files:** `tools/cosmic-flow/src/visualizations/flowField/params.ts` (new), `tests/tools/cosmic-flow/visualizations/flowParams.test.ts` (new).

**Contract:**
```ts
export type FlowParams = FlowModeParams;   // re-uses the slice type (Task 10)
export const FLOW_PARAM_SPECS: readonly SliderSpec[];     // shared base specs
export const FLOW_ADVECT_PARAM_SPECS: readonly SliderSpec[]; // advect range overrides applied
```
Port the spike's `SLIDERS` (`tools/spike/public/index.html:594-603`) into `SliderSpec`s, mapping spike ids → slice param names: `cnt`→count, `spd`→flowSpeed, `bias`→densityBias, `wander`→wander (advect-only — spike `modes:[0]`), `trl`→trail, `siz`→size, `exp`→exposure, `con`→contrast. Base ranges (spike `index.html:594-603`): count 1000..100000 step 1000; flowSpeed 0..1.5 step 0.01; densityBias 0..1 step 0.05; wander 0..0.5 step 0.01; trail 0.002..0.03 step 0.001; size 0.0003..0.004 step 0.0001; exposure 0.1..1.2 step 0.02; contrast 1.4..3.0 step 0.05. **Advect range overrides** (spike `RANGE[0]`, `index.html:610-615`): trail 0.0005..0.02 step 0.0005; flowSpeed 0..0.3 step 0.002. `format` functions per spike `fmt` (e.g. count→`toLocaleString`, flowSpeed→`toFixed(2)`, trail→`toFixed(3)`, size→`toFixed(4)`).

**Test names + assertions** (TDD — the spec calls out "`paramSpecs` defaults sit within declared ranges"):
- [ ] `every advect default sits within its FLOW_ADVECT_PARAM_SPECS range` — for each spec, `defaultFlowSlice.advect[id]` in `[min,max]`.
- [ ] `every streamline default sits within its FLOW_PARAM_SPECS range` — same for `defaultFlowSlice.streamline`.
- [ ] `advect trail range is the tightened override (0.0005..0.02)` — assert the advect trail spec min/max.
- [ ] `wander spec is present for advect and absent for streamline` — assert id membership in each list.
- [ ] Run-fail → implement → `npm test -- cosmic-flow/visualizations/flowParams` passes.
- [ ] Commit: `feat(cosmic-flow): flow-field param specs with spike ranges + advect overrides`.

### Task 20: Flow compute WGSL module

**Files:** `tools/cosmic-flow/src/visualizations/flowField/flow.compute.wgsl.ts` (new).

Export `const flowComputeWgsl: string`. Port the spike's compute module verbatim behaviorally (`tools/spike/public/index.html:153-309`): the PCG hash + `rand01`, `randomStream`, `insideBox`, `overdensity`, `pickSpawn` (rejection sampling), the `advect` entry (pathline ring, carried-distance accumulator, density-weighted respawn, per-step wander jitter), and the `streamline` entry (centred line, walk ±v from the seed). Inject the constants `TRAIL`, `LIFE`, `DENS_SCALE` from typed module consts (spike `index.html:102-109`).

**Compute uniform `Prm` struct byte layout** (spike `struct Prm` `index.html:169`, buffer `size:48` `index.html:147`; std140 — note u32 and f32 are both 4-byte, packed sequentially):

| field | type | byte offset |
|---|---|---|
| dt | f32 | 0 |
| trailStep | f32 | 4 |
| headStep | f32 | 8 |
| n | u32 | 12 |
| frame | u32 | 16 |
| mode | u32 | 20 |
| seedFlag | u32 | 24 |
| bias | f32 | 28 |
| wander | f32 | 32 |

(Buffer 48 bytes — padded to 16-byte multiple; the spike writes dt/trailStep/headStep at 0, n/frame/mode/seedFlag at 12, bias at 28, wander at 32 — `index.html:794-797`.)

**Constants to preserve (spike `index.html:102-109`):** `TRAIL=32`, `LIFE=8.0`, `FADE=1.4`, `DT=0.016`, `MAX_PARTICLES=100000`, `HEAD_STEP_SCALE=0.012`, `SPEED_COLOR_MAX=1200.0`, `DENS_SCALE=1.0`, plus the in-shader salts (`PARTICLE_SALT=8`, `FRAME_SALT=9781`, `AGE_SALT=100`, `WANDER_SALT=257`, `SEED_TRIES=16`). Put `TRAIL`/`LIFE`/`DT`/`MAX_PARTICLES`/`HEAD_STEP_SCALE`/`FADE`/`SPEED_COLOR_MAX`/`DENS_SCALE` in a shared `tools/cosmic-flow/src/visualizations/flowField/constants.ts` so both the compute and render modules read them.

- [ ] Create `constants.ts` then `flow.compute.wgsl.ts` (template literal injecting the constants — match the spike's `wgslF` float-literal emission so integers print as `8.0`, `index.html:114`).
- [ ] `npm run typecheck` → passes.
- [ ] Commit: `feat(cosmic-flow): flow compute WGSL (advect + streamline integrators)`.

### Task 21: Flow render WGSL module

**Files:** `tools/cosmic-flow/src/visualizations/flowField/flow.render.wgsl.ts` (new).

Export `const flowRenderWgsl: string`. Port the spike's trail render shader behaviorally (`tools/spike/public/index.html:311-380`): `vsTrail` (per-particle triangle-strip ribbon through TRAIL points, screen-space tangent + perpendicular widening by `cam.width`, world-space so it rotates with the cube; `gridToWorld` maps voxel `[0,1]`→`[-1,1]`), the speed→colour ramp (COOL→WARM + GLOW), and the two alpha models (advect: `along * birth/death fade` using LIFE/FADE; streamline: travelling pulse `PULSE_FLOOR + pow(fract(along - phase + rand01(ii)), PULSE_SHARPNESS)`). `fsTrail` returns `vec4(col*alpha, alpha)`. Inject TRAIL/LIFE/FADE/SPEED_COLOR_MAX from `constants.ts`; keep render-only consts (`COOL`, `WARM`, `GLOW=0.5`, `PULSE_FLOOR=0.12`, `PULSE_SHARPNESS=4.0`, `TANGENT_EPS`) inline (spike `index.html:317-321`).

**Render `Cam` uniform struct byte layout** (spike `struct Cam` `index.html:323`, buffer `size:80` `index.html:148`; mat4x4 occupies 64 bytes, then f32×3 + u32):

| field | type | byte offset |
|---|---|---|
| mvp | mat4x4<f32> | 0 |
| width | f32 | 64 |
| aspect | f32 | 68 |
| phase | f32 | 72 |
| mode | u32 | 76 |

(Buffer 80 bytes. Spike writes mvp at 0, `[width, aspect, phase]` at 64, `mode` at 76 — `index.html:774-776`.)

- [ ] Create the file (template literal; preserve the `gridToClip` central-difference tangent and the `cam.mode==0u` advect branch vs streamline pulse branch exactly).
- [ ] `npm run typecheck` → passes.
- [ ] Commit: `feat(cosmic-flow): flow render WGSL (ribbon vsTrail/fsTrail)`.

### Task 22: FlowFieldVisualization — resources + init

**Files:** `tools/cosmic-flow/src/visualizations/flowField/FlowFieldVisualization.ts` (new).

Implements `Visualization` (spec §4). `id='flowField'`, `label='Flow'`, `paramSpecs` = the union of base + advect specs (the ControlsPanel filters by active mode — Task 25 / 29). `init(ctx)` acquires: the two per-mode buffer sets (`part`/`trail`/`acc`) — one each for advect + streamline so the fields stay independent (spike `makeBufs` + `bufs=[...]` `index.html:139-144`), `compPrm` (48B), `camBuf` (80B), two compute pipelines (advect/streamline entries, `layout:'auto'`), the per-mode compute bind groups (advect binds `acc` at binding 5; streamline omits it — spike `index.html:480-498`), the ribbon render pipeline (triangle-strip, additive `one/one` blend into the HDR target — spike `index.html:501-505`), the per-mode render bind groups (spike `index.html:507-511`). Buffers/textures registered with a `createDisposableTracker` (Task 7); `dispose()` calls `disposeAll`.

**Seeding model (spike):** a `seedPending[2]` flag pair; on init both true, seed both up front via a one-shot compute dispatch with `seedFlag=1` in its OWN submit so it can't race the frame `compPrm` (spike `seedMode` `index.html:751-760`). Since the Engine owns the per-frame encoder, FlowField needs a seed hook — see `encodeCompute` (Task 23).

**Contract:** standard `Visualization` shape. Add a private method to (re)request a seed: the density-bias slider change and a reset must reseed the affected mode (spike `index.html:643-647`,`559`). Expose this via the store: when `densityBias` changes the UI sets a `seedPending` flag — **Decision §C** covers where seed state lives (store vs viz-internal).

- [ ] Implement `init` against the cited spike resource setup; route shader creation through `ctx.createShaderModule`, the velocity texture/sampler from `ctx.field.textureView`/`ctx.field.sampler`.
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify deferred to Task 25.
- [ ] Commit: `feat(cosmic-flow): FlowFieldVisualization init (buffers, pipelines, bind groups)`.

### Task 23: FlowField `encodeCompute`

**Files:** `tools/cosmic-flow/src/visualizations/flowField/FlowFieldVisualization.ts` (modify).

`encodeCompute(encoder, frame)` (spec §4): write `compPrm` for the active mode from `frame.params` — `dt=DT`, `trailStep=trail`, `headStep=flowSpeed*HEAD_STEP_SCALE`, `n=round(count)`, `frame=frame.frame`, `mode`, `seedFlag=0`, `bias=densityBias`, `wander=(mode==='advect'?wander:0)` (spike `index.html:794-797`). If a mode has a pending seed, emit a seed dispatch with `seedFlag=1` first (spike defers seeds to their own submit `index.html:792-793`; here they share the Engine encoder — the seed compute writes the trail buffers before the main dispatch reads them in the SAME encoder, which is ordered within a compute pass sequence). Dispatch `ceil(n/64)` workgroups for the active mode.

> **WebGPU ordering caveat (memory `feedback_webgpu_auto_layout_trap` + the CLAUDE.md writeBuffer-race note):** the spike used separate submits for seeding to avoid `writeBuffer`/`submit` ordering hazards. Within one encoder, multiple `beginComputePass` calls execute in submission order, so a seed pass followed by an advance pass is safe IF they are distinct passes (not interleaved `writeBuffer` between dispatches in the same pass). Encode seed-pass → end → advance-pass → end. Verify visually that seeding-on-bias-change doesn't flicker.

- [ ] Implement; preserve `HEAD_STEP_SCALE` decoupling of speed from trail length (spike `index.html:790`).
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify deferred to Task 25.
- [ ] Commit: `feat(cosmic-flow): FlowField encodeCompute (integrate + density-weighted seed)`.

### Task 24: FlowField `encode` (draw)

**Files:** `tools/cosmic-flow/src/visualizations/flowField/FlowFieldVisualization.ts` (modify).

`encode(pass, frame)` (spec §4): write `camBuf` — `mvp = frame.viewProj`, `width = size` param, `aspect = frame.size[0]/frame.size[1]`, `phase` (the travelling-pulse phase, advanced per frame by `dt * flowSpeed` — spike `flowPhase` `index.html:772`; **Decision §D:** phase accumulator location), `mode`. Set the ribbon pipeline + active-mode render bind group; `pass.draw(2*TRAIL, n)` (spike `index.html:806`).

- [ ] Implement; the phase accumulator advances in `encode` (or the Engine passes it via `FrameContext` — see Decision §D).
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify deferred to Task 25.
- [ ] Commit: `feat(cosmic-flow): FlowField encode (ribbon draw, per-mode bind group)`.

### Task 25: Register FlowField + first visual parity check

**Files:** `tools/cosmic-flow/src/visualizations/flowField/register.ts` (new) or fold registration into a `tools/cosmic-flow/src/visualizations/index-registrations.ts` module imported by the Engine bootstrap.

- [ ] `register('flowField', () => new FlowFieldVisualization())` (or factory function form per Task 16's `VisualizationFactory`).
- [ ] Ensure the Engine bootstrap imports the registrations module so `listFactories()` sees it.
- [ ] `npm run typecheck` → passes.
- [ ] **Visual-verify (the user looks):** with the data bin present (Task 4 regeneration) and `npm run cosmic-flow` running, the viewport should show — in the default `streamline` mode — a rotating cube of glowing blue→orange streamline curves with a travelling pulse, density-clustered toward structures (densityBias 1). Switching to advect (once ModeTabs exist, Task 27/29) shows continuous drifting pathlines. This matches the spike at `localhost:5300` vs the spike's view. Describe to the user: "rotating glassy cube of glowing flow filaments; orange where fast, blue where slow; pulses travel along the streamlines."
- [ ] Commit: `feat(cosmic-flow): register FlowFieldVisualization`.

---

## Phase 7 — DensityVolumeVisualization (build + visual-verify)

### Task 26: Density volume params + WGSL

**Files:** `tools/cosmic-flow/src/visualizations/densityVolume/params.ts` (new), `tools/cosmic-flow/src/visualizations/densityVolume/volume.wgsl.ts` (new), `tests/tools/cosmic-flow/visualizations/volumeParams.test.ts` (new).

**Contract — `params.ts`:**
```ts
export type VolumeParams = VolumeSlice;   // intensity, dMax, alpha (Task 10)
export const VOLUME_PARAM_SPECS: readonly SliderSpec[];
```
Only `intensity` is a live slider (spike density-intensity slider, range 1..40 step 1 — `index.html:55`). `dMax`/`alpha` are fixed defaults (1.2 / 16) carried in the slice for future tunability; do NOT expose them as sliders unless trivially. The intensity spec: id `intensity`, label `density intensity`, min 1, max 40, step 1, format `String`.

**Contract — `volume.wgsl.ts`:** export `const volumeWgsl: string`. Port the spike's raymarch verbatim behaviorally (`tools/spike/public/index.html:408-464`): own fullscreen `vsFull`, `fsVolume` reconstructs a world ray from `invMvp`, slab-intersects the `[-1,1]` cube, front-to-back emission/absorption over `STEPS=128`, voxel `= (ro+rd*t)*0.5+0.5` (inverse of `gridToWorld`), `delta` from texture `.w`, `dn = clamp(delta/dMax,0,1)`, `col = mix(LOWCOL,HIGHCOL,dn)*dn*gain`, `a = clamp(dn*alphaScale*dt,0,1)`, early-out at `TRANS_CUTOFF=0.01`. Inline consts `STEPS=128`, `LOWCOL`, `HIGHCOL`, `TRANS_CUTOFF` (spike `index.html:409-412`).

**Volume `Vol` uniform struct byte layout** (spike `struct Vol` `index.html:414`, buffer `size:96` `index.html:150`; mat4x4 = 64B, then vec3+f32 packed, then two f32):

| field | type | byte offset |
|---|---|---|
| invMvp | mat4x4<f32> | 0 |
| eye | vec3<f32> | 64 |
| gain | f32 | 76 |
| dMax | f32 | 80 |
| alphaScale | f32 | 84 |

(Buffer 96 bytes. Spike writes invMvp at 0..15, eye at 64 (offsets 16/17/18 in the f32 view), gain at 76 (live = intensity), dMax at 80, alphaScale at 84 — `index.html:778-782`. `gain`←`intensity`, `dMax`←`dMax`, `alphaScale`←`alpha`.)

**Test names + assertions** (TDD — range check):
- [ ] `volume intensity default (10) sits within the intensity spec range (1..40)` — assert `defaultVolumeSlice.intensity` in `[1,40]`.
- [ ] `VOLUME_PARAM_SPECS exposes only the intensity slider` — assert length 1, id `intensity`.
- [ ] Run-fail → implement → `npm test -- cosmic-flow/visualizations/volumeParams` passes.
- [ ] Commit: `feat(cosmic-flow): density-volume params + raymarch WGSL`.

### Task 27: DensityVolumeVisualization + register + visual parity

**Files:** `tools/cosmic-flow/src/visualizations/densityVolume/DensityVolumeVisualization.ts` (new), registration wired into the registrations module.

Implements `Visualization`. `id='densityVolume'`, `label='Density'`. `init(ctx)`: `volBuf` (96B), the volume pipeline (own `vsFull`/`fsVolume`, additive `one/one` blend into the HDR target — spike `index.html:521-525`), the volume bind group (`volBuf` + `ctx.field.textureView` + `ctx.field.sampler` — spike `index.html:526-530`). No `encodeCompute`. `encode(pass, frame)`: compute `invMvp = mat4.invert(frame.viewProj)` (gl-matrix `mat4.invert` — replaces the spike's hand-rolled `invert4` `index.html:575-588`, spec §8 DRY), derive `eye` from the inverse (or pass via FrameContext — the spike read `eye` from the camera directly `index.html:780`; **Decision §E**), write `volBuf` (invMvp, eye, gain=intensity, dMax, alphaScale=alpha), draw the fullscreen triangle (`pass.draw(3)`). Density draws BEFORE trails in the shared HDR pass (Engine encode order, Task 18) so trails composite on top (spike `index.html:805-806`).

- [ ] Implement; register `('densityVolume', factory)`.
- [ ] `npm run typecheck` → passes.
- [ ] **Visual-verify (the user looks):** toggle density on (once LayerToggles exist, Task 29) — a translucent orange-cored / blue-shelled glow appears behind the flow at the dense knots; the intensity slider brightens it; the flow trails sit visibly on top. Matches spike density button + intensity slider behavior. Describe: "soft volumetric glow filling the dense regions, flow filaments layered over it."
- [ ] Commit: `feat(cosmic-flow): DensityVolumeVisualization (raymarch overlay) + register`.

---

## Phase 8 — UI components (component skill; CSS modules; tokens)

> All components: one folder per component under `tools/cosmic-flow/src/ui/<Name>/` with co-located `<Name>.module.css`, `function Name()` + `export default Name` (or named export per the curator's ui convention — match whichever the curator uses; the repo component skill prefers `export default`). `type` aliases never `interface`. `Vec2`/`Vec3` over tuples. Consume `var(--token)` from `global.css` (imported once in `main.tsx`). Reuse `common/Panel`, `common/Button`, `common/PillButton` (imported deep from `../../../../src/components/common/...`). These are presentational — they read from / write to the store via `useStore` + slice actions, no GPU coupling.

### Task 28: `Slider` + `Toggle`

**Files:** `tools/cosmic-flow/src/ui/Slider/Slider.tsx` + `.module.css`, `tools/cosmic-flow/src/ui/Toggle/Toggle.tsx` + `.module.css` (new).

**Contract — Slider:**
```ts
export type SliderProps = {
  readonly spec: SliderSpec;
  readonly value: number;
  readonly onChange: (v: number) => void;
};
```
Renders the `DebugPanel`-row idiom (spec §9): label + live value readout (via `spec.format`), an `<input type="range">` with `min`/`max`/`step` from `spec`, `--color-accent-control` fill, flanking min/max hints. Driven entirely by `paramSpecs`.

**Contract — Toggle:**
```ts
export type ToggleProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onToggle: () => void;
};
```
A labelled on/off control; reuse `common/Button` or `common/PillButton` for the affordance, tinted by tokens. Used for layer on/off and labels on/off.

- [ ] Implement both with co-located CSS modules referencing tokens (`--surface-control`, `--color-accent-control`, `--font-family-mono`, `--border-control`, focus ring).
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify: deferred to Task 30 (verified in the assembled panel).
- [ ] Commit: `feat(cosmic-flow): Slider + Toggle UI primitives (token-styled, paramSpec-driven)`.

### Task 29: `ModeTabs` + `LayerToggles`

**Files:** `tools/cosmic-flow/src/ui/ModeTabs/ModeTabs.tsx` + `.module.css`, `tools/cosmic-flow/src/ui/LayerToggles/LayerToggles.tsx` + `.module.css` (new).

**Contract — ModeTabs** (advect | streamline; a `flowSlice.mode` param, NOT a layer switch — spec §4):
```ts
export type ModeTabsProps = { readonly mode: FlowMode; readonly onSelect: (m: FlowMode) => void };
```
Two tab buttons (reuse `common/PillButton` or `common/Button`), active tab highlighted (token fill). Spike tab look at `index.html:46-49`,`27-30`.

**Contract — LayerToggles** (flow / density on-off; layers composite, not exclusive — spec §4):
```ts
export type LayerTogglesProps = {
  readonly flowField: boolean;
  readonly densityVolume: boolean;
  readonly onToggle: (layer: 'flowField' | 'densityVolume') => void;
};
```
Renders a `Toggle` per layer.

- [ ] Implement both; wire to the store via `useStore` selectors + `setFlowMode`/`toggleLayer` in the consuming panel (Task 30), or accept props (preferred — keep them presentational, the App wires the store).
- [ ] `npm run typecheck` → passes.
- [ ] Commit: `feat(cosmic-flow): ModeTabs + LayerToggles`.

### Task 30: `ControlsPanel`

**Files:** `tools/cosmic-flow/src/ui/ControlsPanel/ControlsPanel.tsx` + `.module.css` (new).

Composes `common/Panel` (reuse — `src/components/common/Panel/Panel.tsx`) wrapping: `ModeTabs`, the per-active-mode `Slider`s generated from the active layers' `paramSpecs` (spec §4 — the panel renders whatever specs the enabled layers expose: flow specs filtered by mode + the volume intensity slider when density is enabled), `LayerToggles`, the labels `Toggle`, an auto-rotate toggle, a reset button (reuse `common/Button`), and a "copy defaults" affordance (spike `index.html:668-678` — copies the current per-mode values as a paste-ready block; reuse `common/Button`).

**Contract:** `ControlsPanel` takes no props; reads everything via `useStore(store, selector)` and dispatches slice actions. `store` is provided via a module-level singleton or React context (spec §6 — the store is created once at app start). **Decision §F:** store provisioning (context vs import).

- [ ] Implement; the slider list is built by mapping the active layers' `paramSpecs` → `<Slider>` with `value` from `selectActiveFlowParams`/`volume` and `onChange` → the matching slice action. Active-mode filtering: advect shows wander + advect ranges; streamline omits wander (Task 19).
- [ ] Reset: dispatches a reseed of both modes (Decision §C) and optionally restores camera defaults.
- [ ] `npm run typecheck` → passes.
- [ ] Visual-verify: deferred to Task 31 (verified in the full shell).
- [ ] Commit: `feat(cosmic-flow): ControlsPanel (Panel + tabs + paramSpec sliders + toggles)`.

### Task 31: `Viewport`, `LabelsOverlay`, `Hud`, `App` shell + integration parity

**Files:** `tools/cosmic-flow/src/ui/Viewport/Viewport.tsx` + `.module.css`, `tools/cosmic-flow/src/ui/LabelsOverlay/LabelsOverlay.tsx` + `.module.css`, `tools/cosmic-flow/src/ui/Hud/Hud.tsx` + `.module.css`, `tools/cosmic-flow/src/app/App.tsx` + `.module.css` (new), `tools/cosmic-flow/src/main.tsx` (modify — render `App`).

**Viewport** owns the `<canvas>`, constructs + starts the `Engine` in a `useEffect` (spec §3 ui ring), attaches `attachOrbitControls(canvas, cam, { onCameraChange })` (reuse `src/services/camera/orbitControls.ts:129`), and disposes the Engine + detaches controls on unmount. **Camera/store bridge (Decision §G):** orbit controls mutate an `OrbitCamera`; the Engine reads camera state. Reconcile: either (a) controls write yaw/pitch/distance into the store and the Engine builds the camera from the store each frame, or (b) the Engine owns the `OrbitCamera` and `attachOrbitControls` mutates it directly, with `cameraSlice` only mirroring for UI. Pick (b) for parity with the spike's direct-mutation model (`index.html:551-555`), and have the auto-rotate toggle read from the store.

**Contract — Viewport:** `export type ViewportProps = {}` (or none); renders a full-bleed `<canvas>` (CSS from `global.css` `#c` idiom — but scoped via the module, with `touch-action: none`).

**LabelsOverlay** (spec §5 step 2): projects `placeStructures(STRUCTURE_CATALOG)` world positions through the store's `cameraSlice.viewProj` (engine-written each frame) to screen coords, renders a dot + name per visible structure (`cw > epsilon`), hidden when behind the camera. Toggled by `labelsSlice.enabled`. Port the spike projection math (`index.html:813-826`) — column-major mvp, `w<=0` → hidden. Pointer-events none.

**Contract — LabelsOverlay:** reads `viewProj` + `labels.enabled` via `useStore`; no props or minimal.

**Hud** (spike `#hud` `index.html:42-43`): particle count + fps + a one-line caption ("CF4++ peculiar-velocity flow · real 128³ supergalactic grid"). Reads `count` from the store; fps from the Engine (the Engine can publish fps to the store, or the Hud computes from RAF — keep it simple, Engine writes an fps field or the Hud is static minus fps). pointer-events none.

**App** (spec §3): the shell — `<Viewport>` + `<ControlsPanel>` + `<Hud>` + `<LabelsOverlay>` stacked; creates the store once and provides it (Decision §F). `.module.css` positions ControlsPanel top-right (spike `#ctl` `index.html:12`), Hud top-left, overlays fixed.

- [ ] Implement all four + wire `main.tsx` to render `<App>`.
- [ ] `npm run typecheck` → passes.
- [ ] **Visual-verify (the user looks) — full parity pass:** `npm run cosmic-flow`, open `localhost:5300` side-by-side with the spike (`tools/spike/` served separately if needed). Confirm: (1) default streamline view matches (rotating glow cube, pulses); (2) advect tab → drifting pathlines; (3) density toggle → volumetric glow behind flow, intensity slider works; (4) labels toggle → structure names land on the right knots (Virgo near centre, Shapley toward edge); (5) all sliders affect the flow as in the spike; (6) auto-rotate + reset + copy-defaults work; (7) the chrome reads as skymap (glass blue panels, mono type). Describe each to the user for confirmation. Fix any divergence before proceeding.
- [ ] Commit: `feat(cosmic-flow): Viewport + LabelsOverlay + Hud + App shell (full parity)`.

---

## Phase 9 — Spike retirement (gated on parity)

### Task 32: Delete `tools/spike/`

**Files:** delete `tools/spike/` (whole dir), `package.json` (remove any spike script if present), grep for stray references.

> **Gate:** ONLY after Task 31's visual parity is confirmed by the user. Spec §10: "Port to visual parity with the spike, verify by eye, then delete `tools/spike/`."

- [ ] Confirm with the user that parity is verified.
- [ ] Grep the repo for `tools/spike` references (Grep tool, not bash grep) — package.json scripts, docs, tests — and remove/redirect them.
- [ ] Delete `tools/spike/`. The `convertCf4ppVfield.py` + `findEdgeAttractors.py` already moved in Task 4, so nothing unique is lost.
- [ ] `npm run typecheck` + `npm test` → green.
- [ ] Commit: `chore(cosmic-flow): retire tools/spike at parity`.

---

## Phase 10 — WESL shader conversion (post-parity; added 2026-06-03)

> **Gate:** only after Phase 8 visual parity is confirmed. The working WGSL-string
> version + the spike are the golden references — convert against them so any
> regression is unambiguously the WESL change. Refactor-style plan (terse): the
> shader *source* barely changes; what changes is the plumbing.

Decision (user, 2026-06-03): adopt WESL to match the main app's shader system,
but AFTER reaching a known-good rendered baseline (debugging a new wesl-plugin
build + the port + WESL const-injection simultaneously against a blank canvas is
the failure mode CLAUDE.md warns about).

- [ ] Add `wesl-plugin` to `tools/cosmic-flow/vite.config.ts` (mirror the main app's `vite.config.ts` wesl setup) + the `wesl.toml`/package wiring the runtime uses.
- [ ] Move each WGSL template module to a `.wesl` file under `src/<viz>/shaders/` (mirroring `src/services/gpu/shaders/`): `blit`, `flow.compute`, `flow.render`, `volume`. NO backticks in WESL comments (wesl-plugin parse error — use single quotes; see memory `feedback_wesl_no_backticks`).
- [ ] Replace JS template-literal constant injection (`${TRAIL}u`, `wgslF(...)`) with WESL's const/`?static`/`package::` mechanism (memory `project_wesl_conversion`). The typed constants in `flowField/constants.ts` become the single source the `.wesl` reads.
- [ ] Update `makeShaderFactory`/viz `init` to consume the wesl-plugin module output instead of a raw string.
- [ ] Visual-verify each shader still renders identically to the WGSL baseline; typecheck + tests green.
- [ ] Commit per shader converted.

## Decisions the implementer must resolve (flagged inline above)

These are genuine ambiguities between the spike's hand-rolled coordinate handling and the repo's verified transform. Resolve each with a test (where TDD applies) or a one-line ADR-style note in the relevant module header. The plan does not pre-decide them because the correct answer depends on what the verification test (Task 14) reveals about the shared transform vs the spike's empirical fit.

- **§A — Hubble-h factor in structure placement.** The spike multiplied SG-Mpc by `SG_H=0.77` before voxel-indexing (`index.html:687`,`701`); `sgToVoxelIndex` (`coordinates.ts:51-57`) has no h-factor and treats the box as 1000 Mpc/h directly. Determine empirically (Task 14 anchor tests) whether structures land on overdensities with or without the h-multiply, and pin it. The `boxMpcPerH` meta key (1000) implies the grid is already in Mpc/h, so RA/Dec/dist (physical Mpc) likely needs `* h` before indexing — but the verified spike fit is the ground truth; reproduce it.
- **§B — Axis permutation.** The spike maps texture x←SGZ, y←SGY, z←SGX and world x←k, y←j, z←i (`index.html:684-685`,`697`,`702`). The texture upload is C-order `[z][y][x]` with components xyz=velocity. The renderer's `gridToWorld` and the structure mapping must agree on which voxel axis is which world axis. Reproduce the spike's empirically-verified permutation (every massive cluster on a δ>1 knot — `index.html:686`) and lock it with the Task 14 anchor test.
- **§C — Seed-pending state location.** Whether `seedPending[2]` lives in the store (a `flowSlice` field) or inside the FlowFieldVisualization. Recommend viz-internal with a store-driven trigger: a `flowSlice.reseedToken` counter the UI bumps (reset / densityBias change) and the viz watches via `FrameContext`. Keeps the store free of GPU concerns.
- **§D — Flow phase accumulator.** The streamline travelling-pulse phase (`flowPhase += dt*flowSpeed`, spike `index.html:772`). Recommend the Engine accumulates it and passes via `FrameContext.params` (key `phase`), OR the FlowField accumulates internally from `frame.dt`. Pick one; keep it out of the store (it's per-frame transient).
- **§E / §F / §G — camera/eye, store provisioning, camera ownership** — described inline at Tasks 27, 30, 31. Resolve consistently: Engine owns the `OrbitCamera` (controls mutate it directly, parity with spike); `cameraSlice` mirrors yaw/pitch/distance for UI + carries the engine-written `viewProj` for labels; `eye` for the volume raymarch is read from `cam.position` (reuse) not recomputed from `invMvp`.

---

## Self-review

**Spec coverage (every section → task):**
- §1 Purpose / §2 Scope → the whole plan; non-goals (no backend, no persistence, no mobile-opt beyond reused controls, no GPU visual tests) honored — no tasks add them.
- §3 Architecture (three rings, directory layout, patterns) → Tasks 1, 5–8, 16 (Strategy+Registry), 18 (Facade), 9 (Observer), 15 (Render-graph), 7+17 (Factory+Disposable). Directory matches spec §3 tree.
- §4 Strategy+Registry, SliderSpec/Visualization, advect-vs-streamline-as-param → Tasks 5, 16, 19, 22–25 (mode is a flow param), 29 (ModeTabs is a param control).
- §5 Engine/render loop, FrameContext/EngineContext, continuous RAF + hidden-pause → Tasks 6, 15, 18.
- §6 Store/slices/selectors → Tasks 9, 10, 12.
- §7 Domain (VelocityField factory, structures via shared coords) → Tasks 11, 13, 14, 17.
- §8 DRY/reuse table → every row mapped: gl-matrix+orbitCamera (18), orbitControls (31), coordinates+superGalacticTransform (14), shaderCompileLogger (8), device (18), reusable Slider (28), Vec aliases (throughout).
- §9 UI style parity (global.css tokens, reuse Panel/Button/PillButton, build Slider/Toggle, component skill) → Tasks 1 (import global.css), 28–31.
- §10 Build/testing/retirement → Tasks 1–4 (build), TDD tasks flagged honestly (testing), 32 (retirement); `convertCf4ppVfield.py`→data/ (Task 4), `findEdgeAttractors.py` retained (Task 4).
- §11 Deferred (render-on-demand, promoting Slider/Toggle, extra layers) → explicitly NOT built; continuous RAF in Task 18.

**Placeholder scan:** no "TBD"/"similar to Task N"/"add error handling" placeholders — Decisions are explicit, flagged, and each has a recommended resolution. The only deferred-body case (Task 11/17 split) is explicitly justified for import-resolution ordering.

**Type consistency:** `SliderSpec`/`Visualization`/`EngineContext`/`FrameContext` defined Tasks 5–6, consumed Tasks 15–31. `Store`/`AppState`/slice types defined Tasks 9–10, consumed by selectors (12), Engine (18), UI (28–31). `VelocityField` type defined Task 11, consumed by EngineContext (6) and the factory body (17). `FlowModeParams` defined in `flowSlice` (10), re-exported as `FlowParams` (19) and `VolumeSlice` as `VolumeParams` (26) — single source. `Vec2`/`Vec3`/`Mat4`/`FlowMode` names consistent across all tasks. Byte-layout tables (Prm 48B / Cam 80B / Vol 96B / Blit 16B) match the spike's buffer sizes and write offsets.

**TDD honesty:** genuine TDD on Tasks 3, 7, 9, 10, 12, 14, 16, 19, 26 (store/slices/selectors/structures/registry/params/disposable + smoke). GPU/WGSL/React tasks (15, 17, 18, 20–25, 27, 28–31) are implement→typecheck→visual-verify, explicitly NOT unit-tested — no fabricated GPU tests.
