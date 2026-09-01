# Camera pivot — design (Fable variant)

> **Status.** Drafted 2026-09-01 by Fable as the adversarial pair to the
> opus-authored variant (`2026-09-01-camera-pivot.md`); the two are compared and
> merged/picked at user review. Not yet built.
> **Ruling record.** [`docs/grill-sessions/globe-camera-pivot-2026-08-24.md`](../grill-sessions/globe-camera-pivot-2026-08-24.md)
> — every decision below cites it (`ruled, Q2`) rather than re-arguing. Where
> this spec adds something the transcript did not settle, §12 says so.
> **Spec 2 of two.** Spec 1 (body render slabs) shipped as PR #634; this spec
> swaps provider B in behind its `BodyPoseProvider` seam without touching the
> renderer (ruled, Q1b, S1).

## 1. What we're building

A Google-Maps-style **surface regime** for near-body navigation. Inside an
`h/R` band around a planet or moon, the authoritative camera state stops being
the heliocentric orbit parameterization and becomes a **body-fixed pose +
orthonormal basis in SI metres, anchor-relative** (ruled, Q1, Q2, S2, S3). One
exact, one-sited conversion connects the two regimes; crossing never moves the
camera because both sides derive the render pose through the same formula
(ruled, Q1).

Everything the user feels — ground-locked drag, zoom-to-cursor, tilt/look up
to the sky, settle-to-top-down on the way out — is a rigid motion on that
stored pose. No solver, no rate law, no transport correction: the
parameterization family that produced PR #623's nine fix waves is not ported,
it is made unnecessary (ruled, Q2; probe-findings' three defects are all the
same missing thing).

**What this is not built on.** #623 closed unmerged 2026-09-01. Main today has
_no_ surface-camera machinery — no follow-corotation, no drag solve, no ground
rate law — just the plain orbit camera plus `clampDistance` /
`surfaceStandoffRadii` floors. DESIGN-INPUT §6's "dies" table is therefore
mostly already dead; this spec adds a regime, and deletes little (§10).

### Why now

- **The seam is live and waiting.** Spec 1 shipped `BodyPoseProvider` with
  provider A behind it; every body layer, the tile planner, and pick already
  consume body-relative metre poses. Provider B changes the *source* of a pose
  the renderer already consumes, and nothing else (ruled, S1).
- **Every near-body defect on record localizes to the parameterization.** The
  probe measured it: 90° horizon roll dead-east at the frame equator, the sky
  unreachable over the equator, nadir degenerate — all cures require a
  camera-owned basis (probe-findings, defects 1–3).
- **Q10's debt compounds.** Keyframes and serialized poses interpolate in
  absolute Mpc; every tour recorded near Earth is wrong the moment the sim
  clock moves. The grill ruled: convert now, while the frame machinery lands
  (ruled, Q10, Q10b).

### Goals

- Rock-solid ground-anchored navigation at every altitude inside the band,
  down to the current zoom floor and past it (anchor-relative state, deep zoom
  in scope — ruled, S2: "I don't want to redo this").
- Sky access: tilt to 180° at ground level via look mode (ruled, Q5).
- A fast sim clock never moves the ground under an engaged camera: the stored
  state is independent of `t` (DESIGN-INPUT §3.5; ruled by construction).
- Keyframes and serialized camera state name their frame; near-body content is
  body-relative (ruled, Q10, Q10b).
- Fewer constants and fewer concepts than the nine fix waves accumulated —
  the pivot's own meta-bar (DESIGN-INPUT §8).

### Non-goals

- **Inertia/coast** (ruled, Q8: none; the only acceptable later shape is
  recorded there). **Pole dial** (ruled, Q9: no). **H2 rate blend** (ruled,
  Q7: H1 first; H2 is the bounded escalation, spent only on adverse evidence
  under an accelerated clock).
- **Terrain/DEM.** No height source exists; the collision floor works against
  the reference radius. The two terrain rules that cost nothing are still
  written down now (§7, sensitivity-never-reads-DEM and the ground-height
  low-pass) so they cannot be invented wrong later.
- **XR, SpaceMouse.** No XR path on main; the SpaceMouse subsystem was deleted
  2026-06-16. The input controller lands in the vacated priority-100 driver
  slot, which is all the 6-DoF future needs.
- **An ellipsoid.** `ENU(P)` is defined so the geodetic normal drops in later;
  first landing is spherical, like everything else in the body registry.

## 2. Ground preparation

Refactor-ground for the whole pivot ran 2026-08-24/25; its prep shipped: P1–P4
as PR #635, and spec 1 itself (#634) built the seam, the metre units, the
single `R_body(t)` sample rule, and `ctx.bodyPose`. What remains for spec 2 is
two small behaviour-preserving prep diffs on the intent side:

**P5 — frame the camera base.** `CameraState.base: CameraPose` becomes
`base: FramedPose` (§3) with every existing writer/reader on the
`{ kind: 'orbit' }` arm. Pure wrapper, no behaviour change. Without it, the
surface arm would bolt onto a shape every driver and the hash serializer
pattern-match today.

**P6 — `PoseFrame` on clip data.** `ClipData` (and the recorder's output) gains
a `frame: PoseFrame` field, `'absolute'` everywhere, evaluator threads it
without acting on it. This is T4's "minimal channel + tag" landing its tag
first (ruled, addendum T4 — the `FramedPose` rewrite of the animation system
stays declined).

Packaging — separate prep PR vs riding this feature's PR — is the standing
explicit ask at the checkpoint (convention; no default).

## 3. Data delta

The binding shapes. S2's ruled state vector is carried verbatim, renamed only
to match spec 1's field conventions (`*M` suffix = metres).

```ts
// src/@types/camera/SurfaceCameraState.d.ts
/**
 * Authoritative camera state while the surface regime is engaged.
 * Body-fixed axes, SI metres, f64. Nothing else is stored (ruled, Q2, Q3, S2).
 */
export type SurfaceCameraState = {
  readonly bodyId: BodyId;
  /** Body-fixed anchor point; [0,0,0] = body centre (first landing default). */
  readonly anchorLocalM: Vec3;
  /** Eye − anchor. Small near the anchor, so the f64 floor shrinks with zoom. */
  readonly eyeRelAnchorM: Vec3;
  /** Camera right | up | forward as columns, body-fixed, orthonormal. */
  readonly basisLocal: Mat3;
};
```

```ts
// src/@types/camera/FramedPose.d.ts — the T2 resolution, see §12-T2 (OPEN)
export type FramedPose =
  | { readonly kind: 'orbit'; readonly pose: CameraPose }
  | { readonly kind: 'surface'; readonly state: SurfaceCameraState };
```

```ts
// src/@types/camera/PoseFrame.d.ts — Q10/Q10b discriminant, shared by
// keyframes, clips, and serialization. Untagged legacy input parses 'absolute'.
export type PoseFrame = { readonly kind: 'absolute' } | { readonly kind: 'body'; readonly bodyId: BodyId };
```

Per-gesture, latched at gesture start, dies at pointerup — never persistent
(ruled, Q3; a stored pivot is FW-H's proven root cause):

```ts
// src/@types/camera/SurfaceGesture.d.ts
export type SurfaceGesture = {
  readonly mode: 'pan' | 'trackball' | 'strafe' | 'look' | 'tilt' | 'zoom';
  /** |first pick| — the frozen pan sphere's radius, metres. */
  readonly anchorRadiusM: number;
  /** Body-fixed. NEVER world (DESIGN-INPUT, Cesium landmine #5). */
  readonly anchorLocalM?: Vec3;
  /** Previous FRAME's end, not the press point. */
  readonly prevPixel: Vec2;
};
```

Derived on read, every frame, never stored: `P` (surface point under screen
centre; fallback nadir), `ENU(P)`, and the KML readouts `heading, tilt, range,
altitude, lonLat` measured at `ENU(P)` — derived once per frame, passed down,
never re-read in a loop (DESIGN-INPUT §1.2).

## 4. The regime

**Discriminant.** `h/R` against the scene's planet/moon registry rows (Sun and
stars excluded — S4 keeps them out of body frames). Bodies are separated by
distances vastly larger than their radii, so at most one body's band contains
the camera; that body is `state.bodyId`.

**Band.** Engage at `h/R ≤ REGIME_ENGAGE_HR ≈ 1.7` (Earth comfortably
full-frame, ~11,000 km), disengage at `h/R ≥ REGIME_DISENGAGE_HR ≈ 3.4` — 2×
hysteresis, both feel-tunable (ruled, Q6; supersedes the FW-E 0.0189/0.0378
values, whose perceptual derivation survives only as the sanity check that
drift at the flip is imperceptible at real-time rate).

**Two rules, both tested:**

- **No flip during an active gesture.** Latched at gesture start, re-evaluated
  at gesture end (ruled, Q6).
- **One state, one consumer.** The regime boolean feeds the flip machinery —
  which arm `FramedPose` holds, and therefore which provider serves
  `state.bodyId` — and *nothing else*. Not a render path, not a drag mode, not
  a serialization frame; serialization reads the pose's own `kind`, never the
  boolean (ruled, Q6; the OpenSpace #3017 re-offence is the named
  counter-example). A test asserts the single consumer.

**The trade, stated for the record:** engaging this high means Earth stops
visibly rotating once engaged (geostationary hover; under a fast clock the sun
and stars sweep instead). "Planetarium Earth" lives above the band (ruled, Q6).

## 5. The conversion and the fold

Exactly continuous, by construction, not by tween (ruled, Q1; DESIGN-INPUT
§3.1):

```
eyeLocalM  = anchorLocalM + eyeRelAnchorM
eyeWorldMpc = bodyPosMpc(t) + R_body(t) · eyeLocalM · M_TO_MPC
basisWorld  =                 R_body(t) · basisLocal
```

- **Entering: capture nothing.** Invert the formulas at the engage edge; no
  snapshot, no epoch. Co-rotation is a property of the storage, not a
  mechanism — the R̃-correction family is unrepresentable here.
- **Leaving: bake.** Re-derive the orbit parameterization from the world pose
  at the disengage edge. By Q4/Q5 the outbound pose is near-nadir and
  roll-free (the tilt ceiling ≡ 0 there), so `heading` maps exactly onto
  `yaw` and the orbit arm receives a pose it can represent — correctness as a
  consequence of a feel decision (ruled, Q4 option iii).
- **Fold last, one site.** While engaged, the world-facing render camera
  (`state.cam`'s position/basis) is *derived* from the surface state through
  the formulas above, at exactly one site, below driver arbitration, as the
  final stage of the camera pipeline (FW-G requirement carried forward;
  DESIGN-INPUT §3.3). COSMO and NEAR0 layers keep consuming the world camera
  they consume today; they never learn the regime exists.
- **One `R_body(t)` sample per frame** feeds this conversion and the rendered
  body — spec 1 already centralized the sample (`deriveBodyStates`, memoized);
  this spec adds the camera conversion as a consumer of the *same* snapshot
  (DESIGN-INPUT §3.5 item 4).

**Provider B.** Trivial by design:

```ts
// provider B, selected for state.bodyId while engaged; provider A serves
// every other body, and everything, outside the band (ruled, S1: B keeps A)
const poseB: BodyRelativePose = {
  eyeRelBodyM: add3(state.anchorLocalM, state.eyeRelAnchorM),
  basisM: state.basisLocal,
};
```

Both providers produce the same value at the flip; a test asserts it at the
band with a rotating, tilted-pole body (the 3.1e-16-agreement fixture shape).

**Re-anchoring** (ruled, S2): a floating-origin shift, exact by construction —
`anchorLocalM += δ; eyeRelAnchorM −= δ`. First landing runs with
`anchorLocalM = [0,0,0]`; the operation, its serialization, and its test land
now, the *trigger* is one parameter (re-anchor toward the sub-eye surface
point when `|eyeRelAnchorM|` exceeds a precision budget) tuned when deep-zoom
content exists. State-side precision then stops being the blocker forever;
data becomes the only frontier (ruled, S2).

## 6. Gestures

All solves run in body-fixed metres, f64, on `raySphereRoots` (kept in its
reformulated discriminant form — the shared pick/drag primitive). The mode
ladder is Cesium's: **chosen by what the cursor is over, altitude only as
tiebreak** — cursor hits the body → anchored pan at any altitude; misses and
high → trackball; misses and low → free-look. No zoom-level state machine
(DESIGN-INPUT §3.6).

**(a) Drag** — frozen pick sphere, two-ray rotation: freeze `anchorRadiusM` at
gesture start, intersect prev/this frame's rays with that sphere, rotate pose
*and basis* by the quaternion carrying p₀ to p₁. ~8 lines, pole-free, exact at
every latitude; no `cos(latitude)` term exists to be wrong. Grazing incidence
(`|ray·normal| < GRAZE_DOT`) → strafe in the anchor plane; a miss mid-gesture
degrades sticky-for-the-gesture to trackball (DESIGN-INPUT §2a — adopt the
hard tests, never a blend).

**(b) Zoom-to-cursor** — the distance measure comes from the screen *centre*,
the anchor from the *cursor*, and they stay separate. Approaching: converge on
the cursor anchor. Receding: centre-directed — the cursor anchor is a
repelling fixed point on zoom-out and the FW-H offset is geometric, not a
storage artefact, so the branch is load-bearing (DESIGN-INPUT §2b). With it:
zoom-out-then-in round trips with the cursor unmoved return to the starting
view, statelessly (FW-B/FW-H carried forward). Guards adopted as specified:
one-sided tilt-scaled minimum range, step-magnitude clamp on *both* signs,
overshoot early-return with forced fresh anchor pick, closing-distance (not
altitude) collision gate.

**(c) Tilt/look** — heading about the local vertical at the latched surface
point `C`, then tilt about the post-heading east: the KML intrinsic Z-then-X
order, load-bearing at any non-zero heading (probe-verified). Two gesture
routes under one ceiling (ruled, Q5):

- *Orbit-tilt* about `C` — the ground-anchored route; cannot pass the horizon
  (orbiting past 90° puts the camera underground).
- *Look mode* — rotation about the eye, eye pinned, heading live while
  pinned; the route to the sky, proved by the probe.

```
maxTilt(h/R): 180° at ground level → 0 at REGIME_DISENGAGE_HR
```

Hard invariant, one shared constant: **ceiling ≡ 0 at the disengage
threshold** (ruled, Q4/Q5 — this identity is what buys the roll-free
crossing). The interpolation shape, where the curve crosses 90°, and the
gesture rate constants are explicitly feel-tunable; no published reference
exists to copy.

**Settle-to-top-down comes free:** capture `(heading, tilt)` before each zoom
step, re-apply after it at the new `ENU(P)` — re-levelling against the new
local vertical every step. Composed with the closing ceiling, outbound zoom
converges to top-down with no auto-untilt tween anywhere (DESIGN-INPUT §2c).

**(d) Readouts and degeneracies.** heading = azimuth from local north at
`ENU(P)`; tilt = angle from nadir (KML form — one convention, in the type
name, never both). Near-vertical view (`|dir·up| ≈ 1`, the *default* globe
view): heading from the up vector's horizontal components, roll ≡ 0 —
Cesium's escape, adopted verbatim. Geographic pole: `east` from the camera's
own right vector projected tangentially, heading 0 by convention — continuous
with the approach direction (DESIGN-INPUT §2d). Both touch only the readout;
drag never has a pole case.

**Collision floor:** unconditional (never inside the zoom branch), resamples
after the last position write, and rotates the basis by the same angle/axis
the push moved the eye (DESIGN-INPUT §8, both OpenSpace traps + Cesium §6.6).
Against the reference radius; sensitivity never reads DEM height — one
comment, written before terrain exists.

## 7. Input integration

Aggregate-then-apply, in the vacated priority-100 driver slot (DESIGN-INPUT
§5; Cesium's own replacement architecture):

- `orbitControls`' DOM layer survives verbatim (pointer capture, window
  binding, `touch-action`, wheel-gap trackpad logic — the hard-won part). Its
  *decision* layer becomes a pure gesture recognizer emitting events; it
  mutates nothing.
- A per-frame aggregator collapses all pointer moves since the last frame into
  one `{startPixel, endPixel}` — one pose, one writer, one apply per frame is
  the structural cure for the two-camera/ordering bug family.
- A `surfaceController` driver consumes `(aggregatedGesture, SurfaceCameraState)`
  and returns the new surface state. It is a `CameraDriver` in the existing
  registry — precedence over clips/tweens stays data, not control flow. While
  the surface arm is live, drivers that author orbit terms (`autoRotate`,
  `followBody` pivot-pin) are inactive by their own `isActive`; clip/tween
  drivers author framed poses (§8).
- A trackpad inertial burst neither registers as a new gesture nor slides the
  view at rest (FW-C carried forward). NaN guards on frame construction.

The FW ground rules that survive as one-line requirements: altitude reads are
eye-based (FW-A); zoom is stateless per tick (FW-B); no rate-currency
alternation across the limb, per-event step bounded (FW-D); ground pinned
while engaged — no residual `ω × r` slide (FW-F); rendered sightline ≡
interaction register, one resolution point (FW-G); drag is sub-pixel exact at
every latitude and altitude with no escape hatch (FW-I).

## 8. Keyframes and serialization (Q10, Q10b, T4)

**Keyframes.** `ClipData` carries `frame: PoseFrame` (P6). Under
`{ kind: 'body' }`, `target`-channel values and `PathWaypoint.at` are
body-fixed metres; channel evaluation runs unchanged — the *numbers* are in
the endpoint's own frame, and the conversion to world happens at the same
fold-last site as live navigation. Deep-space clips stay absolute-Mpc.
`resolveClipFoci` resolves a near-body focus into the body frame. The
recorder stamps `frame` from the pose it captures — a tour recorded near
Earth is body-relative from day one (ruled, Q10 option B). This is the
minimal T4 shape: a tag plus frame-aware endpoint resolution; no rewrite of
channels, layers, or the evaluator's algebra (ruled, addendum T4).

**Serialization.** Any serialized camera state names its frame with the same
discriminant: surface poses serialize as body id + local pose, orbit poses as
today. Untagged legacy input parses `absolute` — and since the URL hash never
serialized a raw pose, Q10b carries no legacy constraint there at all
(ruled, Q10b; verified against `hashParamSources`).

**`lonLatFocusPose` migrates** (deferred here from spec 1, Task 13 stop
ruling): its job — "the pose that puts this geodetic point under the camera"
— is a *body-frame* statement. It becomes a constructor of a
`{ kind: 'body' }` framed endpoint from `(lonLat, distance)` alone; the Mpc
target, `bodyOrientation`, and `frameBasis` parameters die. The fly-to-lonLat
saga tweens toward that framed endpoint through the same Q10 machinery.

## 9. Precision

| Regime  | Units             | f64 floor                                   |
| ------- | ----------------- | ------------------------------------------- |
| Surface | body-fixed metres | ~nm at body-centre anchor; shrinks with re-anchoring |
| Orbit   | heliocentric Mpc  | ~14 µm at 1 AU — ample outside the band     |

The Mpc↔metre conversion stays at exactly one seam. `bodyRelativePose` remains
the sanctioned `MPC_TO_M` importer; the §5 conversion is the *other* direction
(`M_TO_MPC`) and lives at the fold-last site — `oneMpcSeam.test.ts`'s
allow-list grows by exactly that one file, nothing else. GPU safety is
unchanged from spec 1: uniforms rebase camera-relative before the f32 narrow.

## 10. What dies / what survives

Dies (all on main today):

- `lonLatFocusPose`'s Mpc/`frameBasis` derivation (§8).
- The near-body reach of `applyWheelZoom`/cursor-zoom and orbit drag: inside
  the band the surface controller owns every gesture, so whatever near-body
  special-casing those paths carry is unreachable there. The plan inventories
  exact sites; outside the band they are untouched.

Not touched, deliberately:

- `cameraClock.followPanOffset` and the `followBody` driver — they serve
  *deep-space* body focus (following a planet from orbit distance), which the
  band never reaches. They are orbit-regime machinery and stay.
- The whole #623 "dies" table (drag solve, corotation fold, rate laws): never
  merged; already dead.

Survives: `raySphereRoots` (shared primitive), the driver registry and wake
gate, `clampDistance`/`surfaceStandoffRadii` (re-priced as the collision
floor's outer layers), the DOM layer of `orbitControls`, every renderer.

## 11. Acceptance criteria

**Structural (tests):**

- Flip continuity: engage→disengage round trip at the band, rotating
  tilted-pole body, pose bit-identical through the conversion pair (§5).
- Clock independence: with the surface arm engaged, advancing `simDays` alone
  changes no rendered-camera-relative quantity — the ground is pinned by
  storage, not correction.
- Zoom round trip (FW-H), no-flip-mid-gesture, single-consumer assertion
  (Q6), heading readout continuity through nadir and over the pole,
  re-anchor exactness, `PoseFrame` legacy-parse.
- The oneMpcSeam import-graph test extended per §9; suite + typecheck green.

**Feel (user attestation, dev server):**

1. Ground-locked drag at street, city, country, and full-globe scale — the
   grabbed point stays under the cursor, every latitude.
2. Tilt to the horizon and past it to zenith at ground level; heading sweep
   while pinned; horizon level (no roll) at every latitude × azimuth.
3. Outbound zoom from a tilted sky view settles to top-down with no snap;
   crossing the band is invisible at real-time rate.
4. Accelerated clock while standing on Denmark: ground rock-still, sun/stars
   sweep. Then disengage: Earth resumes rotating. H1's flip observed and
   judged; H2 spent only on adverse evidence (ruled, Q7).
5. A tour clip recorded near Earth replays correctly with the clock running.

**Perf:** neutral — this spec adds no render passes; measure before/after per
the perf skill anyway (worktree's own `--url`). A regression halts the
pipeline; land/park is the user's ruling.

**Meta-bar:** count the constants. If the landing carries more feel constants
than: two band thresholds, one tilt-curve (max + shape + 90°-crossing), one
graze threshold, gesture rates, and the re-anchor budget — something regrew
(DESIGN-INPUT §8).

## 12. Open questions

**T2 — where the two states live. PROPOSED, OPEN for user ruling.** Deferred
to this spec by the refactor-ground checkpoint. Proposal: **the union**
(`FramedPose`, §3) — `camera.base` holds exactly one arm; the other regime's
parameterization does not exist while it is not authoritative. The
alternative (both states resident, synced at flips or per frame) is mirror
state: two homes for one truth, a sync step that can be missed, and the exact
value×place braid `simplicity.md` names — FW-G's register-vs-render
divergence was this bug's live form. Cost of the union, honestly: every
`camera.base` reader gains an arm check (P5 makes that a compile-error
sweep, ~a dozen sites: drivers' `isActive`/`pose`, hash compose-at-rest,
`seedCameraFromBase`, the camera slice's reducers), and the engine's live
`OrbitCamera` register keeps existing as *derived* render state while
engaged — written by the fold, read by renderers, never authoritative. If
the sweep turns up a reader that genuinely needs both parameterizations
simultaneously, that is evidence for both-synced; none is known.

**Feel constants** (`REGIME_ENGAGE_HR`/`DISENGAGE_HR` exact values, tilt-curve
shape and 90° crossing, gesture rates, `GRAZE_DOT`) — explicitly tunable at
the feel gate; the spec binds only the invariants (2× hysteresis;
ceiling ≡ 0 at disengage; thresholds as fractions of `R`, never metres).

**Which registry rows can engage.** Proposal: every planet and moon row
(consistent with S4's "near-body generic"); a sub-309-km-radius body keeps the
`MIN_DISTANCE` wall issue it has today (known, backlog-grade). Flag: engaging
on a 10-km moon at 1.7 R = 17 km is correct but abrupt; if feel objects, the
floor is a registry parameter, not a second regime.

## 13. File inventory (indicative — the plan confirms exact paths)

New:

```
src/@types/camera/{SurfaceCameraState,FramedPose,PoseFrame,SurfaceGesture}.d.ts
src/services/camera/surface/{surfaceController,surfaceDrag,surfaceZoom,surfaceTiltLook,reAnchor,regimeBand}.ts
src/services/engine/camera/{surfacePoseProvider,foldSurfacePose}.ts
src/utils/camera/{enuBasisAt,headingTiltAt}.ts
tests/** mirroring the above
```

Modified: `src/@types/camera/CameraState.d.ts` (P5), `ClipData`/recorder/
`resolveClipFoci`/`evaluateClip` (P6 + §8), `cameraSlice` + drivers
(`isActive` arm checks), `runFrame.ts` (fold site), `frameContext.ts`
(provider selection), `orbitControls.ts` (recognizer split),
`lonLatFocusPose.ts` (§8), URL hash camera source, `oneMpcSeam.test.ts`.

## 14. Verification plan

Unit tests per §11's structural list, with the tilted-pole rotating-body
fixture as the conversion workhorse. Parity: no-behaviour-change gates on P5
and P6 (every existing test green with the wrappers in place, before any
feature commit). Feel: the five-item attestation list in §11, plus the parked
descent-island re-check (its standing "re-check after the camera work" order)
and a re-judge of the parked label precedence-band prep. Then perf,
`/feature-done`.

## References

- [Grill session 2026-08-24](../grill-sessions/globe-camera-pivot-2026-08-24.md) — the ruling record (Q1–Q10b, S1–S7, addendum).
- `docs/research/2026-08-24-camera-pivot/DESIGN-INPUT.md` — algorithms (§2), handoff (§3), precision (§4), input architecture (§5), risks (§8); `probe-findings.md` — the measured defect record.
- [Spec 1 — body render slabs](completed/2026-08-25-body-render-slabs.md) — the seam this spec's provider B satisfies (§5 there).
- `docs/superpowers/conventions/simplicity.md` — the mirror-state lens T2's proposal applies.
