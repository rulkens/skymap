# Camera Choreography — the Tour Engine

**Status:** Design spec. Subsumes and resolves [`../../../specs/2026-05-07-tour-animation-design.md`](../../../specs/2026-05-07-tour-animation-design.md) — that document was a stalled brainstorm and should be deleted (or marked superseded) once this lands.
**Required for:** every shell beat in the cosmic-zoom tour.
**Depends on:** [`./00-scale-architecture.md`](./00-scale-architecture.md) (multi-shell coordinates), the `CameraScale` type, and the existing [`../../../../../src/services/camera/cameraTween.ts`](../../../../../src/services/camera/cameraTween.ts).

---

## 1. Goal

Drive the camera through the nine shells of [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) as one continuous, cinematic motion of ~103 seconds. The user clicks "Take the tour" once; from there the camera flies, dwells, transitions, and returns home without any further input — except `space` (pause) and `esc` (exit).

Cinematic in this context means three concrete things:

1. **No hard cuts.** Every camera change is an eased interpolation between waypoints. The viewer's eye is never asked to relocate the subject across an instantaneous jump.
2. **Coupled orientation and motion.** When the camera moves to a new vantage, it also rotates *as it travels*, the way a film camera dollying through a scene smoothly re-frames its subject. This is a slerp, not a snap.
3. **Subject-aware framing within a shell.** Once the camera is "at" a shell, it doesn't sit still — it does a slow orbit, push-pull, or arc to give the user parallax and a sense of three-dimensional structure. The tour's longest shells (Milky Way, Virgo, Laniakea) earn their watch time through this internal motion, not by holding a static frame.

This spec is the design of the **TourEngine**: the subsystem that owns the camera while a tour is running, schedules per-shell beats from a script, manages pause/resume, signals the shell renderer about boundary crossings, and integrates with the existing render-on-demand scheduler.

---

## 2. The `TourScript` data structure

A tour is a static, declarative array of `ShellBeat` records. The script lives in `src/services/engine/tour/script.cosmicZoom.ts` as the canonical default tour. Other tours (preset library, future authoring UI) plug in as additional `TourScript` exports later.

A **`ShellBeat`** describes everything the engine needs to play one shell's worth of the tour: how to enter, how to behave inside, how to exit, and what overlay copy to show.

```ts
type Seconds = number;
type Mpc = number;

/**
 * One shell's slice of the tour. Beats run in array order; the engine
 * advances to beat N+1 the moment beat N's exit waypoint is reached.
 */
export type ShellBeat = {
  /** Stable id; matches the shell id in shellDefinitions.ts. */
  shellId: ShellId;

  /**
   * Camera state at the moment this beat begins. The engine eases from
   * the *previous* beat's exit waypoint to this entry waypoint over
   * `entryDuration` seconds.
   *
   * For the first beat, `entry` is reached by easing from the user's
   * current camera state at tour-start.
   */
  entry: CameraWaypoint;
  entryDuration: Seconds;
  entryEasing?: Easing; // defaults to 'easeInOutCubic'

  /**
   * How the camera moves *within* the shell after the entry leg lands.
   * 'hold' means the camera sits at `entry` until it's time to leave;
   * any other descriptor produces continuous motion through `dwell`.
   */
  dwell: Seconds;
  internalMotion: InternalMotion;

  /**
   * Camera state at the moment this beat ends. The engine eases from
   * the post-dwell camera state to this exit waypoint over
   * `exitDuration` seconds. The next beat's entry takes over from here.
   */
  exit: CameraWaypoint;
  exitDuration: Seconds;
  exitEasing?: Easing; // defaults to 'easeInOutCubic'

  /**
   * Overlay copy and timing. `appearAt` and `disappearAt` are seconds
   * relative to the beat's local t=0 (= start of the entry leg).
   */
  overlay: {
    title: string;
    body: string;
    appearAt: Seconds;
    disappearAt: Seconds;
  };

  /**
   * Optional: visual sub-beats within the shell that the renderer
   * needs to react to (e.g. "X-ray halo fades up at t+2s into Virgo").
   * Engine emits these as events; renderers subscribe.
   */
  subBeats?: ShellSubBeat[];
};

export type TourScript = {
  /** Human id, e.g. 'cosmic-zoom-default'. */
  id: string;
  /** Display name for UI ("The Cosmic Zoom"). */
  name: string;
  /** Total wall-clock duration, derived from beats but cached for UI. */
  totalDuration: Seconds;
  beats: readonly ShellBeat[];
};
```

The default script's beats correspond 1:1 to the table in [`../vision/01-narrative-script.md#total-runtime`](../vision/01-narrative-script.md). Beat 0 is the "open + dolly to Sun" prelude; beats 1-9 are the nine shells; beat 10 is the "return to default view" coda.

The script is a **pure data structure**. It contains no functions, no closures, no references to engine state. This makes it serialisable (future preset library can load it from JSON), trivially testable (snapshot the parsed script, assert on its shape), and authorable by hand.

---

## 3. The `CameraWaypoint` type

A waypoint is a complete camera state expressed in shell-relative coordinates, plus the FoV. It is what the existing `CameraTween` interpolates *between*, generalised across shells.

```ts
import type { CameraScale, ShellId } from './scale/cameraScale';

export type CameraWaypoint = {
  /**
   * Which shell this waypoint lives in. Determines the unit of `position`
   * and `lookAt`, and which projection matrix the engine builds when this
   * waypoint is active.
   */
  shellId: ShellId;

  /**
   * Camera position in this shell's native unit, relative to the shell's
   * origin (Sun for shells 1-3, LG barycentre for 4-5, M87 for 6, etc.).
   * Stored as f64 for precision; narrowed to f32 on the way to the GPU.
   */
  position: [number, number, number];

  /**
   * Point the camera is looking at, same shell-relative frame as `position`.
   * The engine derives yaw/pitch from `lookAt - position` at tween time.
   */
  lookAt: [number, number, number];

  /** Camera FoV (vertical, radians). Defaults to the canvas's current FoV. */
  fovYRad?: number;

  /** Optional: roll about the look-axis. Almost always 0. */
  roll?: number;
};
```

**Why position+lookAt and not yaw+pitch+target?** The existing `OrbitCamera` uses orbit semantics (target + radius + yaw + pitch). That works for user navigation because the user's mental model is "I'm orbiting a thing." But the tour camera flies in straight lines through space, looking at moving subjects — it isn't orbiting anything continuously. Forcing the tour into orbit semantics would make every leg arithmetic ("what target, at what distance, gives me the eye position I want?"), and would pollute the script with derived values.

Position+lookAt is the **cinematographer's** representation. The script author writes "camera at (0, 0, 50) looking at (0, 0, 0)"; the engine handles the rest. At the moment a waypoint becomes the active camera state, the engine *also* updates the `OrbitCamera`'s target/distance/yaw/pitch from `lookAt` and `position - lookAt`, so when the user pauses or exits, the orbit camera is in a sane state for free-fly.

---

## 4. Easing per leg

Every leg (entry, exit) gets an explicit easing curve. The default is **cubic ease-in-out** — the same shape film cameras have used since the 1930s, fastest in the middle, gentlest at the ends. It is the curve the existing `cameraTween` uses (well, *out* cubic; we change to in-out for the tour because tour legs are longer and benefit from a slow start as well as a slow finish).

```ts
export type Easing =
  | 'linear'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInOutQuint'    // sharper plateau in the middle
  | 'easeOutBack';      // slight overshoot — used sparingly, e.g. landing on Sun
```

Per-leg overrides exist for cases the narrative needs. Two examples from the script:

- **Beat 0 (dolly to Sun):** `entryEasing: 'easeInCubic'` — accelerates *into* the Sun, no settle. The Sun reveal lands at peak velocity, which feels right for "we're falling toward the star."
- **Beat 9 → 10 (CMB sphere → return):** `exitEasing: 'easeInOutQuint'` — deliberately slow start, fast middle, slow stop. The CMB shell lingers a beat before the camera "wakes up" and pulls home.

All easing functions live in `src/utils/math/easing.ts`. They are pure, all input is clamped to [0, 1], all output is in [0, 1] (except `easeOutBack`, which slightly overshoots on the high side — the renderer has to tolerate this).

---

## 5. Shell crossfade coupling

The tour engine **owns** the shell-transition signal that the renderer's crossfade logic ([`./00-scale-architecture.md#piece-3---per-shell-render-passes`](./00-scale-architecture.md)) consumes.

Two integration points:

1. The engine continuously updates `CameraScale.shell` based on the camera's distance from the active shell's origin. The crossfade band around each boundary (see [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md)) is what the renderer uses to compute `fadeAlphaAt` per shell.

2. The engine emits a **`ShellTransitionEvent`** when the camera crosses a boundary mid-tour. This is the renderer's hook to spin up the next shell's resources (load planet textures for shell 1, hand the cosmic-flows volume to the GPU for shell 7, etc.) in time for the crossfade.

```ts
export type ShellTransitionEvent = {
  fromShell: ShellId;
  toShell: ShellId;
  /** 0 = just entered the band; 1 = fully crossed. */
  blendProgress: number;
  /** Wall-clock ms when the band was first entered. */
  enteredAtMs: number;
};
```

The tour engine is *not* the only producer of these events — free-fly navigation crosses boundaries too. Both code paths emit the same event shape; the renderer doesn't care which produced it. (This is the [Spec A engine↔renderer boundary](../../../specs/2026-05-07-engine-renderer-boundaries-design.md) at work.)

---

## 6. Internal motion within a shell

After the entry leg lands, the camera doesn't sit still for the dwell duration unless the script explicitly says `'hold'`. The four supported `InternalMotion` descriptors are:

```ts
export type InternalMotion =
  | { kind: 'hold' }
  | { kind: 'orbit'; angularVelocity: number; axis: 'shell-y' | 'shell-z' | [number, number, number] }
  | { kind: 'pushPull'; toDistance: number; durationFraction: number }
  | { kind: 'arc'; viaWaypoint: CameraWaypoint };
```

- **`hold`**: target/distance/yaw/pitch all frozen at the entry waypoint. Used in beat 0 (the Sun reveal — camera just sits there for a moment) and the final return beat.

- **`orbit`**: the camera revolves around its `lookAt` point at a fixed angular velocity (radians per second) about the chosen axis. Used in shells 2 (parallax around the Sun-axis), 4 (parallax between MW and M31), and 5 (slow planar drift over the Local Sheet). Angular velocity is small — typically 0.05–0.15 rad/s, yielding a half-degree to one-degree drift per frame at 60 fps. Anything faster reads as motion-sick.

- **`pushPull`**: the camera dollies along its current look-axis, changing distance from `lookAt` while preserving direction. `durationFraction` says "spend this fraction of `dwell` pushing in/pulling out." Used in shell 6 (push toward Virgo, then pull back) and shell 7 (slight push toward the Great Attractor).

- **`arc`**: the camera follows a quadratic Bezier curve through `viaWaypoint` between the entry and exit waypoints, replacing what would otherwise be a straight-line interpolation. Used in shell 3 — the Milky Way arc-over from edge-on to top-down view is the script's canonical example. The lookAt also interpolates Bezier-style, so the framing rotates with the camera.

A beat may *only* declare one internal motion; combinations (orbit + pushPull) are explicitly out of scope for v1. If the script needs a compound motion, split it into two adjacent beats with the same `shellId`.

---

## 7. The `TourEngine` state machine

```
                 click "Take the tour"
        IDLE ────────────────────────────▶ RUNNING
         ▲                                    │
         │ all beats complete                 │ space
         │ OR user pressed esc                ▼
         │                                  PAUSED
         │ esc OR tour-engine.stop()          │
         │                                    │ space
         │                                    ▼
         └────────────────────────────── RESUMING
                                              │
                                              │ resume tween done
                                              ▼
                                           RUNNING
```

State definitions:

- **IDLE**: no tour active. Camera obeys user input. The default state. The engine's per-frame `tick()` is a no-op in this state (it returns immediately, *before* any cost is incurred).

- **RUNNING**: a tour is active. The engine owns the camera. User input that would otherwise move the camera is intercepted (mouse drag becomes a no-op; scroll-zoom becomes a no-op; SpaceMouse axes are zeroed). Pressing `space` transitions to PAUSED. Pressing `esc` transitions to IDLE.

- **PAUSED**: the camera holds its current position and orientation (whatever it was the moment `space` was pressed — mid-leg, mid-orbit, anywhere). The engine remembers the active beat and the local time within it. Pressing `space` again transitions to RESUMING.

- **RESUMING**: the camera eases from its paused state back to where it would have been at the moment of pause, then the beat's playback resumes. This re-ease takes 400 ms with `easeInOutCubic` — short enough that it doesn't feel like a separate animation, long enough to absorb any micro-drift from the user nudging the canvas during pause.

State is held in a `TourEngineState` object, stored on the engine handle. Every transition is a function that takes the current state and the trigger and returns the new state — pure, testable, no side effects. The side effects (intercepting input, emitting events, updating the camera) happen in the `tick()` function based on the current state.

---

## 8. Pause and resume semantics

Pausing must be **instant**: the moment `space` is pressed, the camera freezes. There is no "decelerate to a stop" — that would feel sloppy and the user almost certainly pressed pause because they want to look at *this exact frame*.

Resume is the inverse but kinder. Because the user may have nudged the mouse or moved the canvas during the pause (mostly we forbid input, but the canvas itself can be resized, the page can scroll, etc.), the camera state at resume is not guaranteed to be byte-identical to the state at pause. We re-ease over 400 ms from the now-current state to the *pause-time* state, then the beat's playback continues from where it was interrupted.

Implementation: pause snapshots `(beatIndex, localTimeMs, cam)` into the state. Resume builds a fresh `CameraTween` from current cam to snapshot cam with `durationMs: 400`, queues it before the beat resumes, and only re-enters RUNNING when that tween completes.

Pause is *not* allowed to be issued during the entry leg of beat 0 (the dolly to the Sun) — the first 8 seconds of the tour is the user's commitment window, and pausing during it makes the UI feel broken. Press `space` during beat 0 → `esc` to bail entirely or wait. This is enforced by `tourEngine.canPause()` returning `false` when `beatIndex === 0 && localTimeMs < entryDuration`.

---

## 9. The `?tour=auto` URL flag

`?tour=auto` is the **kiosk** flag. Skymap shipped to a museum, conference booth, classroom display, or anywhere the page is left running on a screen. Behaviour:

- Tour starts automatically 3 seconds after the page is fully loaded (after `cloudLoader` reports `READY` for shell 8 — we need at least the wide view to have something to show during the prelude).
- When the tour completes, it loops automatically after a 10-second hold on the final "TOUR COMPLETE" overlay.
- Pause/exit work as normal but if the user is idle for 60 seconds in the IDLE state, the tour restarts.
- The "Take the tour" button is hidden (no point — it's already running).
- The UI panel and corner widgets stay hidden the whole time.

The engine reads `URLSearchParams` once on init. Switching modes mid-session is not supported (the user can refresh).

## 10. The `?tour=default` URL flag

`?tour=default` is the **shareable link** flag. Use case: someone tweets "check out the cosmic-zoom tour at https://skymap.rulkens.com/?tour=default". The recipient lands and the tour starts immediately — no extra click required. Behaviour:

- Tour starts 1 second after the page is loaded (slightly faster than auto, because the user came here intentionally).
- Tour does **not** loop. When complete, returns to IDLE; the canvas is fully interactive.
- Pause/exit work normally.
- The UI panel auto-collapses on tour start, restores on tour end.

The two flags differ only in the `loop`, `idleRestart`, and `prelude` parameters. Internally they share the same engine code path:

```ts
type TourMode = 'manual' | 'default' | 'auto';

export type TourEngineConfig = {
  mode: TourMode;
  prelude: Seconds;        // delay before tour starts after page-ready
  loop: boolean;
  idleRestartAfter: Seconds | null;
};

const CONFIGS: Record<TourMode, TourEngineConfig> = {
  manual: { mode: 'manual', prelude: 0, loop: false, idleRestartAfter: null },
  default: { mode: 'default', prelude: 1, loop: false, idleRestartAfter: null },
  auto: { mode: 'auto', prelude: 3, loop: true, idleRestartAfter: 60 },
};
```

---

## 11. Skip-to-shell affordance — NOT in v1

**Recommendation: do not ship.** Reasoning:

- The whole point of the tour is the cinematic continuity — letting the user skip to "shell 7 please" makes it a chapter menu, which is a fundamentally different product. The narrative of "the universe is bigger than you think" only lands if the user *experiences* the scaling, beat by beat.
- Skip-to-shell would also force us to design crossfade-from-anywhere transitions, which is a significant engineering scope expansion (every shell needs a "land here from arbitrary previous state" entry tween).
- If the user wants to look at shell 7 specifically, they can use the existing free-fly navigation (drag, scroll) once the tour ends or after pressing `esc`. The cosmic-flows volume will still be there.

Pause/play and esc-to-exit are the only tour-time controls. The keyboard shortcuts are deliberately minimal: `space`, `esc`. Anything more invites a hotkey help dialog, which kills the "lean back and watch" feel.

If a future plan reverses this, the addition is non-breaking: a `tourEngine.jumpToBeat(index)` API can be added without changing any existing surface, and the script's structure already isolates each beat enough to make this implementable.

---

## 12. Resolution of the tour-animation brainstorm open questions

The brainstorm at [`../../../specs/2026-05-07-tour-animation-design.md`](../../../specs/2026-05-07-tour-animation-design.md) had six unresolved questions. This spec resolves all of them.

### Q1 — Camera rotation during a fly leg

**Resolved: smoothly slerp.** The camera's orientation interpolates from "looking at the previous waypoint's lookAt" to "looking at the next waypoint's lookAt" *during* the same eased fly leg. Implementation: extract a forward-vector from `position - lookAt` at both ends, slerp the unit vectors over the leg's eased `t`, derive yaw/pitch from the result.

This produces the "head-turn while walking" feel the brainstorm flagged. The alternative — snap-rotate then dolly — is jarring on shells where the lookAt point moves significantly between beats (every beat past shell 4, in practice).

The brainstorm flagged a "rotate-on-tour, no-rotate-on-nav" requirement: this is satisfied automatically because the tour engine builds its own tweens from waypoints, while user nav (`#target=`) builds tweens from the existing `cameraTween` API, which only adjusts the orbit target without re-aiming the camera. The two code paths are independent.

### Q2 — "You are here" label in shell 3

**Resolved: hard dependency on MSDF labels landing.** The Milky Way beat's overlay copy includes a Sun marker label in the script. Without the [MSDF labels plan](../../../plans/2026-05-07-msdf-labels.md), the marker won't render, and the beat's narrative ("our Sun is in the Orion Arm, halfway out") loses its anchor.

The tour engine should fail fast if labels aren't available: at tour-start, the engine checks `labelRenderer != null` for any beat that requires labels and refuses to start with a clear console error. The user-facing message is "The tour requires the labels feature, which is not yet enabled in this build."

This is the right trade because skipping a beat silently makes the tour feel broken in a way that's worse than a clean refusal.

### Q3 — Milky Way impostor

**Resolved: hard dependency on the impostor landing for shell 3.** Same shape as Q2. The shell 3 narrative is built around "look at our home galaxy" — falling back to a flat textured disc undermines the central reveal. If the impostor isn't ready, the tour engine refuses to start with a similar clean error.

(The fallback table in [`../shells/00-shell-overview.md#per-shell-fallbacks`](../shells/00-shell-overview.md) says "render a flat textured disc" for shell 3. That fallback is for *free-fly* mode, where the user wandered into shell 3 and we want *some* visual. The tour, by contrast, requires the hero shader because the script was written assuming it.)

### Q4 — Per-leg duration

**Resolved: from the narrative script.** The table in [`../vision/01-narrative-script.md#total-runtime`](../vision/01-narrative-script.md) is canonical. Reproduced here for the tour engine's reference:

| Beat | Shell | Entry (s) | Dwell (s) | Exit (s) | Total (s) |
|------|-------|-----------|-----------|----------|-----------|
| 0 | Prelude / dolly to Sun | 5 | 3 | 0 | 8 |
| 1 | Solar System | 1 | 4 | 1 | 6 |
| 2 | Stellar Neighborhood | 1 | 7 | 1 | 9 |
| 3 | Milky Way | 2 | 8 | 1 | 11 |
| 4 | Local Group | 1 | 7 | 1 | 9 |
| 5 | Local Sheet | 1 | 6 | 1 | 8 |
| 6 | Virgo Supercluster | 1 | 8 | 1 | 10 |
| 7 | Laniakea | 2 | 8 | 1 | 11 |
| 8 | Cosmic Web | 1 | 6 | 1 | 8 |
| 9 | Observable Universe | 1 | 5 | 1 | 7 |
| 10 | Return | 4 | 3 | 0 | 7 |
| | **Total** | | | | **94 s** |

The 9-second discrepancy with the script's "1:43" total is the script's deliberate buffer for crossfade overlap (where one beat's exit and the next beat's entry overlap by ~0.5–1.5 s). The engine implements this overlap by starting beat N+1's entry tween *before* beat N's exit tween fully completes, scheduled by an `overlapMs` field on `ShellBeat` (default 0, set per-beat for the cinematic ones).

### Q5 — TourEngine API shape

**Resolved.** Full API sketch:

```ts
// src/services/engine/tour/tourEngine.ts

import type { CameraScale } from '../scale/cameraScale';
import type { OrbitCamera } from '../../@types';
import type { CameraTween } from '../../camera/cameraTween';

export type TourEngineState =
  | { phase: 'IDLE' }
  | { phase: 'RUNNING'; beatIndex: number; localTimeMs: number; activeTween: CameraTween | null }
  | { phase: 'PAUSED'; beatIndex: number; localTimeMs: number; snapshotCam: OrbitCamera }
  | { phase: 'RESUMING'; beatIndex: number; localTimeMs: number; resumeTween: CameraTween };

export type TourEngineEvents = {
  onBeatStart: (beatIndex: number, beat: ShellBeat) => void;
  onBeatEnd: (beatIndex: number, beat: ShellBeat) => void;
  onShellTransition: (event: ShellTransitionEvent) => void;
  onSubBeat: (beatIndex: number, subBeat: ShellSubBeat) => void;
  onTourComplete: () => void;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
};

export type TourEngine = {
  /** Begin a new tour. Throws if state is not IDLE or if dependencies missing. */
  start(script: TourScript): void;

  /** Pause an active tour. No-op if not RUNNING or if currently in beat 0's entry. */
  pause(): void;

  /** Resume a paused tour. No-op if not PAUSED. */
  resume(): void;

  /** Exit any active/paused tour, returning to IDLE and full user control. */
  stop(): void;

  /**
   * Per-frame tick. Engine.runFrame() calls this once per frame, BEFORE
   * advancing free-fly state. The tick mutates `cam` and `scale` in-place
   * if the tour is active, and returns whether the engine should re-schedule
   * a frame (true while RUNNING, RESUMING, or pre-pause-snapshot).
   */
  tick(cam: OrbitCamera, scale: CameraScale, nowMs: number): boolean;

  /** Current state (read-only). */
  getState(): Readonly<TourEngineState>;

  /** Subscribe to events. Returns an unsubscribe function. */
  on<K extends keyof TourEngineEvents>(event: K, handler: TourEngineEvents[K]): () => void;
};

export function createTourEngine(config: TourEngineConfig): TourEngine;
```

The engine is a **factory + closure**, not a class. (Consistent with the rest of the codebase's `createX(): X` pattern.) State is held in a closed-over object; events are a tiny pub/sub. No singleton — the engine is created once during bootstrap and stored on the engine handle.

### Q6 — Tab-hidden UI

**Resolved: auto-collapse on tour start, restore on tour end.** When `tourEngine.start()` is called, it emits `onPause`-equivalent for the UI: the React shell subscribes to the tour engine and collapses the side panel + dims the corner widgets. When the tour completes (or is exited), the inverse happens.

This couples UI and tour, but the alternative — making the user press Tab manually — adds friction in exactly the moment the tour is supposed to feel effortless. The coupling is one-way (UI subscribes to engine; engine doesn't know about UI), which keeps the dependency direction sane.

For `?tour=auto` mode, the panel never shows during the IDLE-between-loops state either; that's a small additional UI state ("kiosk mode") rather than a separate tour-engine concern.

---

## 13. Render-on-demand integration

The existing render-on-demand scheduler ([`engine.ts` frame tail](../../../../../src/services/engine/engine.ts)) re-schedules a frame while any of `autoRotate`, `currentTween`, `hasAnyAxis`, `queue.inFlightCount > 0`, or recent-fade is true. The tour adds one more truthy condition: **`tourEngine.tick()` returns `true`**.

Concretely, the runFrame tail becomes:

```ts
const needsAnotherFrame =
  autoRotate ||
  currentTween != null ||
  hasAnyAxis ||
  queue.inFlightCount > 0 ||
  fadeStillActive ||
  tourEngine.tick(cam, scale, nowMs);  // ← new
```

(The order matters slightly: `tourEngine.tick()` has a side effect of mutating `cam`. It must run *before* the frame is rendered. The boolean it returns is "schedule another frame after this one." The single-call shape — mutate + return — keeps the call site clean.)

While the tour is RUNNING or RESUMING, `tick()` returns `true` every frame. While PAUSED, it returns `false` — the camera isn't moving, so render-on-demand correctly idles. While IDLE, it returns `false` immediately.

This is identical in shape to how `currentTween` is plumbed today. The tour doesn't introduce a new architectural concept; it slots into the existing one.

---

## 14. Integration with the `#target=` deep-link flow

The `#target=` URL fragment ([famous-galaxy palette flow](../../../../../src/services/engine/engine.ts)) is an **independent entry point** that drives the orbit camera via `cameraTween` to a named target. It does not interact with the tour engine.

Specifically:

- If a user lands at `?tour=default#target=M31`, the tour engine wins. The `#target=` is ignored (with a console info message). Tour mode is the explicit user intent; trying to honour both would mean cutting from the tour camera to the M31 target mid-flight, which makes no sense.
- If a user lands at `#target=M31` (no `?tour=`), the existing flow runs as today. Tour engine stays IDLE.
- If a user clicks "Take the tour" while a `#target=` tween is in flight, the tween is cancelled (snapshotted state goes back into the camera) and the tour begins from there.

In all cases, the *one* code path mutating the camera at any given moment is well-defined. There is never a frame where both the tour engine and a non-tour tween are writing to the camera.

---

## 15. Integration with the existing `cameraTween`

The tour engine **uses `cameraTween` as its leg primitive.** Each entry leg, exit leg, and resume re-ease is a `CameraTween`. The tour engine maintains a queue (typically depth 1, depth 2 during overlap windows) of these tweens.

Why reuse rather than reinvent? Three reasons:

1. **The math is already tested.** `cameraTween.test.ts` covers easing, shortest-arc yaw, deadline saturation, target lerp, and pitch clamp behaviour. Reimplementing those in a parallel "tour-tween" loses the test coverage.

2. **The orbit-camera contract is already defined.** `advanceCameraTween` mutates an `OrbitCamera` correctly, calls `updatePosition`, and returns a clean done/not-done boolean. The engine doesn't need to know how orbit cameras work; that's `cameraTween`'s job.

3. **Pause/resume re-ease needs the same primitive.** The 400 ms re-ease is itself a `CameraTween`. If the tour engine had its own tween system, we'd have to translate state between the two for the resume path.

The tour engine builds tweens by deriving orbit-camera channels from the position+lookAt waypoints:

```ts
function tweenFromWaypoint(
  fromCam: OrbitCamera,
  toWaypoint: CameraWaypoint,
  scale: CameraScale,
  durationMs: number,
  nowMs: number,
): CameraTween {
  // Convert waypoint position+lookAt to orbit-camera channels.
  const toTarget = toWaypoint.lookAt;
  const eyeOffset = subtract(toWaypoint.position, toWaypoint.lookAt);
  const toDistance = length(eyeOffset);
  const { yaw: toYaw, pitch: toPitch } = yawPitchFromDirection(eyeOffset);

  return {
    startMs: nowMs,
    durationMs,
    fromTarget: cloneVec3(fromCam.target),
    toTarget,
    fromDistance: fromCam.distance,
    toDistance,
    fromYaw: fromCam.yaw,
    toYaw,
    fromPitch: fromCam.pitch,
    toPitch,
  };
}
```

The slerp-of-orientation behaviour from §12-Q1 is implicit here: yaw and pitch interpolate over the eased `t`, producing exactly the slerp behaviour we want without an explicit quaternion. (The `lerpAngleShortest` for yaw + scalar lerp for pitch is mathematically equivalent to a constrained slerp on the unit sphere as long as the camera doesn't roll, which it doesn't.)

The internal-motion descriptors (orbit / pushPull / arc) are *not* `CameraTween`s — they're parametric paths the tour engine evaluates directly per frame, mutating the orbit camera the same way `advanceCameraTween` does. Hold mode is a no-op tick.

---

## 16. Test criteria

The tour engine has three layers of testing.

**Pure state-machine tests** (`tests/services/engine/tour/tourEngine.state.test.ts`):
- IDLE → RUNNING on `start()`.
- RUNNING → PAUSED on `pause()` after entry-leg of beat 0 finishes.
- `pause()` is a no-op during beat 0 entry.
- PAUSED → RESUMING on `resume()`; RESUMING → RUNNING when re-ease completes.
- Any state → IDLE on `stop()`.
- Beat advancement: a beat ends when its (entry + dwell + exit) duration elapses.
- Final beat triggers `onTourComplete` and transitions to IDLE.

**Camera-mutation tests** (`tests/services/engine/tour/tourEngine.camera.test.ts`):
- After `tick()` advances through beat N's entry leg, `cam.target ≈ beats[N].entry.lookAt` and `cam.distance ≈ |entry.position − entry.lookAt|`.
- During internal-motion `orbit`, the camera's yaw advances by ~`angularVelocity * dt` per tick.
- The slerp behaviour: at `t=0.5`, the camera is exactly halfway between the previous and current waypoints' yaws (modulo shortest-arc).

**Integration tests** (`tests/services/engine/tour/tourEngine.integration.test.ts`):
- Mock `OrbitCamera` + mock `CameraScale`. Run the full default script with a fast-forward clock. Assert that every beat's `onBeatStart` and `onBeatEnd` fires in order.
- Assert that `ShellTransitionEvent` fires N times for N inter-shell transitions.
- Assert that `?tour=auto` config triggers `start()` after `prelude` ms, and re-`start()` after `idleRestartAfter` of IDLE post-completion.

The engine itself is testable without WebGPU because it doesn't touch the GPU. The `tick()` function takes mutable inputs and returns a boolean — pure transformation of state. This is the same testing philosophy as `cameraTween`.

---

## 17. Files this touches

**New:**

```
src/services/engine/tour/
  tourEngine.ts                — factory, state machine, tick(), event bus
  tourEngineState.ts           — pure state-transition helpers
  tweenFromWaypoint.ts         — waypoint → CameraTween conversion
  internalMotion.ts            — orbit / pushPull / arc evaluators
  script.cosmicZoom.ts         — the canonical default tour script
  shellTransitionEvent.ts      — event type + emitter

src/@types/
  tour.ts                       — TourScript, ShellBeat, CameraWaypoint, etc.

src/utils/math/
  easing.ts                     — easeInCubic, easeInOutCubic, easeInOutQuint, easeOutBack
                                  (the existing easeOutCubic moves here too)
  yawPitchFromDirection.ts      — derive yaw/pitch from a direction vector
  slerpOrientation.ts           — slerp helper for the leg orientation interpolation
```

**Modified:**

```
src/services/engine/runFrame.ts     — call tourEngine.tick() before render
src/services/engine/bootstrap.ts    — instantiate tourEngine, wire URL flags
src/services/input/inputBindings.ts — intercept space/esc when tour is active;
                                       gate camera input on tourEngine.getState().phase
src/components/SettingsPanel.tsx     — subscribe to tourEngine; auto-collapse
src/components/TourButton.tsx        — new "Take the tour" / "Replay tour" UI
```

**Superseded:**

```
docs/superpowers/specs/2026-05-07-tour-animation-design.md
                                   — delete or rename to *-superseded.md
                                     (this spec replaces it entirely)
```

---

## What this enables

With the tour engine in place, the rest of the cosmic-zoom plan becomes "fill in the shells." Each shell-spec author writes their `ShellBeat` entry in the script alongside their renderer; the engine plays it back without further coordination. Future tours (a Local Group focus, a Solar System focus, a "history of cosmology" tour) are pure-data additions — write a new `TourScript`, register it, done. The tour engine is built once and lasts.
