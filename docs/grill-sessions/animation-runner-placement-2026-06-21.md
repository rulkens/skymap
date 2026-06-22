# Grill Session: Animation runner placement & clip vocabulary — 2026-06-21

Source: design conversation off the question "get the codebase ready for the
animation system design spec — use the spike as a guide, find the complections."
Refines the already-committed
[`specs/2026-06-19-animation-system-design.md`](../superpowers/specs/2026-06-19-animation-system-design.md)
(clips-as-data + saga orchestration), whose Layer-1 runner section it largely
rewrites.

The original spec made the clip runner a `CameraDriver` that owns camera + scene
+ clock in one closure. The user flagged that placement as wrong and licensed
challenging it ("the spike is reference *functionality*, not reference *shape* —
it could be a totally different, simpler solution"). This session walked the
Layer-1 design tree branch by branch, editing the spec live as each branch
resolved.

---

## Q1: Where does the clip runner live — is it a `CameraDriver`?

**The question:** The committed spec implements `playClip` as a single
priority-80 `CameraDriver` that, per frame, computes the camera pose *and*
dispatches scene intents *and* drives fades. Is the driver table the right home,
or does this braid independent concerns?

**Considerations:**
- **Option A (runner *is* a `CameraDriver`, as specced):** proven by the spikes,
  zero `engine.ts` edits. But it breaks the purity contract PR #357 just bought —
  `CameraDriver.pose()` is now a *pure* function (return a pose, no side effects),
  and the runner must `dispatch` + drive fades (side effects). It also jams three
  jobs (camera pose / scene choreography / clock+lifecycle) into a one-job
  interface — the god-object braid the spike already exhibits, relocated into the
  table. Tell-tale: the spikes sit at priority 90 specifically to *dodge*
  commit-on-edge, i.e. they opt out of the table's own protocol.
- **Option B (separate player subsystem that produces the pose; camera reads it
  via a preemption branch):** cohesive runner, but creates a **second pose
  authority** beside the driver table — re-complecting the single-writer guarantee
  the table exists to provide (the user's explicit objection: "if we sidetrack
  the drivers, we're complecting it in another way").
- **Key reframe (from the user):** the driver table is the authority over **all
  camera pose** (Q-aside, locked). So a clip's *camera motion* is just another
  motion source the table must arbitrate — it belongs *in* the table. Only the
  clip's non-camera concerns (scene effects, clock, lifecycle) leave it.

**Decision:** Split the clip into two facets. The **camera facet** is a source the
table arbitrates (a real driver, pure pose) — single authority preserved, and it
inherits commit-on-edge for free. The **scene + clock + lifecycle facet** is a
frame-ticked **player subsystem** (peer of `fades` / `structureFocus`) where side
effects are sanctioned. This honours both "the table owns all pose" and "pose()
stays pure," and rejects A (purity break, god-object) and B (second authority).

---

## Q2: Are `tween` and a clip's camera one concept? Is the priority difference essential?

**The question:** A clip's camera track is a generalized tween (multi-segment vs
one from→to). The math clearly unifies. But the focus `tween` driver is priority
60 (below `orbitDrag` 80, deliberately interruptible) while the reserved tour slot
is 95 (above drag, owns the camera). Is that priority/interruptibility difference
essential or accidental?

**Considerations:**
- **Option S — essential: shared evaluator, two driver rows.** One
  `evaluateCameraTrack`; `evaluateTween` becomes its one-segment case. Two store
  fields (`camera.tween`, `camera.clip`), two driver rows (`tween`@60, `clip`@95),
  static priorities preserved. No math duplication; the just-shipped focus path
  barely changes.
- **Option U — accidental: one field, one driver, priority-in-descriptor.**
  Collapses to a single timeline source; interruptibility rides in the descriptor.
  Cost: `pickWinner` does a pure max-scan over *static* `d.priority` — U forces
  priority to become *dynamic* (read from state) for this one driver, bending the
  table's documented "precedence is data, static declaration" property.

**Decision:** **Option S (essential).** A focus suggestion should yield to your
hand (60 < drag); a recording/tour must not be derailable by a mouse twitch
(95 > drag), with cancellation a deliberate saga decision rather than "drag wins
the frame." S shares the math, keeps static-priority arbitration intact, and
leaves the just-shipped focus tween (`camera.tween` + `evaluateTween`, PR
#357/#358) essentially untouched. There is **no** "subsume `tweenManager`" step —
`tweenManager` no longer exists.

---

## Q3: How does the clip's camera reach the table — and what's Intent vs Resource?

**The question:** Given the camera facet is a table source, how does the per-frame
composed pose surface to its driver, and what lives in the store vs as an engine
Resource? The user's refinement: "a clip is not the unit of a camera driver, an
action within a clip is."

**Considerations:**
- The per-frame composed pose changes ~60 Hz → it cannot be store Intent ("if
  dispatching it 60×/second would be absurd, it is not Intent", ADR 0007).
- Precedent: `orbitDrag` already reads a **live Resource** (`state.cam`, mutated
  outside the store by the controls) gated by a **low-frequency store flag**
  (`camera.dragging`, flipped on pointerdown/up).

**Decision:** The `clip` driver is **`orbitDrag`-shaped**. Store Intent
`camera.clip: { id } | null` (set once on clip start/stop, mirrors `dragging`)
gates `isActive`; the live composed pose is a `clipPlayer` Resource (mirrors
`state.cam`); `pose: () => clipPlayer.pose()` is a pure read. The driver's unit is
the **live camera state**, not the clip: the player *composes* the active camera
actions (Q4) and the table *arbitrates* across drivers — two distinct mechanisms.
This dissolves both earlier "infra gaps" instead of fixing them: `elapsedForWinner`
returns 0 for `'clip'` (correct — the player owns its own clock, like the
controls own the gesture), and keep-alive falls out of `camera.clip !== null`
being Intent that `selectCameraActive` already sees (no `requestRender` hack).

---

## Q4: Within a clip, how do concurrent camera actions compose — and what conflicts?

**The question:** The player composes concurrent actions via `base`/`vel`/`osc`.
What happens when two actions target the same channel?

**Considerations:**
- The three layers are non-conflicting: `final[ch] = base + ∫vel + osc`. A channel
  can ramp, drift, and bob at once.
- I initially called "ramp + rate on one channel" a conflict ("Conflict 2"). The
  user pushed for realistic conflict examples, which exposed that as **wrong**:
  `vel` and `osc` are *additive layers* that compose with a base ramp. The only
  real conflict is **two base-writers (`set`/`spin`) on one channel at once** —
  a channel can't be in two positions, so no coherent blend exists.
- Realistic "two things on one channel" cases all dissolve: organic dolly =
  `base` + `osc`; orbit-and-re-aim = route via `target`, or `base` + `vel`;
  interrupt = *retarget* (cancel outgoing, new ramp from the live value — the same
  handoff a focus tween already uses). Validated against the spikes: every channel
  there is `base` (held or one sequential ramp) + optional `vel` + optional `osc`;
  `webshow` re-aims via `target` precisely to avoid a second `yaw` base-writer.

**Decision:** Single-writer applies to the **`base` (position) layer only**;
`vel` and `osc` are additive (multiple sum). The sole conflict is concurrent
base-writers on one channel, which always means *retarget*, never blend — and is
an authoring error.

---

## Q5: Enforce single-writer at compile time or runtime?

**The question:** Can TypeScript reject two concurrent base-writers on a channel,
or only the runtime?

**Considerations:**
- **Option A (conditional types over the `all([…])` tuple):** possible, but errors
  read like `Type 'distance' is not assignable to 'never'`, and it **dies on any
  dynamically-built timeline** (`.map`, conditionals, `fork`'s open scope) — so a
  runtime check is still required. Partial guarantee, cryptic errors.
- **Option B (channel-keyed `all` grammar — unrepresentable):** compile-time
  single-writer for free, but reshapes the readable array grammar; a grammar
  decision for the vocabulary design, not a bolt-on.
- **Option C (registration-time validation):** because a Layer-1 clip is
  non-reactive **static data**, every base-writer's `[start, end)` window and
  channel are known when `playClip` is called, before any frame runs. A one-pass
  interval check is **complete** — catches dynamic/`fork`ed timelines no
  compile-time scheme can see — with clear errors naming both actions, and it is
  the same static-tree walk a scrub/preview tool would use.

**Decision:** **Option C.** The property that makes a generator-runner wrong
(clips are static data) makes registration-time validation *fully* complete —
strictly stronger than the cryptic type subset. A is dropped; B is left open for
the vocabulary design only if it wants it for other reasons.

---

## Q6: When does the player tick relative to camera arbitration?

**The question:** The `clip` driver reads `clipPlayer.pose()`. For that to be this
frame's composition, where in `runFrame` does `clipPlayer.tick()` run?

**Considerations:**
- **Tick last (where `fades.tick` is):** the driver reads *last* frame's pose — a
  one-frame camera lag. Wrong for the camera facet.
- **Split (compose inside `pose()`, fire effects at end):** either `pose()`
  advances a clock (no longer pure) or camera and scene run off two clocks. Re-
  braids what Q1 separated.
- **Tick first:** the player is the frame's intent source — compose the pose
  (cached for the driver), fire scene effects, clear `camera.clip` on completion —
  before demand/masks/produce. The whole frame is then a consistent function of
  post-animation state; `pose()` is a pure read of the cache; effects live in the
  tick's side-effect phase.

**Decision:** **Tick first.** `clipPlayer.tick(nowMs)` is the first step of
`runFrame`. Consequence surfaced by the code: commit-on-edge (which bakes a
deactivating driver's final pose into `base`) only fired for `'tween'`/
`'autoRotate'` — a clip ending is the same situation, so `'clip'` joins that set.

---

## Q7: The dispatch/fade routes feel icky — what's complected?

**The question:** Scene effects had two routes — `dispatch(setX)` (settings →
bridge → fade) and `fade(FadeId, …)` (direct registry). The user: "feels a little
icky." What's essential vs accidental?

**Considerations:**
- The **persistent/transient split is essential** — `flowShowcase`'s beat D fades
  a dozen layers to black, several with *no* settings toggle (scaleBar,
  galaxyNames); expressing that as Intent would invent a setting per layer and
  flip them all. So a transient-opacity primitive can't be eliminated.
- The **accidental ick:** `dispatch` is an unbounded `AnyAction` escape hatch, and
  opacity is addressed two ways (settings-action vs raw `FadeId`).

**Decision:** Keep both primitives, remove the accidental ick: rename `dispatch`
→ **`scene`, typed to a `SettingsAction` union** (no arbitrary-Redux hatch), and
address **`fade` by layer name** (resolved through the `FADE_LAYERS` manifest, one
addressing scheme). Boundary rule: changes the settings panel / survives the clip
→ `scene`; a transient beat the next `syncVisibilityFades` would wash away →
`fade`.

---

## Q8: A `fade` is running and a layer is enabled/disabled — what happens?

**The question:** Enabling/disabling a layer (`scene` toggle) triggers a bridge
fade. If a direct `fade` is also moving that layer, they fight in the registry.

**Considerations:**
- It's the single-writer problem on the **opacity** channel — two writers
  (bridge-fade, direct fade) on one layer.
- Evidence it's real: `flowShowcase` enables flow then clamps its opacity to 0
  *every frame* (`setImmediate`) to suppress the enable's auto-fade so its explicit
  reveal owns the opacity. That per-frame clamp is the hand-rolled workaround.
- This mirrors the camera exactly: a clip already *owns the pose* while playing
  (commit-on-edge reconciles on exit).

**Decision:** Symmetric rule. **While a clip plays (`camera.clip !== null`) the
clip owns layer opacity:** `watchFades` early-returns (bridge suspended), so a
`scene` toggle changes the setting without a competing fade; the clip's opacity
verbs are the sole opacity writers (single-writer extends to opacity). On clip end
`syncVisibilityFades` runs once to reconcile opacity to the settings baseline —
the opacity analogue of commit-on-edge. This codifies and **retires** the spike's
per-frame clamp.

---

## Q9: Must the author fade in/out every layer by hand?

**The question:** Q8's "clip owns opacity, bridge suspended" implies explicitly
fading every layer. The user asked for a convenient default-fade primitive.

**Considerations:**
- `show`/`hide` driving the registry directly (with a default duration) coexists
  with "clip owns opacity" — they are clip primitives, not the reactive bridge.
- Argument shape: `over: boolean` vs an optional **number** (the fade time). The
  number is strictly more expressive (omit → default, `0` → instant, `N` →
  custom) with fewer concepts.

**Decision:** Add **`show([layers], over?)` / `hide([layers], over?)`** — set
visibility intent *and* fade opacity to 1/0, `over` the fade time in seconds.
Sugar over "set intent + `fadeTo`" (like `dollyTo` over `tween('distance')`).
Subsumes the clunky setup beat (`hide([...], 0)` replaces three dispatches). With
this, every opacity move flows through three clip-owned, single-writer-validated
verbs (`show`/`hide`/`fade`); `scene` never touches opacity; the bridge is parked
during a clip. The original ick fully dissolves.

---

## Q10: How does a clip express selection focus?

**The question:** Re-expressing `webShowcase` surfaced that its isolate is
`updateSelectionFocus` — a *selection* Intent, not a settings action, so it
doesn't fit `scene(SettingsAction)`.

**Considerations:** Either broaden `scene` to accept selection actions (re-widens
the escape hatch) or add a dedicated, bounded primitive.

**Decision:** Add **`focus(ref | null)`** — a sibling of `scene` that dispatches
selection focus. It drives the member-isolation dim; the focus-tween it kicks
stays dormant under the `clip`@95 driver (which outranks `tween`@60).

---

## Q11: `fork` runs alongside other animations — how is it stopped?

**The question:** The spec said `fork` is "cancelled when the clip returns." How
do you stop a fork *earlier* (e.g. a perpetual `oscillate`)?

**Considerations:**
- **Explicit handle + `stop(label)`:** introduces a naming/handle concept.
- **Structured concurrency (lexical scope):** a `fork` is cancelled when its
  *enclosing scope* completes; a scope (clip root, or an `all`/`seq` block)
  completes when its *awaited* (non-fork) children finish. To bound a fork, nest
  it in the block whose duration you want.

**Decision:** **Structured concurrency.** A `fork` is cancelled at its enclosing
scope's completion; lifetime is lexical (top-level → whole clip; nested → that
block). No handle/`stop` primitive (a labelled stop is a deferred YAGNI escape —
nothing in the spikes or the tour needs it). Fork lifetimes are statically known,
so the Q5 registration-time validation already covers their `[start, scope-end)`
windows.

---

## Q12: Interruption — partial override or all-or-nothing cancel?

**The question:** A clip plays at `clip`@95, above `orbitDrag`@80. When the user
drags (or the tour aborts), what happens?

**Considerations:**
- **Partial override (raise drag above clip):** a drag steers the camera while the
  clip's scene choreography keeps running. Splits one animation across two
  controllers and snaps back on release — the braid we removed; also contradicts
  the Q2 lock (`clip` essential at 95).
- **All-or-nothing reactive cancel:** `clip` stays @95 (owns the camera while it
  plays); taking control means cancelling the *whole* clip — a decision the
  orchestration makes (a saga watching input, or an imperative `stop()`), not a
  per-frame priority.

**Decision:** All-or-nothing reactive cancel. A recording (no saga) never watches
input (`clip`@95 ignores stray mouse; `g` calls `clipPlayer.stop()`); the tour
aborts via `race({ run: call(playClip, clip), abort: take(isUserCameraInput) })`.
`playClip` resolves on natural completion *and* `stop()`; cancellation is
structured via a redux-saga `[CANCEL]` hook, never a rejection. Mid-clip abort
runs the *same* teardown as natural end.

## Q13: Where does teardown live — is it callable as an action?

**The question:** `clipPlayer.stop()` cleared `camera.clip`, reconciled opacity,
and (for the tour) restored settings. Should that bundle live in one imperative
method, or go through the store?

**Considerations:**
- **Imperative `clipPlayer.stop()` owns everything:** simple call site, but bakes
  camera + opacity teardown into a Resource method — the same anti-pattern as a
  settings setter that both writes state and runs its own side effects, which
  ADR 0007 routes through reactors.
- **One action + distributed reactions:** `endClip()` (mirror of `startClip`) is
  the single write path; consequences live with their owners (frame loop = camera
  commit; the bridge un-suspends; `clipPlayer` = Resource cleanup; tour `finally`
  = settings restore).

**Decision:** One action. `endClip()` is the single trigger, dispatched by the
player (natural end), `clipPlayer.stop()` (abort), or the tour — and teardown is
the set of reactions to it. `clipPlayer.stop()` becomes thin: Resource cleanup +
`dispatch(endClip())`. Anything (a future "skip" button) ends a clip the same way.

## Q14: Is there an existing saga method for `syncVisibilityFades` — and do we even need a clip-end reconcile?

**The question:** Q8 claimed a clip-end `syncVisibilityFades` reconcile. Is there
an existing saga mechanism to call it, and is the reconcile even needed?

**Considerations:**
- The reconcile sagas reach the engine via `getContext<ReconcileEffects>('reconcile')`
  → `fx.syncFades([keys])` (`reconcileSagas.ts`). So no new context key — a
  reconcile would be `fx.syncFades(...)`.
- But the camera analogue (`commit-on-edge`) **commits the final value** (freeze),
  it does not reset to a baseline. The honest opacity analogue is the same:
  opacity stays at the clip's final value. `show`/`hide` layers already have
  opacity == intent (nothing to reconcile); transient `fade`s (fade-to-black,
  partial dims) should *persist* — a recording ending on black must not snap back.
- The bridge un-suspends purely by its guard (`watchFades` early-returns while
  `camera.clip !== null`); when `camera.clip` is null it simply resumes. Nothing
  needs to fire on the transition.

**Decision:** **No dedicated clip-end reconcile saga** (corrects Q8). The bridge
un-suspends by its guard; opacity commits its final value (freeze, like the pose);
the only full reconcile back to live is the tour saga's existing `restore`
(`restoreSettings` → `fx.syncFades`). Recordings end on their final frame and
reload. The existing `fx.syncFades` via `getContext('reconcile')` is the mechanism
wherever a reconcile *is* wanted (e.g. inside `restore`).

## Q15: What is the exact animatable channel set — and where do `roll`/`fov` sit?

**The question:** The clip composes per-channel into the pose the `clip`@95
driver returns — a `CameraPose`, which has four fields. The spec's candidate
table listed **six** channels (`distance`, `yaw`, `pitch`, `roll`, `target`,
`fov`). Grounding it against the types exposed the braid: `CameraPose` =
`{ target, yaw, pitch, distance }` (what every driver produces, the table
arbitrates, `commitCameraPose` bakes), while `roll`/`fovYRad` live only on the
live `OrbitCamera` (renderer reads `cam.roll` at `orbitCamera.ts:229`,
`cam.fovYRad` at `:270`) — no driver produces them. The table braided "params the
live camera has" with "channels the pose pipeline carries."

**Considerations:**
- **Option A — channel set ≡ `CameraPose` (4).** The clip animates exactly what
  the table arbitrates and commits; `pose()` returns a `CameraPose`. `roll`/`fov`
  stay real camera params but not animation channels. No spike footage moves
  either, so it costs nothing today.
- **Option B — widen `CameraPose` to 6.** Uniform through the table, but every
  driver (orbitDrag/tween/autoRotate/resting), `commit-on-edge`, `evaluateTween`,
  `assembleOrbitCamera` grow two fields — a camera-pipeline-wide change for a
  dolly-zoom/roll nobody has asked for.
- **Option C — 4 in the table, `roll`/`fov` written direct to the live camera.**
  A second camera write path outside arbitration — the exact braid Q1 killed.

**Decision:** **Option A.** Un-braided shape: animatable channel set ≡
`CameraPose` fields. The user accepted A while flagging two anticipated futures;
both leave A intact because the channel set is coupled to the camera
*parameterization*, not to the *generator*:
- **`roll` + `fov`** — a genuine future channel-set extension (2 `CameraPose`
  fields added uniformly across drivers), deferred YAGNI, not built now.
- **Spline / free-flight camera** (`docs/tour/cinematography.md`) — **not** a
  channel change: it maps onto the same four channels (`target=focus`,
  `distance=exp(logDist)`, `yaw/pitch=angle`); "free-flowing" is a higher-level
  *generator* (Catmull-Rom through waypoints, arc-length reparam in log space) =
  a single base-layer writer claiming all four base channels jointly, composing
  under the existing single-writer rule (`vel`/`osc` still layer).

Also fixed a contradiction the table carried: the note "yaw/pitch driven by
tween/spin **or** rate, never both" contradicted the Q4 composition model
(`base + ∫vel + osc` — base and vel compose; only two *base*-writers conflict).
"Never both" removed; the honest rule is every channel sums all three layers,
single-writer on `base` only.

## Q16: Tour clip granularity — one clip per beat, or continuous spline segments?

**The question:** The spec's Layer-2 sketch loops one `playClip(flyToClip(beat))`
per beat — an ease-in-out *stop* at every beat. `cinematography.md` says
pass-through waypoints (`dwell_s: 0`) must *bend the path at constant speed* (a
flythrough, no stop), which one-clip-per-beat can't express. Does a tour clip
span one beat or a run of beats?

**Considerations:**
- **Option A — one clip per beat.** Matches today's ramp generators (fly + dwell,
  ease-in-out), but stops at every beat (can't flythrough); bakes granularity to
  the beat.
- **Option B — saga composes clips split at *reactive boundaries*.** A clip spans
  a run of beats; a new clip starts only where a runtime decision forces a break.
  With ramp generators a run ≈ one beat; with the deferred spline generator a run
  of pass-throughs collapses to one continuous spline clip, zero saga rework.

**Decision (corrected by the user — I over-reached with Option B):** The intended
UX is a **discrete, click-advanced tour**: each beat is **one clip** — fly to the
place, then *dwell there with subtle motion* until the viewer clicks next or the
timeout fires. A deliberate stop at every beat. The continuous pass-through
flythrough is a **different consumer** — a *non-reactive recorded cinematic* — and
the boundary rule already separates them (no per-beat waits → legitimately one
spline clip in Layer 1). I should not have dragged `cinematography.md`'s
flythrough into the interactive tour; there is no granularity choice to force
here. Essentially **Option A**, with the spline flythrough left to its own
(recorded) consumer.

The one real mechanic this adds over the spec's prior sketch: the dwell is
**never frozen** (`cinematography.md`: a zero-motion hold reads as a bug). It runs
a perpetual `dwellDrift` clip (the `flowOrbit` spike: `fork(oscillate)` + a very
slow `spin(loop)`) inside the `race({ timeout, next, drift })` — `drift` never
completes, so it always loses, and whichever of timeout/click fires cancels it via
the same `[CANCEL] → clipPlayer.stop()` path (Q12–Q14). The establishing fly is
**awaited** (plays out before advance arms); the dwell is the interruptible part.
Also reconciled capture/restore with the real wiring seam (`captureSettings` /
`restoreSettings(state, store, snapshot, { animate })` in
`services/engine/wiring/`, called not `put`).

## Validation: the four spikes (and a 5-galaxy hop) as clips

Re-expressing all four throwaway drivers in the resulting vocabulary collapsed
each from 115–382 lines to 5–22, deleting every `phase` machine, self-clock,
per-frame `requestRender`, and fired-flag latch (worked examples folded into the
spec). The galaxy hop demonstrated the Layer-1/Layer-2 boundary concretely: fixed
timing → one data clip (`.map(visit)`); "orbit only once the thumbnail loads" →
a saga composing `flyTo`/`orbit` clips with `waitUntil`.

## Status

Layer-1 design resolved and recorded in the spec, including
cancellation/teardown (Q12–Q14) and the channel/value-space table (Q15):
interruption is all-or-nothing reactive cancel, `endClip()` is the single
teardown action, no clip-end opacity reconcile (opacity commits its final value),
and the animatable channel set ≡ `CameraPose` (4 channels; `roll`/`fov` deferred,
spline camera is a generator not a channel). Layer-2 tour-saga shape resolved
(Q16): discrete click-advanced beats, one clip per stop, dwell never frozen (a
perpetual `dwellDrift` clip in the `race`), capture/restore via the real
`captureSettings`/`restoreSettings` wiring seam. The continuous pass-through
flythrough is a separate recorded consumer, out of this saga's scope.

**Design tree resolved.** Remaining work is execution-time, not design: the
`BeatData` field list + `applyIntent`/`showCaption`/`waitUntil` plumbing (a tour
plan, atop the existing `captureSettings` seam), and the deferred items the spec's
"Open decisions" already enumerates (`aimAt` interpolation, preview tool,
plan decomposition).
