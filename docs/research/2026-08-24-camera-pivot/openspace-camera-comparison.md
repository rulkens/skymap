# skymap vs OpenSpace: camera strategy under a simplicity lens (2026-08-23)

Inputs: `skymap-camera-seed.md`, `openspace-camera-notes.md`, `findings-rationale.md`. Citations
are `path:line` into the OpenSpace clone or issue numbers on `OpenSpace/OpenSpace`.

Judging rule used throughout: a mechanism is worth transplanting only if it **removes a concept
from skymap's artifact**. "They have it and it's nice" is a rejection, not a reason.

---

## 1. Where OpenSpace solves the same problems with fewer concepts

**1.1 The coordinate frame _is_ the precision fix (their single biggest structural win).**
The Dynamic Scene Graph attaches the camera to exactly one node — "the deepest node in the scene
graph whose sphere of influence fully encompasses the camera position" — and "the camera's position
and orientation is expressed in AN's local coordinate system" at all times (Axelsson et al. §4.2).
That one representation simultaneously delivers: the camera follows a moving body for free ("As the
camera position is defined relative to the focus node, it will follow its movements... Otherwise, it
would be cumbersome when focusing on a fast moving object", Bock et al. §4.2.4), and near-body float
precision, because nothing is ever expressed as a large-magnitude absolute.

skymap solves those same two problems with **two** mechanisms: `applyFocusedBodyPivot` (absolute
target re-pinned per frame) for anchor-tracking, and Earth RTC for precision. That is a real,
nameable braid-of-two-where-one-would-do — and the honest accounting is that un-braiding it costs a
scene graph with spheres of influence and a reattachment rule, which for a handful of bodies is a
much bigger artifact than the two mechanisms it replaces. Transplantable residue is narrow and
listed in §3(d) and §4: express _serialized_ and _interpolated_ camera states relative to a body,
which is where skymap's absolute-Mpc formulation actually leaks.

**1.2 One signed interpolator instead of an engage/disengage state machine.** Follow-anchor-rotation
has no state machine at all: a per-frame boolean distance test controls only the _sign_ of the
delta-time fed to a persistent smoothstep `Interpolator<double>`
(`orbitalnavigator.cpp:1512-1527`, transfer function at `:427-430`), and the value is the slerp
factor on the anchor's rotation differential. Crossing the threshold reverses the sweep. One
threshold, one scalar, zero discrete transitions. skymap's FW-G carries two thresholds (120/241 km),
a boolean engaged state, a snapshot epoch, a frame-switched meaning for the pan offset, and a
one-shot disengage fold with a "smooth via roll tween if reachable, else accept" fallback. See
§3(b) for how much of that gap is actually closable without buying their downsides.

**1.3 One dimensionless ratio for altitude sensitivity.**
`rotationSpeedScaleFromCameraHeight()` (`orbitalnavigator.cpp:1541-1575`) is
`clamp(distFromSurfaceToCamera / distFromCenterToSurface, 0, 1)` — body-size-independent by
construction, so no per-body sensitivity constant exists anywhere. skymap's altitude-scaled
sensitivity is equivalent in effect but expressed in absolute altitude. Minor; not worth a change on
its own, worth knowing when a second surfaced body arrives.

**1.4 Where skymap already has fewer concepts than them.** Worth stating so the comparison isn't
one-directional. OpenSpace needs the local/global rotation decomposition
(`camerapose.cpp:55-99`, invariant `rotation = globalRotation * localRotation`) because it allows
free-look residual on top of an anchor lock; skymap's `{yaw, pitch, distance, target}` holds
"camera looks at target" _structurally_ — the invariant is in the parameterization, not enforced by
a recompose helper. Likewise skymap's exclusive driver table (one driver wins per frame) is one
concept where OpenSpace has five `DampenedVelocity` axes × five device classes summed additively
(`orbitalinputhandler.cpp:160-198`), plus a `resetVelocities()` that must be called on every mode
change (`orbitalnavigator.cpp:556-565`) and still loses momentum races (#2779).

---

## 2. Where OpenSpace is more complex, and whether it's essential

**Essential to their scope, flag as such — do not import:**

- _Anchor + aim as two independently-settable nodes._ Justified in its founding PR by exactly one
  use case ("Set spacecraft as anchor and planet as aim... to visualize a flyby without having to
  reposition the planet in screen space", PR #799) — not a general theory. Cost: `followAim()` is
  the densest function in the file (`orbitalnavigator.cpp:1064-1169`, ~105 lines, a `ratio^50`
  singularity fade with the exponent commented as "picked arbitrarily", and a two-branch angle-sign
  disambiguation), plus `interpolateRetargetAim()` with a geometric-reachability bail-out
  (`:1224-1287`).
- _Multi-node sync._ `Camera::_position`/`_rotation` are `SyncData<>` (`camera.h:151-152`) purely
  for cluster/dome deployment. Zero relevance to a single-camera web app.
- _Device-class velocity summation_ across mouse/joystick/websocket/script/touch — dome-console and
  remote-control scope.
- _Path navigation as a subsystem._ `path.cpp` 655 + `pathnavigator.cpp` 629 + `pathcurve.cpp` 300 +
  `avoidcollisioncurve.cpp` 300, with runtime collision avoidance against every "relevant node" and
  an `InsufficientPrecisionError` → linear-path fallback (`path.cpp:636-652`). This exists because
  users type "fly to Enceladus" at runtime. skymap's tour clips are _authored_, so collision
  avoidance is an authoring-time concern and a tween driver is the right size.

**Accidental — their own maintainers say so:**

- 26 `PropertyInfo` blocks in one file, and #3537 point 5 names it: "Utilizing the full potential of
  the system currently requires knowledge about all the different settings, that have to be set
  manually." Point 4 of the same issue admits a workaround shipped instead of a root fix ("Fast
  unexpected rotations (which is why roll is disabled per default)"). This is the single clearest
  warning in the whole corpus against skymap growing camera knobs.
- #1822: the follow-rotation _toggle_ was added on top of the distance threshold with maintainers
  conceding it is "effectively the same as using the distance and setting to min or max" — a knob
  added for mental-model familiarity, i.e. paid complexity for zero capability.
- `updateCameraStateFromStates()` (`:600-767`) is ~165 lines of ten ordered stages threading a
  mutable `CameraPose` + `CameraRotationDecomposition` pair; the notes correctly observe stage 4
  cannot be tested without stages 1-3 having run, and a reordering wouldn't be caught by types.
  skymap's driver table is genuinely better shaped here.
- `DirectManipulation` is gated by a `_defaultRenderableTypes` list whose own comment calls it "a
  bit of a hack... ideally this property should not be needed at all"
  (`directmanipulation.cpp:316-322`).

---

## 3. Verdicts

### (a) Our orbit-pose + absolute per-frame pivot pin vs their anchor/aim node model — **KEEP-OURS**

The attractive half of their model (camera stored relative to a moving anchor) is _separable_ from
the anchor/aim pair, and skymap already owns an equivalent: an idempotent absolute SET every frame
is the same invariant stated explicitly rather than obtained implicitly from a representation.
`findings-rationale.md` §4 reaches the same conclusion independently ("skymap's
absolute-target-repinned-each-frame is the more explicit version of the same invariant"). Adopting
anchor/aim adds one node concept, `followAim`'s spin+radial decomposition with its singularity fade,
and a second retarget interpolator — and **removes nothing**, because skymap has no
two-bodies-framed-simultaneously requirement. Textbook feature envy.

One thing to steal is a _check_, not code. OpenSpace's `updateAnchorNode()` must explicitly re-stamp
`_previousAnchorNodePosition/Rotation` (`orbitalnavigator.cpp:877`, `:904-913`) or the next frame
computes a delta between the old anchor's last position and the new anchor's current position — a
pose jump. skymap's absolute pin is immune to that class **for the target**, but `followPanOffset`
is delta-accumulated and therefore is _not_: verify it is re-based (or zeroed) on focus-body change,
and that focus change fires once, not twice (their #1734 was exactly a `Earth -> ISS` then
`ISS -> ISS` double fire). Cost: one test.

### (b) Our R̃ engage-frame correction vs their follow-anchor-rotation — **ADJUST, narrowly and conditionally**

Does their signed smoothstep blend kill the disengage-snap problem skymap just designed around?
**Partly, and not for free — the two mechanisms are not interchangeable.**

The structural difference is _derived vs integrated_. skymap's R̃(t) = R(t)·R(t₀)⁻¹ is a pure
function of a snapshot epoch, applied at one resolution point; the stored pose stays clean, engage
is exactly identity, and there is no accumulation. OpenSpace applies the per-frame rotation
_differential_ into the stored pose every frame (`:664-672`, `:726-730`), so "following" is just
"keep adding the body's delta to my pose". That is why their transition is free in both directions:
disengaging is _ceasing to add_, which never has to unwind anything, so t can ramp 1→0 with no
discontinuity and no fold. It is also why they have #3026 — "Following the rotation of an object
with a FixedRotation causes jittering camera movements", repro: capture on ISS, **increase the delta
time**. skymap runs an accelerated sim clock; that is precisely #3026's regime, and the derived
formulation is what makes skymap immune. Do not convert to their incremental form.

The load-bearing consequence, stated honestly: **a purely derived R̃ cannot ramp out continuously.**
Camera world orientation is R̃ · base(yaw,pitch); letting R̃ decay to identity against a fixed base
means the camera unwinds the whole accumulated co-rotation — the snap, spread over a second, which
is worse than a snap. Continuity in the disengage direction _requires_ folding the removed increment
into the base as it is removed. There is no third option.

But that fold need only run **during the ramp**, not in steady state. The transplant is therefore:
keep the frozen epoch and derived R̃ exactly as FW-G has it; on threshold exit, ramp a scalar
s: 1→0 over ~1s through the same `3t²−2t³` shape, apply `slerp(I, R̃, s)`, and fold the per-frame
removed increment into yaw/pitch as it leaves. Sixty frames of quaternion composition is bounded and
never runs under time acceleration, so #3026 does not apply. Concept delta: **−1 threshold constant
(the hysteresis pair collapses to one threshold + a signed rate), −1 boolean engaged state, −1
"residual up-roll: smooth via roll tween if reachable, else accept" special case; +1 scalar and one
smoothstep.** Net −2 concepts and one deleted special case, ~30-40 LOC.

Conditional on evidence: FW-G is in flight and the discrete fold may simply not be visible. Land it,
look at it, and only then spend the change — a neutral observation halts this, it does not defer it.
Note also that skymap's thresholds are derived from a _perceptual_ quantity (3 / 1.5 px/s ground
drift), which is a strictly better currency than OpenSpace's `boundingSphere × 5.0`
(`orbitalnavigator.cpp:361`, `:1004-1027`) — the body-radius-multiple formulation is exactly what
broke for the Apollo 8 capsule case in #3017. Keep ours.

### (c) Our zoom-to-cursor + Newton ground-drag vs their velocity/friction navigation — **AVOID (their model), KEEP-OURS**

Friction is one primitive well factored (`DampenedVelocity`, one exponential filter, friction∈[0,1]
inverted into a scale factor so a single knob governs both "does it coast" and "how long"). It is
also a _pervasive_ concept: it adds per-axis velocity state that every other transition must know
about. The maintenance record is right there — #2779 (refocus stomps in-flight zoom velocity),
#3380 ("even if you have friction disabled the planet still stops rotation" under touch), #3364,
#4173. skymap's zoom-to-cursor is stateless per tick and its ground drag is a solve, i.e. direct
manipulation: the pixel under the cursor is the contract, and there is no velocity to reset, race,
or leak across a driver change. Adding inertia would add a concept that touches everything and
remove none.

Two narrower points. Their exponential dolly (`translateVertically()`, `:1413-1433`, multiplying by
the surface-relative _vector_) is the same thing skymap already does with geometric ~10%/notch on
|eye−P| — nothing to take. And their `DirectManipulation` (720 LOC, Levenberg-Marquardt minimizing
screen-space L2 over contact points) is the robust cousin of skymap's exact Newton solve: a
minimizer degrades where a root-find on an exact equation fails, which is skymap's
"unavailable below ~0.4 body radii (float cancellation vs 1e-9 px tolerance)". **AVOID** importing
LMA — 720 LOC and a solver for one gesture. The cheaper attack on the same symptom is conditioning,
not algorithm: run the solve in a body-local RTC frame and state the tolerance in pixel currency
rather than a fixed 1e-9. That is where the cancellation is coming from.

### (d) Precision strategy vs dynamic scene graph / camera-relative rendering — **KEEP-OURS on the model, ADJUST at the serialization and interpolation boundaries**

skymap already has the load-bearing half and arrived at it independently: doubles on CPU, single
cast late, camera-relative construction. That is literally Globe Browsing §4.4.3's "camera space in
double precision and uploaded to the GPU in single precision", and OpenSpace's own core does the
same thing with the float appearing only at the final uniform upload
(`renderableglobe.cpp:1229-1264`). Their notes are explicit that this falls out of a _convention_
every renderable must honour, not a shared type — skymap's RTC path has the same property and the
same exposure.

Do **not** adopt the dynamic scene graph. Spheres of influence + a reattachment rule + a traversal
earn their keep when arbitrary nodes nest arbitrarily deep; skymap has a handful of bodies and one
camera. Flag as their-scope. The generalization skymap _should_ make, when a second body gets a
surface, is a rule not a graph: render every surfaced body camera-relative, rather than adding a
second Earth-shaped special path.

The real finding here is the trap, not the architecture — see (e), #2305.

### (e) Their hard-won lessons that predict traps ahead of us — **ADOPT the predictions**

Four are live for skymap, ranked by how close they are:

1. **Precision-by-reference-frame does not propagate to camera _paths_** (#2305: "position values
   are often so large that it can lead to precision errors when computing things like camera path
   speed, interpolation"; and `path.cpp:485-490`'s hard-coded `MaxDistance = 1E12` admitted as
   "very specific to our space system"). skymap's exact analogue is the clip/tween drivers and tour
   authoring, which interpolate in absolute Mpc — over a body's surface that is the known
   Mpc-magnitude denormal landmine class, arriving through a subsystem that never got the RTC
   treatment because RTC was framed as a renderer concern. This is the highest-value prediction in
   the corpus.
2. **The orbit-only parameterization has a structural ceiling**, converged on independently by
   #2822 ("a camera mode that does not use the focus+anchor paradigm, specifically for... inside of
   objects") and #1918 ("rotating the camera around its own position, rather than taking the center
   of the current anchor node into account"). skymap's `{yaw, pitch, distance, target}` has exactly
   this ceiling, and skymap is _actively_ in that territory: XR head-look rotates the view about the
   eye, not the target. No action now — but the distance→0 limit must stay well-defined, and if a
   first-person mode is ever wanted it is a new parameterization, not a knob on this one.
3. **Distance-scaled speed collapses to zero when grazing terrain** (#2150: "when you just graze a
   feature, you nearly come to a complete halt"). skymap is immune _today_ because altitude is
   `|eye − bodyCenter| − radius`, i.e. reference-sphere, not DEM. The day terrain height feeds
   sensitivity, skymap inherits the bug. OpenSpace's own escape hatch is `_constantVelocityFlight`
   (`orbitalnavigator.cpp:1558-1568`) — measure against the _reference_ ellipsoid instead of the
   _actual_ surface — but they default it the wrong way and pay for it. Prophylactic: never use DEM
   height for sensitivity, only for the collision floor. Zero LOC, one comment.
4. **Do not let one state decide two things** (#3017, interaction sphere and follow-rotation were
   the same knob and had to be split; #2399, a designed clamp invariant never wired up and open for
   years). Note that OpenSpace _re-committed_ this exact sin elsewhere:
   `NavigationHandler::navigationState()` picks the serialization reference frame based on whether
   follow-rotation is engaged (`navigationhandler.cpp:460-463`). skymap's FW-G engage state must
   stay a pure input to the R̃ correction and nothing else — not a render path, not a drag mode, and
   not a serialization frame.

One more, lower stakes: #1642 (a UI text field truncating a pasted double) is the reminder that
architectural precision safety protects nothing at a serialization boundary. skymap's URL hash is
the same boundary and is already a known landmine.

---

## 4. Bottom line

Ranked. Sizes are concept delta first, LOC second.

1. **NOW — Keep FW-G engagement a pure input to R̃.** Rule + one test that nothing else reads it
   (#3017, and their own `navigationhandler.cpp:460-463` re-offence). ~0 LOC, prevents a braid.
2. **NOW — Audit the clip/tween/tour interpolation path for absolute-Mpc arithmetic near bodies**
   (#2305). Diagnosis only at this stage; the fix is "express endpoints relative to the body", scope
   unknown until measured. Highest-expected-value item here.
3. **NOW — Record the terrain-sensitivity rule before terrain exists**: sensitivity scales on
   reference radius, never DEM height (#2150). One comment where altitude is computed, one line in
   the terrain backlog detail file. ~0 LOC.
4. **NOW — Verify `followPanOffset` re-bases on focus-body change and focus fires once** (their
   `updatePreviousAnchorState`, #1734). One test.
5. **LATER, conditional on the shipped snap being visible — replace FW-G's disengage with a signed
   smoothstep ramp + distributed fold.** Collapses two thresholds to one threshold + a signed rate,
   deletes the boolean engaged state and the "roll tween if reachable, else accept" fallback.
   Net −2 concepts, ~30-40 LOC. Do not convert to their incremental fold (#3026 under time
   acceleration). Land FW-G and look first; neutral evidence halts this.
6. **LATER — serialize camera state relative to the focused body when near it** (their
   `NavigationState`, `navigationhandler.cpp:499-503`), choosing the frame from _altitude_, not from
   the follow-engage flag. Small; only worth it if the URL-hash/tour-state precision actually bites.
7. **LATER — improve the near-surface drag solve by conditioning, not by algorithm**: solve in a
   body-local RTC frame, express tolerance in pixel currency. Removes the "flat-rate below ~0.4 body
   radii" special case if it works. Explicitly _not_ Levenberg-Marquardt.
8. **NEVER — anchor/aim as a second node** (+1 node concept, +105 dense lines, removes nothing);
   **velocity/friction input model** (+per-axis state touching every transition; their #2779/#3380
   are the receipts); **Levenberg-Marquardt direct manipulation** (720 LOC for one gesture);
   **dynamic scene graph with spheres of influence** (their-scope: arbitrary node nesting);
   **idle-motion subsystem** (skymap's autoRotate driver is the whole feature); **camera property /
   knob proliferation** (#3537 point 5 is their own verdict on it).
9. **Watch, no action — the orbit-only parameterization ceiling vs XR/first-person** (#2822, #1918).
   If it has to give, it gives as a new parameterization, never as a knob on this one.

Net reading: skymap's camera is _already simpler than OpenSpace's for skymap's scope_, and in two
places (derived-not-integrated co-rotation; perceptually-derived thresholds instead of
bounding-sphere multiples) it is simply better. The genuine debt is not in the camera model — it is
that precision-relativity stops at the renderer and does not reach the tween/clip/serialization
paths, which is exactly the mistake OpenSpace made and has had open since #2305.
