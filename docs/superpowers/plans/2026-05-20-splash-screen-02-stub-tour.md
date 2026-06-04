# Splash Screen — Tour Implementation Plan (Part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follows [`plan-style.md`](../conventions/plan-style.md): contract code (types, test names, signatures) is included; implementation bodies are not — read the cited code and write the body from the tests.

> **Companion plan:** `2026-05-20-splash-screen-01-core.md` — the splash dialog + AboutPill + useSplash hook + WebGPU gate. **Plan 1 has landed:** the `Splash` component, `useSplash` (`dismissExplore` / `dismissTour` / `reopen`), and the `<Splash onTour={...}>` prop all exist; `onTour` is currently wired to `splash.dismissTour` (the Tour button just dismisses). This plan replaces that no-op with a real camera tour.

> **Architecture pivot (2026-06-04).** Originally this plan shipped a deliberately-throwaway stub: a React-driven async `sleep` chain in `App.tsx`. We changed direction — **the tour runner now lives engine-side as a `tourSubsystem` + an `engine.tour` sub-handle**, frame-driven exactly like the camera tween, so the polished cinematic tour (`../specs/2026-05-07-tour-animation-design.md`) *extends this seed* rather than throwing it away. This plan ships a minimal-but-real tour: chained focus + per-beat dwell + generic side-effects, no rotation slerp and no captions yet (those are the cinematic extensions). It resolves the cinematic spec's decision 4 ("tour-engine API shape").

**Goal:** Wire a six-beat Powers-of-Ten camera tour (Milky Way → Local Group → Virgo Cluster → Boötes Void → Coma Supercluster → wide view) to the Tour button, driven by an engine subsystem and exposed as `engine.tour`, with cancel-on-input, UI-hide coordination, and pre-tour settings restoration.

---

## Skymap conventions reminder (applies to every task below)

- `type` aliases only, never `interface`.
- **One exported type per file** under `src/@types` — never co-locate two.
- `readonly` fields + `Vec2`/`Vec3` aliases (not raw tuples); prefer immutability.
- Multi-paragraph didactic comments at module headers; comments timeless (no dates/PR refs in code).
- No barrel exports; deep imports.
- Tests under `tests/` mirroring `src/`.
- Dev server is left running.

---

## Architecture

The tour is an **engine subsystem** (`tourSubsystem`) that owns beat sequencing, plus a thin **`engine.tour` sub-handle** (`start` / `stop` / `isActive`). It is frame-driven, mirroring the existing `tweenManager` (`src/services/engine/camera/tweenManager.ts`) and `clusterFocus` (imperative methods + per-frame `update` + `isAwake`) subsystems.

**Why engine-side, not React.** The render-on-demand loop only keeps ticking while something animates (`stillAnimating` predicate at `src/services/engine/frame/runFrame.ts:502-509`). A tour dwelling between beats has no in-flight tween, so a React `sleep` driver could not keep frames flowing — the loop would sleep and the dwell timer would stall. By living in the subsystem registry and adding `|| state.subsystems.tour.isActive()` to that predicate, the tour participates in the loop the same way an in-flight tween or autoRotate does: frames keep coming through each dwell, the subsystem advances on a wall-clock comparison, and each beat's focus tween renders normally.

**Per-beat dispatch via a `TourActions` port.** The subsystem does not import engine internals directly. It calls an injected `TourActions` object — `focus(focus)`, `applyEffect(effect)`, `snapshot(effects)`, `requestRender()`. The engine builds this adapter closing over its internal `state` (routing `focus` to the same `commitFocus` / `focusOnMilkyWay` / `selectFamous` paths the camera/selection handles already use — see `engine.ts:790-804`, `engine.ts:760-784`, `helpers/commitFocus.ts:25`). Tests inject a fake `TourActions` that records calls and a controllable clock (`advance(nowMs)`), so the sequencing core is unit-tested with no real timers and no GPU.

**Completion.** The engine has no completion-promise idiom for tweens (they're polled via `isActive()`), but `fades.fadeTo()` returns `Promise<void>` (`@types/animation/FadeRegistry.d.ts:52`). Following that precedent, `engine.tour.start(beats)` returns `Promise<void>` that resolves when the tour ends — naturally (last dwell elapsed) or via `stop()`. App.tsx clears `tourActive` in the resolution.

**Restoration.** On `start`, the subsystem asks the adapter to `snapshot` the union of every setting any beat's `effects` touch, and replays that snapshot on end/stop — generalizing the original plan's filament try/finally to the whole effect set. The stub's beats only touch `filaments`, so in practice this restores the user's pre-tour filaments setting; the mechanism is already general for the cinematic palette.

### Data structure

These types are the contract the cinematic tour also consumes — include them exactly. One exported type per file.

```ts
// src/@types/engine/tour/TourFocus.d.ts
/**
 * Symbolic camera target for a tour beat.  A beat table is static data
 * authored at build time, but GalaxyInfo is built at runtime and
 * StructureRecords come from the structure store — so a beat references
 * its target by name and the runner resolves it, matching how the engine
 * already resolves selectFamous(id) and POI lookups.
 */
export type TourFocus =
  | { readonly kind: 'milkyWay' }
  | { readonly kind: 'home' }
  | { readonly kind: 'famous'; readonly id: string }
  | { readonly kind: 'structure'; readonly structureId: string };
```

```ts
// src/@types/engine/tour/TourEffect.d.ts
import type { SourceType } from '../../data/SourceType';
import type { VolumeFieldId } from '../../data/VolumeFieldId';
import type { PoiCategory } from '../data/PoiCategory';

/**
 * A per-beat side-effect, applied on beat entry.  A generic delta union
 * (not a hardcoded `filamentsOn?: boolean`) so the cinematic tour can add
 * volume / source / label beats with no change to the beat shape.  Each
 * variant maps 1:1 to an existing engine-handle setter.
 */
export type TourEffect =
  | { readonly kind: 'filaments'; readonly enabled: boolean }
  | { readonly kind: 'milkyWay'; readonly enabled: boolean }
  | { readonly kind: 'source'; readonly source: SourceType; readonly visible: boolean }
  | { readonly kind: 'volume'; readonly field: VolumeFieldId; readonly enabled: boolean }
  | { readonly kind: 'labelCategory'; readonly category: PoiCategory; readonly visible: boolean }
  | { readonly kind: 'markerCategory'; readonly category: PoiCategory; readonly visible: boolean };
```

```ts
// src/@types/engine/tour/TourBeat.d.ts
import type { TourFocus } from './TourFocus';
import type { TourEffect } from './TourEffect';

/**
 * One beat of a guided tour.  `dwellMs` is the pause AFTER the focus tween
 * settles (per-beat, so the cinematic tour can weight legs).  `effects`
 * are applied on entry.  `caption` is the seam for the future
 * tourCaptionSubsystem (cinematic decision 2b); the stub leaves it unset
 * and nothing renders it yet.
 */
export type TourBeat = {
  readonly id: string;
  readonly focus: TourFocus;
  readonly dwellMs: number;
  readonly effects?: readonly TourEffect[];
  readonly caption?: string;
};
```

```ts
// src/@types/engine/tour/TourActions.d.ts
import type { TourFocus } from './TourFocus';
import type { TourEffect } from './TourEffect';

/**
 * The port the tourSubsystem calls to affect the world.  The engine wires
 * the real adapter (closing over internal state); tests inject a fake that
 * records calls.  `snapshot` reads the current value of every setting the
 * given effects touch and returns a thunk that restores them.
 */
export type TourActions = {
  focus(focus: TourFocus): void;
  applyEffect(effect: TourEffect): void;
  snapshot(effects: readonly TourEffect[]): () => void;
  requestRender(): void;
};
```

```ts
// src/@types/engine/subsystems/TourSubsystem.d.ts
import type { TourBeat } from '../tour/TourBeat';

/**
 * Engine subsystem owning tour sequencing.  Frame-driven: `advance(nowMs)`
 * is called once per frame and issues the next beat when the current beat's
 * (tween + dwell) budget has elapsed.  `start` resolves when the tour ends.
 */
export type TourSubsystem = {
  start(beats: readonly TourBeat[]): Promise<void>;
  stop(): void;
  isActive(): boolean;
  advance(nowMs: number): void;
  destroy(): void;
};
```

```ts
// src/@types/engine/handles/EngineTourHandle.d.ts
import type { TourBeat } from '../tour/TourBeat';

/**
 * Public tour control surface on EngineHandle.  Thin delegate to the
 * tourSubsystem.  `start` resolves when the tour finishes or is stopped.
 */
export type EngineTourHandle = {
  start(beats: readonly TourBeat[]): Promise<void>;
  stop(): void;
  isActive(): boolean;
};
```

(Confirm the exact import paths for `SourceType`, `VolumeFieldId`, `PoiCategory` against the current tree before writing — cite, don't guess. `SourceType`/`VolumeFieldId` live under `src/@types/data/`; `PoiCategory` under `src/@types/engine/data/`.)

### Itinerary (the beat table)

`src/data/tourBeats.ts` — six beats, ~50 s wall time (each ≈ `FOCUS_TWEEN_MS` + `STUB_TOUR_DWELL_MS`). Items marked *(auto)* render with no tour-side work thanks to shipped subsystems.

| # | id | focus | effects | notes |
|---|----|-------|---------|-------|
| 1 | `milky-way` | `{ kind: 'milkyWay' }` | — | MW impostor *(auto, on by default)* + "You are here" *(auto, ≤2 Mpc)*. |
| 2 | `local-group` | `{ kind: 'famous', id: 'm31' }` | — | Andromeda. Famous name label *(auto)*. |
| 3 | `virgo` | `{ kind: 'structure', structureId: 'cluster-virgo-m87' }` | — | Name label *(auto)*. |
| 4 | `bootes-void` | `{ kind: 'structure', structureId: 'void-bootes-void' }` | — | Mid-sequence; next beat re-populates the frame. Name label *(auto)* softens the "is it broken?" read. |
| 5 | `coma` | `{ kind: 'structure', structureId: 'supercluster-coma-sc' }` | `[{ kind: 'filaments', enabled: true }]` | Cosmic web. Name label *(auto)*. |
| 6 | `wide-view` | `{ kind: 'home' }` | — | Climax. |

The void sits mid-sequence (not last) so the camera never *ends* on an empty region — the cheap, robust mitigation; the auto-rendered "Boötes Void" name label is a bonus on top. Filaments are turned on for beat 5 and restored to the user's pre-tour setting on tour end via the snapshot mechanism (beat 5 is the only beat touching `filaments`, so the snapshot captures + restores exactly that). The stub deliberately leaves the volume / milliquas / horizon / groups palette to the cinematic tour.

---

## Task 1: Tour data-structure + handle types

**Files (create, one type each):**
- `src/@types/engine/tour/TourFocus.d.ts`
- `src/@types/engine/tour/TourEffect.d.ts`
- `src/@types/engine/tour/TourBeat.d.ts`
- `src/@types/engine/tour/TourActions.d.ts`
- `src/@types/engine/subsystems/TourSubsystem.d.ts`
- `src/@types/engine/handles/EngineTourHandle.d.ts`

- [ ] Write the six type files exactly as specified in the Data-structure section above. Verify the imported type names + paths (`SourceType`, `VolumeFieldId`, `PoiCategory`) against the current tree first.
- [ ] Add `tour: EngineTourHandle` to the `EngineHandle` type (`src/@types/engine/EngineHandle.d.ts`) and `tour: TourSubsystem` to the subsystem-registry type (find it via the existing `tweens` / `labelDirector` / `clusterFocus` fields — likely `src/@types/engine/EngineSubsystems.d.ts` or similar; cite the real file).
- [ ] `npm run typecheck` → PASS (types compile; nothing consumes them yet).
- [ ] Commit.

## Task 2: `tourSubsystem` — sequencing core

**Files:**
- Create: `src/services/engine/subsystems/tourSubsystem.ts` — `createTourSubsystem(actions: TourActions): TourSubsystem`
- Test: `tests/services/engine/subsystems/tourSubsystem.test.ts`

**Shape to mirror:** `tweenManager.ts:52-92` (closure-over-mutable-state factory returning the imperative+`isActive` object) and the `clusterFocus` per-frame `update(…, nowMs)` cadence. The subsystem holds `beats`, `index`, `beatStartMs`, an `active` flag, the completion `resolve`, and the `restore` thunk. `advance(nowMs)` advances to the next beat when `nowMs - beatStartMs >= FOCUS_TWEEN_MS + beat.dwellMs` (import `FOCUS_TWEEN_MS` from `src/services/engine/camera/focusTweenDuration.ts`); issuing a beat = `actions.applyEffect(...)` for each effect then `actions.focus(beat.focus)` then stamp `beatStartMs`. On running off the end, restore + resolve + `active=false`.

**Behaviour contract — write these tests (fake `TourActions` recording calls; drive `advance` with explicit `nowMs`):**

- [ ] `start issues the first beat immediately` — after `start(beats)`, `actions.focus` called once with `beats[0].focus`; `isActive()` is `true`.
- [ ] `applies a beat's effects before its focus` — a beat with `effects: [{kind:'filaments',enabled:true}]` records the `applyEffect` call ordered before the `focus` call.
- [ ] `advances to the next beat only after FOCUS_TWEEN_MS + dwellMs` — `advance(start + FOCUS_TWEEN_MS + dwell - 1)` issues nothing new; `advance(start + FOCUS_TWEEN_MS + dwell)` issues `beats[1].focus`.
- [ ] `plays all beats in order` — stepping the clock through every beat issues each `focus` once, in table order.
- [ ] `resolves the start() promise after the last beat's dwell` — the promise from `start` resolves once the final beat's budget elapses; `isActive()` becomes `false`.
- [ ] `stop() ends the tour and resolves the promise` — `stop()` mid-tour flips `isActive()` to `false` and resolves the pending `start` promise; subsequent `advance` is a no-op.
- [ ] `restores snapshot on natural completion` — `actions.snapshot` is called once at `start` with the union of beat effects; its returned restore thunk is invoked exactly once on completion.
- [ ] `restores snapshot on stop()` — restore thunk invoked on `stop()` too (not double-invoked if completion races).
- [ ] `advance before start is a no-op` and `advance after completion is a no-op`.

- [ ] Implement `createTourSubsystem` against those tests (no body in this plan — read `tweenManager.ts` for the factory shape). `destroy()` calls `stop()`.
- [ ] `npx vitest run tests/services/engine/subsystems/tourSubsystem.test.ts` → PASS.
- [ ] Commit.

## Task 3: Engine wiring — actions adapter, subsystem registration, handle, frame tick + RoD gate

**Files (modify):**
- `src/services/engine/engine.ts` — build the `TourActions` adapter, create + register the subsystem, add the `tour` sub-handle.
- `src/services/engine/frame/runFrame.ts` — tick the subsystem + extend the reschedule gate.

- [ ] **TourActions adapter** (engine.ts, near the other internal helpers). `focus` dispatches on `TourFocus.kind`:
  - `'milkyWay'` → the existing Milky-Way focus path (`engine.ts:760-784`).
  - `'home'` → the home-focus path behind `camera.focusOnHome` (`engine.ts`, the `focusOnHome` impl).
  - `'famous'` → the `selectFamous(id)` inline path (`engine.ts:790-804`).
  - `'structure'` → `state.data.structures.byId(id)` (the structure store's by-id getter — `src/@types/engine/data/StructureStore.d.ts`, returns `StructureRecord | null`; the static anchors come from `buildStaticAnchorStructures()`), then `commitFocus`/`commitPoiFocus` (`helpers/commitPoiFocus.ts`). Missing id (`byId` → `null`) → skip silently (a renamed slug is a catalog bug, not a tour crash).
  `applyEffect` dispatches each `TourEffect.kind` to the matching setter already in the handle literal (filaments `engine.ts:1241`, milkyWay `:1227`, sources `:1211`, volumes `:1294`, labels `:1258`/`:1273`). `snapshot(effects)` reads current values from `state.settings.*` for the touched keys and returns a restore thunk that re-applies them through the same setters. `requestRender` → `state.subsystems.scheduler.requestRender()`.
- [ ] **Register** `state.subsystems.tour = createTourSubsystem(tourActions)` alongside the other subsystem constructions; add it to teardown (`destroy`) with the others.
- [ ] **Sub-handle:** add `tour: { start: (beats) => state.subsystems.tour.start(beats), stop: () => state.subsystems.tour.stop(), isActive: () => state.subsystems.tour.isActive() }` to the `const handle: EngineHandle` literal (~`engine.ts:1184`).
- [ ] **Frame tick:** call `state.subsystems.tour.advance(nowMs)` once per frame in `runFrame.ts`, near the other subsystem ticks (`tweens.advance` at `:139`, `labelDirector.runFrame` at `:231`, `clusterFocus.update` at `:262`). Use the same `nowMs`/`performance.now()` the neighbours use.
- [ ] **Reschedule gate:** add `|| state.subsystems.tour.isActive()` to the `stillAnimating` predicate (`runFrame.ts:502-509`).
- [ ] `npm run typecheck && npm test` → PASS.
- [ ] Commit.

## Task 4: Beat table + App.tsx wiring (start / cancel / UI hide)

**Files:**
- Create: `src/data/tourBeats.ts` — `export const STUB_TOUR_DWELL_MS = 2_500;` and `export const TOUR_BEATS: readonly TourBeat[]` per the Itinerary table.
- Modify: `src/components/App/App.tsx`.

- [ ] Author `TOUR_BEATS` exactly as the Itinerary table specifies (six beats; beat 5 carries the single `filaments` effect). Add a test `tests/data/tourBeats.test.ts`: `TOUR_BEATS has six beats ending on home` and `only the Coma beat toggles filaments` (guards the void-not-last + single-effect invariants).
- [ ] App.tsx: replace `onTour={splash.dismissTour}` with a `startTour` callback that: dismisses the splash (`splash.dismissTour()`), sets a `tourActive` state `true`, calls `engine.tour.start(TOUR_BEATS)`, and clears `tourActive` in the promise's `.finally`. Idempotent if `tourActive` already true. (Cite the current `useSplash` block + `<Splash>` JSX — `grep -n "onTour\|useSplash\|Splash" src/components/App/App.tsx`.)
- [ ] Cancel-on-input: a `useEffect` armed only while `tourActive` adds capture-phase `pointerdown` / `keydown` / `wheel` / `touchstart` window listeners that call `engine.tour.stop()`; cleanup removes them. (`wheel`/`touchstart` passive.) The `start` promise resolves on stop, so the `.finally` clears `tourActive` and restores the UI — no token plumbing needed.
- [ ] Force `uiHidden` while active: add `tourActive` to the `uiStack` hidden condition (the line Plan 1 left as `(uiHidden || splash.splashVisible)`).
- [ ] `npm run typecheck && npm test` → PASS.
- [ ] Commit.

## Task 5: Final smoke + integration check

**Files:** none modified; verification task.

- [ ] `npm run typecheck && npm test && npm run build` → all green.
- [ ] Manual smoke (ask the user) in the live dev server:
  1. Tour button triggers the six-beat tour (camera flies the itinerary), not just a dismiss.
  2. UI chrome (left stack, top bar, status bar) is hidden while the tour plays; returns on end.
  3. Any click / scroll / key during the tour stops it cleanly at the current beat and restores the UI.
  4. Filaments are on for the Coma beat and restored to the pre-tour setting at end (toggle them on *before* starting to confirm restore-to-on as well as restore-to-off).
  5. Beats 1/2/3/4/5 show their auto-rendered visuals/labels (MW impostor + "You are here", M31 name, cluster/void/supercluster names).
  6. The render-on-demand loop keeps ticking through dwells (the tour doesn't stall between beats) and goes idle again after it ends.
  7. Clicking About mid-tour reopens the splash AND stops the tour (the click hits the cancel listener).
- [ ] Confirm the cinematic spec is still present and now references this as its decision-4 resolution: `ls docs/superpowers/specs/ | grep tour` → `2026-05-07-tour-animation-design.md`.

---

## Self-review notes

- **Seed, not stub.** `engine.tour` + `tourSubsystem` + `TourBeat`/`TourEffect`/`TourFocus` are the foundation the cinematic tour extends: richer beats (groups/volumes/milliquas/horizon via existing `TourEffect` variants), per-leg `dwellMs` (already per-beat), `caption` (the wired seam for the future caption producer), and — the one genuinely new build — rotation-toward-target slerp in the focus tween (cinematic decision 1). None of those require reshaping what this plan ships.
- **Plan-style compliance:** type contracts + test names/assertions included; no implementation bodies; integration points cited by `file:line`. Verify the cited line numbers against the live tree on pickup — they will have drifted.
- **Convention checks:** one type per `@types` file (six files in Task 1); `readonly` throughout; no barrels; tests mirror `src/`.
- **Removed from the original plan:** `TourCancelToken` + `createTourCancelToken` (the engine now owns lifecycle via `stop()` + the completion promise), and the React `sleep`-chain runner (replaced by the frame-driven subsystem).
