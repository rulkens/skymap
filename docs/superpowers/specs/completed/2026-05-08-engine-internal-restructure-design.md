# Engine Internal Restructure (Spec B)

**Date:** 2026-05-08
**Status:** Spec
**Predecessor:** [Engine ↔ Renderer Boundary Tightening (Spec A)](2026-05-07-engine-renderer-boundaries-design.md) — landed 2026-05-07

## Goal

Reduce `engine.ts` from 2377 lines to ~1500 (~37%) by extracting code that has no business living in one file: the giant async bootstrap IIFE, the per-frame body, the per-source slot-wiring boilerplate, the duplicated tween-to-galaxy logic, and the table-shaped settings dispatch.

This spec deliberately does **NOT** change observable behaviour. Every PR is a pure refactor — same per-frame work, same callbacks, same public handle surface. The point is to give the engine a shape that future feature work (MSDF labels' you-are-here controller, density-correction wiring, the deferred PR-#35 follow-ups) can attach to without re-inflating the file.

## Background

`engine.ts` post-Spec-A:

```
1–195    imports + module-scope helpers
196–604  createEngine setup (state init, hover/select helpers, scale-bar)
605–1722 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
         GIANT ASYNC IIFE (~1100 lines)
         GPU init • slot wiring per source • click handlers • frame body
         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
1726–2370 public handle (~640 lines: 13 dispatch-shaped setters,
          tween-driven select/focus, setTier, loadPgcAliases, …)
```

Five concerns dominate the smell:

1. **Settings setter table.** 13 of the public-handle setters follow the same `state.x = v; cb.onXChange?.(v); requestRender()` shape — copy-paste with renamed fields. Five other setters have non-trivial side-effects (`setBiasMode`, `setTier`, `setLodMode`, `setSourceVisible`, `setSpaceMouseSensitivity`) and rightly stay bespoke.
2. **Tween-to-galaxy duplication.** `selectFamous` (line 2077), `selectByAlias` (2163), and `handle.focusOn` each open-code "build target Vec3 from cloud row → start tween → requestRender". Three near-identical implementations.
3. **Frame body inline.** Lines 1405–1717 (~310 lines) live as a closure assigned to a forward-declared `frame` variable. The closure reads only from `state` and a few captured locals — it's effectively a pure function trapped inside a constructor.
4. **Slot wiring boilerplate.** The IIFE has ~5 near-identical blocks (SDSS, 2MRS, GLADE, Famous, Synthetic) that build an `AssetSlot`, subscribe it to a `commit` function, register with `aggregateRegistry`, and store in `state.assetSlots`. Sidecar slots (filaments, famousMeta, pgcAliases) are each one-off and don't fit the registry shape — they stay bespoke.
5. **Bootstrap IIFE.** The 1100-line IIFE is one undifferentiated try-block; a stack trace from line 900 says "from the bootstrap" with no further structure.

## Architecture

### #1 — Settings setter table

A new module `services/engine/settingsTable.ts` exports a typed table of "boring" setters and a builder that turns it into public-handle methods.

```ts
// settingsTable.ts
export type SettingDescriptor<K extends keyof EngineSettings> = {
  stateKey: K;
  callbackKey: keyof EngineCallbacks;  // typed via mapped lookup
};

export const SETTINGS_TABLE = {
  setPointSize: { stateKey: 'pointSizePx', callbackKey: 'onPointSizeChange' },
  setBrightness: { stateKey: 'brightness', callbackKey: 'onBrightnessChange' },
  setAutoRotate: { stateKey: 'autoRotate', callbackKey: 'onAutoRotateChange' },
  setGalaxyTexturesEnabled: { stateKey: 'galaxyTexturesEnabled', callbackKey: 'onGalaxyTexturesChange' },
  setMilkyWayEnabled: { stateKey: 'milkyWayEnabled', callbackKey: 'onMilkyWayEnabledChange' },
  setFilamentsEnabled: { stateKey: 'filamentsEnabled', callbackKey: 'onFilamentsEnabledChange' },
  setFilamentIntensity: { stateKey: 'filamentIntensity', callbackKey: 'onFilamentIntensityChange' },
  setHighlightFallback: { stateKey: 'highlightFallback', callbackKey: 'onHighlightFallbackChange' },
  setRealOnlyMode: { stateKey: 'realOnlyMode', callbackKey: 'onRealOnlyModeChange' },
  setDepthFadeEnabled: { stateKey: 'depthFadeEnabled', callbackKey: 'onDepthFadeEnabledChange' },
  setAbsMagLimit: { stateKey: 'absMagLimit', callbackKey: 'onAbsMagLimitChange' },  // bias.absMagLimit — see note
  setExposure: { stateKey: 'exposure', callbackKey: 'onExposureChange' },
  setToneMapCurve: { stateKey: 'toneMapCurve', callbackKey: 'onToneMapCurveChange' },
} as const;

export function buildSettersFromTable(state, cb, requestRender): Pick<EngineHandle, keyof typeof SETTINGS_TABLE>;
```

Each table entry is two strings; the builder writes 13 identical bodies that:

```ts
state[stateKey] = value;
cb[callbackKey]?.(value);
requestRender();
```

**State-shape caveat.** A few setters target nested state (`state.bias.absMagLimit`, not `state.absMagLimit`). The descriptor extends to support a `path: string[]` form (`['bias', 'absMagLimit']`) when needed. Builder uses a tiny `setByPath` helper.

**Bespoke setters keep their custom code:** `setBiasMode` (async bake + scheduler interaction), `setTier` (multi-source slot reload), `setLodMode` (camera coupling), `setSourceVisible` (mask math), `setSpaceMouseSensitivity` (subsystem call). They remain inline in the public-handle object literal alongside the spread of table-built methods:

```ts
const handle: EngineHandle = {
  clearSelection() { ... },
  destroy() { ... },
  ...buildSettersFromTable(state, cb, requestRender),
  setBiasMode(mode) { /* bespoke */ },
  setTier(tier) { /* bespoke */ },
  // … other bespoke + selection methods
};
```

**Net diff:** ~150 lines deleted in handle, ~50 added in `settingsTable.ts`. Engine drops ~100 lines.

### #5 — Tween-to-galaxy helper

New module `services/engine/tweenToGalaxy.ts`:

```ts
export type TweenTarget = {
  source: Source;
  localIdx: number;
  cloud: PointCloud;        // already resolved
  prebuiltInfo?: PointInfo; // for selectByAlias's pre-GPU-upload window
};

export function tweenToGalaxy(state: EngineState, target: TweenTarget): void;
```

Body:

```ts
const x = target.cloud.x[target.localIdx]!;
const y = target.cloud.y[target.localIdx]!;
const z = target.cloud.z[target.localIdx]!;
const diameterKpc = target.cloud.diameterKpc[target.localIdx]!;

state.subsystems.tweens.tweenTo(state.cam, { x, y, z }, diameterKpc, performance.now());
state.subsystems.scheduler.requestRender();
```

`selectFamous`, `selectByAlias`, and the click `dblclick → focusOn` path all collapse to a single `tweenToGalaxy(state, ...)` call after they've resolved the cloud + localIdx (which they already do for their own bookkeeping). ~40 lines deleted.

`handle.focusOn(info)` keeps its public signature but its body becomes:

```ts
focusOn(info) {
  const cloud = state.sources.clouds.get(info.source);
  if (!cloud) return;
  tweenToGalaxy(state, { source: info.source, localIdx: info.localIdx, cloud });
},
```

### #4 — Frame body to `runFrame.ts`

New module `services/engine/runFrame.ts`:

```ts
export type RunFrameDeps = {
  canvas: HTMLCanvasElement;
  cb: EngineCallbacks;
  fpsCounter: FpsCounter;          // closure local today; threaded through deps (option b below)
  pointInfoForSelection: (sel) => PointInfo | null;  // closure helper currently in engine.ts
  cssToTexPx: (cssPx: number) => number;             // closure helper
  // …other closure-captured helpers
};

export function runFrame(state: EngineState, deps: RunFrameDeps, nowMs: number): void;
```

The current frame body (engine.ts:1405–1717) moves verbatim into `runFrame`. The forward-declared `frame` variable in `engine.ts` becomes:

```ts
frame = () => {
  runFrame(state, frameDeps, performance.now());
  scheduleFrameTail();   // existing keep-rendering predicate stays in engine.ts
};
```

**Decision: closure captures.** A handful of frame-body references (`fpsCounter`, `lastReportedFps`, `lastScaleSig`, `cssToTexPx`, `pointInfoForSelection`) are today closure variables. Three options:

- **(a) Lift to `state.subsystems`** — ideal long-term, but expands `EngineState` shape and risks merge conflicts with bespoke setters.
- **(b) Pass via `RunFrameDeps`** — explicit, no `EngineState` churn. **Recommended.** Even the `let lastReportedFps` becomes a `{ current: number }` ref carried in deps.
- **(c) Mutable singleton module-scope** — quickest but fights the "minimize stateful surface" principle.

Pick (b). One new type alias, ~15 captures threaded through. ~310 lines move out, ~5 added back at the call site.

### #3 — Point-source slot wiring registry

New module `services/engine/pointSourceRegistry.ts`:

```ts
export type PointSourceConfig = {
  source: Source;
  fetcher: Fetcher<PointCloud, PointCloudReq>;
  initialTier: Tier;        // for the boot-time first load — Synthetic ignores tier
};

export const POINT_SOURCE_REGISTRY: readonly PointSourceConfig[] = [
  { source: Source.SDSS,      fetcher: pointCloudFetcher,      initialTier: 'medium' },
  { source: Source.TwoMRS,    fetcher: pointCloudFetcher,      initialTier: 'medium' },
  { source: Source.Glade,     fetcher: pointCloudFetcher,      initialTier: 'small'  },
  { source: Source.Famous,    fetcher: pointCloudFetcher,      initialTier: 'medium' },
  { source: Source.Synthetic, fetcher: syntheticPointFetcher,  initialTier: 'small'  },
];
```

(All four real surveys share the dispatching `pointCloudFetcher`; only the request's `{ source, tier }` differs.  Synthetic uses its dedicated fetcher and ignores tier.)

A new helper `wirePointSourceSlot(state, cfg)` builds the slot, subscribes it to `commitPointCloudToRenderer`, registers with `aggregateRegistry`, and stores in `state.assetSlots.points`. The bootstrap loop becomes:

```ts
for (const cfg of POINT_SOURCE_REGISTRY) wirePointSourceSlot(state, cfg);
```

**Sidecar slots (filaments, famousMeta, pgcAliases) stay bespoke.** Each has a one-off shape (different commit target, no `loadedSources()` interaction, occasionally different retry policy). Forcing them through the registry would add abstraction overhead without reducing lines. They keep their existing inline construction in the bootstrap.

**Net diff:** ~200 lines deleted from the IIFE, ~60 added across the registry + helper. ~140 line reduction.

### #2 — Bootstrap IIFE to ordered phases

New directory `services/engine/phases/`:

```
phases/
  initGpu.ts        — device, format, postProcess, renderer, pickRenderer, milkyWayRenderer, filamentRenderer
  wireSlots.ts      — uses #3's registry; spawns sidecar slots; awaits initial arrivals
  wireInput.ts      — orbitControls, click handlers, inputBindings, settings panel state
  startLoop.ts      — assigns `frame`, fires the first scheduler.requestRender()
  bootstrap.ts      — orchestrator; runs phases in order
```

Each phase: `(state, deps) => Promise<void>`. The orchestrator:

```ts
export async function runBootstrapPhases(state, deps): Promise<void> {
  await initGpu(state, deps);
  await wireSlots(state, deps);
  await wireInput(state, deps);
  await startLoop(state, deps);
}
```

The IIFE in `engine.ts` collapses to:

```ts
(async () => {
  try {
    cb.onStatusChange({ kind: 'initializing' });
    await runBootstrapPhases(state, { canvas, cb });
    cb.onStatusChange({ kind: 'ready' });
  } catch (err) {
    cb.onStatusChange({ kind: 'error', error: err as Error });
  }
})();
```

**Decision: error handling.** Today's one big try/catch covers the whole IIFE; first throw stops everything and reports `error`. Phases preserve this — `await` chain, first phase to reject stops the chain. Same semantics, cleaner stack traces.

**Decision: phase boundaries.** The four phases above have natural ordering:
- `initGpu` runs first because every later phase needs the device.
- `wireSlots` needs the renderer (to commit clouds into) but starts I/O immediately so fetches overlap with later setup.
- `wireInput` needs both renderer (for click pick) and `state.subsystems.scheduler` (already constructed at engine entry).
- `startLoop` runs last; awaiting `wireSlots`'s "first arrival" promise happens INSIDE `startLoop` so input is responsive while loading.

The IIFE today already sequences this way; phases just give the boundaries names.

**Net diff:** ~1100 lines moved out of engine.ts to `phases/*.ts`, ~10 added back. The phases themselves don't shrink — they're just relocated and given a function signature.

## Migration strategy

Five PRs in this order, smallest-blast-first. Each is independently mergeable; each preserves observable behaviour (verified by the existing 895+ test suite).

1. **#1 Settings setter table.** Pure refactor inside the public handle. Touches ~150 lines in `engine.ts`, adds a small new file. Mechanical.
2. **#5 Tween-to-galaxy helper.** New module + 3 call-site updates. ~40 lines saved.
3. **#4 Frame body → `runFrame.ts`.** New module + 1 call-site collapse. ~310 lines moved. Largest single relocation; lands middle so PRs on either side aren't fighting it.
4. **#3 Point-source slot registry.** Touches the IIFE; coexists with the IIFE structure for now (the registry replaces 5 blocks within the IIFE). ~140 lines saved.
5. **#2 Bootstrap IIFE → phases.** Lands last on the cleanest target. ~1100 lines moved. Largest diff; smallest cognitive load by the time we get there because everything around it has been simplified.

Each PR adds at least one regression test for the contract being relocated:
- **#1:** unit test that `buildSettersFromTable` produces methods that mutate state, fire callbacks, and request a render.
- **#5:** unit test that `tweenToGalaxy` reads cloud x/y/z + diameterKpc, calls `tweens.tweenTo`, and `requestRender`.
- **#4:** existing `runFrame.test.ts` integration test stays green; add a focused test for the FPS-counter-via-deps wiring.
- **#3:** unit test that `wirePointSourceSlot` registers in `aggregateRegistry` and `state.assetSlots.points`.
- **#2:** unit test that `runBootstrapPhases` calls phases in order; first rejection short-circuits.

## What this spec deliberately does NOT do

- The public handle's other ~600 lines (selection logic, `setTier`, `loadPgcAliases`, `selectFamous`/`selectByAlias`). Each has its own gravity and could be follow-up work — none of them duplicate something extractable in this pass.
- Splitting `state` into multiple objects. Today's flat `state` is fine; splitting it for its own sake is premature.
- Anything inside the renderer modules (`pointRenderer.ts`, `pickRenderer.ts`, etc.). Spec A covered that surface and the picking-fix follow-up cleaned it up further.
- Replacing the `state.subsystems.*` bag pattern with a DI container. Big lift; no immediate benefit.
- Adding new abstractions (event bus, command queue, reducer pattern). YAGNI.

## Success criteria

- All five PRs merged.
- `engine.ts` is ~1500 lines (from 2377 — 37% reduction).
- No regression in the existing test suite (895+ tests).
- One regression test added per PR for the specific contract being relocated.
- The frame body lives in `runFrame.ts`; the bootstrap lives in `phases/*.ts`; the table-shaped setters live in `settingsTable.ts`; the point-source slot wiring lives in `pointSourceRegistry.ts`; the tween-to-galaxy helper lives in `tweenToGalaxy.ts`.
- Bespoke setters (`setBiasMode`, `setTier`, `setLodMode`, `setSourceVisible`, `setSpaceMouseSensitivity`) remain inline; sidecar slots (filaments, famousMeta, pgcAliases) remain bespoke. **The spec is not "extract everything" — it's "extract the parts that benefit from extraction".**
