# Tour Engine Seed (cinematic-core) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follows [`plan-style.md`](../conventions/plan-style.md): contract code (types, test names, signatures) is included; implementation bodies are not — read the cited code and write the body from the tests.

> **Companion plan:** `2026-05-20-splash-screen-01-core.md` — the splash dialog + AboutPill + useSplash hook + WebGPU gate. **Plan 1 has landed:** the `Splash` component, `useSplash` (`dismissExplore` / `dismissTour` / `reopen`), and the `<Splash onTour={...}>` prop all exist; `onTour` is currently wired to `splash.dismissTour` (the Tour button just dismisses). This plan replaces that no-op with a real, frame-driven camera tour.

> **The cinematic target.** `docs/tour/` is the full guided-tour design — a narrated ~2½-min powers-of-ten journey (`goal.md`, `script.md`, `cinematography.md`, `graphic-design.md`, and the eleven `stages/NN-*.md` front-matter files). **This plan ships the SEED that the cinematic tour purely extends.** The seed's camera core is built in the *same shape* the cinematic uses, running a trivial subset — so the cinematic is additive, with zero rework or cruft. (The `stages/*.facts.md` files are trivia and out of scope.)

> **DEPENDS ON the pre-tour decomplection** (`../specs/2026-06-08-pre-tour-decomplection-design.md`), which lands first. That spec reconciles two tasks here: (1) the tour does **not** "write the camera pose after the other mutators" — it registers a `tour` `CameraDriver` (priority 80) in the new camera-driver registry, and `applyCameraPose` becomes that driver's `apply`; (2) `TourActions.snapshot`/`restore`/`applyEffect` build on the seam's `readVisibility` / `applyVisibility({ animate })` rather than hand-coding the four settings storage shapes. Apply those two reconciliations when picking this plan up; the rest of the plan stands.

---

## The architecture pivot (read this first)

An earlier draft of this plan delegated camera control to one-shot tweens: `actions.focus()` → `commitFocus` / `focusOnMilkyWay` / `selectFamous` → `tweenToStructure` / `tweenToGalaxy`. **The cinematic design requires the opposite**, and `cinematography.md` is explicit about it:

> "**Driver consequence:** `log-dolly` + `pass-through-spline` + `dwell-drift` mean the tour subsystem must **own the camera per-frame** — own a global tour clock and evaluate the spline + dwell-orbit into the camera — not fire one-shot tweens through `tweenManager`."

One-shot tweens are the wrong substrate for three independent reasons:

1. **Scale is logarithmic.** Framing distances span ~0.05 → ~6,000 Mpc (5 orders of magnitude). The camera must interpolate `logDist = ln(distance)`, not raw distance — `tweenToGalaxy` / `tweenToStructure` lerp raw distance. (`goal.md` "Hard constraints"; `cinematography.md` "The one hard constraint".)
2. **Dwell is never frozen.** Every stop carries a slow drift (`cinematography.md` "Dwell is never frozen"). A one-shot tween settles and lets the render-on-demand loop go idle — dwell-drift literally cannot run on that substrate.
3. **Per-frame ownership is the only thing a Catmull-Rom spline + arc-length reparam can extend.** A bag of sequential tweens has no global clock to evaluate a spline against.

Building the tween-delegation version means ~40 % of its core (the focus-delegation adapter + wall-clock-between-tweens sequencing) gets thrown away when the cinematic lands, and risks a two-camera-mode entanglement (tour-via-tweens vs cinematic-via-pose-writes). So **we reshape the seed's camera core now to be the cinematic's core**, running the trivial subset.

### What the seed ships

- The tour subsystem **owns the camera every frame** while active: it writes a `CameraPose` into `state.cam` directly (NOT via `tweenManager`).
- A **single linear-in-log segment per beat**: `logDist` lerps linearly between the previous keyframe's `ln(distanceMpc)` and the current beat's, `target` lerps as a `Vec3`, yaw/pitch held constant.
- **Per-beat framing distance** (`distanceMpc`) and **per-beat travel duration** (`travelMs`) — the keyframe model, not a global tween constant.
- **Generic per-beat effects** (instant boolean toggles), snapshotted at start and restored on end/stop.
- The **real eleven-stage beat table** authored from `docs/tour/stages/`.
- Cancel-on-input, UI-hide coordination, render-on-demand participation.

### The additive extension points (cinematic, NOT in the seed)

Each is purely additive on top of what the seed ships — a new field, a new interpolation strategy, or a new subsystem — never a reshape:

- **Catmull-Rom spline** through N keyframes with **arc-length reparam** — replaces the seed's straight log-lerp between two keyframes. (`TourBeat` keyframes already feed it.)
- **Pass-through waypoints** (`dwell_s: 0`) as spline control points that bend the path at constant speed — the seed collapses these to a settle on the stage's primary focus.
- **Dwell-orbit / dwell-drift** — a tiny orbit evaluated during the dwell instead of holding a fixed pose.
- **Azimuth / elevation** per keyframe (approach angle) — the seed carries yaw/pitch constant.
- **Captions** (`caption?: TourCaption` on `TourBeat`) + a `tourCaptionSubsystem` rendering the stage title + narration — the seed renders no text.
- **Ramped effects** (`ramp_s` / `rampMs` on `TourEffect`) tweening an effect's intensity over a leg — the seed's effects are instant.
- **Look-offset** (look-ahead) and **per-segment easing** parameters.
- **Flow-field toggle** — already expressible as a `TourEffect` variant when the layer lands.

None of these require changing a type the seed ships — they extend it.

---

## Skymap conventions reminder (applies to every task below)

- `type` aliases only, never `interface`.
- **One exported type per file** under `src/@types` — never co-locate two.
- `readonly` fields + `Vec2` / `Vec3` aliases (not raw tuples); prefer immutability.
- Multi-paragraph didactic comments at module headers; comments timeless (no dates / PR refs in code).
- No barrel exports; deep imports.
- Tests under `tests/` mirroring `src/`.
- Dev server is left running.
- **Re-verify every cited line number against the live tree before editing** — engine.ts and runFrame.ts churn and the numbers below will have drifted.

---

## Architecture

The tour is an **engine subsystem** (`tourSubsystem`) owning beat sequencing **and the per-frame camera evaluator**, plus a thin **`engine.tour` sub-handle** (`start` / `stop` / `isActive`). It is frame-driven, mirroring the factory shape of `tweenManager` (`src/services/engine/camera/tweenManager.ts:52` — a closure-over-mutable-state factory returning an imperative + `isActive` object) and the per-frame `update(…, nowMs)` cadence of `structureFocusSubsystem` (`src/services/engine/subsystems/structureFocusSubsystem.ts:56`).

**Why per-frame camera ownership, not tweens.** See the pivot section above. The single load-bearing consequence: the subsystem holds a global tour clock and, every frame, evaluates the current segment into a `CameraPose` it writes to the camera via the `TourActions` port. While the tour is active its pose write is **authoritative** — it must run *after* the other camera mutators in the frame (tweens / spaceMouse / autoRotate) and must NOT itself start a `tweenManager` tween.

**Render-on-demand.** The loop only keeps ticking while something animates (`stillAnimating` predicate, `runFrame.ts:493-501`). A tour dwelling between beats has no in-flight tween, so without participation the loop would sleep and the dwell clock would stall. Adding `|| state.subsystems.tour.isActive()` to that predicate makes the tour keep frames flowing through every beat and dwell — the same way an in-flight tween or autoRotate does.

**Per-beat dispatch via a `TourActions` port.** The subsystem does not import engine internals. It calls an injected `TourActions` object. The engine builds the real adapter closing over its internal `state`; tests inject a fake that records calls and is driven by an explicit `advance(nowMs)` clock — so the sequencing + interpolation core is unit-tested with no real timers and no GPU.

**Completion.** The engine has no completion-promise idiom for tweens (polled via `isActive()`), but `fades.fadeTo()` returns `Promise<void>`. Following that precedent, `engine.tour.start(beats)` returns `Promise<void>` that resolves when the tour ends — naturally (last dwell elapsed) or via `stop()`. App.tsx clears `tourActive` in the resolution.

**Restoration.** On `start`, the subsystem asks the adapter to `snapshot` the union of every setting any beat's `effects` touch, and replays that snapshot on end / stop — restoring the user's pre-tour state for the whole effect set.

### Data contracts

These types are the contract the cinematic tour also consumes. One exported type per file. Verify every import path against the live tree before writing — they are cited from the current tree below but will be re-confirmed by the implementer.

```ts
// src/@types/engine/tour/TourFocus.d.ts
import type { Vec3 } from '../../math/Vec3';

/**
 * Symbolic camera target for a tour beat.  A beat table is static data
 * authored at build time, but GalaxyInfo is built at runtime and
 * StructureRecords come from the structure store — so a beat references its
 * target by name and the runner resolves it to a world position, matching how
 * the engine already resolves selectFamous(id) and structure-store lookups.
 *
 * The `point` variant carries a literal world position for stages that frame
 * no single catalog object (the deep field, the edge — stages 06 / 08 / 09).
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
import type { VolumeFieldId } from '../../data/VolumeFieldId';
import type { PoiCategory } from '../data/PoiCategory';

/**
 * A per-beat side-effect, applied instantly on beat entry.  A generic delta
 * union (not a hardcoded `filamentsOn?: boolean`) so the cinematic tour can add
 * volume / source / label beats with no change to the beat shape.  Each variant
 * maps 1:1 to an existing engine-handle setter.
 *
 * Effects are instant booleans here.  The cinematic tour adds an optional
 * `rampMs` field additively, to tween an effect's intensity over a leg
 * (cinematography.md "Effects can animate"); the seed always toggles instantly.
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
 * One beat of a guided tour — a keyframe in the cinematic camera model.
 *
 * `distanceMpc` is the per-beat FRAMING distance (camera→focus, world units ≈
 * Mpc); the seed interpolates `ln(distanceMpc)` linearly toward it, the
 * cinematic splines it in log space.  `travelMs` is the per-beat travel
 * duration (NOT a global constant — the cinematic weights legs); `dwellMs` is
 * the hold AFTER travel settles.  `effects` apply instantly on beat entry.
 *
 * The cinematic tour adds, ADDITIVELY: `caption?: TourCaption` (the editorial
 * title + narration layer), per-keyframe `azimuth` / `elevation` (approach
 * angle), and pass-through-waypoint fields (a zero-dwell control point that
 * bends the spline).  None of those reshape this type.
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
 * The per-frame orbit-camera pose the tour writes through TourActions.
 * Exactly the four mutable orbit fields (`target` / `distance` / `yaw` /
 * `pitch`); the immutable framing fields (`fovYRad` / `near` / `far`) stay
 * owned by `state.cam` and are never written by the tour.
 *
 * Intentionally narrower than `InitialCam` (src/@types/camera/InitialCam.d.ts),
 * which carries the framing fields too — see the Task-1 note for why a fresh
 * type rather than reusing it.
 */
export type CameraPose = {
  readonly target: Vec3;
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
};
```

```ts
// src/@types/engine/tour/TourActions.d.ts
import type { TourFocus } from './TourFocus';
import type { TourEffect } from './TourEffect';
import type { CameraPose } from './CameraPose';
import type { Vec3 } from '../../math/Vec3';

/**
 * The port the tourSubsystem calls to affect the world.  The engine wires the
 * real adapter (closing over internal state); tests inject a fake that records
 * calls.
 *
 * `resolveFocus` turns a symbolic target into a world position WITHOUT moving
 * the camera or changing selection (returns null for an unresolvable id).
 * `applyCameraPose` is how the tour OWNS the camera — it writes `state.cam`
 * every frame.  `markFocused` sets selection/focus state for label + ring
 * emphasis ONLY (no camera move) — fired once on settle.  `snapshot` reads the
 * current value of every setting the given effects touch and returns a thunk
 * that restores them.
 */
export type TourActions = {
  resolveFocus(focus: TourFocus): Vec3 | null;
  applyCameraPose(pose: CameraPose): void;
  markFocused(focus: TourFocus): void;
  applyEffect(effect: TourEffect): void;
  snapshot(effects: readonly TourEffect[]): () => void;
  requestRender(): void;
};
```

```ts
// src/@types/engine/subsystems/TourSubsystem.d.ts
import type { TourBeat } from '../tour/TourBeat';

/**
 * Engine subsystem owning tour sequencing AND the per-frame camera evaluator.
 * Frame-driven: `advance(nowMs)` is called once per frame while active and
 * writes the camera pose for the current segment.  `start` resolves when the
 * tour ends (naturally or via `stop`).
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

### The beat table

`src/data/tourBeats.ts` — `TOUR_BEATS: readonly TourBeat[]` authored from the eleven cinematic stages (`docs/tour/stages/00..10`). For each stage, map the front-matter: `focus` → `TourFocus`, `distance_mpc` → `distanceMpc`, `travel_s * 1000` → `travelMs`, `dwell_s * 1000` → `dwellMs`, `effects` → `TourEffect[]`.

| # | id | focus | distanceMpc | travelMs | dwellMs | effects |
|---|----|-------|-------------|----------|---------|---------|
| 00 | `opening-title` | `{ kind: 'milkyWay' }` | 0.05 | 0 | 8000 | — |
| 01 | `you-are-here` | `{ kind: 'milkyWay' }` | 0.05 | 3000 | 7000 | — |
| 02 | `nearest-neighbour` | `{ kind: 'famous', id: 'm31' }` | 0.8 | 7000 | 7000 | — |
| 03 | `our-neighbourhood` | `{ kind: 'structure', structureId: 'group-sculptor-group' }` | 4 | 9000 | 5000 | `markerCategory group on`, `labelCategory group on` |
| 04 | `nearest-cluster` | `{ kind: 'structure', structureId: 'cluster-virgo-m87' }` | 16 | 7000 | 7000 | — |
| 05 | `cosmic-web` | `{ kind: 'structure', structureId: 'supercluster-coma-sc' }` | 90 | 9000 | 9000 | `filaments on` (+ `volume` mcpm on — see note) |
| 06 | `cosmic-flows` | `{ kind: 'point', position: [0,0,0] }` | 80 | 5000 | 9000 | — (flow layer toggle deferred — see note) |
| 07 | `emptiness` | `{ kind: 'structure', structureId: 'void-bootes-void' }` | 150 | 6000 | 5000 | — |
| 08 | `deep-field` | `{ kind: 'point', position: [0,0,0] }` | 2000 | 8000 | 4000 | `source milliquas visible` (see note) |
| 09 | `the-edge` | `{ kind: 'point', position: [0,0,0] }` | 6000 | 9000 | 8000 | — |
| 10 | `home-again` | `{ kind: 'milkyWay' }` | 0.05 | 8000 | 5000 | — |

**Verified IDs** (live tree): famous `m31` exists (`data/famous_galaxies.seed.json:813`); structure ids are `${category}-${seed.id}` (`buildStaticAnchorStructures.ts:103`), so `group-sculptor-group`, `cluster-virgo-m87`, `supercluster-coma-sc`, `void-bootes-void` all resolve against `data/structure_anchors.seed.json`. The stage front-matter slugs already carry the `category-` prefix, matching the store's id rule.

**Seed-vs-cinematic notes** (author these as comments in `tourBeats.ts`):

- **Pass-through waypoints collapse.** Stage 03's director notes route the path *through* `group-m81-group` and `group-cen-a-group` as `dwell_s: 0` pass-throughs before settling on `group-sculptor-group`. The seed has no spline, so it collapses to a single settle on the primary focus (`group-sculptor-group`). The cinematic restores the two pass-throughs as Catmull-Rom control points.
- **`point` focuses use the front-matter coords.** Stages 06 / 08 / 09 declare `focus: point:0,0,0` (placeholder origin — the cinematic will retarget 06 to the local flow basin). Use the literal coords as the `point` variant's `position`.
- **Effect mapping is best-effort against shipped handles.** Stage 05 declares "mcpm volume fade-in + filaments fade-in"; the seed toggles them instantly (`filaments on`, and `volume` mcpm on IF the implementer confirms the field id from `VolumeFieldId` and the master-enable interplay — otherwise ship filaments-only and leave a TODO comment). Stage 06's flow-field toggle is **omitted from the seed** (the CF4++ flow layer's `TourEffect` variant is a cinematic add — see the extension list); leave a comment. Stage 08's "milliquas emphasized" maps to a `source` visible toggle if a milliquas `SourceType` exists; otherwise omit with a comment.
- **The void sits mid-sequence (07), never last** — the camera never *ends* on an empty region. Stage 10 (`home-again`) is the climax-return to the Milky Way.

---

## Task 1: Tour data-structure + handle types

**Files (create, one type each):**
- `src/@types/engine/tour/TourFocus.d.ts`
- `src/@types/engine/tour/TourEffect.d.ts`
- `src/@types/engine/tour/TourBeat.d.ts`
- `src/@types/engine/tour/CameraPose.d.ts`
- `src/@types/engine/tour/TourActions.d.ts`
- `src/@types/engine/subsystems/TourSubsystem.d.ts`
- `src/@types/engine/handles/EngineTourHandle.d.ts`

- [ ] Write the seven type files exactly as specified in the Data-contracts section. Verify the imported type names + paths against the live tree first: `Vec3` is `src/@types/math/Vec3` (confirmed), `SourceType` is `src/@types/data/SourceType` (confirmed `export type SourceType`), `VolumeFieldId` is `src/@types/data/VolumeFieldId` (confirmed), `PoiCategory` is `src/@types/engine/data/PoiCategory` (confirmed).
- [ ] **`CameraPose` — reuse-check first.** Before creating `CameraPose.d.ts`, look at `src/@types/camera/InitialCam.d.ts` and the camera-snapshot helpers (`src/services/engine/camera/cameraSnapshot.ts`). `InitialCam` has `target/distance/yaw/pitch` PLUS `fovYRad/near/far` — it is NOT a clean match (the tour must never write the framing fields). Create the narrower `CameraPose` as specified, and add a one-line note in its docblock pointing at `InitialCam` and why it is intentionally narrower. (Document the decision either way: if you find an exact-shape existing type, reuse it instead.)
- [ ] Add `tour: EngineTourHandle` to the `EngineHandle` type — `src/@types/engine/EngineHandle.d.ts` (the sub-handle cluster, ~lines 46-59; add the import alongside the other `./handles/*` imports).
- [ ] Add `tour: TourSubsystem` to the subsystem-registry type — `src/@types/engine/handles/EngineSubsystemHandles.d.ts`. Note the `_EnforceDestroyable` mapped type at the bottom (~lines 141-145) requires every field satisfy `Destroyable`; `TourSubsystem` has `destroy()`, so it passes. Add the field as **non-nullable** (eager construction — no GPU dep) alongside `structureFocus` / `tweens`.
- [ ] `npm run typecheck` → PASS (types compile; nothing consumes them yet).
- [ ] Commit.

## Task 2: `tourSubsystem` — sequencing + per-frame camera evaluator (the heart)

**Files:**
- Create: `src/services/engine/subsystems/tourSubsystem.ts` — `createTourSubsystem(actions: TourActions): TourSubsystem`
- Test: `tests/services/engine/subsystems/tourSubsystem.test.ts`

**Shape to mirror:** `tweenManager.ts:52` (closure-over-mutable-state factory returning the imperative + `isActive` object). The subsystem holds `beats`, segment `index`, `segmentStartMs`, an `active` flag, the completion `resolve`, the `restore` thunk, the **previous-keyframe pose** (the start pose for beat 0; the prior beat's resolved keyframe thereafter), and a `settled` flag for the current segment.

**Behaviour contract** (specify as contract + tests, NOT a full body):

- `start(beats)`: stamp segment 0's `segmentStartMs`; apply beat 0's effects at segment entry (before its travel); call `actions.snapshot(union-of-all-beat-effects)` ONCE and store the restore thunk; capture the **previous keyframe for beat 0** (see the decision below); return a `Promise<void>` resolved on end. Set `active = true`.
- `advance(nowMs)` runs every frame while active and **drives the camera**. For the current segment:
  - `p = clamp((nowMs - segmentStartMs) / travelMs, 0, 1)` (a `travelMs: 0` beat — stage 00 — yields `p = 1` immediately: snap to the keyframe and dwell).
  - Interpolate `logDist` **linearly** between `ln(prevDistanceMpc)` and `ln(beat.distanceMpc)`; `distance = Math.exp(that)`. (This is the load-bearing log-scale fact — assert the midpoint is the geometric mean, not the arithmetic mean.)
  - Interpolate `target` by `Vec3` lerp between the previous resolved focus position and the current beat's resolved focus position (via `actions.resolveFocus`).
  - Carry `yaw` / `pitch` **constant** (seed keeps orientation fixed; the cinematic adds azimuth/elevation + dwell-orbit).
  - Call `actions.applyCameraPose(pose)` each frame.
  - When `p` first reaches 1, call `actions.markFocused(beat.focus)` ONCE (the settle), set `settled`; then hold the settled pose during the dwell.
  - Advance to the next segment when `nowMs - segmentStartMs >= travelMs + dwellMs`: stamp the new `segmentStartMs`, set the new previous-keyframe to the just-finished beat's resolved keyframe, apply the next beat's effects at entry, clear `settled`.
  - Running off the end → invoke the restore thunk, resolve the promise, `active = false`.
- **Previous-keyframe-for-beat-0 decision (document the contract you pick):** the cleaner contract is to accept the camera's current pose at `start` via the port — i.e. resolve beat 0's *own* focus as both the from- and to-target so beat 0 with `travelMs: 0` simply settles on its keyframe (stage 00 is "held open" and frames the Milky Way). Pick this unless you find a reason the start pose must be read from the live camera; if you read the live camera, add a `resolveCurrentPose(): CameraPose` to the port and document it. **Prefer the simpler "from = beat 0's own keyframe" contract** — it needs no new port method and matches stage 00's "begins here, no travel" intent.
- `stop()`: invoke the restore thunk **exactly once** (guard so a completion racing `stop` doesn't double-invoke), resolve the pending promise, `active = false`. Subsequent `advance` is a no-op.
- `destroy()` calls `stop()`.

**Tests** (fake `TourActions` recording calls; explicit `nowMs` clock; no GPU; `resolveFocus` returns deterministic fixture positions):

- [ ] `start applies beat-0 effects then begins travel` — beat 0's `applyEffect` calls recorded at start, ordered before the first `applyCameraPose`; `isActive()` is `true`.
- [ ] `applyCameraPose called each advance while active` — N advances → N pose writes.
- [ ] `logDist interpolation is geometric at p=0/0.5/1` — for a beat from 1 Mpc → 100 Mpc, the pose distance at `p=0` is 1, at `p=1` is 100, and at `p=0.5` is `exp((ln1+ln100)/2) = 10` (the geometric mean), NOT 50.5 (arithmetic).
- [ ] `target Vec3 lerps between previous and current resolved focus` — assert the midpoint component-wise.
- [ ] `effects of a segment apply at segment entry, ordered before that segment's travel` — entering segment 1 records segment 1's effects before its first pose write.
- [ ] `markFocused fires once on settle` — exactly one `markFocused(beat.focus)` per beat, at the frame `p` first reaches 1, never during travel, never repeated during dwell.
- [ ] `advances to the next beat only after travelMs + dwellMs` — `advance(segmentStart + travelMs + dwellMs - 1)` does not advance; `advance(... + 0)` does.
- [ ] `plays all beats in order` — stepping the clock through every beat settles each focus once, in table order.
- [ ] `resolves the start() promise after the last beat's dwell` — the promise resolves once the final beat's `travelMs + dwellMs` elapses; `isActive()` becomes `false`.
- [ ] `stop() ends + resolves + restores once` — `stop()` mid-tour flips `isActive()` to `false`, resolves the pending promise, invokes the restore thunk exactly once.
- [ ] `restore on natural completion exactly once` — restore thunk invoked once on running off the end (and never double-invoked if a later `stop` follows).
- [ ] `advance before start is a no-op` and `advance after completion is a no-op`.
- [ ] `point-focus beats resolve via resolveFocus` — a `{ kind: 'point', position }` beat drives the target from `resolveFocus`'s returned position (proves the seed actually exercises the point variant via stages 06/08/09).
- [ ] `travelMs:0 beat snaps to its keyframe and dwells` — a beat with `travelMs: 0` writes its keyframe pose on the first advance and holds through the dwell (stage 00).

- [ ] Implement `createTourSubsystem` against those tests (no body in this plan — read `tweenManager.ts` for the factory shape). Use `Vec3` lerp from the project's math utils (cite the helper you find; do not open-code a tuple).
- [ ] `npx vitest run tests/services/engine/subsystems/tourSubsystem.test.ts` → PASS.
- [ ] Commit.

## Task 3: Engine wiring — TourActions adapter, registration, handle, frame tick + RoD gate

**Files (modify):**
- `src/services/engine/engine.ts` — build the `TourActions` adapter, construct + register the subsystem, add the `tour` sub-handle, add teardown.
- `src/services/engine/frame/runFrame.ts` — tick the subsystem + extend the reschedule gate.

Cite these locations (verified against the live tree; **re-verify — they drift**):

- [ ] **TourActions adapter** (engine.ts, build near the focus helpers — `focusOnHome` ~840-853, `focusOnMilkyWay` ~855-879, `selectFamous` ~885-904):
  - `resolveFocus(focus)` → `Vec3 | null`:
    - `milkyWay` → `MILKY_WAY_CENTER_WORLD` (imported at engine.ts:132 from `../../data/galacticCenter`).
    - `home` → `state.initialCamSnapshot?.target` (null until bootstrap framing computed — return null then).
    - `famous` → look up the famous-meta position the way `selectFamous` does: `state.data.galaxies.famousMeta.findIndex(m => m.id === id)` then read the position (confirm whether the world position is on the meta entry or must come from the famous cloud via `buildGalaxyInfo` — `selectFamous` at ~885-904 shows the lookup; reuse the same path, returning the world `Vec3`).
    - `structure` → `state.data.structures.byId(id)?.worldPos` (StructureStore.byId returns `StructureRecord | null` — `src/@types/engine/data/StructureStore.d.ts:32`; `StructureRecord.worldPos` is a `Vec3` — `StructureRecord.d.ts`). Missing id → `null`.
    - `point` → the literal `position`.
    - A `null` from any branch → the subsystem skips the target (don't crash).
  - `applyCameraPose(pose)` → write `state.cam`'s four orbit fields and re-derive the basis. **Reuse the existing snap path**: this is exactly what `snapToCameraSnapshot` (`cameraSnapshot.ts:84`) does (copy `target/distance/yaw/pitch`, call `updatePosition(cam)`, requestRender) — call it (or factor a `CameraPose`-shaped variant) rather than open-coding the field copy. Cam-null → no-op (it absorbs the guard).
  - `markFocused(focus)` → set selection/focus state for label + ring emphasis **without moving the camera**. The existing commit helpers braid selection + tween: `commitStructureFocus` (`helpers/commitStructureFocus.ts:21`) does `selection.setSelected(...)` + `selection.setFocused(...)` THEN `tweenToStructure`; `commitGalaxyFocus` (`helpers/commitGalaxyFocus.ts:40`) does the same THEN `tweenToGalaxy`. The adapter must do **only the `setSelected` + `setFocused` writes**, omitting the tween — call `state.subsystems.selection.setSelected/setFocused` directly (for structure: `{ kind: 'structure', id }`; for famous: build the `GalaxyInfo` as `selectFamous` does and pass `{ kind: 'galaxy', source, localIdx }` + info). For `milkyWay` / `home` / `point` (no catalog object), `setFocused(null)` (matching `focusOnMilkyWay`'s "not a catalog object → drop the focus slot", engine.ts ~868). Document this split in the adapter's comment.
  - `applyEffect(effect)` → dispatch each `TourEffect.kind` to the matching handle setter on `state` (the same setters the public handle wraps): `filaments` → the filaments enable path (handle literal ~1346-1360 / `boringSetters.setFilamentsEnabled` + fade); `milkyWay` → ~1332-1345; `source` → `setSourceVisible` (~943); `volume` → the volumes enable path (`volumes.setEnabled` wiring); `labelCategory` → `labels.setCategoryLabelVisible`; `markerCategory` → `labels.setCategoryMarkerVisible`. Prefer calling the same internal functions the handle delegates to.
  - `snapshot(effects)` → read the current value for each touched key from `state.settings.*` (or the source draw mask for `source` effects) and return a thunk that re-applies them via the same setters as `applyEffect`. Read only the keys the passed effects touch.
  - `requestRender()` → `state.subsystems.scheduler.requestRender()`.
- [ ] **Construct + register.** Build `tour: createTourSubsystem(tourActions)` **eagerly** in the subsystem literal alongside `structureFocus` (~636) — it has no GPU dependency. (The adapter closes over `state`, so construct it where `state` is in scope; if construction order needs the adapter first, mint the adapter just above the literal.)
- [ ] **Teardown.** Add `state.subsystems.tour.destroy();` to the destroy walk near the other eager subsystems (~1214, beside `structureFocus.destroy()`).
- [ ] **Sub-handle.** Add a `tour` sub-handle to the `const handle: EngineHandle` literal (~1293) delegating to the subsystem: `start: (beats) => state.subsystems.tour.start(beats)`, `stop: () => state.subsystems.tour.stop()`, `isActive: () => state.subsystems.tour.isActive()`.
- [ ] **Frame tick (ORDERING IS LOAD-BEARING).** In `runFrame.ts`, call `state.subsystems.tour.advance(nowMs)` **after** the other camera mutators — tweens (`runFrame.ts:138-140`), spaceMouse (`:151-153`), autoRotate (`:167-170`) — and before `deriveFrameContext` (`:179`). While the tour is active its pose write must be the authoritative camera state for the frame. Use the `nowMs` parameter the function already receives (the tour must NOT start a `tweenManager` tween — it owns the camera directly).
- [ ] **Reschedule gate.** Add `|| state.subsystems.tour.isActive()` to the `stillAnimating` predicate (`runFrame.ts:493-501`).
- [ ] `npm run typecheck && npm test` → PASS.
- [ ] Commit.

## Task 4: Beat table + App.tsx wiring (start / cancel / UI-hide)

**Files:**
- Create: `src/data/tourBeats.ts` — `export const TOUR_BEATS: readonly TourBeat[]` per the beat table above.
- Create: `tests/data/tourBeats.test.ts`.
- Modify: `src/components/App/App.tsx`.

- [ ] Author `TOUR_BEATS` from the eleven stages per the beat table + the seed-vs-cinematic notes (collapse stage 03's pass-throughs; use `point` coords for 06/08/09; instant effects only; omit the flow toggle; map milliquas/mcpm only if the source/field ids confirm). Keep `src/data/` pure (no `services/` imports — it's identity data).
- [ ] Test `tests/data/tourBeats.test.ts`:
  - `has 11 beats in stage order` — `TOUR_BEATS.length === 11` and `ids` equal the ordered stage slugs.
  - `ends on milkyWay (home-again)` — the last beat's focus kind is `milkyWay`.
  - `distance ladder spans ~0.05 → 6000 Mpc` — first/min ≈ 0.05, max ≈ 6000; the outbound legs (00→09) are monotonic-non-decreasing in `distanceMpc`.
  - `void is mid-sequence, never last` — the `void-bootes-void` beat is not the final beat.
  - `effects only where stages declare them` — only the beats that declare effects (e.g. stage 03 group toggles, stage 05 filaments) carry a non-empty `effects` array.
- [ ] App.tsx: replace `onTour={splash.dismissTour}` (currently App.tsx ~427; `useSplash.dismissTour` at `src/hooks/useSplash.ts:180-183`) with a `startTour` callback that: calls `splash.dismissTour()`, sets a new `tourActive` state to `true`, calls `handleRef.current?.tour.start(TOUR_BEATS)`, and clears `tourActive` in the promise's `.finally`. Idempotent if `tourActive` already true. (Add a `const [tourActive, setTourActive] = useState(false)` near the other UI state — `uiHidden` is at App.tsx ~150.)
- [ ] Cancel-on-input: a `useEffect` armed only while `tourActive` adds **capture-phase** `pointerdown` / `keydown` / `wheel` / `touchstart` window listeners that call `handleRef.current?.tour.stop()`; cleanup removes them. (`wheel` / `touchstart` registered `passive: true`.) The `start` promise resolves on stop, so the `.finally` clears `tourActive` and restores the UI — no token plumbing needed.
- [ ] Force the HUD hidden while active: add `tourActive` to the `uiStack` hidden condition — currently `(uiHidden || splash.splashVisible) && appStyles.uiStackHidden` at App.tsx ~215 → `(uiHidden || splash.splashVisible || tourActive)`.
- [ ] `npm run typecheck && npm test` → PASS.
- [ ] Commit.

## Task 5: Final smoke + integration check

**Files:** none modified; verification task.

- [ ] `npm run typecheck && npm test && npm run build` → all green.
- [ ] Manual smoke (ask the user) in the live dev server:
  1. Tour button flies the **log-scale ladder** — uniform decades/sec, NOT linear jumps (the local universe doesn't blow past in the first frames of a long leg).
  2. The tour **owns the camera each beat** — the camera moves under tour control, not via a focus-tween snap.
  3. Dwell **holds** at each settled beat (no idle stall — the loop keeps ticking through dwells and goes idle again after the tour ends).
  4. Effects toggle on their beats and **restore** to the pre-tour state on end (toggle filaments on *before* starting to confirm restore-to-on as well as restore-to-off).
  5. Any click / scroll / key during the tour **stops it cleanly** at the current beat, restores the UI chrome, and the camera is left usable.
  6. **Point-focus stages work** — the deep field (08) and the edge (09) frame the origin and pull back to the horizon shell; stage 06 reframes the basin.
  7. Clicking About mid-tour reopens the splash AND stops the tour (the click hits the cancel listener).
- [ ] Confirm the cinematic design is still the additive target: `ls docs/tour/stages/` shows the eleven stage files; this seed's `TOUR_BEATS` reads from their front-matter.

---

## Decisions baked in

- **Per-frame camera ownership, not tweens.** The subsystem writes a `CameraPose` to the camera every frame while active (via `applyCameraPose` → `snapToCameraSnapshot`-style write), and runs *after* the other camera mutators so its pose is authoritative. The tour never starts a `tweenManager` tween. This is the single shape the cinematic extends.
- **Seed = a single linear-in-log segment per beat.** `logDist` lerps linearly between two keyframes (geometric interpolation of distance); the cinematic replaces this with a Catmull-Rom spline through N keyframes with arc-length reparam — additive, same keyframe inputs.
- **The real eleven-stage beat table.** Authored from `docs/tour/stages/00..10`, not a six-beat stub — so the cinematic only enriches each beat (captions, azimuth/elevation, pass-throughs), never re-authors the itinerary.
- **Captions / rampMs / azimuth-elevation / pass-through waypoints / dwell-orbit are OMITTED from the seed** and added additively by the cinematic. None reshape a type the seed ships (`caption?` and `rampMs?` are new optional fields; azimuth/elevation are new optional keyframe fields; pass-throughs are zero-dwell control points the spline reads).
- **`point` focus is exercised by the seed** (stages 06 / 08 / 09) — not reserved for later, so the variant is real and tested from day one.
- **Reserve nothing speculative.** No empty caption/ramp slots, no two-camera-mode switch, no unused fields. Every type the seed ships is fully consumed by the seed; the cinematic adds new fields/subsystems when it needs them.
- **`CameraPose` is its own narrow type** (four orbit fields), distinct from `InitialCam` (which also carries the immutable framing fields the tour must never write).
- **`markFocused` is the un-braided half of the commit helpers** — selection/focus writes only, no camera tween — so emphasis (labels + rings) and camera motion stay separable, the way the cinematic needs them.

## Self-review notes

- **Seed, not stub.** `engine.tour` + `tourSubsystem` + the `Tour*` / `CameraPose` types are the foundation the cinematic tour *extends*, not throws away. The camera evaluator is the cinematic's evaluator running a trivial interpolation; swapping the log-lerp for a spline and adding the omitted optional fields is the whole cinematic camera delta.
- **Plan-style compliance:** type contracts + test names/assertions included; no implementation bodies; integration points cited by `file:line`. Re-verify the cited line numbers against the live tree on pickup — engine.ts and runFrame.ts churn.
- **Convention checks:** one type per `@types` file (seven files in Task 1); `readonly` throughout; `Vec3` aliases not raw tuples; no barrels; tests mirror `src/`.
- **Corrected paths from the prior draft:** `useSplash` lives at `src/hooks/useSplash.ts` (not under `components/Splash/`); the focus-mode subsystem is `structureFocus` (not `clusterFocus`); the frame body is `src/services/engine/frame/runFrame.ts` (`stillAnimating` at ~493-501, camera mutators at ~138-170); the handle literal is at engine.ts ~1293; eager subsystem construction ~636, teardown ~1214.
