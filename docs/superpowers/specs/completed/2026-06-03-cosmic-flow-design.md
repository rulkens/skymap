# Cosmic Flow — design

**Status:** design, awaiting plan
**Date:** 2026-06-03
**Supersedes:** the `tools/spike/` CF4++ flow prototype (retired at parity — see §10)

## 1. Purpose

A standalone WebGPU tool for exploring the **Cosmicflows-4++ peculiar-velocity
field** — a 128³ supergalactic velocity grid — as glowing, animated flow.
It is a developer/research instrument, not part of the skymap runtime bundle.

The prototype (`tools/spike/public/index.html`) proved the visuals work: two
flow modes (advect pathlines, static streamlines), a density-volume overlay,
and real cosmic-structure labels. It is a single 700-line HTML file with
hand-rolled math, inline WGSL, and DOM-built controls. This spec rebuilds it
as a properly-architected Vite + TypeScript + React app so it can be extended
and maintained.

Flow is the identity of the tool. The density volume and labels are *context
layers* drawn behind the flow, not co-equal features.

## 2. Scope

**In scope (first release — parity with the spike, cleanly built):**

- Flow-field visualization with two sub-modes: **advect** (continuous
  pathlines) and **streamlines** (static curves with a travelling pulse).
- **Density-volume overlay** — raymarch of the overdensity field δ (carried in
  the velocity texture's alpha channel), toggleable, with a live intensity
  control.
- **Structure labels** — curated cosmic structures (Virgo, Shapley, …)
  projected onto the view, toggleable.
- Orbit camera, HDR-accumulate → Reinhard-tonemap render path.
- Per-mode tunable parameters via sliders; copy-current-values affordance.

**Architected for (not built now):** additional field layers (e.g. the MCPM
"rhizome" density field, clusters, filaments) added as new `Visualization`
implementations without touching the engine, store, or UI shell.

**Non-goals (YAGNI):**

- No backend/API plugin (the curator has one; this tool reads prebuilt static
  assets only).
- No persistence of UI state across reloads.
- No mobile/touch optimization beyond what the reused orbit controls provide.
- No automated GPU/visual testing (consistent with the repo — renderers are
  verified by eye).

## 3. Architecture — hexagonal, three rings

Dependencies point inward. **The `engine/` and `visualizations/` core import no
React; the React `ui/` imports no GPU.** They meet at exactly two seams: the
typed **store** and the **`Visualization`** interface.

```
tools/cosmic-flow/
  vite.config.ts  index.html  tsconfig.json  README.md
  src/
    main.tsx                      # DOM adapter — mounts React, imports global.css tokens
    app/App.tsx (+ .module.css)   # shell: Viewport + ControlsPanel + Hud + LabelsOverlay

    engine/                       # ── CORE · framework-agnostic, no React ──
      Engine.ts                   # Facade: owns device, render loop, camera, orchestration
      RenderGraph.ts              # HDR accum target → Reinhard tonemap blit (Pipeline)
      EngineContext.ts            # init-time services handed to a viz
      FrameContext.ts             # per-frame inputs handed to a viz
      gpu/shaderFactory.ts        # wraps src/ createShaderModuleWithDevLog
      gpu/disposable.ts           # Disposable contract + resource tracker

    visualizations/               # ── Strategy implementations + Registry ──
      Visualization.ts            # the interface (Strategy contract)
      registry.ts                 # register() / list()  (Registry pattern)
      flowField/
        FlowFieldVisualization.ts
        flow.compute.wgsl.ts      # advect + streamline integrators
        flow.render.wgsl.ts       # ribbon vsTrail / fsTrail
        params.ts                 # FlowParams type + defaults + slider specs
      densityVolume/
        DensityVolumeVisualization.ts
        volume.wgsl.ts            # raymarch
        params.ts

    field/                        # ── domain: the data being inspected ──
      VelocityField.ts            # loads cf4pp_vfield.bin/.json → 3D texture + meta (Factory)
      structures.ts               # curated catalog → world coords via tools/utils coordinates

    state/                        # ── Observer store · typed slices + selectors ──
      store.ts                    # observable + getSnapshot + subscribe + useStore
      slices/{view,camera,flow,volume,labels}Slice.ts
      selectors.ts

    ui/                           # ── React adapter · component skill, CSS modules ──
      Viewport/        # owns the <canvas>, constructs + starts the Engine
      ControlsPanel/   # composes ModeTabs + LayerToggles + Sliders for active layers
      ModeTabs/        # advect | streamline (a flowSlice param, not a layer switch)
      LayerToggles/    # flow / density on-off (layers composite, not exclusive)
      Slider/ Toggle/ LabelsOverlay/ Hud/

  public/  cf4pp_vfield.bin + .json   # gitignored build artifacts (~16 MB)
  data/    convertCf4ppVfield.py      # one-off npz → rgba16f extractor (numpy)
```

**Patterns in play:** Ports & Adapters (hexagonal), Strategy + Registry
(visualizations), Facade (engine API), Observer (state store), Render-graph /
Pipeline (passes), Factory + Disposable (GPU resources).

## 4. The extensibility seam — Strategy + Registry

A visualization is a self-contained layer. Adding one is implementing this
interface and calling `register()` — the engine, store, and UI shell are
untouched, because the controls panel renders whatever `paramSpecs` the active
layers expose.

```ts
// visualizations/Visualization.ts (contract — implementation lives per-viz)
export type Visualization = {
  readonly id: string;            // 'flowField' | 'densityVolume' | …
  readonly label: string;         // shown in the view switcher
  readonly paramSpecs: readonly SliderSpec[];  // UI generated from this

  /** Acquire GPU resources. May be async (shader compile, buffer fill). */
  init(ctx: EngineContext): Promise<void> | void;

  /** Optional pre-render compute (the flow integrator runs here). */
  encodeCompute?(encoder: GPUCommandEncoder, frame: FrameContext): void;

  /** Additive draws into the shared HDR pass. */
  encode(pass: GPURenderPassEncoder, frame: FrameContext): void;

  /** Free every GPU resource acquired in init(). */
  dispose(): void;
};
```

```ts
// SliderSpec — the single source of truth the UI reads to build controls
export type SliderSpec = {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format?: (v: number) => string;
};
```

Key consequence: **advect vs streamlines is a `flowSlice` parameter, not a
separate visualization.** Density is a separate toggleable layer. Multiple
layers can be enabled at once and composite additively in one shared HDR target
(density glow behind flow trails — exactly the spike's behavior).

## 5. Engine — Facade + render loop

`Engine` is a framework-agnostic class. It is constructed with a canvas and a
store handle, holds the registry's instantiated visualizations, and runs the
loop. It exposes a tiny surface: `start()`, `stop()`, `dispose()`.

Per frame, in one command encoder:

1. Read a store snapshot → assemble `FrameContext` (viewProj, dt, canvas size,
   per-viz param snapshots, enabled-layer set).
2. Update the orbit camera (reused `computeViewProj`); write the current
   `viewProj` back to the store so the React `LabelsOverlay` projects labels in
   sync with the rendered frame.
3. For each **enabled** viz with `encodeCompute`, encode its compute pass.
4. Begin the shared HDR accumulation render pass (clear); each enabled viz
   `encode`s its additive draws; end.
5. `RenderGraph` tonemaps the HDR target to the swapchain (Reinhard + contrast
   + gamma, exposure/contrast from the active flow params).
6. Submit.

Continuous `requestAnimationFrame` (auto-rotate is a first-class feature);
the loop pauses when the document is hidden. Render-on-demand is a later
refinement, explicitly deferred.

```ts
// FrameContext — everything a viz needs to draw this frame, nothing more
export type FrameContext = {
  readonly viewProj: Mat4;
  readonly dt: number;            // seconds, clamped
  readonly frame: number;
  readonly size: Vec2;            // drawable pixels
  readonly enabled: ReadonlySet<string>;
  readonly params: Readonly<Record<string, number>>;  // active snapshot
};

// EngineContext — init-time services a viz acquires resources from
export type EngineContext = {
  readonly device: GPUDevice;
  readonly hdrFormat: GPUTextureFormat;
  readonly field: VelocityField;   // shared 3D texture + sampler + metadata
  readonly createShaderModule: (code: string, label: string) => GPUShaderModule;
};
```

## 6. State — Observer store, typed slices + selectors

A small zero-dependency observable. React binds via `useSyncExternalStore`
(the React-blessed external-store pattern); the engine reads `getSnapshot()`
outside React each frame. Updates are immutable (copy-on-write), honoring the
repo's immutability preference.

```ts
// state/store.ts (contract)
export type Store<S> = {
  getSnapshot(): Readonly<S>;
  subscribe(listener: () => void): () => void;
  setState(update: (prev: Readonly<S>) => Readonly<S>): void;
};
export function createStore<S>(initial: S): Store<S>;
export function useStore<S, T>(store: Store<S>, selector: (s: Readonly<S>) => T): T;
```

Slices — each a typed object with a default and pure action creators:

- `viewSlice` — which layers are enabled (`{ flowField: boolean; densityVolume: boolean }`).
- `cameraSlice` — yaw/pitch/distance/auto-rotate; plus the engine-written `viewProj`.
- `flowSlice` — mode (`'advect' | 'streamline'`) + per-mode params (count, flow
  speed, density bias, wander, trail, size, exposure, contrast).
- `volumeSlice` — density overlay intensity, dMax, alpha.
- `labelsSlice` — labels on/off.

`selectors.ts` holds named selectors (`selectActiveFlowParams`,
`selectEnabledLayers`, …) so components and the engine share one definition of
"what derives from state."

## 7. Domain data

- **`field/VelocityField.ts`** (Factory) — fetches `cf4pp_vfield.bin` + `.json`,
  uploads the rgba16float 128³ texture (rgb = velocity, a = δ), exposes the
  texture view, a linear sampler, and metadata (`n`, `boxMpcPerH`, δ stats).
- **`field/structures.ts`** — the curated structure catalog (RA/Dec/distance)
  and the world-space positions, computed at runtime via
  `tools/utils/math/coordinates.ts` (`eqToSg`, `sgToVoxelIndex`) +
  `src/data/superGalacticTransform`. **This replaces the spike's hand-rolled
  ICRS→Galactic→Supergalactic rotation matrices** with the repo's verified
  transform — single source of truth.

## 8. DRY / reuse

| Spike hand-rolls | Replaced by |
|---|---|
| mat4 / perspective / lookAt / invert | `gl-matrix` + `src/services/camera/orbitCamera` (`computeViewProj`) |
| pointer / wheel orbit handlers | `src/services/camera/orbitControls` (`attachOrbitControls`) |
| RA/Dec → supergalactic rotation matrices | `tools/utils/math/coordinates` + `src/data/superGalacticTransform` |
| raw `createShaderModule` | `src/services/gpu/shaderCompileLogger` (iOS-safe compile errors) |
| inline device / canvas setup | `src/services/gpu/device` (`initGpu`, `resizeCanvasToDisplay`) |
| hand-built slider DOM + syncLabels | reusable `<Slider>` driven by `paramSpecs` |
| numeric tuples | `Vec2` / `Vec3` / `Mat4` aliases from `src/@types/math` |

WGSL stays as readable per-viz template modules; shared constants are injected
from each viz's typed `params.ts` defaults (same idea as the spike, but typed
and co-located with the visualization that owns them).

## 9. UI style parity

The tool wears skymap's exact chrome by **consuming the same token system, not
re-specifying a look:**

- **Import `src/styles/global.css` once** in `main.tsx`. Every tool CSS module
  references `var(--token)` — glass surfaces (`--surface-panel`, `--blur-panel`),
  blue palette (`--color-fg`, `--color-accent-control`), mono typography
  (`--font-family-mono`), radii, focus rings, Material motion. Pixel-identical
  to the main UI; a future theme tweak in `global.css` retints the tool for free.
- **Reuse `src/components/common/Panel`** for the controls container and
  **`common/Button` / `common/PillButton`** for actions, layer toggles, and the
  mode tabs. These are pure presentational components — no engine coupling.
- **Build `<Slider>` + `<Toggle>` in the tool**, styled from the tokens to
  match the `DebugPanel` row idiom (label + live value readout,
  `--color-accent-control` fill). Driven by `paramSpecs`. If they prove general,
  the follow-up is promoting them to `src/components/common/` — but extracting
  them from the engine-coupled `DebugPanel` is out of scope here.
- All components follow the **component skill**: one folder per component,
  co-located `.module.css`, named exports, `type` aliases (never `interface`),
  `Vec2`/`Vec3` aliases over raw tuples.

Net effect: the inspector reads as "the same product, a different screen" —
dark glassmorphic blue panels floating over the black field view.

## 10. Build, testing, retirement

**Build wiring**
- `tools/cosmic-flow/vite.config.ts` — `root` = this dir, own port (5300),
  `@vitejs/plugin-react`. Modeled on the curator's config (the *wiring*
  precedent), not its internal layout.
- `npm run cosmic-flow` = `vite --config tools/cosmic-flow/vite.config.ts`.
- `tools/cosmic-flow/tsconfig.json` extends the root tsconfig and includes
  `../../src` + `../../tools/utils` for cross-dir imports. Folded into
  `npm run typecheck`.
- Data bin is gitignored (build artifact, like `public/data/*.bin`). README
  documents regeneration via `data/convertCf4ppVfield.py` (numpy; reads the
  CF4++ npz). The structure catalog needs no precomputed asset — positions are
  derived at runtime from the shared coordinate transform.

**Testing (vitest, mirrors the repo convention)**
- Unit-tested, no GPU: store + slices + selectors (immutable updates,
  subscription, selection); `structures.ts` world-position mapping (pure, via
  shared coords — assert known structures land at expected voxels); `paramSpecs`
  defaults sit within declared ranges.
- Not unit-tested: WGSL / GPU passes (verified visually, per repo norms).

**Spike retirement**
- Port to visual parity with the spike, verify by eye, then delete
  `tools/spike/`. The `convertCf4ppVfield.py` extractor moves into
  `tools/cosmic-flow/data/`. `findEdgeAttractors.py` (the one-off attractor
  analysis) is not part of the tool; retain it under `data/` as a documented
  analysis script or drop it once its confident matches are folded into the
  structure catalog.

## 11. Open questions / deferred

- **Render-on-demand** — deferred; continuous RAF for now.
- **Promoting `<Slider>`/`<Toggle>` to `common/`** — deferred until a second
  consumer exists.
- **Additional field layers** (rhizome density, clusters, filaments) — the
  architecture supports them; none are built in this release.
- **Reseed on reset / density-bias change** — deferred. `seedPending` is
  one-way (set once, never re-armed), so streamline anchors are fixed after the
  initial seed and the density-bias slider is inert in streamline mode until
  reload. Advect tracks bias live via natural respawn, so the gap is
  streamline-only. A `flowSlice.reseedToken` the UI bumps (reset button /
  `setDensityBias`), watched in `FlowFieldVisualization.encodeCompute`, would
  close it — this is plan decision §C, left unbuilt.
