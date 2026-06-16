# Tour Engine Seed (cinematic-core) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follows [`plan-style.md`](../conventions/plan-style.md): contract code (types, test names, signatures) is included; implementation bodies are not — read the cited code and write the body from the tests.

> **Companion plan:** `2026-05-20-splash-screen-01-core.md` — the splash dialog + AboutPill + useSplash hook + WebGPU gate. **Plan 1 has landed:** the `Splash` component, `useSplash` (`dismissExplore` / `dismissTour` / `reopen`), and the `<Splash onTour={...}>` prop all exist; `onTour` is currently wired to `splash.dismissTour` (the Tour button just dismisses). This plan replaces that no-op with a real, frame-driven camera tour.

> **The cinematic target.** `docs/tour/` is the full guided-tour design — a narrated ~2½-min powers-of-ten journey (`goal.md`, `script.md`, `cinematography.md`, `graphic-design.md`, and the eleven `stages/NN-*.md` front-matter files). **This plan ships the SEED that the cinematic tour purely extends.** The seed's camera core is built in the *same shape* the cinematic uses, running a trivial subset — so the cinematic is additive, with zero rework or cruft. (The `stages/*.facts.md` files are trivia and out of scope.)

> **The pre-tour decomplection prerequisites have all LANDED** (re-grounded against the live tree 2026-06-16). Two of them reshape this plan, and the reshape is already done in the codebase — this plan now slots into the seams rather than waiting on them:
> 1. **Camera authority is a driver registry.** `runFrame` no longer has inline camera mutators; it calls `runCameraDrivers(deps.drivers, state.cam, nowMs)` (`camera/cameraDrivers.ts`), which runs ONLY the highest-priority active driver — single-writer arbitration, no blending. `buildCameraDrivers(state)` already **reserves the `tour` slot at priority 80** (cameraDrivers.ts:103-104, above `tween`=60 and `autoRotate`=20). The tour registers one driver there; "tour pose is authoritative" falls out of priority for free. The `stillAnimating` reschedule predicate already ORs `deps.drivers.some((d) => d.isActive(nowMs))`, so a tour driver also keeps the loop ticking with **zero `runFrame.ts` edits**.
> 2. **Snapshot/restore is the settings seam.** `readVisibility`/`applyVisibility` were never built — the seam that shipped is `captureSettings` → `SettingsSnapshot` (a `Pick` of the six clusters) + `restoreSettings(state, store, snapshot, { animate })` + `applyEffect(state, store, patch, { animate })`, all in `services/engine/wiring/`. The tour's snapshot/restore round-trip uses `captureSettings`/`restoreSettings` directly (whole-cluster, detached); a per-beat effect calls the matching engine-handle setter (`setSourceVisible`/`setStructureItemEnabled`/…, each `(state, store, …)`). See the Data-contracts + Part-B sections, which already encode this.

> **Tour state lives in an engine-owned zustand store** (`TourStore`), a sibling of the settings store — NOT inside `EngineSettingsState` (the tour *snapshots and restores* the settings store, so its own cursor must not live in the thing it clones). The `EngineState` touchpoint is exactly one field: `state.subsystems.tour`. See [Architecture](#architecture).

---

## The architecture pivot (read this first)

An earlier draft of this plan delegated camera control to one-shot tweens: `actions.focus()` → `commitFocus` / `focusOnMilkyWay` / `selectFamous` → `tweenToStructure` / `tweenToGalaxy`. **The cinematic design requires the opposite**, and `cinematography.md` is explicit about it:

> "**Driver consequence:** `log-dolly` + `pass-through-spline` + `dwell-drift` mean the tour subsystem must **own the camera per-frame** — own a global tour clock and evaluate the spline + dwell-orbit into the camera — not fire one-shot tweens through `tweenManager`."

One-shot tweens are the wrong substrate for three independent reasons:

1. **Scale is logarithmic.** Framing distances span ~0.05 → ~6,000 Mpc (5 orders of magnitude). The camera must interpolate `logDist = ln(distance)`, not raw distance — `tweenToGalaxy` / `tweenToStructure` lerp raw distance. (`goal.md` "Hard constraints"; `cinematography.md` "The one hard constraint".)
2. **Dwell is never frozen.** Every stop carries a slow drift (`cinematography.md` "Dwell is never frozen"). A one-shot tween settles and lets the render-on-demand loop go idle — dwell-drift literally cannot run on that substrate.
3. **Per-frame ownership is the only thing a Catmull-Rom spline + arc-length reparam can extend.** A bag of sequential tweens has no global clock to evaluate a spline against.

Building the tween-delegation version means ~40 % of its core gets thrown away when the cinematic lands, and risks a two-camera-mode entanglement. So **we reshape the seed's camera core now to be the cinematic's core**, running the trivial subset. Per-frame camera authority is already a solved seam — the `tour` `CameraDriver` slot (priority 80) is reserved and waiting.

### What the seed ships

- A **`tourSubsystem`** that owns beat sequencing **and the per-frame camera evaluator**, writing its cursor into an **engine-owned `TourStore`** (zustand vanilla, sibling of the settings store).
- A **`tour` `CameraDriver`** (priority 80) registered in `buildCameraDrivers`; while it is active the driver registry makes its pose write authoritative (beats tween + autoRotate) and keeps the render-on-demand loop ticking — no `runFrame` edits.
- The camera pose is **computed each frame and written to `state.cam`** (via the driver's `apply`), NOT stored — so the `TourStore` mutates only at beat boundaries, never per frame.
- A **single linear-in-log segment per beat**: `logDist` lerps linearly between the previous keyframe's `ln(distanceMpc)` and the current beat's, `target` lerps as a `Vec3`, yaw/pitch held constant.
- **Per-beat framing distance** (`distanceMpc`) and **per-beat travel duration** (`travelMs`) — the keyframe model, not a global tween constant.
- **Generic per-beat effects** (instant boolean toggles), with the user's pre-tour settings **captured once at start** (`captureSettings`) and **restored on end / stop** (`restoreSettings`).
- The **real eleven-stage beat table** authored from `docs/tour/stages/`.
- Cancel-on-input + UI-hide coordination, both driven off `tourStore.active` via a `useTourStore` React adapter.

### The additive extension points (cinematic, NOT in the seed)

Each is purely additive — a new field, a new interpolation strategy, or a new subsystem — never a reshape:

- **Catmull-Rom spline** through N keyframes with **arc-length reparam** — replaces the seed's straight log-lerp.
- **Pass-through waypoints** (`dwell_s: 0`) as spline control points — the seed collapses these to a settle on the stage's primary focus.
- **Dwell-orbit / dwell-drift** — a tiny orbit evaluated during the dwell (reads `tourStore.phase === 'dwell'`).
- **Azimuth / elevation** per keyframe — the seed carries yaw/pitch constant.
- **Captions** — a new `caption?: TourCaption` field on `TourBeat` + a `caption` field on `TourState` + a `tourCaptionSubsystem` rendering the stage title + narration. React reads the live caption off `tourStore` exactly as the seed already reads `active`.
- **Ramped effects** (`ramp_s` / `rampMs` on `TourEffect`) — the seed's effects are instant.
- **Look-offset** and **per-segment easing** parameters.
- **Flow-field toggle** — a new `TourEffect` variant when the layer beat lands.

None of these require changing a type the seed ships — they extend it. The `TourStore` is the load-bearing reason captions slot in cleanly: the engine→React channel already exists.

---

## Skymap conventions reminder (applies to every task below)

- `type` aliases only, never `interface`.
- **One exported type per file** under `src/@types` — never co-locate two.
- `readonly` fields + `Vec2` / `Vec3` aliases (not raw tuples); prefer immutability. The store's state type is fully `readonly`; reducers return new objects copy-on-write.
- Multi-paragraph didactic comments at module headers; comments timeless (no dates / PR refs in code).
- No barrel exports; deep imports.
- Tests under `tests/` mirroring `src/`.
- Dev server is left running.
- **Re-verify every cited line number against the live tree before editing** — engine.ts churns and the numbers below will have drifted.

---

## Architecture

The tour is an **engine subsystem** (`tourSubsystem`) owning beat sequencing **and the per-frame camera evaluator**, writing its cursor into an **engine-owned `TourStore`**. It is frame-driven, mirroring the factory shape of `tweenManager` (`src/services/engine/camera/tweenManager.ts:54` — a closure-over-mutable-state factory returning an imperative + `isActive` object) and the per-frame `update(…, nowMs)` cadence of `structureFocusSubsystem` (`src/services/engine/subsystems/structureFocusSubsystem.ts:75`).

**Where state lives (decomplected).**

- **`TourStore`** (`StoreApi<TourState>`) — engine-owned zustand vanilla store, built in `createEngine` and exposed as `handle.tourStore`, the exact pattern as `settingsStore` (`createSettingsStore`, `handle.settingsStore`). It holds the whole tour cursor (`TourState`, mapped below). React reads it through a `useTourStore` adapter (a copy of `useSettingsStore`). **It is NOT folded into `EngineSettingsState`:** the tour snapshots-and-restores the settings store, so its own cursor cannot live inside the value it clones and swaps without polluting every `SettingsSnapshot` or carving a special-case exclusion.
- **`state.subsystems.tour: TourSubsystem`** — the ONLY tour field on `EngineState`. `buildCameraDrivers(state)` reaches the subsystem through it; teardown destroys it through it.
- **The camera pose is NOT stored** — `advance(nowMs)` computes it from `TourState` + `nowMs` and writes `state.cam`. So `tourStore.setState` fires only at beat boundaries (start, each segment advance, each settle travel→dwell, stop) — a few dozen writes across a tour, not one per frame.
- **No completion `Promise`.** React observes `tourStore.active`; `start(beats)` returns `void`. App.tsx hides the HUD and arms cancel-on-input off `useTourStore(s => s.active)` — no local `tourActive` flag, no `.finally` echo.

**Why per-frame camera ownership, via the driver.** The subsystem holds a global tour clock and, every frame, evaluates the current segment into a `CameraPose` it writes to the camera via the `TourActions` port. The seam that makes this authoritative already exists: register a `tour` `CameraDriver` at **priority 80** in `buildCameraDrivers`. `runCameraDrivers` runs only the single highest-priority active driver, so while the tour is active it beats `tween` (60) and `autoRotate` (20) with no guards, and because the `stillAnimating` predicate already ORs `deps.drivers.some(d => d.isActive(nowMs))`, the loop keeps ticking through every beat and dwell. **No `runFrame.ts` edit is required.** The driver is the whole integration:

```ts
// added inside buildCameraDrivers(state) — fills the reserved priority-80 slot
{
  id: 'tour',
  priority: 80,
  isActive: () => state.subsystems.tour.isActive(),
  apply: (_cam, nowMs) => state.subsystems.tour.advance(nowMs),
}
```

(The driver's `apply` ignores its `cam` arg — the subsystem writes `state.cam` through `actions.applyCameraPose`, which closes over the same `state.cam`. Keeping the write inside the port is what lets the sequencing core be unit-tested against a fake.)

**Per-beat dispatch via a `TourActions` port.** The subsystem does not import engine internals. It calls an injected `TourActions` object. The engine builds the real adapter closing over its internal `state` + `settingsStore`; tests inject a fake that records calls and is driven by an explicit `advance(nowMs)` clock — so the sequencing + interpolation core is unit-tested with no real timers and no GPU.

**Restoration.** On `start`, the subsystem calls `actions.captureSettings()` and stores the result in `tourStore.preTourSnapshot`. On end / stop it calls `actions.restoreSettings(preTourSnapshot)`. Both are thin forwards to the live `services/engine/wiring/{captureSettings,restoreSettings}` seam — whole-cluster, detached, and (since `restoreSettings` routes through `store.setState`) the SettingsPanel re-renders to the restored values.

### Data contracts

These types are the contract the cinematic tour also consumes. **One exported type per file.** The tour data model lives in `src/@types/engine/tour/`; the subsystem + handle contract types live in their conventional folders (`subsystems/`, `handles/`). Verify every import path against the live tree before writing — the cited paths are current as of the 2026-06-16 re-grounding but moved into subfolders (`data/structure/`, `data/volume/`, `math/`) during earlier refactors.

```ts
// src/@types/engine/tour/TourFocus.d.ts
import type { Vec3 } from '../../math/Vec3';

/**
 * Symbolic camera target for a tour beat.  A beat table is static data
 * authored at build time, but GalaxyInfo is built at runtime and StructureInfo
 * comes from the structure store — so a beat references its target by name and
 * the runner resolves it to a world position, matching how the engine already
 * resolves selectFamous(id) and structure-store lookups.
 *
 * `structureId` is a STRUCTURE-INSTANCE id (e.g. 'cluster-virgo-m87'), the key
 * StructureStore.byId() takes — NOT a StructureId category. (TourEffect, below,
 * keys on the CATEGORY; the two id spaces are deliberately different.)
 *
 * The `point` variant carries a literal world position for stages that frame no
 * single catalog object (the deep field, the edge — stages 06 / 08 / 09).
 */
export type TourFocus =
  | { readonly kind: 'milkyWay' }
  | { readonly kind: 'home' }
  | { readonly kind: 'famous'; readonly id: string }
  | { readonly kind: 'structure'; readonly structureId: string }
  | { readonly kind: 'point'; readonly position: Vec3 };
```

```ts
// src/@types/engine/tour/TourEffect.d.ts
import type { SourceType } from '../../data/SourceType';
import type { VolumeFieldId } from '../../data/volume/VolumeFieldId';
import type { StructureId } from '../../data/structure/StructureId';

/**
 * A per-beat side-effect, applied instantly on beat entry.  A generic delta
 * union (not a hardcoded `filamentsOn?: boolean`) so the cinematic tour can add
 * volume / source / structure beats with no change to the beat shape.  Each
 * variant maps 1:1 to an existing engine-handle setter, all of which take
 * `(state, settingsStore, …)`:
 *
 *   filaments      → setFilamentsEnabled
 *   milkyWay       → setMilkyWayEnabled            (the disk)
 *   source         → setSourceVisible              (survey/source point cloud)
 *   volume         → setVolumeFieldEnabled
 *   structure      → setStructureItemEnabled       (ring/marker for a category)
 *   structureLabel → setStructureLabelEnabled      (category label)
 *
 * `category: StructureId` is a CATEGORY id ('cluster' | 'supercluster' | 'void'
 * | 'group') — the key `settings.structures.items` uses — NOT a structure
 * instance id (cf. TourFocus.structureId).  PoiCategory, which an earlier draft
 * imported, no longer exists (the poi-free refactor dissolved it).
 *
 * Effects are instant booleans here.  The cinematic tour adds an optional
 * `rampMs` field additively; the seed always toggles instantly.
 */
export type TourEffect =
  | { readonly kind: 'filaments'; readonly enabled: boolean }
  | { readonly kind: 'milkyWay'; readonly enabled: boolean }
  | { readonly kind: 'source'; readonly source: SourceType; readonly visible: boolean }
  | { readonly kind: 'volume'; readonly field: VolumeFieldId; readonly enabled: boolean }
  | { readonly kind: 'structure'; readonly category: StructureId; readonly enabled: boolean }
  | { readonly kind: 'structureLabel'; readonly category: StructureId; readonly enabled: boolean };
```

```ts
// src/@types/engine/tour/TourBeat.d.ts
import type { TourFocus } from './TourFocus';
import type { TourEffect } from './TourEffect';

/**
 * One beat of a guided tour — a keyframe in the cinematic camera model.
 *
 * `distanceMpc` is the per-beat FRAMING distance (camera→focus, world units ≈
 * Mpc); the seed interpolates `ln(distanceMpc)` linearly toward it, the
 * cinematic splines it in log space.  `travelMs` is the per-beat travel
 * duration (NOT a global constant); `dwellMs` is the hold AFTER travel settles.
 * `effects` apply instantly on beat entry.
 *
 * The cinematic tour adds, ADDITIVELY: `caption?: TourCaption`, per-keyframe
 * `azimuth` / `elevation`, and pass-through-waypoint fields.  None reshape this
 * type.
 */
export type TourBeat = {
  readonly id: string;
  readonly focus: TourFocus;
  readonly distanceMpc: number;
  readonly travelMs: number;
  readonly dwellMs: number;
  readonly effects?: readonly TourEffect[];
};
```

```ts
// src/@types/engine/tour/CameraPose.d.ts
import type { Vec3 } from '../../math/Vec3';

/**
 * The per-frame orbit-camera pose the tour writes through TourActions.  Exactly
 * the four mutable orbit fields (`target` / `distance` / `yaw` / `pitch`); the
 * immutable framing fields (`fovYRad` / `near` / `far`) stay owned by
 * `state.cam` and are never written by the tour.
 *
 * Intentionally narrower than `InitialCam` (src/@types/camera/InitialCam.d.ts),
 * which carries the framing fields too — there is no snap-from-pose helper to
 * reuse (cameraSnapshot.ts only tweens), so the adapter writes these four fields
 * onto `state.cam` and calls `updatePosition(cam)` directly.
 */
export type CameraPose = {
  readonly target: Vec3;
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
};
```

```ts
// src/@types/engine/tour/TourState.d.ts
import type { Vec3 } from '../../math/Vec3';
import type { TourBeat } from './TourBeat';
import type { SettingsSnapshot } from '../settings/SettingsSnapshot';

/**
 * The whole tour cursor — the value held by the engine-owned `TourStore`.
 *
 * Everything the tour needs to know lives here EXCEPT the per-frame camera pose
 * (computed in `advance` and written to `state.cam`, never stored) and `nowMs`
 * (an `advance` argument).  Because the pose is not stored, the store mutates
 * only at beat boundaries, so holding the full cursor in one observable cell
 * costs a few dozen `setState`s per tour, not one per frame.
 *
 * `segmentStartMs` is `null` until the current segment's first `advance` stamps
 * it (the subsystem has no clock at `start` time — the driver supplies `nowMs`).
 * `fromPosition` / `fromDistanceMpc` are the previous keyframe the current
 * segment interpolates FROM (for beat 0, its own keyframe).  `preTourSnapshot`
 * is captured at `start` and replayed on end/stop.
 *
 * Fully `readonly`: reducers return a new object copy-on-write, the store's only
 * write path (`store.setState`).  The cinematic adds `caption: TourCaption |
 * null` here additively — React reads it the same way it reads `active`.
 */
export type TourState = {
  readonly active: boolean;
  readonly beats: readonly TourBeat[];
  readonly beatIndex: number;
  readonly phase: 'travel' | 'dwell';
  readonly segmentStartMs: number | null;
  readonly fromPosition: Vec3;
  readonly fromDistanceMpc: number;
  readonly preTourSnapshot: SettingsSnapshot | null;
};
```

```ts
// src/@types/engine/tour/TourActions.d.ts
import type { TourFocus } from './TourFocus';
import type { TourEffect } from './TourEffect';
import type { CameraPose } from './CameraPose';
import type { SettingsSnapshot } from '../settings/SettingsSnapshot';
import type { Vec3 } from '../../math/Vec3';

/**
 * The port the tourSubsystem calls to affect the world.  The engine wires the
 * real adapter (closing over internal `state` + `settingsStore`); tests inject a
 * fake that records calls.
 *
 * `resolveFocus` turns a symbolic target into a world position WITHOUT moving
 * the camera or changing selection (null for an unresolvable id).
 * `applyCameraPose` is how the tour OWNS the camera — it writes the four orbit
 * fields onto `state.cam` and re-derives the basis.  `markFocused` sets
 * selection/focus state for label + ring emphasis ONLY (no camera move) — fired
 * once on settle.  `applyTourEffect` dispatches one `TourEffect` to its handle
 * setter (named `applyTourEffect`, not `applyEffect`, to avoid colliding with
 * the settings-seam `wiring/applyEffect`).  `captureSettings` / `restoreSettings`
 * forward to the settings seam for the pre-tour snapshot round-trip.
 */
export type TourActions = {
  resolveFocus(focus: TourFocus): Vec3 | null;
  applyCameraPose(pose: CameraPose): void;
  markFocused(focus: TourFocus): void;
  applyTourEffect(effect: TourEffect): void;
  captureSettings(): SettingsSnapshot;
  restoreSettings(snapshot: SettingsSnapshot): void;
  requestRender(): void;
};
```

```ts
// src/@types/engine/subsystems/TourSubsystem.d.ts
import type { TourBeat } from '../tour/TourBeat';

/**
 * Engine subsystem owning tour sequencing AND the per-frame camera evaluator.
 * Frame-driven: `advance(nowMs)` is called once per frame (by the `tour` camera
 * driver) while active and writes the camera pose for the current segment.
 * `start` is fire-and-forget — completion is observed via `tourStore.active`,
 * so there is no completion Promise.
 */
export type TourSubsystem = {
  start(beats: readonly TourBeat[]): void;
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
 * tourSubsystem.  Fire-and-forget; React observes progress/active via
 * `handle.tourStore` (a `TourStore`), the same way it reads settings via
 * `handle.settingsStore`.
 */
export type EngineTourHandle = {
  start(beats: readonly TourBeat[]): void;
  stop(): void;
  isActive(): boolean;
};
```

**The `TourStore` type alias** (`export type TourStore = StoreApi<TourState>`) lives with its factory in `src/services/engine/tourStore/createTourStore.ts` (Part B), mirroring `SettingsStore` in `createSettingsStore.ts` — not a `@types` file, because it is `zustand`-coupled.

### The beat table

`src/data/tourBeats.ts` — `TOUR_BEATS: readonly TourBeat[]` authored from the eleven cinematic stages (`docs/tour/stages/00..10`). For each stage, map the front-matter: `focus` → `TourFocus`, `distance_mpc` → `distanceMpc`, `travel_s * 1000` → `travelMs`, `dwell_s * 1000` → `dwellMs`, `effects` → `TourEffect[]`.

| # | id | focus | distanceMpc | travelMs | dwellMs | effects |
|---|----|-------|-------------|----------|---------|---------|
| 00 | `opening-title` | `{ kind: 'milkyWay' }` | 0.05 | 0 | 8000 | — |
| 01 | `you-are-here` | `{ kind: 'milkyWay' }` | 0.05 | 3000 | 7000 | — |
| 02 | `nearest-neighbour` | `{ kind: 'famous', id: 'm31' }` | 0.8 | 7000 | 7000 | — |
| 03 | `our-neighbourhood` | `{ kind: 'structure', structureId: 'group-sculptor-group' }` | 4 | 9000 | 5000 | `structure group on`, `structureLabel group on` |
| 04 | `nearest-cluster` | `{ kind: 'structure', structureId: 'cluster-virgo-m87' }` | 16 | 7000 | 7000 | — |
| 05 | `cosmic-web` | `{ kind: 'structure', structureId: 'supercluster-coma-sc' }` | 90 | 9000 | 9000 | `filaments on` (+ `volume` mcpm on — see note) |
| 06 | `cosmic-flows` | `{ kind: 'point', position: [0,0,0] }` | 80 | 5000 | 9000 | — (flow layer toggle deferred — see note) |
| 07 | `emptiness` | `{ kind: 'structure', structureId: 'void-bootes-void' }` | 150 | 6000 | 5000 | — |
| 08 | `deep-field` | `{ kind: 'point', position: [0,0,0] }` | 2000 | 8000 | 4000 | `source milliquas visible` (see note) |
| 09 | `the-edge` | `{ kind: 'point', position: [0,0,0] }` | 6000 | 9000 | 8000 | — |
| 10 | `home-again` | `{ kind: 'milkyWay' }` | 0.05 | 8000 | 5000 | — |

**Verified IDs** (live tree): famous `m31` exists (`data/famous_galaxies.seed.json`); structure instance ids are `${category}-${seed.id}` (`buildStaticAnchorStructures.ts`), so `group-sculptor-group`, `cluster-virgo-m87`, `supercluster-coma-sc`, `void-bootes-void` all resolve against `data/structure_anchors.seed.json` via `state.data.structures.byId(...)`. The stage front-matter slugs already carry the `category-` prefix.

**Seed-vs-cinematic notes** (author these as comments in `tourBeats.ts`):

- **Pass-through waypoints collapse.** Stage 03 routes the path *through* `group-m81-group` and `group-cen-a-group` as `dwell_s: 0` pass-throughs before settling on `group-sculptor-group`. The seed has no spline, so it collapses to a single settle on the primary focus. The cinematic restores the two pass-throughs as Catmull-Rom control points.
- **`point` focuses use the front-matter coords.** Stages 06 / 08 / 09 declare `focus: point:0,0,0` (placeholder origin — the cinematic will retarget 06 to the local flow basin). Use the literal coords as the `point` variant's `position`.
- **Effect mapping is best-effort against shipped handles.** Stage 03's group toggles map to `{ kind: 'structure', category: 'group', enabled: true }` (ring/marker via `setStructureItemEnabled`) and `{ kind: 'structureLabel', category: 'group', enabled: true }` (label via `setStructureLabelEnabled`). Stage 05 toggles `filaments` instantly; add `{ kind: 'volume', field: <mcpm id>, enabled: true }` IF the implementer confirms the field id from `VolumeFieldId` and the master-enable interplay — otherwise ship filaments-only with a TODO. Stage 06's flow-field toggle is **omitted from the seed** (a cinematic add — no `flow` `TourEffect` variant yet); leave a comment. Stage 08's "milliquas emphasized" maps to `{ kind: 'source', source: <milliquas SourceType>, visible: true }` if a milliquas `SourceType` exists; otherwise omit with a comment.
- **The void sits mid-sequence (07), never last** — the camera never *ends* on an empty region. Stage 10 (`home-again`) is the climax-return to the Milky Way.

---

## Part A — Data model (lands first, behind a review gate)

This part ships **types only** — the `src/@types/engine/tour/` folder plus the two sibling contract types — so the data model can be reviewed in isolation before any behaviour is built. It is its own commit (and may ship as its own docs-light PR). Nothing consumes the types yet; `npm run typecheck` is the whole acceptance bar.

### Task A1: Tour data-model type folder

**Files (create, one type each):**
- `src/@types/engine/tour/TourFocus.d.ts`
- `src/@types/engine/tour/TourEffect.d.ts`
- `src/@types/engine/tour/TourBeat.d.ts`
- `src/@types/engine/tour/CameraPose.d.ts`
- `src/@types/engine/tour/TourState.d.ts`
- `src/@types/engine/tour/TourActions.d.ts`
- `src/@types/engine/subsystems/TourSubsystem.d.ts`
- `src/@types/engine/handles/EngineTourHandle.d.ts`

- [ ] Write the eight type files exactly as specified in the Data-contracts section. Verify the imported type names + paths against the live tree first: `Vec3` is `src/@types/math/Vec3`; `SourceType` is `src/@types/data/SourceType`; `VolumeFieldId` is `src/@types/data/volume/VolumeFieldId`; `StructureId` is `src/@types/data/structure/StructureId`; `SettingsSnapshot` is `src/@types/engine/settings/SettingsSnapshot`. **`PoiCategory` no longer exists** — do not import it; structure effects key on `StructureId`.
- [ ] **`CameraPose` — reuse-check first.** Look at `src/@types/camera/InitialCam.d.ts`. It has `target/distance/yaw/pitch` PLUS `fovYRad/near/far` — NOT a clean match (the tour must never write the framing fields). Create the narrower `CameraPose` as specified, with the docblock note pointing at `InitialCam` and at the fact that `cameraSnapshot.ts` only offers a *tween* (`tweenToCameraSnapshot`), no snap — so there is no helper to reuse and the adapter writes the four fields directly.
- [ ] Add `tour: EngineTourHandle` to the `EngineHandle` type — `src/@types/engine/EngineHandle.d.ts` (the sub-handle cluster; add the import alongside the other `./handles/*` imports). Also add `tourStore: TourStore` near `settingsStore` (import the alias from `../../services/engine/tourStore/createTourStore` — it will exist in Part B; if you prefer the type-only file to compile standalone, declare the alias now in `createTourStore.ts` as a one-line `export type TourStore = StoreApi<TourState>` stub and fill the factory in Part B).
- [ ] Add `tour: TourSubsystem` to the subsystem-registry type — `src/@types/engine/handles/EngineSubsystemHandles.d.ts`. The `_EnforceDestroyable` mapped guard at the bottom requires every field satisfy `Destroyable`; `TourSubsystem` has `destroy()`, so it passes. Add the field as **non-nullable** (eager construction — no GPU dep) alongside `structureFocus` / `tweens`.
- [ ] `npm run typecheck` → PASS (types compile; nothing consumes them yet).
- [ ] Commit (`feat(tour): tour data-model types`).

### 🚦 REVIEW GATE — stop here for human review

**Do not start Part B until the data model is approved.** Hand the reviewer the new folder so they can confirm the shape matches their mental model:

```
src/@types/engine/tour/
  TourFocus.d.ts      TourEffect.d.ts    TourBeat.d.ts
  CameraPose.d.ts     TourState.d.ts     TourActions.d.ts
src/@types/engine/subsystems/TourSubsystem.d.ts
src/@types/engine/handles/EngineTourHandle.d.ts
```

Reviewer checklist:
- [ ] `TourState` holds the right cursor (and nothing per-frame leaks in).
- [ ] `TourEffect` variants cover the beat table's effects and map 1:1 to real setters.
- [ ] `TourFocus` (instance id) vs `TourEffect` (`StructureId` category) split reads clearly.
- [ ] The store is a sibling of settings, not folded into `EngineSettingsState`.
- [ ] `start` is fire-and-forget (no Promise); completion is observed via `tourStore`.

Adjust the types from review feedback before proceeding. The rest of the plan is written against these contracts; a shape change here ripples into Part B.

---

## Part B — Implementation

### Task B1: `createTourStore` + `useTourStore` (the store seam)

**Files:**
- Create: `src/services/engine/tourStore/createTourStore.ts` — `export type TourStore = StoreApi<TourState>` + `createTourStore(initial: TourState): TourStore`. Mirror `createSettingsStore.ts` verbatim (vanilla `createStore(() => initial)`, didactic header explaining engine-owned + no React dep in `services/`).
- Create: `src/services/engine/tourStore/buildInitialTourState.ts` — `buildInitialTourState(): TourState` returning the inert cursor (`active:false`, `beats:[]`, `beatIndex:0`, `phase:'travel'`, `segmentStartMs:null`, `fromPosition:[0,0,0]`, `fromDistanceMpc:0`, `preTourSnapshot:null`). Mirror `buildInitialSettings.ts`.
- Create: `src/hooks/useTourStore.ts` — the React adapter. Copy `useSettingsStore.ts` shape (`useSyncExternalStore` over `store.subscribe` + a selector + fallback); read the store off `handleRef.current?.tourStore`.
- Tests: `tests/services/engine/tourStore/buildInitialTourState.test.ts` (inert defaults present), and a `createTourStore` round-trip test if `createSettingsStore` has one to mirror.

- [ ] Write the factory, the initial-state builder, and the React adapter against the settings-store equivalents (no body invented — read those three files and parallel them).
- [ ] `npm run typecheck && npx vitest run tests/services/engine/tourStore` → PASS.
- [ ] Commit.

### Task B2: `tourSubsystem` — sequencing + per-frame camera evaluator (the heart)

**Files:**
- Create: `src/services/engine/subsystems/tourSubsystem.ts` — `createTourSubsystem(store: TourStore, actions: TourActions): TourSubsystem`
- Test: `tests/services/engine/subsystems/tourSubsystem.test.ts`

**Shape to mirror:** `tweenManager.ts:54` (factory returning the imperative + `isActive` object). The subsystem reads/writes its cursor through `store` (the only mutable state — no closure-held cursor); `advance` derives the pose purely from `store.getState()` + `nowMs`.

**Behaviour contract** (specify as contract + tests, NOT a full body):

- `start(beats)`: `actions.captureSettings()` → set `store` to `{ active:true, beats, beatIndex:0, phase:'travel', segmentStartMs:null, fromPosition: actions.resolveFocus(beats[0].focus) ?? [0,0,0], fromDistanceMpc: beats[0].distanceMpc, preTourSnapshot: <captured> }`; then apply beat 0's effects (`actions.applyTourEffect` for each). **Beat-0 from-keyframe = beat 0's own keyframe** (so a `travelMs:0` beat 0 settles immediately on its focus — stage 00 "begins here, no travel"). `segmentStartMs` stays `null` until the first `advance` stamps it (the subsystem has no clock at `start`).
- `advance(nowMs)` runs every frame while active and **drives the camera**:
  - If `!active` → no-op. If `segmentStartMs === null` → set it to `nowMs` (this segment's start).
  - `p = clamp((nowMs - segmentStartMs) / travelMs, 0, 1)` (a `travelMs:0` beat yields `p = 1` immediately).
  - Interpolate `logDist` **linearly** between `ln(fromDistanceMpc)` and `ln(beat.distanceMpc)`; `distance = Math.exp(that)`. (Load-bearing: assert the midpoint is the geometric mean, not the arithmetic mean.)
  - Interpolate `target` by `Vec3` lerp between `fromPosition` and the current beat's resolved focus (`actions.resolveFocus`; if null, hold `fromPosition`).
  - Carry `yaw`/`pitch` **constant** (the cinematic adds azimuth/elevation + dwell-orbit).
  - Call `actions.applyCameraPose(pose)` each frame.
  - When `p` first reaches 1 while `phase === 'travel'`: call `actions.markFocused(beat.focus)` ONCE and set `phase: 'dwell'`; then hold the settled pose through the dwell.
  - Advance segments when `nowMs - segmentStartMs >= travelMs + dwellMs`: if this was the last beat → **end** (`actions.restoreSettings(preTourSnapshot)`, set `active:false`); else set `beatIndex+1`, `phase:'travel'`, `segmentStartMs:null`, `fromPosition` = the just-finished beat's resolved focus, `fromDistanceMpc` = the just-finished beat's `distanceMpc`, and apply the next beat's effects.
- `stop()`: guard on `active` (so a completion racing `stop` doesn't double-restore); `actions.restoreSettings(preTourSnapshot)`; set `active:false`. Subsequent `advance` is a no-op.
- `isActive()`: returns `store.getState().active`.
- `destroy()` calls `stop()`.

**Tests** (fake `TourActions` recording calls; a throwaway in-memory `TourStore` via `createStore`; explicit `nowMs` clock; no GPU; `resolveFocus` returns deterministic fixture positions):

- [ ] `start captures settings, seeds the store active, applies beat-0 effects` — `captureSettings` called once; `store.getState().active === true`; beat 0's `applyTourEffect` calls recorded, ordered before the first `applyCameraPose`.
- [ ] `applyCameraPose called each advance while active` — N advances → N pose writes.
- [ ] `logDist interpolation is geometric at p=0/0.5/1` — for 1 Mpc → 100 Mpc, distance is 1 at p=0, 100 at p=1, and `exp((ln1+ln100)/2) = 10` at p=0.5 (the geometric mean), NOT 50.5.
- [ ] `target Vec3 lerps between fromPosition and current resolved focus` — midpoint component-wise.
- [ ] `segment effects apply at segment entry, before that segment's travel` — entering beat 1 records its effects before its first pose write.
- [ ] `markFocused fires once on settle` — exactly one `markFocused(beat.focus)` per beat, at the frame `p` first reaches 1, never during travel, never repeated during dwell; `phase` flips to `'dwell'`.
- [ ] `advances only after travelMs + dwellMs` — `advance(start + travelMs + dwellMs - 1)` does not advance; `advance(... + 0)` does.
- [ ] `plays all beats in order` — stepping the clock settles each focus once, in table order; `beatIndex` walks 0..n-1.
- [ ] `restores + deactivates after the last beat's dwell` — running off the end calls `restoreSettings(preTourSnapshot)` once and flips `active` false.
- [ ] `stop() restores + deactivates exactly once` — `stop()` mid-tour flips `active` false and calls `restoreSettings` once; a later `stop`/completion does NOT double-restore.
- [ ] `advance before start and after completion are no-ops`.
- [ ] `point-focus beats resolve via resolveFocus` — a `{ kind:'point', position }` beat drives the target from `resolveFocus`'s returned position (proves stages 06/08/09 exercise the variant).
- [ ] `travelMs:0 beat snaps to its keyframe and dwells` — writes its keyframe pose on the first advance and holds through the dwell (stage 00).

- [ ] Implement `createTourSubsystem` against those tests (no body in this plan — read `tweenManager.ts` for the factory shape). Use the project's `Vec3` lerp helper (cite the one you find; do not open-code a tuple).
- [ ] `npx vitest run tests/services/engine/subsystems/tourSubsystem.test.ts` → PASS.
- [ ] Commit.

### Task B3: Engine wiring — store, TourActions adapter, driver, handle, teardown

**Files (modify):** `src/services/engine/engine.ts`, `src/services/engine/camera/cameraDrivers.ts`.

Cite these locations (re-verify — they drift):

- [ ] **Create the store.** In `createEngine`, build `const tourStore = createTourStore(buildInitialTourState());` beside `const settingsStore = createSettingsStore(...)` (engine.ts ~232). It is a `createEngine` local — NOT a field on `EngineState`.
- [ ] **TourActions adapter** (build near the focus helpers — `selectFamous` ~561, `focusOnHome`, the commit helpers):
  - `resolveFocus(focus)` → `Vec3 | null`:
    - `milkyWay` → `MILKY_WAY_CENTER_WORLD` (`src/data/milkyWay/galacticCenter.ts`).
    - `home` → `state.initialCamSnapshot?.target` (null until bootstrap framing computed).
    - `famous` → look up the position the way `selectFamous` does: find the index in `state.data.galaxies.famousMeta`, then read the world position via the famous cloud / `buildGalaxyInfo` (reuse `selectFamous`'s path, returning the world `Vec3`).
    - `structure` → `state.data.structures.byId(id)?.worldPos` (`StructureStore.byId(id): StructureInfo | null`; `StructureInfo.worldPos: Vec3` — note the type is `StructureInfo`, NOT the old `StructureRecord`). Missing id → `null`.
    - `point` → the literal `position`.
  - `applyCameraPose(pose)` → write `state.cam`'s four orbit fields and re-derive the basis. **No snap helper exists** (`cameraSnapshot.ts` only offers `tweenToCameraSnapshot`, which tweens — wrong here). Open-code the write the way the `autoRotate` driver does (`cameraDrivers.ts:122-124`): assign `target/distance/yaw/pitch`, call `updatePosition(cam)` (`src/services/camera/orbitCamera.ts`), then `requestRender()`. Cam-null → no-op.
  - `markFocused(focus)` → selection/focus writes ONLY, no tween — the un-braided half of the commit helpers (`commitGalaxyFocus`/`commitStructureFocus`/`commitMilkyWayFocus` each do `selection.setSelected` + `selection.setFocused` THEN a tween). Call `state.subsystems.selection.setSelected(target)` + `setFocused(target)` directly, where `target` is a `FocusableTarget`: for `structure`, `state.data.structures.byId(id)` (a `StructureInfo`, which IS a `FocusableTarget` arm); for `famous`, the `GalaxyInfo` built as `selectFamous` does; for `milkyWay`, `MILKY_WAY_INFO` (`src/data/milkyWay/milkyWayInfo.ts`); for `home`/`point` (no catalog object), `setFocused(null)`.
  - `applyTourEffect(effect)` → dispatch each `TourEffect.kind` to the matching internal setter (all take `(state, settingsStore, …)`): `filaments` → `setFilamentsEnabled`; `milkyWay` → `setMilkyWayEnabled`; `source` → `setSourceVisible`; `volume` → `setVolumeFieldEnabled`; `structure` → `setStructureItemEnabled`; `structureLabel` → `setStructureLabelEnabled`. (These are the same functions the public handle clusters delegate to — `engine.ts` ~755/768/772/784/786/793.)
  - `captureSettings()` → `captureSettings(state)` (`wiring/captureSettings`).
  - `restoreSettings(snapshot)` → `restoreSettings(state, settingsStore, snapshot, { animate: true })` (`wiring/restoreSettings`).
  - `requestRender()` → `state.subsystems.scheduler.requestRender()`.
- [ ] **Construct + register the subsystem.** Build `tour: createTourSubsystem(tourStore, tourActions)` **eagerly** in the subsystem literal (engine.ts ~303-384) alongside `structureFocus` — no GPU dependency. The adapter closes over `state` + `settingsStore`, so construct it where both are in scope (mint the adapter just above the subsystem literal if needed).
- [ ] **Register the camera driver.** In `buildCameraDrivers(state)` (`cameraDrivers.ts:106`), add the `tour` driver at priority 80 (the slot the comment at :103-104 reserves) per the snippet in the Architecture section. Remove that "intentionally absent" comment. **No `runFrame.ts` edits** — `runCameraDrivers` makes it authoritative and `stillAnimating` already keys off `deps.drivers`.
- [ ] **Expose on the handle.** Add `tour: { start: (beats) => state.subsystems.tour.start(beats), stop: () => state.subsystems.tour.stop(), isActive: () => state.subsystems.tour.isActive() }` to the `const handle: EngineHandle` literal (engine.ts ~728), and `tourStore` beside `settingsStore` (~834).
- [ ] **Teardown.** Add `state.subsystems.tour.destroy();` to the destroy walk beside `structureFocus.destroy()` (engine.ts ~644-666).
- [ ] `npm run typecheck && npm test` → PASS.
- [ ] Commit.

### Task B4: Beat table + App.tsx wiring (start / cancel / UI-hide)

**Files:**
- Create: `src/data/tourBeats.ts` — `export const TOUR_BEATS: readonly TourBeat[]` per the beat table.
- Create: `tests/data/tourBeats.test.ts`.
- Modify: `src/components/App/App.tsx`.

- [ ] Author `TOUR_BEATS` from the eleven stages per the beat table + the seed-vs-cinematic notes (collapse stage 03's pass-throughs; `point` coords for 06/08/09; instant effects only; structure/structureLabel for stage 03; omit the flow toggle; map milliquas/mcpm only if the ids confirm). Keep `src/data/` pure (no `services/` imports).
- [ ] Test `tests/data/tourBeats.test.ts`:
  - `has 11 beats in stage order` — `length === 11`; ids equal the ordered stage slugs.
  - `ends on milkyWay (home-again)` — last beat's focus kind is `milkyWay`.
  - `distance ladder spans ~0.05 → 6000 Mpc` — first/min ≈ 0.05, max ≈ 6000; outbound legs (00→09) monotonic-non-decreasing in `distanceMpc`.
  - `void is mid-sequence, never last` — the `void-bootes-void` beat is not final.
  - `effects only where stages declare them` — only stage-03/05/08 (etc.) beats carry a non-empty `effects` array.
- [ ] App.tsx: replace `onTour={splash.dismissTour}` with a `startTour` callback that calls `splash.dismissTour()` then `handleRef.current?.tour.start(TOUR_BEATS)`. **No local `tourActive` state and no completion promise** — read `const tourActive = useTourStore(handleRef, (s) => s.active, false);` instead.
- [ ] Cancel-on-input: a `useEffect` armed only while `tourActive` adds **capture-phase** `pointerdown` / `keydown` / `wheel` / `touchstart` window listeners that call `handleRef.current?.tour.stop()`; cleanup removes them (`wheel` / `touchstart` registered `passive: true`). `stop()` flips `tourStore.active`, so `useTourStore` re-renders and the UI restores — no token plumbing.
- [ ] Force the HUD hidden while active: add `tourActive` to the `uiStack` hidden condition — `(uiHidden || splash.splashVisible || tourActive)`.
- [ ] `npm run typecheck && npm test` → PASS.
- [ ] Commit.

### Task B5: Final smoke + integration check

**Files:** none modified; verification task.

- [ ] `npm run typecheck && npm test && npm run build` → all green.
- [ ] Manual smoke (ask the user) in the live dev server:
  1. Tour button flies the **log-scale ladder** — uniform decades/sec, NOT linear jumps.
  2. The tour **owns the camera each beat** — moves under tour control (priority-80 driver), not a focus-tween snap; auto-rotate does not fight it.
  3. Dwell **holds** at each settled beat (loop keeps ticking through dwells via the driver, goes idle after the tour ends).
  4. Effects toggle on their beats and **restore** on end — and the SettingsPanel reflects the restored values (toggle filaments on *before* starting to confirm restore-to-on as well as restore-to-off; this exercises the `restoreSettings`→`store.setState` notify path).
  5. Any click / scroll / key during the tour **stops it cleanly**, restores the UI chrome, leaves the camera usable.
  6. **Point-focus stages work** — deep field (08) + edge (09) frame the origin and pull back to the horizon shell.
  7. Clicking About mid-tour reopens the splash AND stops the tour (the click hits the cancel listener).
- [ ] Confirm the cinematic design is still the additive target: `ls docs/tour/stages/` shows the eleven stage files; this seed's `TOUR_BEATS` reads from their front-matter.

---

## Decisions baked in

- **Tour state in an engine-owned `TourStore`, sibling of the settings store — never folded into `EngineSettingsState`.** The tour captures and restores the settings store; its cursor cannot live inside the value it clones/swaps without polluting `SettingsSnapshot` or adding a carve-out exclusion. The store reuses the settings-store *pattern* (vanilla zustand, engine-owned, `useStore` adapter) wholesale.
- **The only `EngineState` touchpoint is `state.subsystems.tour`.** The store is a `createEngine` local + `handle.tourStore`; there is no `state.tour` read-view getter because the only cursor reader is the subsystem itself (the driver/`runFrame` ask `state.subsystems.tour.isActive()`).
- **The per-frame camera pose is never stored** — computed in `advance` and written to `state.cam`. So `tourStore` mutates only at beat boundaries.
- **No completion Promise.** React observes `tourStore.active`; `start` is `void`. App.tsx loses its local flag + `.finally` echo.
- **Per-frame camera ownership via the reserved priority-80 `tour` `CameraDriver`** — `runCameraDrivers` arbitration makes the tour authoritative and `stillAnimating` already keys off drivers, so there are no `runFrame.ts` edits and no two-camera-mode entanglement.
- **Seed = a single linear-in-log segment per beat.** `logDist` lerps linearly (geometric distance interpolation); the cinematic swaps in a Catmull-Rom spline + arc-length reparam — same keyframe inputs.
- **The real eleven-stage beat table**, authored from `docs/tour/stages/00..10` — so the cinematic enriches each beat, never re-authors the itinerary.
- **Captions / rampMs / azimuth-elevation / pass-throughs / dwell-orbit are OMITTED** from the seed and added additively. Captions land as a `caption` field on `TourState` + `TourBeat` + a caption subsystem — the `TourStore` channel makes that a pure addition.
- **`point` focus is exercised by the seed** (stages 06 / 08 / 09) — real and tested from day one.
- **Restore is the settings seam** — `captureSettings`/`restoreSettings` (whole-cluster, detached, store-notifying), not a hand-rolled per-key snapshot.
- **`markFocused` is the un-braided half of the commit helpers** — selection/focus writes only, no camera tween.

## Self-review notes

- **Seed, not stub.** `engine.tour` + `tourSubsystem` + `TourStore` + the `Tour*` / `CameraPose` types are the foundation the cinematic *extends*, not throws away. Swapping the log-lerp for a spline and adding the omitted optional fields is the whole cinematic camera delta.
- **Data model first, behind a gate.** Part A ships the `@types/engine/tour/` folder alone so the shape is reviewable before behaviour exists; Part B is written against those frozen contracts.
- **Plan-style compliance:** type contracts + test names/assertions included; no implementation bodies; integration points cited by `file:line` (re-verify on pickup — engine.ts churns).
- **Convention checks:** one type per `@types` file; `readonly` throughout; `Vec3` aliases not raw tuples; no barrels; tests mirror `src/`.
- **Reality-grounded 2026-06-16:** `PoiCategory` removed → structure effects key on `StructureId`; `StructureRecord` → `StructureInfo`; `focusOnMilkyWay` deleted → `markFocused` builds the `FocusableTarget` and calls selection setters; camera mutation is a driver registry (`buildCameraDrivers`/`runCameraDrivers`) with the tour slot pre-reserved; SpaceMouse subsystem removed (not a tour concern); the visibility seam is `captureSettings`/`restoreSettings`/`applyEffect` (the `readVisibility`/`applyVisibility` the old draft cited were never built); settings handle reshaped to per-source clusters (`sources`/`structures`/`milkyWay`/`filaments`/`volumes`), no `handle.labels`.
