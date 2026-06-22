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
  selection-Intent change — drives the member-isolation dim; the focus-tween it
  kicks stays dormant under the `clip` driver. Distinct from `scene` because focus
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

> **⚠ Under revision (grill 2026-06-21).** Positioning the runner *as* a
> `CameraDriver` is being reconsidered. Two findings drive it:
>
> 1. **Purity break.** PR #357 made `CameraDriver.pose()` a *pure* function
>    (return a pose, no mutation, no side effects). The runner must `dispatch`
>    intents and drive the `FadeRegistry` mid-timeline — side effects — so it
>    cannot live inside a `pose()` without undoing what #357 bought.
> 2. **Single-authority constraint.** The driver table exists to be the *single
>    writer* of camera pose — priority arbitration among competing motion
>    sources. A clip's *camera motion* is itself such a source. Bolting the
>    runner on *outside* the table (a preemption branch that produces a pose the
>    camera reads) would create a **second pose authority** — re-complecting the
>    exact thing the table exists to prevent.
>
> **Decided (grill 2026-06-21): the driver table is the authority over *all*
> camera pose.** A clip's camera motion is therefore just another motion source
> the table arbitrates — it lives *in* the table as a real driver (pure pose),
> not in a preemption branch beside it. Being a table member, it inherits
> `commit-on-edge` handoff for free (the spike dodged this at priority 90).
>
> So a clip splits into two facets:
> - **Camera facet** → a source the table arbitrates, evaluated as a *pure*
>   pose. Stays inside the camera authority.
> - **Scene + clock + lifecycle facet** → a frame-ticked player subsystem (peer
>   of `fades` / `structureFocus`) that walks the timeline, fires its
>   dispatches/fades in the side-effect-sanctioned tick phase, owns the clip
>   clock, and resolves the `playClip` Promise.
>
> Resolved in grill: **Option S** — one shared `evaluateCameraTrack` evaluator
> with **two driver rows** (focus `tween` @60 Intent untouched, scripted `clip`
> @95); the priority/interruptibility difference is *essential*, not accidental.
> **The driver's unit is the live camera state, not the clip.** The `clip` driver
> is `orbitDrag`-shaped: an Intent flag `camera.clip` + a `clipPlayer` Resource.
> Still open: the per-channel action vocabulary + value-space table; scene-effect
> routing through the player tick; commit-on-edge on clip end; the `playClip`
> Promise + cancellation; frame-body ordering (player tick before arbitration).
> The revised model follows; the original "CameraDriver-owns-everything" prose is
> removed.

### The model: arbitration across drivers, composition within a clip

The runner is **not** "a `CameraDriver` that owns the clip." It rests on a
distinction the first draft missed: **a camera driver's unit is the live camera
state, not the clip.** Two mechanisms, not one:

- **Across drivers (the table) — arbitration.** Single-writer: the highest-priority
  active driver's pose is the frame's pose. A scripted clip contributes *one*
  driver here.
- **Within a clip (the player) — composition.** Multiple camera *actions* on
  different channels blend each frame — a `dollyTo` on distance, a `rate` on yaw,
  an `oscillate` on pitch, concurrently. This is the `base`/`vel`/`osc` per-channel
  sum, **not** arbitration.

A camera **action** is the composition unit; the **clip** is the container the
player walks; the **table** sees only the net pose.

```ts
// camera actions — the "other moves" beyond a tween; each a per-channel contribution
type CameraAction =
  | { kind: 'set'; ch: Channel; to: number; over: number; ease: Ease; space: Space } // dollyTo/moveTarget/aimAt
  | { kind: 'spin'; ch: Channel; by: number; over: number; ease: Ease; loop?: boolean }
  | { kind: 'rate'; ch: Channel; to: number; over: number; ease: Ease }   // persistent velocity → vel
  | { kind: 'osc';  ch: Channel; amp: number; period: number };            // additive sine → osc
// a tween/focus-style move is a `set` across all four channels — one constructor, shared ramp math.
```

### The clip driver is `orbitDrag` for scripted motion

The table already contains a driver that reads a **live Resource** gated by a
**low-frequency store flag**: `orbitDrag` reads `state.cam` (mutated outside the
store by the controls) while `camera.dragging` is set. The clip driver is the same
shape — a live register (the player's composed pose) gated by a flag set once on
clip start/stop:

```ts
// Intent (low-freq, set on clip start/stop — mirrors `camera.dragging`)
camera.clip: { id: string } | null
// Resource (60 Hz composed pose — mirrors `state.cam`):  clipPlayer
{ id: 'clip', priority: 95, isActive: (s) => s.camera.clip !== null, pose: () => clipPlayer.pose() }
```

Two consequences both *dissolve* infra the pre-revision design would have had to add:

- **Clock** — the player owns its own clock (like the controls own the gesture).
  `elapsedForWinner` returns `0` for `'clip'`, which is correct, exactly as for
  `orbitDrag`. `cameraClock` stays tween/autoRotate-only, untouched.
- **Keep-alive** — `camera.clip !== null` is store Intent, so `selectCameraActive`
  sees it and render-on-demand stays awake. No per-frame `requestRender`.

The focus tween (`camera.tween` @60, an Intent descriptor evaluated by
`evaluateTween`) is left exactly as shipped (#357/#358); it shares only the
per-channel ramp math with the clip's `set` actions — the "different contexts,
shared evaluator" of Option S. There is **no** "subsume `tweenManager`" step
(`tweenManager` no longer exists): focus stays an interruptible @60 source;
scripted clips are an own-the-camera @95 source.

### The player (a Resource)

`clipPlayer` walks `ClipData` against its own clock each frame and:

- composes the active `CameraAction`s into the live pose the `clip` driver reads
  (`base`/`vel`/`osc` per channel; `base + osc`, `vel` integrated into `base`);
- fires the timeline's `dispatch`/`fade` scene effects in the frame's
  side-effect-sanctioned tick phase (next to `fades.tick`), **not** inside the
  driver's pure `pose`;
- resolves `playClip(clip): Promise<void>` when the tree completes, and dispatches
  `camera.clip = null` so the @95 driver deactivates and `commit-on-edge` bakes the
  final pose into `camera.base`.

Because the tree is static, the player needs no generator pumping — it is a
recursive stepper over `seq`/`all`/`fork`/leaf nodes; `fork`ed children run on a
small child list, cancelled when the root completes.

### Composition: layers and the single-writer rule

A channel's value each frame is the sum of three layers:

```
final[ch] = base[ch]  +  ∫vel[ch]  +  osc[ch]
```

- **`base`** — the channel's *position*, driven by `set` / `spin` (and the
  `dollyTo` / `moveTarget` / `aimAt` helpers). **Single-writer: at most one
  base-writer per channel at a time.**
- **`vel`** — a persistent velocity (`rate`), integrated into the channel each
  frame. Additive; multiple sum.
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
composes the camera pose (cached for the `clip` driver to read), fires the
timeline's `dispatch`/`fade` scene effects, and on completion dispatches
`camera.clip = null`. The whole frame — demand, masks, arbitration, render — is
then a consistent function of the post-animation state. The `clip` driver's
`pose: () => clipPlayer.pose()` is a **pure read** of the cached composition;
every side effect lives in `tick()`, in the frame's side-effect phase (alongside
the existing demand/resize work).

Ticking last (where `fades.tick` runs) would make the driver read the previous
frame's pose — a one-frame camera lag. Splitting compose-in-`pose()` from
effects-at-end would either make `pose()` impure or run the camera and its scene
effects off two clocks. Tick-first avoids both.

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
{ id: 'clip', priority: 95, isActive: (s) => s.camera.clip !== null, commitsOnEdge: true, pose: () => clipPlayer.pose() }

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
  selection-Intent change, not a setting — drives the member-isolation dim; the
  focus-tween it kicks stays dormant under the `clip`@95 driver).

`show`/`hide` are sugar over "set visibility intent + `fadeTo`" — the way
`dollyTo` is sugar over `tween('distance', …)`.

**Opacity is single-writer too.** All three opacity-moving verbs (`show`, `hide`,
`fade`) are clip-owned and covered by the same registration-time validation as
`base` channels: two opacity-writers on one layer at once is an authoring error.
`scene` never touches opacity, so it cannot collide.

**The reactive bridge is suspended while a clip plays.** `watchFades`
early-returns when `camera.clip !== null`, so a visibility-intent change *inside*
a clip does not spawn a competing background fade — `show`/`hide` perform the fade
themselves, once. This codifies and **retires** `flowShowcase`'s per-frame
`setImmediate` opacity clamp, which existed only to suppress that background fade
by hand.

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
tour saga's `restore` (Layer 2) — `restoreSettings(snapshot)` runs the existing
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
- **Resource** — `clipPlayer` does its own lifecycle cleanup (stop the clock,
  cancel forks, resolve the `playClip` Promise). Imperative, because Resources are
  imperative (ADR 0007).
- **Settings** (Layer 2 only) — the tour saga's `finally` dispatches
  `restoreSettings(snapshot)`, reverting what `scene`/`show`/`hide` changed and
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
  const snapshot = captureSettings(state);                        // the wiring seam (Pick of the six clusters)
  yield* put(setUiHidden(true));
  try {
    for (const beat of beats) yield* visitBeat(beat);
  } finally {
    yield* call(restoreSettings, state, store, snapshot, { animate: true }); // restore even on cancel
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

`captureSettings` / `restoreSettings` are the existing wiring seam
(`services/engine/wiring/`), called (not `put`) — `restoreSettings(state, store,
snapshot, { animate })` runs the full `fx.syncFades` reconcile back to live, the
only place opacity is reset to baseline (clip end merely freezes it).

| Tour need | Mechanism |
| --- | --- |
| Don't start a beat before its data loads | `call(waitUntil, () => focusReady(...))` |
| Auto-advance, but let the viewer click "next" | `race({ timeout: delay(...), next: take(TOUR_ADVANCE), drift: call(playClip, dwellDrift) })` |
| Dwell is never frozen | a perpetual `dwellDrift` clip in the race — always loses, cancelled on advance |
| Cancel the whole tour on stray input | runner cancellation → the `finally` runs |
| Restore settings even on mid-beat cancel | `try { … } finally { call(restoreSettings, …, { animate }) }` |
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
5. **Decomposition** — likely three plans: (A) the clip data model + runner +
   re-express one spike; (B) `playClip` seam + retire `tweenManager`; (C) the
   tour saga + `BeatData` + reactive effects, landing on the parked tour spec.

## First implementation slice (suggested)

Build Layer 1 end-to-end on the smallest surface: the `Effect`/`ClipData`
types, the runner as a `CameraDriver`, a handful of primitives (`tween`/`rate`/
`oscillate`/`wait`/`all`/`seq`/`fork`/`fade`), and re-express **one** spike
(the flyout) as a clip to validate the model against known-good footage. Sagas
and the tour come after the data layer is proven.
