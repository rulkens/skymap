# Grill Session: Input architecture — 2026-10-14

Source: the dome remote brainstorm
([`2026-10-11-dome-remote-design.md`](../superpowers/specs/2026-10-11-dome-remote-design.md)). The remote is the
app's second input source, and both ways of adding it to today's input path were rejected as bolt-ons: a
`SagaContext.pushGesture` member (prep Task 1 of #888, reverted in `2a0d4c6cc`) and replaying the remote's events as
synthetic DOM events on the canvas.

Goal: a layered input path (sources → recognition → binding → consumers) where the dome remote, and later a gamepad
or WebXR controller, plug in as sources with no engine change.

**Ruled before the questions:** this work outranks OpenSpace camera mode PR #837, which touches the same files
(`InputGestureEvent`, `InputStep`, `orbitControls`, the aggregator, `wireInput`, control schemes). #837 is rewritten
on top of these decisions.

**Today's path, for reference:** `attachOrbitControls(canvas, emit)` reads DOM events and decides their meaning
(right button = pan, two pointers = pinch, release within 4 px = click); its events go through a closure in
`wireInput.ts` that dispatches `beginDrag` + `cancelCameraTween` at DOM time, pushes into the engine's
`inputAggregator`, and wakes the loop; `runFrame` drains the aggregator. A second listener set
(`inputBindings.ts`) watches the same pointers for hover and tracks `picking.pointerDown` again, and also handles
Escape, which the keyboard shortcut table handles too. Click → GPU pick → `updateSelectionSelect` and double-click →
focus live in `wireInput`. Positions are viewport `clientX/Y` but are consumed as canvas pixels. #837 adds a
`bindAxis` callback the recognizer calls at each press.

---

## Q1: What crosses into the engine?

**The question:** At which layer does input enter the engine? Everything above that boundary is outside the engine
and source-agnostic; everything below is engine-owned.

**Considerations:**

- **Option A (device events):** the engine receives `PointerInput` (down, move, up, wheel, with buttons and
  modifiers) and does recognition and binding itself. Smallest change from today, but the engine keeps
  understanding devices.
- **Option B (gestures):** recognition happens outside; the engine receives press, drag, pinch, wheel, tap. Binding
  (what a press means per control scheme) still sits in the engine.
- **Option C (intents):** recognition and binding both happen outside; the engine receives camera input (orbit,
  pan, axis, zoom deltas) and pick requests. The engine is only needed for the per-frame camera fold and GPU
  picking; recognition is a pure state machine and binding is a lookup in the active control scheme, which lives in
  the store. Matches the keyboard path (channel → saga → actions). Removes #837's `bindAxis` callback.

**Decision:** C, intents. Recognition and binding need neither the GPU nor frame state, so they leave the engine.

## Q2: How do intents reach the engine?

**The question:** Given intents, through what does the engine receive them?

**Considerations:**

- **Option A (an engine method):** `handle.input(intent)` or a `SagaContext` member. Every source needs a reference
  to the engine; the remote saga could only reach it through the saga context, the rejected bolt-on.
- **Option B (an input hub at the composition root):** `main.tsx` creates a publish/subscribe hub; the engine takes
  the subscribe side as a constructor argument, sources take the publish side. Recommended: the engine knows no
  publishers, and its only new contract is a constructor dependency.
- **Option C (Redux actions):** intents are dispatched; camera deltas at pointer rate go through the store and its
  dev checks.

**Decision:** C, Redux actions (owner override of the B recommendation): "the action interface is the cleanest
interface we have; I'd like not to reach into the engine at all with deep objects, calls, properties." The cost of
pointer-rate traffic is addressed by Q4. The camera route is already a `WAKE_ROUTE` (`watchWakeSaga`), so input
actions wake the render loop with no new wiring.

### Side question: can the rest of the camera live in actions and sagas?

Yes for what the camera is doing: which driver owns it (gesture, tween, clip, follow, auto-rotate), every request
(fly to, focus, orientation, clip, follow), orchestration, and edges back from the engine as actions (settled,
clip finished, interrupted). That would remove `SagaContext.playClip` (→ `startClip` answered by `clipFinished`),
`cameraRuntime()` (→ a tween that starts "from live", resolved by the engine on its first frame) and
`clipPathInspect`. No for per-frame evaluation: `pose = evaluate(snapshot, frame time, bodies)` stays in the engine
and is never written back per frame, because the camera route wakes the loop (a per-frame write would keep it awake
forever) and it would be 60 store writes a second. The rule: **the store holds what the camera is doing, the engine
computes where it is, and only actions cross.** Scheduled as a separate later stage (Q14).

## Q3: How does the engine take camera input out of the store?

**The question:** What does pending input look like in state, and how does the frame consume it?

**Considerations:**

- **Option A (a pending-input fold, cleared per frame):** a reducer folds input actions into ordered steps, merging
  consecutive motion of the same kind exactly as the aggregator does now; the frame reads it from its one snapshot
  and dispatches `inputConsumed`. One extra dispatch per frame while input is pending; the engine's aggregator
  subsystem is deleted.
- **Option B (an append-only log):** numbered entries, engine remembers the last consumed. No acknowledgement, but
  hidden engine-local state and a log only the engine knows how to trim.
- **Option C (the engine listens to actions):** a middleware or listener hands actions to the engine — the reach-in
  ruled out in Q2.

**Decision:** A. The engine reads input the way it reads settings and time. The fold rules become a pure reducer.
The double-tap landmine (B1: a deferred `cancelCameraTween` killed the focus fly a double-click had just started)
dissolves: the `gestureStarted` action itself begins the drag and cancels the tween, atomically, in a reducer.
`inputConsumed` rides the camera step's existing dispatch loop. (Location amended by Q13b: the fold lives in an
`input` slice.)

## Q4: How often do sources dispatch?

**The question:** Pointer devices fire 60–120+ events a second; each dispatch runs reducers, RTK's dev checks over
the whole state, every mounted selector and the saga middleware.

**Considerations:**

- **Option A (one action per event):** simplest; pointer-rate dev checks may stutter and every selector re-runs at
  pointer rate.
- **Option B (motion coalesced per animation frame, edges at once):** the source buffers drag, pinch and wheel
  deltas and dispatches one action per frame; before any edge (gesture start or end, tap, double-tap) it flushes,
  then dispatches the edge. Order is preserved by the flush.
- **Option C (everything batched):** a delayed `gestureStarted` would land after the focus a double-click started —
  the B1 bug again.

**Decision:** B. At most one motion action per frame per source; edges keep strict order with everything else. The
remote already sends one message per frame. The owner asked whether a saga can do this "like in repperjs": yes —
repperjs wraps DOM listeners as event channels (`packages/shared/src/redux/eventListeners/`), races
`take(frameListener)` in `renderLoopSaga`, and interprets interaction in sagas
(`handleNavigate3DInteractionSaga`). Here each source runs one saga: take from its pointer channel, run the pure
recognizer, buffer motion or flush-then-put an edge, and race an animation-frame channel that puts buffered motion.
One deliberate difference: repperjs dispatches raw pointer triggers and interprets them in sagas; under Q1 only
intents reach the store.

## Q5: Where does binding live?

**The question:** What a press means (orbit, pan, nav axis, zoom) differs per control scheme. Today "right button =
pan" is hard-coded in the recognizer and #837 adds a `bindAxis` callback.

**Considerations:**

- **Option A (a binding table per scheme):** each scheme owns a pure `bind(press) → intent kind`; the source saga
  `select`s the active scheme at each press and latches the result for the gesture.
- **Option B (an interaction saga per scheme):** repperjs's `handleNavigate2D`/`3D` shape with a lock channel; each
  scheme re-implements pinch, wheel and tap, and they drift.

**Decision:** A. The skymap and OpenSpace schemes differ only in what a press means. Latching at press keeps #837's
rule that releasing ctrl mid-drag must not change the axis; a scheme switch applies from the next gesture. #837
becomes one table row plus its navigator intent.

## Q6: Two sources at once

**The question:** At a dome the presenter drags on the remote while an operator nudges the dome machine's mouse.
One `pendingInput`, one camera.

**Considerations:**

- **Option A (merge):** both apply; the gesture ends when the last source releases. Two people pulling one camera
  feels like a fight; the step tracks a set of sources.
- **Option B (first owner holds):** the other's gestures are dropped; a stuck gesture locks everyone out.
- **Option C (latest takes over):** another source's `gestureStarted` ends (and commits) the current gesture and
  takes over; the loser's motion is ignored until it starts anew.

**Decision:** C. Whoever touches last is in control, as tours already yield to any user input. It cannot get stuck.
Intents carry `source`; state keeps one `owner`.

## Q7: Coordinate space for intent positions

**The question:** Zoom toward the cursor, terrain grabs and picks need positions; sources differ in size and aspect.

**Considerations:**

- **Option A (relative to the source's own surface):** resolution-free, one meaning for every source; measured
  against the surface's own rect.
- **Option B (engine canvas pixels):** a remote cannot know the dome canvas's size.
- **Option C (deltas only):** loses zoom-to-cursor, terrain grabs and picks.

**Decision:** A, with the owner's constraint: aspect ratio has caused bugs before in many actions, so its handling
must be explicitly defined (Q8, Q9). Measuring against the surface's rect also fixes a latent bug: the recognizer
sends viewport `clientX/Y` but the camera consumes canvas pixels, which breaks when the canvas is offset (the dome's
CSS-squared canvas).

## Q8: Which aspect rule?

**The question:** Plain fractions hide aspect; the camera already measures drags against the viewport height
(`draggedSurfacePose.ts:49`).

**Considerations:**

- **Option A (stretch):** per-axis fractions mapped per axis; anisotropic swipes when aspects differ.
- **Option B (view units):** centre origin, 1 = surface height, isotropic; a `ViewUnits` type with
  `toViewUnits`/`fromViewUnits`.

**Decision:** neither. Owner: "unit values, and each surface defines or communicates its aspect ratio." Positions and
deltas are plain 0..1 per-axis values; the source's aspect travels as data and each consumer applies it explicitly
where an action needs isotropy.

## Q9: Where does a surface's aspect live?

**The question:** Given Q8, where is the aspect stated?

**Considerations:**

- **Option A (on every `gestureStarted`):** self-contained per gesture; wheel and hover have none.
- **Option B (a source record in state):** `sources[source] = { aspect }`, written by `inputSourceAttached`,
  `inputSourceResized`, cleared by `inputSourceDetached`; one explicit place that says what a surface is.

The owner raised a phone flipped between interactions. A flip is a resize: the remote adapter sends
`inputSourceResized` immediately; the link is in order and rotation animates for a few hundred milliseconds, so the
new aspect lands before the next touch. A flip mid-gesture fires `pointercancel` on mobile browsers, ending the
gesture, so no drag spans two aspects.

**Decision:** B. A detach also ends that source's gesture in the same reducer, so there is no separate
cancel-on-disconnect path.

## Q10: How do pick requests reach the GPU picker?

**The question:** Hover, tap-to-select and double-tap-to-focus start as intents in the store, but the pick runs in
the engine — off-frame, so hovering over a still scene never forces a 2.5M-point redraw.

**Considerations:**

- **Option A (request in state, engine subscribes):** `pickRequested({ source, at, purpose })`, hover coalesced per
  frame; the engine subscribes to the store and runs the existing off-frame pick on a new request, dispatching
  `updateSelectionHover`/`updateSelectionSelect` as now. The engine reaches out to the store, as it already does.
- **Option B (a saga calls the engine):** a new saga-context capability — a reach-in.
- **Option C (pick inside the frame):** every hover forces a render — the regression `hoverPickDriver` removed.

**Decision:** A. Double-tap needs no pick: it is the same intent as the keyboard's `F` (focus the selected ref),
today's `wireInput.ts:198` behaviour, now one action for key and gesture. The hover driver's
`picking.pointerDown` gate becomes "a gesture is owned" (Q6), deleting one listener set and the duplicated flag.

## Q11: Who detects a double-tap?

**The question:** Browser `dblclick` or our own timing?

**Considerations:**

- **Option A (the browser's `dblclick` as a device event):** follows the OS double-click speed and accessibility
  settings; the recognizer stays timer-free.
- **Option B (our own timing):** two taps within a window and a maximum distance.

**Decision:** B (owner override): "we have to be sure we know about a single tap, and perhaps a small delta between
taps." Device events carry the browser's `event.timeStamp`, so the recognizer stays pure (time as data, no timers).
The window and the maximum distance (measured with the source's aspect applied) are named constants in
`src/data/input/`. The OS double-click setting no longer applies — accepted.

## Q12: When is a single tap reported?

**Considerations:**

- **Option A (immediately; double-tap adds to it):** tap → `tapped` (select now); a second tap in the window →
  `tapped` + `doubleTapped` (focus the selected). No delay on selection.
- **Option B (deferred confirmed single tap):** every selection waits the window (~250–300 ms) and the recognizer
  needs a timer tick.
- **Option C (both):** two tap kinds and a timer for a consumer that does not exist.

**Decision:** A. Selection stays instant and the recognizer timer-free. A consumer that needs an exclusive single tap
(for example tap-to-toggle the interface on the dome) adds a saga timer for itself later.

## Q13: Who starts the canvas input source?

**Considerations:**

- **Option A (`useEngine` forks it):** next to `createEngine(canvas, …)`, `runSaga(canvasInputSourceSaga, canvas)`,
  cancelled on unmount; the engine never touches pointer listeners.
- **Option B (the engine forks it from `wireInput`):** the engine keeps owning the decision that its canvas is an
  input surface.
- **Option C (a React `<InputSurface>` component):** a second owner of the canvas element.

**Decision:** A. The engine loses `attachOrbitControls`, the pointer half of `inputBindings` (its duplicate
pointerdown/up listeners and the Escape keydown) and `detachControlsRef`; it keeps only its `resize` listener, which
serves the render target. Escape is handled once, in the keyboard shortcut table. Every source is started by its
owner; none goes through the engine.

## Q13b: Canvas resize, and how the aspect reaches a gesture

**The question (owner):** how is canvas resize handled, and how does the aspect end up in the gesture?

**Answer and decision:** two concerns.

1. **The engine's render target** is unchanged: its `resize` listener wakes the loop and `resizeCanvasToDisplay`
   reads the canvas size at the top of the next frame. The view's pixel size is all the engine knows.
2. **The input surface's aspect:** the canvas source watches its element with a `ResizeObserver` (the dome's CSS
   squares the canvas, and panels resize it without a window resize), fed into the same event channel as its
   pointer events so order is kept, and dispatches `inputSourceResized`. The remote does the same from its own
   `resize` (the phone flip).

The aspect enters a gesture by **stamping**: the fold reducer looks up `sources[step.source].aspect` and stamps it on
each folded step, which is exact across a flip. The engine converts with one function, `stepToViewPx(step,
viewSizePx)`: positions map point to point (`x × viewWidth`, `y × viewHeight`); deltas that must be isotropic (orbit,
pan) use source-height units (`dx × sourceAspect × viewHeight`, `dy × viewHeight`). On the dome's own canvas this
reduces exactly to today's pixels.

Ruled: `pendingInput`, `sources` and `owner` live together in an **`input` slice** (amending Q3 and Q6). The camera
slice reacts to `gestureStarted` (begin drag, cancel tween) through `extraReducers`, pinned by a test because an
unmatched `extraReducers` case is dropped silently.

## Q14: Shipping order

**Decision:** as proposed.

1. **#888:** the palette and toggle-row prep only (Task 1 reverted).
2. **Input architecture:** its own spec and plan. Behaviour-neutral except our own double-tap timing, one Escape
   handler, and canvas-relative positions.
3. **#837:** rewritten on top — one binding row plus its navigator intent.
4. **Dome remote:** a source adapter on the link, the relay, the remote page and the command registry; its spec is
   rewritten without the gesture conversion and the saga-context prep.
5. **Camera state into actions (later, separate):** removes the `playClip` and `cameraRuntime` saga-context
   reach-ins, per the side question's rule.

Folding stage 5 into stage 2 was rejected (one larger refactor touching tours, clips and tween sagas, with the remote
waiting behind it).
