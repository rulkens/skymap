# Animation system — clips (data) + saga orchestration

**Status:** design, awaiting plan. Foundation for the parked guided tour
([`2026-05-07-tour-animation-design.md`](2026-05-07-tour-animation-design.md)).
Ships to main; the throwaway recording spikes
(`worktree-fly-to-edge-spike`, see
[`docs/research/2026-06-19-camera-animation-spike-findings.md`](../../research/2026-06-19-camera-animation-spike-findings.md))
are its first consumers.

## Why this exists

Three throwaway camera spikes — a log-dolly fly-to-the-edge, a seamless
flow-field orbit, and a multi-beat "cosmic flows" showcase — independently
re-derived the same animation primitives: log-space distance interpolation,
eased ramps, constant-rate integration, sine bobbles, parallel tracks,
one-shot cues, cross-fades. Each spike hand-rolled its own `keydown`-armed
state machine writing `state.cam` per frame.

We want to stop hand-rolling. The goal is to **describe an animation in a
simple, readable way**, reuse it across the spikes and the real tour, and do
so on a foundation that survives to production. Two things make now the right
moment:

1. The spikes proved out the vocabulary (what channels, what generators, what
   easings) against real footage.
2. The settings store migrated to Redux Toolkit with a wired (but empty)
   `redux-saga` runtime (PR #345). The "generator that yields effects, pumped
   from outside" shape we'd want for reactive choreography is now a
   first-class part of the codebase — so the reactive layer can ride it
   instead of duplicating it.

## The core decision: two layers, one boundary rule

An animation is split into two layers that meet at a single seam:

- **Layer 1 — Clips: data, played by a small frame-clocked runner.** A clip is
  a serializable tree of effects. A tiny engine-side runner (a `CameraDriver`)
  plays it against the render clock, returns a `Promise` when it finishes.
- **Layer 2 — Orchestration: sagas, for reactivity only.** A saga sequences
  clips and adds the things a clip can't know in advance: load-waits,
  click-to-advance, branching, settings snapshot/restore, intent dispatch.

The seam between them:

```ts
function playClip(clip: ClipData): Promise<void>;
```

A saga plays a data clip with `yield* call(playClip, clip)` and suspends until
it completes. A non-reactive consumer (every recording spike) calls `playClip`
directly, with no saga at all.

### The boundary rule

> **A clip is always non-reactive data. The moment an animation needs a
> runtime decision, it is not a clip — it is a saga that composes clips.**

This is the load-bearing invariant. It keeps clips inspectable, scrubbable,
preview-tool-able, and trivially authored as data; and it quarantines
reactivity (and its opacity) to the orchestration layer, where inspectability
isn't useful anyway (you never scrub a *live* tour).

### Why clips are data, not sagas

A clip gains nothing from being a saga and loses everything that made it data.
And — counter-intuitively — a clip's runner is *simpler* than a saga
scheduler, not harder:

- A saga (or a general coroutine) needs generator-pumping because it produces
  effects **lazily** — step N+1 is unknown until step N resolves. That
  laziness is exactly what reactivity requires.
- A non-reactive clip is a **fully-known static tree**. The runner just walks
  it against the render clock — no `gen.next()`, no `take`, no `select`, no
  branching. Remove reactivity and the generator machinery collapses to a
  recursive tree-stepper.

So splitting the layers does not cost a second runtime. It makes the clip
runtime *smaller*, and lets the reactive layer reuse the saga runtime that
already exists.

## Layer 1 — the clip data model

### The shape

```ts
type ClipData = {
  start?: Pose | 'live';   // snap to a fixed pose, or capture the live camera (default 'live')
  preroll?: number;        // seconds of static hold before the timeline clock starts
  timeline: Effect[];      // played in order; an entry may itself be concurrent (all/fork)
};
```

### The effect vocabulary

Every effect is a plain, serializable object. Authoring helpers are one-line
constructors that build them (so a human writes `dollyTo(300, 4)`, not the
raw literal).

**Channels and value spaces.** Each camera channel carries a default
interpolation space so the author never writes `exp(lerp(ln…))` by hand:

| Channel | Space | Notes |
| --- | --- | --- |
| `distance` | `log` | uniform decades/sec (Eames "Powers of Ten") |
| `yaw`, `pitch`, `roll` | `add` (angular) | driven by `tween`/`spin` (position) **or** `rate` (velocity), never both |
| `target` | `lin` (vec3) | component-wise lerp |
| `fov` | `lin` | |

**Value-over-time generators** (the leaves):

- `hold(sec)` — keep the current value.
- `tween(ch, { to, over, ease, space? })` — ramp to an absolute value.
  Helpers: `dollyTo(mpc, over, ease?)`, `moveTarget(vec3, over, ease?)`,
  `aimAt(bearing, over, ease?)`.
- `spin(ch, { by, over, ease, loop? })` — relative ramp (e.g. a yaw drift);
  `loop` repeats it seamlessly (constant rate).
- `rate(ch, { to, over, ease })` — ramp a **persistent velocity** that the
  runner integrates each frame; it keeps applying after the ramp ends (this is
  how rotation decelerates to a residual drift).
- `oscillate(ch, { amp, period })` — an additive sine on top of the base;
  runs until cancelled (use inside `fork`).
- `wait(sec)` — advance the clock with no write (a gap in the timeline).

**Scene effects** (timed intent emission — still data):

- `dispatch(action)` — emit a store action at this point in the timeline
  (e.g. `dispatch(setFlow({ enabled: true }))`). Serializable; the runner
  performs `store.dispatch` when the timeline reaches it.
- `fade(ids, to, over)` — drive the `FadeRegistry` for one or more layers
  (`flow`, `galaxies`, `milkyWay`, `structures`, `labels`, …).

**Combinators** (structure):

- `seq([…])` — children in order (the same as successive timeline entries;
  exists so a sequence can be nested *inside* a concurrent block).
- `all([…])` — children concurrently; done when **all** finish.
- `fork(effect)` — detach a child to run alongside; auto-cancelled when the
  clip returns.

### Authoring surface

The primary authoring format is a **typed TypeScript object literal** (the
effect tree). It *is* the data, and it gives type-checking (a bad channel or
easing is a compile error), comments (load-bearing for didactic tuning of
hand-picked constants), computed constants, IDE autocomplete, and **zero new
toolchain**. It serializes to JSON for free if an external tool ever needs it.

JSON is rejected as an *authoring* surface (no comments, verbose, ugly nesting)
— fine only as a wire/export format. YAML and a bespoke text DSL are rejected
unless clips must be authored *outside* the codebase by non-developers, which
is not a current requirement. (See "Open decisions" for the preview-tool path,
which is the one thing that would harden these choices.)

### Worked example — the cosmic-flows showcase as data

```ts
const cosmicFlows: ClipData = {
  start: OPENING_POSE,
  preroll: 2,                                          // static hold — time to hit record
  timeline: [
    dispatch(setVolumesEnabled(false)),               // cosmic web off
    dispatch(setFilamentsEnabled(false)),
    dispatch(setGalaxyCatalogLabelEnabled('famousGalaxy', false)),
    dispatch(setFlow({ enabled: true })),             // enable; held hidden next line
    fade('flow', 0, 0),

    fork(oscillate('pitch', { amp: 0.09, period: 16 })),     // gentle bob, runs throughout
    fork(rate('yaw', { to: 0.18, over: 1.5, ease: 'in' })),  // ease in; velocity persists
    wait(2),                                                  // I — establish on the MW

    all([ fade('flow', 1, 3), fade('galaxies', 0, 3) ]),     // A — crossfade

    all([                                                    // B — both branches are 11s
      seq([ dollyTo(300, 4), wait(3), dollyTo(950, 4) ]),    //   distance: 4 + 3 + 4
      rate('yaw', { to: 0.025, over: 11, ease: 'inOut' }),   //   yaw decel across all of it
    ]),

    wait(5),                                                 // C — hold (drift + bob keep it alive)
    fade(['flow', 'milkyWay', 'structures', 'labels'], 0, 3),// D — to black
  ],
};
```

The structural payoff: the rotation decel that spans three "beats" is a single
`rate` sibling in the `all` block — concurrency stated locally, not computed as
absolute timestamps. The flyout and flow-orbit spikes collapse to a handful of
lines each in the same model.

## Layer 1 — the runner

`playClip` is implemented by a `CameraDriver` (the existing priority-80 seam,
`src/@types/engine/camera/CameraDriver.d.ts`). It owns no reactivity:

- **Walks the static effect tree each frame** against `nowMs`, writing the
  camera. Channel state is split so concurrent tracks on different channels
  never collide: `base` (authored value, written by `tween`/`spin`/`set`),
  `vel` (persistent velocity, integrated each frame by `rate`), `osc`
  (this-frame additive offset from `oscillate`). The composed camera is
  `base + osc` per channel, with `vel` integrated into `base`.
- **Drives fades** via the `FadeRegistry` and **dispatches** timeline intents
  through the injected store when the clock reaches them.
- **Keeps render-on-demand awake** while a clip plays (`isActive()` true), and
  **resolves the `Promise`** when the tree completes.

Because the tree is static, the runner needs no generator pumping — it is a
recursive stepper over `seq`/`all`/`fork`/leaf nodes. `fork`ed children run on
a small child list and are cancelled when the root completes.

This runner **subsumes the existing `tweenManager`**: a focus-on-click move is
`playClip(focusClip(target))` — a one-tween data clip. There is then exactly
one camera-execution path for every move; `tweenManager` retires.

## Layer 2 — saga orchestration

Reactivity lives only here. The tour is a saga that plays data clips and adds
the glue a clip cannot predetermine. Every reactive need maps to a stock
`typed-redux-saga` effect:

```ts
function* visitBeat(beat: BeatData) {
  yield* call(waitUntil, () => focusReady(beat.focus));          // reactive load-wait
  yield* call(playClip, flyToClip(beat));                        // play a DATA clip, await it
  for (const e of beat.effects ?? []) yield* put(applyIntent(e));// scene = dispatch intents
  yield* put(showCaption(beat.caption));
  yield* race({ dwell: delay(beat.dwellSec * 1000), next: take(TOUR_ADVANCE) }); // auto / click
  yield* put(showCaption(null));
}

function* guidedTour(beats: BeatData[]) {
  const snapshot = yield* select((s) => s.settings);             // capture = a selector
  yield* put(setUiHidden(true));
  try {
    for (const beat of beats) yield* visitBeat(beat);
  } finally {
    yield* put(restoreSettings(snapshot));                       // restore even on cancel
    yield* put(setUiHidden(false));
  }
}
```

| Tour need | Mechanism |
| --- | --- |
| Don't start a beat before its data loads | `call(waitUntil, () => focusReady(...))` |
| Auto-advance, but let the viewer click "next" | `race({ dwell: delay(...), next: take(TOUR_ADVANCE) })` |
| Cancel the whole tour on stray input | runner cancellation → the `finally` runs |
| Restore settings even on mid-beat cancel | `try { … } finally { put(restoreSettings(…)) }` |
| Per-beat scene changes, captions | `put(intent)` — same flow as the UI |
| The cinematic move itself | `call(playClip, clip)` — Layer 1 |

The `try/finally` row is why the spine is a saga rather than data: guaranteed
settings-restore on abort is *free* structured control flow, where a pure-data
sequencer needed a bespoke snapshot/restore dance.

### Frame-clock vs. action-clock

`redux-saga` is timer/action-clocked; it can orchestrate but cannot do the
per-frame `cam.distance = interp(dt)` write. That write must happen in the
render loop. The seam resolves this: `call(playClip, clip)` registers the clip
with the frame-clocked runner and returns a `Promise` the saga awaits;
`race([call(playClip, …), take(ADVANCE)])` composes "play this move, or skip on
click" for free. The orchestration is action-clocked; the interpolation is
frame-clocked; the `Promise` is the bridge.

### Relationship to the empty `rootSaga` and ADR 0007

`src/store/rootSaga.ts` is wired but empty by design (its phase-2 home is
"render-wake, fade-triggering, demand re-evaluation"). Today the handle setters
(`setFlow`, …) still carry those side-effects imperatively, so a clip's
`dispatch(setFlow(…))` must go through the runner-side equivalent (dispatch +
render wake + fade bridge) until those consequences move into sagas. Once they
do (ADR 0007's single-write-path), `dispatch(intent)` alone suffices and the
runner's scene effect is a bare `store.dispatch`. The animation system is built
to ride that transition, not to block on it.

## Reactive vs. non-reactive — the precise definition

- **Non-reactive:** the entire effect stream is knowable from the clock alone.
  Fixed total duration; scrubbable; expressible as a static data tree. All
  three spikes are non-reactive (they are recordings).
- **Reactive:** the stream depends on something not known in advance — world
  state, user input, or a computed branch. No fixed duration; not blindly
  scrubbable; needs code (a saga) to decide the next step.

Reactivity further splits: **event-reactive** (`take('advance')`, a named
string trigger — still expressible as data) and **state/branch-reactive**
(`until(predicate)`, `if (…)` — genuine code). The boundary rule routes all of
it to Layer 2 regardless, keeping Layer 1 purely non-reactive.

## Migration and integration notes

- **`tweenManager` retires** into the clip runner (focus = a one-tween clip).
  One execution path for all camera moves.
- **The parked `TourBeat[]` survives as data.** `BeatData[]` is fed to the tour
  saga; what changes is that the hand-rolled `tourSubsystem.advance(nowMs)`
  sequencer is replaced by `for (const beat of beats) yield* visitBeat(beat)`.
  Captions become inline `put(showCaption(...))` intents rather than a producer
  reading `currentBeat()` — which removes the `currentBeat()` getter the tour
  seed had to add.
- **The `engine.tour.start(beats): Promise<void>` API survives** — the saga's
  run resolves the promise.
- **The existing `CameraDriver` priority-80 seam is reused** verbatim; the clip
  runner is the driver that fills it.

## What we are deliberately not building (YAGNI)

- JSON/YAML/bespoke-DSL authoring — the typed TS effect tree is the surface.
- A scrub/preview/timeline tool — the design *keeps the door open* (clips are
  data, hence previewable) but does not build it now.
- Inter-fiber saga channels — branching via ordinary `yield*` delegation
  covers the tour; message-passing between coroutines is unneeded.
- Saga-based clips — clips stay data; sagas only orchestrate.

## Open decisions (resolve at planning)

1. **Channel/value-space table** — pin the exact channel set and per-channel
   default spaces (the table above is the candidate).
2. **Scene effects in clips vs. hoisted to sagas** — a clip *may* carry
   `dispatch`/`fade` timeline events (good for self-contained recordings); the
   tour saga owns `capture`/`restore` *around* the clips it plays. Confirm this
   division and whether any scene change must be saga-only.
3. **`aimAt` / rotation-toward-target** — the parked tour's open decision #1
   (slerp yaw+pitch toward a target bearing) becomes an `aimAt` tween; settle
   its interpolation (shortest-arc angular lerp vs. quaternion slerp).
4. **Preview tool** — defer, but record the intended shape (a player that reads
   `ClipData` and a scrubber over a flattened timeline) so Layer 1's data
   purity is not casually broken later.
5. **Decomposition** — likely three plans: (A) the clip data model + runner +
   re-express one spike; (B) `playClip` seam + retire `tweenManager`; (C) the
   tour saga + `BeatData` + reactive effects, landing on the parked tour spec.

## First implementation slice (suggested)

Build Layer 1 end-to-end on the smallest surface: the `Effect`/`ClipData`
types, the runner as a `CameraDriver`, a handful of primitives (`tween`/`rate`/
`oscillate`/`wait`/`all`/`seq`/`fork`/`fade`), and re-express **one** spike
(the flyout) as a clip to validate the model against known-good footage. Sagas
and the tour come after the data layer is proven.
