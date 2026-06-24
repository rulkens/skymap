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

**Channels and value spaces.** The animatable channel set is **exactly the
fields of `CameraPose`** (`{ target, yaw, pitch, distance }`) — the clip can move
precisely what the driver table arbitrates and `commitCameraPose` bakes, nothing
more. Each channel carries a default interpolation space so the author never
writes `exp(lerp(ln…))` by hand. Every channel sums all three composition layers
(`base + ∫vel + osc`); the single-writer rule applies to the **`base` layer
only** (see "Composition" below):

| Channel | Space | Notes |
| --- | --- | --- |
| `distance` | `log` | uniform decades/sec (Eames "Powers of Ten") |
| `yaw`, `pitch` | `add` (angular) | base (`aimAt`/`spin`) + vel (`rate`) + osc all sum |
| `target` | `lin` (vec3) | one vec3 channel, component-wise lerp (`moveTarget`) |

This table is **one canonical record**, not three copies — a single
`CHANNEL_SPACE: Record<Channel, Space>` read by *both* the authoring helpers (so
`dollyTo` fills `space: 'log'` from it, never hardcoded) *and* the
registration-time validator. The `space` field on a `CameraAction` is an optional
**override** that defaults from `CHANNEL_SPACE`; a helper never restates the
mapping. (Keeping the channel→space fact in one home avoids the drift where a doc
table, a helper, and a validator each carry their own copy.)

**Why these four, and not `roll`/`fov`.** `roll` and `fovYRad` are real
`OrbitCamera` params (the renderer reads `cam.roll`, `cam.fovYRad`) but are **not
in `CameraPose`** — no driver produces them, no arbitration carries them. Making
them animatable would mean either widening `CameraPose` across every driver, or a
second camera write path beside the table (the braid the runner placement
explicitly killed). No spike footage moves either, so they stay non-animatable
for now. The channel set is coupled to the camera *parameterization*, not to the
*generator* — which is why the two anticipated extensions leave it intact:

- **`roll` + `fov`** (Dutch-angle, dolly-zoom) — a genuine channel-set extension:
  add the two fields to `CameraPose` uniformly across all drivers when a clip
  first needs them. Pure addition; recorded as a YAGNI deferral, not built now.
- **Spline / free-flight camera** ([`docs/tour/cinematography.md`](../../tour/cinematography.md))
  — **not** a channel change. It maps onto these same four channels
  (`target=focus`, `distance=exp(logDist)`, `yaw/pitch=angle`); "free-flowing" is
  a higher-level *generator* (waypoints → Catmull-Rom → arc-length reparam in log
  space), i.e. a single **base-layer writer that claims all four base channels
  jointly** and evaluates a coupled path instead of four independent ramps. It
  composes under the existing single-writer rule (one base-writer owning the four
  channels for its window; `vel`/`osc` still layer), so it does not disturb this
  table.

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

**Scene effects** (timed, still data — see "Scene effects: visibility verbs and
the opacity single-writer" below for the full rule):

- `show([layers], over?)` / `hide([layers], over?)` — visibility: set the layers'
  visibility intent **and** fade opacity to 1 / 0. `over` is the fade time in
  seconds: omit → default, `0` → instant snap, `N` → custom. The convenient
  common case (and the scene-setup beat).
- `fade([layers], to, over)` — a *transient* opacity move to an arbitrary value,
  **no** intent change (partial dims, the fade-to-black end card, layers with no
  settings toggle).
- `scene(action)` — a non-visibility settings change, typed to a `SettingsAction`
  union (never `AnyAction` — no arbitrary-Redux escape hatch).
- `focus(ref)` — set selection focus to a `SelectionRef` (or `null` to clear). A
  selection-Intent change — drives the member-isolation dim. The camera tween it
  would normally kick (`watchFocusTween`) is **suspended** while a clip plays — not
  merely outranked — by the same saga-suspension policy as the fade bridge (see
  "The reactive bridges are suspended" below). Distinct from `scene` because focus
  is selection, not settings.

**Combinators** (structure):

- `seq([…])` — children in order (the same as successive timeline entries;
  exists so a sequence can be nested *inside* a concurrent block).
- `all([…])` — children concurrently; the block completes when its **awaited**
  (non-`fork`) children all finish.
- `fork(effect)` — detach a *background* child to run alongside; **cancelled when
  its enclosing scope completes** (the clip root, or the `all`/`seq` block it sits
  in). A `fork` never keeps a scope alive. Lifetime is lexical — to stop a fork
  earlier, nest it in the block whose duration you want; there is no handle /
  `stop` primitive (a labelled stop is a deferred YAGNI escape).

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

### Worked examples — the spikes as clips

The four throwaway recording drivers, re-expressed in the vocabulary above. Each
collapses an entire `keydown`-armed, self-clocked `CameraDriver` (115–382 lines)
to a handful of declarative lines; the `phase` machine, `performance.now()` clock,
per-frame `requestRender`, fired-flag one-shots, and per-frame pose re-seeding all
disappear.

**`flyout` — the log-dolly pull-back to the horizon shell (145 → 6):**

```ts
const flyout: ClipData = {
  start: 'live',                                         // dolly out from wherever the user is framed
  timeline: [
    all([
      dollyTo(29_500, 22, 'inOut'),                      // log-dolly to the horizon shell — the whole point
      spin('yaw', { by: 1.1, over: 22, ease: 'inOut' }), // gentle quarter-turn so the wide end isn't dead-still
    ]),
  ],
};
```

**`flowOrbit` — the seamless loop orbit (115 → 5):**

```ts
const flowOrbit: ClipData = {
  start: 'live',                                          // orbit whatever framing the user dialed in
  timeline: [
    fork(oscillate('pitch', { amp: 0.12, period: 30 })), // rise/dip, returns to start each loop
    spin('yaw', { by: TWO_PI, over: 30, loop: true }),   // constant rate → seamless loop, runs until cancelled
  ],
};
```

**`flowShowcase` / cosmic flows — the multi-beat hero clip (365 → 16):**

```ts
const cosmicFlows: ClipData = {
  start: { target: [0, -0.01, 0], yaw: 4.44, pitch: 0.2932, distance: 0.14 },
  preroll: 2,                                                  // static hold — time to hit record
  timeline: [
    hide(['volumes', 'filaments', 'famousGalaxyLabels'], 0),  // cosmic web off — instant intent (3 dispatches → 1)
    scene(setFlow({ enabled: true })),                        // load the cube + keep resident — NO visual yet

    fork(oscillate('pitch', { amp: 0.09, period: 16 })),      // gentle bob throughout
    fork(rate('yaw', { to: 0.18, over: 1.5, ease: 'in' })),   // ease the orbit in; drift persists
    hold(2),                                                  // I — establish on the MW

    all([ fade(['flow'], 1, 3), fade(['galaxies'], 0, 3) ]),  // A — crossfade (opacity only; galaxies stay LOADED)

    all([                                                     // B — both branches 11 s
      seq([ dollyTo(300, 4), hold(3), dollyTo(950, 4) ]),     //   pull back → dwell → pull out
      rate('yaw', { to: 0.025, over: 11, ease: 'inOut' }),    //   decelerate the orbit across the WHOLE pull-back
    ]),

    hold(5),                                                  // C — hold (drift + bob keep it alive)
    fade(['flow', 'milkyWay', 'structures', 'labels'], 0, 3), // D — fade to black (transient; no settings flipped)
  ],
};
```

The structural payoff: the rotation decel that spans three "beats" is a single
`rate` sibling in the `all` block — concurrency stated locally, not computed as
absolute timestamps.

**`webShowcase` — the named-cosmic-web hero (382 → 22; data-dependent → a builder):**

```ts
function webShowcaseClip(state: EngineState): ClipData {
  const virgo = resolveStructure(state, 'cluster-virgo-m87');  // positions + framing distances resolved ONCE
  const m87 = resolveFamous(state, 'm87');
  return {
    start: { target: [0, 0, 0], yaw: 0.6, pitch: 0.26, distance: 160 },
    preroll: 2,
    timeline: [
      hide(['volumes', 'filaments', 'famousGalaxyLabels'], 0),   // galaxy points + rings + names only

      fork(oscillate('pitch', { amp: 0.05, period: 18 })),       // slow bob for life
      fork(rate('yaw', { to: 0.12, over: 1.5, ease: 'in' })),    // ease the orbit in; drift persists the take
      hold(6),                                                   // PAN — named rings + labels sweep through

      all([                                                      // APPROACH — out to Virgo + dolly to its ring
        moveTarget(virgo.worldPos, 5, 'inOut'),
        dollyTo(virgo.ringMpc, 5, 'inOut'),
      ]),

      focus({ type: 'structure', id: 'cluster-virgo-m87' }),     // the "click" — isolate Virgo's members
      hold(4),                                                   // DWELL — isolate reads, camera holds the ring

      all([                                                      // DIVE — to M87 (Virgo stays focused → M87 bright)
        moveTarget(m87.worldPos, 5, 'inOut'),
        dollyTo(m87.focusMpc, 5, 'inOut'),
      ]),

      hold(3),                                                   // HOLD — slow orbit on the M87 thumbnail
      hold(4),                                                   // CLEAR beat — keep orbiting...
      focus(null),                                               // ...then lift the isolation; background returns
    ],
  };
}
```

### Worked example — a galaxy hop (Layer 1 clip vs Layer 2 saga)

Fly to N famous galaxies, orbiting each. Fixed timing is non-reactive → **one
clip**; a `visit` sub-sequence mapped over the list:

```ts
function visit(g: { worldPos: Vec3; focusMpc: number }): Effect {
  return seq([
    all([
      moveTarget(g.worldPos, 2.5, 'inOut'),       // re-aim onto it (camera centres it — no yaw whip)
      dollyTo(g.focusMpc, 2.5, 'inOut'),           // dolly to its thumbnail distance
    ]),
    spin('yaw', { by: Math.PI * 0.8, over: 3 }),   // orbit ~145° around it over 3 s
  ]);
}

function famousHopClip(state: EngineState, ids: string[]): ClipData {
  const galaxies = ids.map((id) => resolveFamous(state, id));
  return {
    start: 'live',
    preroll: 1,
    timeline: [
      fork(oscillate('pitch', { amp: 0.04, period: 14 })),  // subtle life for the whole hop
      ...galaxies.map(visit),                                // fly→orbit, fly→orbit, … in sequence
    ],
  };
}
```

The moment a runtime decision enters — *orbit only once the thumbnail has loaded*
— it crosses into Layer 2: a saga composing small `flyTo` / `orbit` clips so it
can `waitUntil`:

```ts
function* famousHopTour(ids: string[]) {
  for (const id of ids) {
    const g = yield* call(resolveFamous, id);
    yield* call(playClip, flyTo(g));                  // fly to it
    yield* call(waitUntil, () => thumbnailReady(id)); // ← the runtime decision that makes it a saga
    yield* call(playClip, orbit(g, 3));               // orbit the now-resolved image
  }
}
```

That contrast is the boundary rule on a concrete example: fixed timing → the one
clip; "wait for the picture to load" → a saga composing clips.

## Layer 1 — the runner

> **Revised (grill 2026-06-21, tween-shaped refinement 2026-06-23).** The
> original spec made the runner a `CameraDriver` that owned camera + scene + clock
> in one closure. Two findings retired that:
>
> 1. **Purity break.** PR #357 made `CameraDriver.pose()` a *pure* function
>    (return a pose, no mutation, no side effects). The runner must `dispatch`
>    intents and drive the `FadeRegistry` mid-timeline — side effects — so they
>    cannot live inside a `pose()` without undoing what #357 bought.
> 2. **Single-authority constraint.** The driver table is the *single writer* of
>    camera pose. A clip's *camera motion* is just another source it must
>    arbitrate, so it lives *in* the table as a real driver — not in a preemption
>    branch beside it, which would be a **second pose authority**.
>
> So a clip splits into two facets, and **the camera facet is shaped like the
> focus tween, not like `orbitDrag`:**
> - **Camera facet** → a store **descriptor** (`camera.clip.data`) evaluated by a
>   *pure* function `evaluateClip(data, elapsed)`, on a `clip`@95 driver row that
>   is structurally identical to the `tween`@60 row. No live-pose Resource.
> - **Scene + lifecycle facet** → a frame-ticked `clipPlayer` (peer of `fades` /
>   `structureFocus`) that fires the timeline's scene cues (edge-triggered side
>   effects) in the tick phase and resolves the `playClip` Promise. It no longer
>   holds the pose or its own clock.
>
> The clip is a **generalized tween** (Option S, now *structural* not just shared
> math): `evaluateTween` is the one-segment case of `evaluateClip`; both ride
> `cameraClock`; the only essential difference is priority — a focus suggestion
> yields to your hand (@60 < drag), a recording owns the camera (@95 > drag). The
> full reasoning is the grill transcript (Q1–Q16) + the tween-shaping note; the
> resolved model follows.

### The model: arbitration across drivers, composition within a clip

The runner is **not** "a `CameraDriver` that owns the clip." It rests on a
distinction the first draft missed: **a camera driver's unit is the live camera
state, not the clip.** Two mechanisms, not one:

- **Across drivers (the table) — arbitration.** Single-writer: the highest-priority
  active driver's pose is the frame's pose. A scripted clip contributes *one*
  driver here.
- **Within a clip (the evaluator) — composition.** Multiple camera *actions* on
  different channels blend at a given time — a `dollyTo` on distance, a `rate` on
  yaw, an `oscillate` on pitch, concurrently. This is the `base`/`vel`/`osc`
  per-channel sum, **not** arbitration — and it is a **pure function of
  `(clip, elapsed)`** (`evaluateClip`), not a Resource mutated each frame.

A camera **action** is the composition unit; the **clip** is the container; the
**table** sees only the net pose, evaluated purely from the stored clip.

```ts
// camera actions — the "other moves" beyond a tween; each a per-channel contribution
type CameraAction =
  | { kind: 'set'; ch: Channel; to: number; over: number; ease: Ease; space: Space } // dollyTo/moveTarget/aimAt
  | { kind: 'spin'; ch: Channel; by: number; over: number; ease: Ease; loop?: boolean }
  | { kind: 'rate'; ch: Channel; to: number; over: number; ease: Ease }   // persistent velocity → vel
  | { kind: 'osc';  ch: Channel; amp: number; period: number };            // additive sine → osc
// a tween/focus-style move is a `set` across all four channels — one constructor, shared ramp math.
```

### The clip driver is the focus tween, generalized

The table already evaluates a **store descriptor** with a **pure function**: the
focus `tween`@60 row is `pose: (s, _cam, elapsed) => evaluateTween(s.camera.tween!,
elapsed)`. The clip is a multi-segment tween, so its driver is the same shape,
differing only in priority:

```ts
// Intent: the authored clip lives in the store (low-freq, set once on start/stop)
camera.clip: { data: ClipData } | null
// pose is a PURE function of descriptor + cameraClock elapsed — no Resource; mirrors the tween row:
{ id: 'clip', priority: 95, commitsOnEdge: true,
  isActive: (s) => s.camera.clip !== null,
  pose: (s, _cam, elapsed) => evaluateClip(s.camera.clip.data, elapsed) }
```

`evaluateClip(data, t)` returns the composed `CameraPose` at time `t` — the `base`
ramps, the closed-form `∫vel`, and `osc`, summed per channel (see "Composition").
It is **pure**: same `(data, t)` → same pose, no accumulated per-frame state.
`evaluateTween` is its one-segment case; `playClip` flattens the `ClipData` tree
once into the per-channel tracks the evaluator reads (the same flatten the
registration-time validator does — memoised on the clip's identity, not re-walked
each frame).

Three things *dissolve* versus an `orbitDrag`-shaped clip holding a live-pose
Resource:

- **No pose register.** The pose is derived on demand from store state — no
  mutable `livePose` to keep in sync, and no "tick must run before pose is read"
  ordering coupling between the player and the driver.
- **Clock** — the clip rides `cameraClock` exactly as the tween does; `elapsed` is
  time-since-activation. (The grill's "`elapsedForWinner` returns 0 for clip"
  special-case is gone — `clip` joins the `tween`/`autoRotate` set.)
- **Keep-alive** — `camera.clip !== null` is store Intent, so `selectCameraActive`
  sees it and render-on-demand stays awake. No per-frame `requestRender`.

The focus tween (`camera.tween`@60) is untouched (#357/#358) and now shares not
just ramp *math* but the whole *shape* with the clip — Option S, structural. Focus
stays an interruptible @60 source; scripted clips own the camera @95. (No "subsume
`tweenManager`" step — `tweenManager` no longer exists.)

This also makes the **live animation state serializable** — it is `camera.clip.data`
in the store, not hidden in a Resource — and a scrub/preview tool nearly free
(pose at any `t` is one pure call). The cost is expressing `∫vel` in **closed
form** rather than a per-frame accumulator, which is also what makes the motion
frame-rate-independent and a recording reproducible.

### The player (a Resource): scene cues + lifecycle only

With the pose pure-derived by the driver, `clipPlayer` keeps only the
side-effecting work. Each frame, given `elapsed` from `cameraClock`, it:

- **fires scene cues** — the timeline's `show`/`hide`/`fade`/`scene`/`focus`
  effects, edge-triggered: any cue whose time falls in `(prevElapsed, elapsed]`
  dispatches now, in the frame's side-effect-sanctioned tick phase (next to
  `fades.tick`), **never** inside the driver's pure `pose`;
- **detects completion** — when `elapsed` reaches the awaited tree's duration (or
  on abort) it dispatches `endClip()`, so the @95 driver deactivates and
  `commit-on-edge` bakes the final pose into `camera.base`;
- **resolves `playClip(clip): Promise<void>`**.

Its only state is a cue cursor (`prevElapsed`) plus `fork` bookkeeping — no pose,
no clock. Because the tree is static, it needs no generator pumping: cue-firing and
completion are a flat scan of the compiled timeline against `elapsed`, with `fork`ed
children cancelled when their enclosing scope completes.

### Composition: layers and the single-writer rule

A channel's value each frame is the sum of three layers:

```
final[ch] = base[ch]  +  ∫vel[ch]  +  osc[ch]
```

- **`base`** — the channel's *position*, driven by `set` / `spin` (and the
  `dollyTo` / `moveTarget` / `aimAt` helpers). **Single-writer: at most one
  base-writer per channel at a time.**
- **`vel`** — a persistent velocity (`rate`), integrated into the channel **in
  closed form** (`∫₀ᵗ vel`, a pure function of `elapsed` — not a per-frame
  accumulator, so the result is frame-rate-independent and reproducible).
  Additive; multiple sum.
- **`osc`** — an additive oscillation (`oscillate`). Additive; multiple sum.

So `base + vel`, `base + osc`, two `vel`s, two `osc`s all **compose** — different
layers never conflict. The *only* conflict is **two base-writers on one channel
at the same time** (`all([ dollyTo(300, 4), dollyTo(950, 4) ])`): a channel can't
be in two positions at once, so no coherent blend exists. Overlapping position
ramps always mean **retarget** — cancel the outgoing ramp, start a new one from
the live value (the same handoff interrupting a focus tween already uses) — never
a blend. (Validated against the spike footage: every channel there is `base`
(held or one sequential ramp) + optional `vel` + optional `osc`; `webshow`
re-aims via `target` precisely to avoid a second base-writer on `yaw`.)

**Enforcement — registration-time validation.** Because a Layer-1 clip is
non-reactive static data, every base-writer's `[start, end)` window and channel
are fully known when `playClip(clip)` is called, *before any frame runs*. The
runner validates once at registration: enumerate base-writers, assert no two
overlap on a channel, and on a clash throw a clear error naming both actions and
their windows. This is **complete** — it catches dynamically-built and `fork`ed
timelines no compile-time scheme can see — and it is the same static-tree walk a
scrub/preview tool would use. (A compile-time variant via a channel-keyed `all`
grammar is left open for the action-vocabulary design; conditional-type tuple
checks were rejected as cryptic and incomplete.)

### Frame ordering: the player ticks first

`clipPlayer.tick(nowMs)` is the **first** step of `runFrame`, before demand/mask
derivation and the camera produce step. It is the frame's intent source: it
fires the timeline's scene cues (`show`/`hide`/`fade`/`scene`/`focus`) and on
completion dispatches `endClip()`. The whole frame — demand, masks, arbitration,
render — is then a consistent function of the post-cue state. The camera pose is
**not** produced here: the `clip` driver evaluates it purely from store state
(`evaluateClip(s.camera.clip.data, elapsed)`) during arbitration, so it needs
nothing the tick wrote. Tick-first is purely about **scene cues firing before the
frame derives from them** — every side effect lives in `tick()`, in the frame's
side-effect phase (alongside the existing demand/resize work).

Ticking the cues *last* (where `fades.tick` runs) would derive the frame from
pre-cue state, then fire the cues — a one-frame scene lag (a layer toggled at this
beat wouldn't take until next frame). Tick-first avoids it. The pose has no such
ordering constraint at all now, because it is a pure read of the store rather than
of a register the player mutates.

A clip ending is a driver deactivation like a tween's: the final composed pose
must bake into `camera.base` so the next driver continues from where the clip left
off. **Which drivers commit on edge is a property of the driver, not a list in the
frame loop.** Today `runFrame` hardcodes the id set — `prev === 'tween' || prev
=== 'autoRotate'` — and naively this design would add a third literal (`'clip'`),
the start of an ever-growing OR-chain that couples the frame loop to driver-table
membership. Instead, lift the fact onto the driver row as `commitsOnEdge` and let
the frame loop read it:

```ts
// driver rows declare the behaviour (tween / autoRotate / clip set it; orbitDrag / resting don't)
{ id: 'clip', priority: 95, isActive: (s) => s.camera.clip !== null, commitsOnEdge: true,
  pose: (s, _cam, elapsed) => evaluateClip(s.camera.clip.data, elapsed) }

// the frame loop reads the property — no id literals, exhaustive by construction
if (prev !== activeId && deps.drivers.byId(prev)?.commitsOnEdge) {
  deps.cb.store.dispatch(commitCameraPose(lastPose.current));
  renderPose = lastPose.current;
}
```

This dissolves the branch *and* its future growth: a fourth committing driver (a
physics fling, a second scripted source) sets the flag on its row and the frame
loop is untouched.

### Scene effects: visibility verbs and the opacity single-writer

A clip changes the scene through three primitives, split by *what they own*:

- **`show([layers], over?)` / `hide([layers], over?)`** — visibility: set the
  layers' visibility *intent* (the setting) **and** drive their opacity to 1 / 0.
  `over` is the fade time in seconds (omit → default, `0` → instant, `N` →
  custom). The convenient common case, including the scene-setup beat
  (`hide(['volumes', 'filaments', 'famousLabels'], 0)` replaces three raw
  dispatches).
- **`fade([layers], to, over)`** — a *transient* opacity move to an arbitrary
  value, with **no** intent change. For partial dims, the fade-to-black end card,
  and layers with no settings toggle (scaleBar, galaxyNames).
- **`scene(action)`** — a non-visibility settings change (bias, intensity, …),
  typed to a `SettingsAction` union, never `AnyAction`.
- **`focus(ref)`** — set selection focus to a `SelectionRef` or `null` (a
  selection-Intent change, not a setting — drives the member-isolation dim). The
  camera tween `watchFocusTween` would kick is **suspended** while a clip plays, not
  merely outranked — see "The reactive bridges are suspended" below.

`show`/`hide` are sugar over "set visibility intent + `fadeTo`" — the way
`dollyTo` is sugar over `tween('distance', …)`.

**Opacity is single-writer too.** All three opacity-moving verbs (`show`, `hide`,
`fade`) are clip-owned and covered by the same registration-time validation as
`base` channels: two opacity-writers on one layer at once is an authoring error.
`scene` never touches opacity, so it cannot collide.

**The reactive bridges are suspended while a clip plays — declared in one place.**
A clip dispatches the *same* intents the UI does (`updateSelectionFocus`, the
visibility toggles), so it trips the production sagas that react to them. Some
reactions the clip *wants* (`scene(setFlow{enabled})` must still load the cube);
some it *owns itself or overrides* and must suppress. The suppressed set is a
single list, **not** a `if (camera.clip) return` guard sprinkled per saga (the
second copy of that guard is the smell — consolidate):

```ts
// the clip is the sole scene/camera authority while it runs; these reactors park.
// NOT watchFlowLoad / watchWake — the clip relies on those still firing.
const SUSPEND_DURING_CLIP = [watchFades, watchFocusTween] as const;
const whileNoClip = (saga) => function* (...a) {
  if (selectClipActive(yield* select())) return;
  yield* saga(...a);
};
```

- **`watchFades`** parked → a visibility-intent change inside a clip does not spawn
  a competing fixed-duration background fade; `show`/`hide` drive the fade
  themselves (next paragraph). Retires `flowShowcase`'s per-frame `setImmediate`
  clamp, which existed only to suppress that background fade by hand.
- **`watchFocusTween`** parked → a `focus()` cue sets selection + the isolation dim
  but plants **no** `camera.tween`. This is load-bearing, and priority alone is
  *not* enough: a tween planted at @60 is dormant *during* the clip (clip@95 wins),
  but `camera.tween` is still non-null when the clip ends, so the instant @95
  deactivates the stale tween outranks `resting`@0 and **snaps the camera to the
  focus framing** — defeating commit-on-edge's bake into `base`.
  Dormancy-by-priority does not survive the edge; suspension does.

**`show`/`hide` reuse the bridge body — they don't re-implement it.** With
`watchFades` parked, the cue handler dispatches the visibility intent and then
calls the *same* `syncVisibilityFades(state, { only, durationMs, animate })` the
saga would have — narrowed to the cue's layers (`only`, which the bridge already
takes), with the cue's `over` as `durationMs` (`over: 0` → `animate: false` snap).
The only addition is an optional `durationMs` override threaded to `applyIntent`,
which hard-codes `FADE_IN/OUT_DURATION_MS` today. So there is exactly **one**
opacity-from-intent code path with two callers — saga-triggered (UI, fixed
duration) and clip-triggered (custom duration) — not a duplicated manifest walk.
`fade([layers], to, over)` (transient, no intent) stays a direct `fades.fadeTo`: it
dispatches no intent, so it never trips the parked saga and is not a second writer.

*Why suspension and not an opacity driver table.* Opacity faces the same shape the
camera does — multiple time-varying writers, one output, a handoff on edge — but
solves it differently (suspend-the-bridge, not priority arbitration), and that
asymmetry is **essential, not an oversight**: the camera has *N concurrent*
sources to arbitrate every frame (orbitDrag, tween, autoRotate, resting, clip),
whereas opacity has exactly *two mutually-exclusive* writers — the settings bridge
*or* the clip, never both at once. For two exclusive writers, "park one while the
other owns it" is strictly simpler than a full arbitration table; a table would be
machinery for a concurrency that cannot occur. (If a second concurrent opacity
animator ever appears, revisit — the camera's table is the proven pattern to
adopt.)

**Clip end — opacity commits its final value.** There is no dedicated clip-end
reconcile. The bridge un-suspends by its own guard — `watchFades` resumes once
`camera.clip` is null, and nothing fires on the transition — and opacity **stays
at the clip's final value**, the true analogue of `commit-on-edge` baking the
camera's *final* pose into `base` (a freeze, not a reset). Layers the clip drove
with `show`/`hide` already have opacity == intent (nothing to reconcile);
transient `fade`s (the fade-to-black, partial dims) persist, which is exactly what
a recording ending on black wants. The only full reconcile back to live is the
tour saga's `restore` (Layer 2) — `restoreScene(snapshot)` runs the existing
`fx.syncFades` path. Recordings end on their final frame and reload.

So there is exactly **one** opacity-writing path — the clip's `show`/`hide`/`fade`
verbs, single-writer-validated, reactive bridge parked while the clip plays — and
the common case never makes the author hand-roll a fade.

### Cancellation and teardown

Interruption is **all-or-nothing and reactive** — never a per-frame partial
override. `clip`@95 outranks `orbitDrag`@80, so while a clip plays the camera is
owned by the clip; a drag cannot steer it. Taking control means **cancelling the
whole clip** (camera *and* scene together) — a decision the orchestration makes,
not a priority the table arbitrates. The alternative (raise drag above clip so a
drag steers the camera while the clip's scene choreography keeps running) splits
one animation across two controllers and snaps back on release — the braid we
removed. A recording (no saga) simply never watches for input; `g` calls
`clipPlayer.stop()`.

**One action triggers teardown** — `endClip()` (the mirror of `startClip(clip)`,
as `cancelCameraTween` mirrors `startCameraTween`), the single write path,
dispatched by the player on natural completion, by `clipPlayer.stop()` on abort,
or by the tour. Teardown is the *set of reactions* to it, each in its owner:

- **Camera** — the frame loop's commit-on-edge bakes the *current* pose into
  `camera.base` on the `camera.clip`→null edge (existing; `'clip'` is in the set).
  A mid-clip abort freezes the camera where it is — no snap — and the next driver
  continues from there.
- **Opacity** — `watchFades` un-suspends by its guard (it stops early-returning
  once `camera.clip` is null); nothing fires on the transition, and opacity stays
  at the clip's final value (see "Clip end — opacity commits its final value").
- **Resource** — `clipPlayer` does its own lifecycle cleanup (reset the cue
  cursor, cancel forks, resolve the `playClip` Promise). Imperative, because
  Resources are imperative (ADR 0007).
- **Settings + selection** (Layer 2 only) — the tour saga's `finally` calls
  `restoreScene(snapshot)`, reverting what `scene`/`show`/`hide`/`focus` changed
  (the snapshot captures the six settings clusters *and* `selection.focus`) and
  running the full `fx.syncFades` reconcile back to live.

`clipPlayer.stop()` is thin: Resource cleanup + `dispatch(endClip())`. It does not
*own* teardown — it triggers it like everyone else, so a future "skip" button or
any caller ends a clip the same way.

**The `playClip` Promise** resolves on natural completion *and* on `stop()`;
cancellation is structured via a redux-saga `[CANCEL]` hook
(`p[CANCEL] = () => clipPlayer.stop()`), never a rejection — so the common path
carries no try/catch. A tour aborts with
`race({ run: call(playClip, clip), abort: take(isUserCameraInput) })`: the lost
`call` is cancelled, `[CANCEL]` stops the player, and the saga's `finally`
restores.

## Layer 2 — saga orchestration

Reactivity lives only here. The tour is a saga that plays data clips and adds
the glue a clip cannot predetermine. Every reactive need maps to a stock
`typed-redux-saga` effect:

A beat is **one clip per stop**: fly to the place, then *dwell there with subtle
motion* until the viewer clicks next or the timeout fires. The dwell is **never
frozen** ([`cinematography.md`](../../tour/cinematography.md): a zero-motion hold
reads as a bug) — it plays a perpetual `dwellDrift` clip (a slow orbit + bob, the
`flowOrbit` spike reused) that always *loses* the race, so whichever of
timeout/click fires cancels it through the same `[CANCEL] → clipPlayer.stop()`
path as any abort:

```ts
const dwellDrift = (beat: BeatData): ClipData => ({
  start: 'live',                                          // continue from where the fly left the camera
  timeline: [
    fork(oscillate('pitch', { amp: 0.04, period: 14 })), // gentle bob
    spin('yaw', { by: TWO_PI, over: 90, loop: true }),   // very slow orbit — perpetual, never completes
  ],
});

function* visitBeat(beat: BeatData) {
  yield* call(waitUntil, () => focusReady(beat.focus));           // reactive load-wait
  yield* call(playClip, flyToClip(beat));                         // establishing move — plays out (awaited)
  for (const e of beat.effects ?? []) yield* put(applyIntent(e)); // per-beat scene intents
  yield* put(showCaption(beat.caption));
  yield* race({                                                   // the interactive dwell — never frozen
    timeout: delay(beat.dwellSec * 1000),                         //   auto-advance, or…
    next: take(TOUR_ADVANCE),                                     //   the viewer clicks "next"
    drift: call(playClip, dwellDrift(beat)),                      //   subtle motion under it; perpetual → loses
  });
  yield* put(showCaption(null));
}

function* guidedTour(beats: BeatData[]) {
  const snapshot = captureScene(state);                           // six settings clusters + selection.focus
  yield* put(setUiHidden(true));
  try {
    for (const beat of beats) yield* visitBeat(beat);
  } finally {
    yield* call(restoreScene, state, store, snapshot, { animate: true }); // restore settings + focus, even on cancel
    yield* put(setUiHidden(false));
  }
}
```

The fly is **awaited** (the establishing move plays out before advance arms — a
click mid-flight doesn't cut it short); the dwell is the interruptible part. This
is a **discrete, click-advanced** tour — a deliberate stop at every beat. The
continuous pass-through *flythrough* (`cinematography.md`, where `dwell_s: 0`
waypoints bend the path at constant speed) is a separate, **non-reactive recorded
cinematic** — with no per-beat waits it is legitimately *one* spline clip (Layer
1), so the boundary rule keeps it out of this saga rather than forcing a
granularity choice here.

`captureScene` / `restoreScene` extend the existing `captureSettings` /
`restoreSettings` wiring seam (`services/engine/wiring/`), called (not `put`) —
`restoreScene` runs the full `fx.syncFades` reconcile back to live (the only place
opacity is reset to baseline; clip end merely freezes it) **and** re-dispatches
`updateSelectionFocus(snapshot.focus)`. The widening is forced by `focus()` joining
the scene vocabulary: `captureSettings` snapshots the six *settings* clusters only,
so a beat's `focus()` and its member-isolation dim would otherwise leak past the
`finally`. Capturing `selection.focus` alongside settings keeps "the snapshot is
the scene" honest — `focus` is reverted the same way `scene` is, not by a separate
`put(updateSelectionFocus(null))` bolted onto the tour.

| Tour need | Mechanism |
| --- | --- |
| Don't start a beat before its data loads | `call(waitUntil, () => focusReady(...))` |
| Auto-advance, but let the viewer click "next" | `race({ timeout: delay(...), next: take(TOUR_ADVANCE), drift: call(playClip, dwellDrift) })` |
| Dwell is never frozen | a perpetual `dwellDrift` clip in the race — always loses, cancelled on advance |
| Cancel the whole tour on stray input | runner cancellation → the `finally` runs |
| Restore settings + focus even on mid-beat cancel | `try { … } finally { call(restoreScene, …, { animate }) }` |
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

- **Focus and clips share one evaluator.** `evaluateTween` becomes the
  one-segment case of `evaluateClip` — focus is `tween`@60, scripted clips are
  `clip`@95, both pure-evaluated store descriptors on `cameraClock`. One ramp-math
  path for all camera moves; no separate tween manager (none exists).
- **The parked `TourBeat[]` survives as data.** `BeatData[]` is fed to the tour
  saga; what changes is that the hand-rolled `tourSubsystem.advance(nowMs)`
  sequencer is replaced by `for (const beat of beats) yield* visitBeat(beat)`.
  Captions become inline `put(showCaption(...))` intents rather than a producer
  reading `currentBeat()` — which removes the `currentBeat()` getter the tour
  seed had to add.
- **The `engine.tour.start(beats): Promise<void>` API survives** — the saga's
  run resolves the promise.
- **The clip adds one `CameraDriver` row** (`clip`@95) shaped exactly like the
  shipped focus `tween`@60 — a store descriptor + a pure evaluator on `cameraClock`
  — plus the `clipPlayer` subsystem for scene cues + lifecycle. No new pose
  authority beside the table.
- **The clip suspends a declared set of reconcile sagas** — `SUSPEND_DURING_CLIP =
  [watchFades, watchFocusTween]`, wired through one `whileNoClip` wrapper, not a
  per-saga `if (camera.clip)`. `watchFades` parks so `show`/`hide` own the fade at
  the cue's duration; `watchFocusTween` parks so a `focus()` cue plants no stale
  `camera.tween` that would hijack the camera at clip-end. `watchFlowLoad` /
  `watchWake` stay unguarded — the clip relies on them. This is the small,
  load-bearing reactive-layer change Layer 1 needs from the existing sagas.
- **`syncVisibilityFades` gains an optional `durationMs`** (it already takes
  `only?`), threaded to `applyIntent` (which hard-codes `FADE_IN/OUT_DURATION_MS`
  today), so `show`/`hide` reuse the one bridge body at a custom duration rather
  than re-walking the manifest.
- **`captureSettings`/`restoreSettings` widen to `captureScene`/`restoreScene`** —
  the snapshot adds `selection.focus` so the tour's `restore` reverts a beat's
  `focus()` and its isolation dim, not settings alone.

## What we are deliberately not building (YAGNI)

- JSON/YAML/bespoke-DSL authoring — the typed TS effect tree is the surface.
- A scrub/preview/timeline tool — the design *keeps the door open* (clips are
  data, hence previewable) but does not build it now.
- Inter-fiber saga channels — branching via ordinary `yield*` delegation
  covers the tour; message-passing between coroutines is unneeded.
- Saga-based clips — clips stay data; sagas only orchestrate.

## Open decisions (resolve at planning)

1. ~~**Channel/value-space table**~~ — **Resolved (grill Q15).** Channel set ≡
   `CameraPose` fields: `distance` (log), `yaw`/`pitch` (add), `target` (lin
   vec3). `roll`/`fov` deferred as a uniform `CameraPose` extension; the spline
   camera is a base-layer *generator*, not a new channel. See "Channels and value
   spaces" above.
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
5. **Decomposition** — likely three plans: (A) the clip data model +
   `evaluateClip` + the `clip`@95 driver row + `clipPlayer` cues/lifecycle +
   re-express one spike; (B) the `playClip` seam + fold `evaluateTween` into
   `evaluateClip` (focus = the one-segment case); (C) the tour saga + `BeatData` +
   reactive effects, landing on the parked tour spec.

## First implementation slice (suggested)

Build Layer 1 end-to-end on the smallest surface: the `Effect`/`ClipData` types,
`evaluateClip` (pure, with closed-form `∫vel`), the `clip`@95 driver row (shaped
like the shipped focus `tween`), a handful of primitives (`tween`/`rate`/
`oscillate`/`wait`/`all`/`seq`/`fork`/`fade`), and re-express **one** spike (the
flyout) as a clip to validate the model against known-good footage. Sagas and the
tour come after the data layer is proven.
