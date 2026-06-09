# Pre-Tour Decomplection — Camera Authority + Settings Seam (design)

> **Status:** approved design, awaiting implementation plans.
> **Why this exists:** the guided-tour feature (`docs/tour/`, and the engine-seed
> plan `docs/superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md`) adds a
> subsystem that must own the camera every frame and toggle/restore visual layers.
> An `entanglement-radar` pass (2026-06-08) over the camera path and `engine.ts`
> found two knots the tour would otherwise fight and amplify. We decomplect them
> **first**, so the tour lands as a clean citizen instead of a fourth
> implicit-ordering dependency. Neither knot is in the documented backlog
> (`simplicity.md` "Known entanglements") — both are new findings.

## Scope

Two independent, behaviour-preserving refactors, executed in order:

1. **Camera-driver authority** — a single per-frame authority for who writes
   `state.cam`, replacing implicit call-order + ad-hoc guards.
2. **Settings snapshot/restore seam** — a single geography-aware read of the
   toggleable visual layers, plus a write-path with an `animate` flag.

Then the tour plan is reconciled to build on both.

**Out of scope (deferred hygiene, do not scope-creep):** mask→registry migration
for source visibility; moving `sources.tier` into `settings`; generalising the
camera tween's hardcoded channels (fov/near/far); a subsystem auto-teardown
registry; splitting the focus helpers' selection/move/distance braid (the tour
sidesteps it via its own port and does not need it changed).

---

## 1. Camera-driver authority

### The knot today

`runFrame.ts:138-170` mutates `state.cam` through three drivers in a fixed call
order — `tweens.advance` → `spaceMouse.applyToCamera` → `autoRotate` yaw — with
correctness resting on the **call order itself** plus ad-hoc guards
(`autoRotate` runs only `!tweens.isActive()`; `spaceMouse` cancels the tween then
writes). "Who controls the camera this frame" is implicit. Adding the tour as a
fourth driver by "running it after the others so its write wins" would add a
fourth implicit-ordering dependency — the braid we are removing.

### The un-braided shape

Precedence becomes **data**, and there is **one** camera-write site.

```ts
// src/@types/engine/camera/CameraDriver.d.ts  (one type per file)
import type { OrbitCamera } from '...';
export type CameraDriver = {
  readonly id: string;        // 'input' | 'tour' | 'tween' | 'autoRotate'
  readonly priority: number;  // input 100 > tour 80 > tween 60 > autoRotate 20
  isActive(nowMs: number): boolean;        // wants to write this frame
  apply(cam: OrbitCamera, nowMs: number): void;
};
```

A small registry/resolver (new module under `src/services/engine/camera/`,
e.g. `cameraDrivers.ts`). Once per frame, replacing `runFrame.ts:138-170`:

```ts
const active = drivers.filter(d => d.isActive(nowMs)).sort(byPriorityDesc);
active[0]?.apply(state.cam, nowMs);
```

The existing pieces become thin driver wrappers:

| Driver | Wraps | `isActive` | Notes |
|---|---|---|---|
| `input` (100) | `spaceMouse.applyToCamera` | `spaceMouse.hasAxes()` | |
| `tour` (80) | the tour subsystem's per-frame evaluator | `tour.isActive()` | added by the tour plan |
| `tween` (60) | `tweenManager.advance` | `tweenManager.isActive()` | |
| `autoRotate` (20) | the yaw increment | `settings.camera.autoRotate` | the `!tweens.isActive()` guard **disappears** — it is just lower priority |

### Preserved behaviour (not changed by this refactor)

- **Input interrupts animation.** Input — spaceMouse puck *or* mouse-drag via
  `OrbitControls` — cancels any active `tween` and `tour`, exactly as today's
  `cancelTween` callback does (now also stopping the tour). Precedence only
  resolves the same-frame race; cancellation is the real interrupt mechanism.
  `OrbitControls` stays an event-driven writer between frames, not a registered
  per-frame driver; it cancels active higher drivers on input.
- **Idle is static.** With no driver active and `autoRotate` off, no `apply`
  runs and the camera holds.

### Bonus decomplection — RoD gate

The render-on-demand `stillAnimating` predicate (`runFrame.ts:493-501`) currently
hand-lists camera animation terms (`tweens.isActive()`, `spaceMouse.hasAxes()`,
`autoRotate`). Its camera terms collapse to `drivers.some(d => d.isActive(nowMs))`
— the registry owns "is the camera animating." The non-camera terms
(`texturedDisks.hasInFlightWork()`, `fades.isAnyAnimating()`,
`flowFieldRenderer.isAnimating()`, `structureFocus.isAwake()`) stay as-is.

### Testing

- The resolver is pure: with fake drivers of known priority + `isActive`, it
  selects the single highest-priority active driver and calls its `apply`; with
  none active it writes nothing.
- Each wrapper's `isActive`/`apply` is unit-tested against its underlying piece.
- A regression test pins "tween active + autoRotate on → tween wins, autoRotate
  does not nudge yaw" (the behaviour the old `!tweens.isActive()` guard encoded).

---

## 2. Settings snapshot/restore seam

### The knot today

The toggleable visual layers live in **four** storage shapes:
`settings.filaments.enabled` / `settings.milkyWay.enabled` (booleans),
`sources.drawMask`/`pickMask` (bitmasks), `settings.volumes.{masterEnabled,fields}`,
and `settings.labelCategoryVisibility` / `markerCategoryVisibility` (dicts). A
programmatic caller (the tour's `snapshot`/`restore`/`applyEffect`) must know all
four. Separately, **fade orchestration is welded into the setters**
(`setSourceVisibleImpl` is async and *awaits* fades), so an instant restore via
the public setters becomes a sequential async chain.

### The un-braided shape

```ts
// src/@types/engine/settings/VisibilitySnapshot.d.ts  (plain data, one type/file)
export type VisibilitySnapshot = {
  readonly sourceDrawMask: number;
  readonly filamentsEnabled: boolean;
  readonly milkyWayEnabled: boolean;
  readonly volumesMasterEnabled: boolean;
  readonly volumeFieldEnabled: Readonly<Record<string, boolean>>;
  readonly labelCategoryVisibility: Readonly<Record<string, boolean>>;
  readonly markerCategoryVisibility: Readonly<Record<string, boolean>>;
};
```

- `readVisibility(state): VisibilitySnapshot` — the **single** geography-aware
  reader. Callers stop hand-coding where each toggle lives.
- `applyVisibility(state, patch, { animate }): void` — the **single** write-path.
  The one new capability is the `animate` flag: `animate: true` routes through the
  existing fade orchestration; `animate: false` sets the value instantly. Where
  clean, the existing handle visibility setters route through this same path so we
  do not introduce a second write path; otherwise they remain and we accept narrow
  overlap (noted, not hidden).

### Testing

- `readVisibility` returns the live values from each storage shape.
- `applyVisibility(read → mutate → apply)` round-trips: reading a snapshot,
  changing layers, then applying the snapshot restores every layer.
- `applyVisibility(..., { animate: false })` writes synchronously (no pending
  fades); `{ animate: true }` drives the fade registry.

---

## 3. How the tour plugs into both

Reconciles the rewritten engine-seed plan
(`docs/superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md`, Task 3):

- **Camera:** instead of "tour writes pose *after* the other mutators," the tour
  registers a `tour` `CameraDriver` (priority 80). `TourActions.applyCameraPose`
  becomes that driver's `apply`, writing `state.cam` via `snapToCameraSnapshot`.
  The resolver handles ordering; no after-the-others hack.
- **Effects/restore:** `TourActions.snapshot` = `readVisibility` over the touched
  layers; `restore` = `applyVisibility(snapshot)`; `applyEffect` =
  `applyVisibility(single-layer patch, { animate })` (`animate: false` for the
  instant-toggle seed; `animate: true` is the seam the cinematic ramped effects
  use).

These are edits to the tour plan's Task 1/3, applied when that plan is picked up
after the two refactors land.

---

## 4. Execution order

1. **Camera-driver authority** — new `CameraDriver` type + `cameraDrivers`
   resolver/registry + wrapper drivers; rewrite `runFrame.ts:138-170`; collapse
   the RoD camera terms. Behaviour-preserving; tests first.
2. **Settings seam** — `VisibilitySnapshot` type + `readVisibility` +
   `applyVisibility({ animate })`; route the existing setters through it where
   clean. Behaviour-preserving; tests first.
3. **Tour engine seed** — the existing plan, reconciled per §3.

Each refactor reproduces current behaviour as tests before changing structure, so
"green before and after" is the gate.

## Decisions baked in

- Single-writer arbitration (one driver writes per frame); **no** cooperative
  blending of multiple drivers. Input cancels tour/tween rather than co-animating.
- Precedence is data (`priority`); the registry also answers "is the camera
  animating" for the RoD gate.
- Settings seam is minimal: a geography-aware read + a write-path with an
  `animate` flag. **No** mask→registry migration, **no** `tier`-into-settings.
- One spec, three sequential plans/efforts; each behaviour-preserving and tested.
