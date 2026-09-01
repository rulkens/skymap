# Grill Session: Globe-anchored camera pivot + body render slabs — 2026-08-24

Source: `docs/research/2026-08-24-camera-pivot/DESIGN-INPUT.md` §7 (the 10 open
decisions, PR #632) plus the remaining questions of the paused earth-local slab
grill (`docs/grill-sessions/earth-local-slab-2026-08-21.md`), folded in by Q1b.

Goal: settle every open decision for the pivot away from the nine-fix-wave
surface camera (PR #623, closing unmerged) to a Google-Maps-style body-anchored
camera, and — per Q1b — the body-local render slab that shares its frame. Output
feeds refactor-ground, then the spec. Binding given throughout (not re-litigated):
body-related navigation state lives in a local body-fixed frame; world-Mpc only
at the regime boundary and in render composition.

---

## Q1: Regime architecture — one camera state or two regimes?

**The question:** Where does authoritative camera state live across the
galaxy-to-surface range, given the binding local-frame constraint?

**Considerations:**

- **Option A (two regimes + one lossless conversion):** world-orbit keeps
  heliocentric Mpc; near a body the authoritative state becomes a body-fixed
  local pose. One exact conversion at a provider seam, one call site each way;
  crossing never moves the camera because both sides derive the render pose
  through the same formula.
- **Option B (one always-anchor-relative state):** OpenSpace's answer. Their
  route to it is a full scene graph (rejected as out of scope in the research
  comparison), and their serialization boundary has been admitted-broken since 2023.
- **Option C (status quo + corrections):** nine fix waves of evidence that this
  converges on a tenth wave, not a fix.

**Decision:** **A.** The given already forces body-fixed near the body;
heliocentric Mpc is right everywhere else; the conversion is exact and
one-sited. User flagged the handoff as the real question → Q1b.

## Q1b: Scope — does body-local rendering ride this pivot?

**The question:** The paused earth-local slab design (body-local km/m render
frame) is exactly provider (B) of the pivot's pose seam. Separate spec, or one
combined design?

**Considerations:**

- **Option i (pivot = camera only; slab = immediate next spec):** two smaller
  independently-testable landings; camera handoff is the same size either way
  (rendering derives from the pose per frame regardless of its own frame).
- **Option ii (one combined spec):** one coherent "everything near a body is
  local units" landing; bigger blast radius — the slab's renderer-shaped open
  problems (cross-slab occlusion, layer assignment) must be solved before
  anything ships.

**Decision:** **ii — one combined design, delivered as two sequenced specs**
(user, refined at session end): **spec 1 = the body render slabs, spec 2 = the
camera pivot.** The slab spec lands consuming provider A (derived body-relative
pose from the incumbent camera, ~14 µm floor — ample for rendering); the camera
spec then swaps provider B in behind the same seam without touching the
renderer. The slab grill's remaining questions became S1–S7 below; every
decision binds both specs.

## Q2: Storage — full pose, or Google-style angles?

**The question:** Is the authoritative surface state a pose + orthonormal basis
in body-fixed units, or the KML/Google `(target, range, heading, tilt)` tuple?

**Considerations:**

- **Option A (pose + basis):** every core operator (drag, tilt, zoom) is a
  rigid motion — exact, closed-form, ~8 lines. Heading/tilt/range become derived
  readouts at the target's ENU (KML semantics), computed once per frame. Nadir
  is continuous because the basis is stored, not derived.
- **Option B (angles as state):** it _is_ the product spec, so storing it
  removes a derivation — but every operator then needs a transport correction
  (rotating the target moves its ENU, so heading must be parallel-transported or
  the view twists): structurally the same correction-on-a-parameterization
  family that produced the nine fix waves. The feel probe's defect 3 (nadir
  heading degeneracy) lives here.

**Decision:** **A, firmly.** Cesium, OpenSpace, and MapLibre's globe all store
pose/quaternion; only the KML _file format_ stores angles. Angles stay
first-class as the derived readout.

## Q3: Is the look-at target persistent state or derived per frame?

**The question:** Store the anchor point the camera is "about", or derive it?

**Considerations:**

- **Option A (derived per frame):** `P` = surface point under screen centre
  (ray ∩ body; fallback nadir). "Where am I looking" is a view of the pose,
  never a second state that can disagree with it. A stored pivot is FW-H's
  proven root cause (`followPanStored` accumulated `altitude · tan(off-axis)`
  at every scale; measured ratio 0.163 across 10 decades). Cesium has no
  persistent target and structurally cannot have that bug.
- **Option B (persistent target):** makes focus-lock trivial later.

**Decision:** **A.** Per-gesture anchors (frozen pick sphere) still exist and
die at pointerup. Focus-lock, if ever wanted, enters as a driver that writes the
pose, not as camera state.

## Q4: Roll at the regime boundary

**The question:** The surface pose carries roll exactly; the world-orbit camera
is yaw/pitch and cannot hold it. What happens on an outbound crossing?

**Considerations:**

- **Option i (accept a residual snap):** FW-G's "residual up-roll: accept" bug
  wearing the pivot's coat. Rejected.
- **Option ii (add roll/up to the world-orbit camera):** honest, +1 field, but
  ripples into XR pose composition and tour authoring for a value that only
  exists in the last stretch of an outbound zoom. This is "be Cesium
  everywhere" — Cesium never faces the question because ECEF is its world frame
  and its camera is a full pose at every altitude.
- **Option iii (let the tilt clamp do it):** the max-tilt ceiling closes as
  altitude rises, with its zero sited at the regime disengage — the outbound
  pose is near-nadir and roll-free by construction, and `heading` maps exactly
  onto `yaw`. Adopts Cesium's emergent settle-to-top-down mechanism
  (HPR-recapture per zoom step re-levels against the new local vertical).

**Decision:** **iii.** Zero new state; the Google feel; correctness becomes a
consequence of a feel decision. Binds Q5: the ceiling's zero must sit at the
disengage threshold — a named invariant, one shared constant.

## Q5: The tilt-ceiling curve (and looking up at the sky)

**The question:** No published reference exists — Cesium ships tilt
unrestricted; Google Maps publishes no formula. Designed feel parameter. The
initial `TILT_MAX ≈ 85°` proposal failed the user's test "does this allow us to
look up at the sky?" — tilt is measured from nadir, so 85° is still below the
horizon.

**Considerations:**

- Sky-looking cannot come from the target-orbit tilt gesture (orbiting past 90°
  about a ground point puts the camera underground). It is rotation about the
  **eye** (free-look), which pose+basis handles trivially and the feel probe
  proved out (tilt past horizon, eye pinned, heading live while pinned).
- The probe's nadir-degeneracy finding (defect 3) is solved structurally by Q2's
  stored basis; only the heading _readout_ needs Cesium's escape (within ~0.08°
  of vertical, heading from the up vector's horizontal components, roll ≡ 0).

**Decision:** **One altitude-dependent tilt ceiling, two gesture routes under
it.** `maxTilt(h/R)`: 180° at ground level (sky to zenith, reached via look
mode) closing smoothly to 0° at the disengage band. Hard invariant:
`ceiling ≡ 0 at REGIME_DISENGAGE_HR` (the Q4 identity). `LO`, interpolation
shape, and where the curve crosses 90° are explicitly feel-tunable. Zoom-out
from a sky view degrades gracefully via per-step HPR recapture + the closing
ceiling.

## Q6: Regime discriminant and band

**The question:** What decides "we're in the surface regime", and where is the
band? Cesium has no frame handoff (ECEF world); its three behavioural altitude
bands (~150 km terrain picking, ~15 km collision, ~7500 km trackball) are
absolute metres and rated do-not-copy as such.

**Considerations:**

- **Currency:** `h/R` (body-independent) vs angular size — nearly degenerate at
  fixed FOV; `h/R` chosen.
- **Band placement:** the FW-E perceptual values (0.0189/0.0378 R = 120/241 km)
  answered "when does ground drift need pinning" — but under the pivot the
  regime is the whole interaction model (anchored globe-drag, cursor zoom), and
  that model is what Google Earth gives at full-globe view. User: the handoff
  should be far up, while the whole Earth is still in view.
- **Trade stated:** engaging high means Earth stops visibly rotating once
  engaged (camera co-rotates, geostationary hover; under a fast clock the sun
  and stars sweep instead). "Planetarium Earth" lives above the band.

**Decision:** `h/R` discriminant, **engage ≈ 1.7 R altitude (~11,000 km, Earth
comfortably full-frame), disengage ≈ 3.4 R**, 2× hysteresis, both feel-tunable.
Two rules regardless: **no regime flip during an active gesture** (latch at
gesture start), and **one state, one consumer** — the boolean feeds the frame
provider and nothing else, with a test asserting the single consumer. FW-E's
derivation survives only as a sanity check (drift at the flip must be
imperceptible at real-time rate — trivially true this high).

## Q7: Rotation handoff — hard flip or blended?

**The question:** The pose is exactly continuous across the boundary; the one
discontinuity is which way the frame moves (outside: Earth rotates, camera
inertial; inside: ground nailed, sky sweeps).

**Considerations:**

- **H1 (hard flip):** only observable is drift onset/cessation — far below
  perception at the 3.4 R band at real-time rate; visible under an accelerated
  clock as spin freezing/unfreezing.
- **H2 (smoothstep the co-rotation _rate_ over ~1 s):** +1 continuous state;
  pose still never tweens.
- **H3 (user toggle):** rejected — knob proliferation is OpenSpace's named
  failure.

**Decision:** **H1 first; measure under an accelerated clock; spend H2 only on
adverse evidence.** H2 recorded as the bounded escalation path in the spec.

## Q8: Inertia/coast

**The question:** None, or Cesium's flick-only form? (A velocity/friction model
is off the table regardless — OpenSpace's documented bug factory.)

**Decision:** **None for the first landing.** If feel demands it later, the only
acceptable shape is Cesium's flick-only synthetic-replay form with cross-cancel
and no persistent velocity. Written now, zero LOC: a coast, if ever added,
replays in the **body-fixed frame** (ground-fixed, not inertial).

## Q9: MapLibre's pole "dial" band

**The question:** MapLibre special-cases drags within ~12° of a pole to preserve
bearing for a north-up map. Port it?

**Decision:** **No.** skymap has no north-up constraint; drag over the pole is
an ordinary rotation with a near-equatorial axis (probe-confirmed pole-free).
Only the heading readout needs the Q5/2d fallback. Revisit only on complaint.

## Q10: Tour/clip/tween endpoints near a body

**The question:** Keyframes today interpolate in absolute Mpc — wrong the moment
the sim clock moves (Earth rotates out from under a stored keyframe). The
research comparison's highest-expected-value prediction (OpenSpace's open-since-
2023 equivalent). Fix in this pivot, or leave with the seam shaped for later?

**Considerations:**

- **Option A (out of scope, seam-shaped):** requirement paragraph, no code;
  named backlog debt.
- **Option B (convert now):** drags tour recorder, clip format, and tween
  drivers into the spec — but kills the debt at the same moment the frame
  machinery lands.

**Decision:** **B — convert in this pivot.** The endpoint format grows a frame
discriminant (`absolute` vs `body:<id>`); near-body keyframes store body-fixed
local coordinates; interpolation runs in the endpoint's own frame; deep-space
keyframes stay absolute-Mpc.

## Q10b: Serialization (URL hash, saved state)

**The question:** Same treatment for the serialized camera? A surface pose
serialized as absolute Mpc throws away everything the pivot bought (OpenSpace's
admitted-broken nav-state round trip; the URL hash is already a known landmine).

**Decision:** **Yes.** The serialized form names its frame, same discriminant as
Q10 keyframes: near-body poses serialize body-relative (body id + local pose),
deep-space poses absolute. Untagged legacy hashes parse as absolute — existing
links behave exactly as today.

---

## S1: Ratify slab Q1 — the two-provider pose seam

**The question:** The paused slab grill proposed an anchor-relative camera-pose
provider seam: (A) derived body-relative pose from the heliocentric f64 camera
(~14 µm floor — fine above the band), (B) natively body-fixed pose (~nm floor).
"A is not a stepping stone B replaces — B keeps A."

**Decision:** **Ratified.** Under this grill's decisions the structure is a
restatement: provider B _is_ the pivot's surface state (inside the band),
provider A _is_ the conversion of the world-orbit pose (outside), the Q6 boolean
selects, both produce the same value at the flip. The slab consumes one
interface ("give me the body-relative pose") and never does Mpc math itself.

## S2: Precision depth target — the anchor is state, now

**The question:** The slab grill proposed success = rock solid at 1.7 m eye
height, with sub-µm regimes deferred as a "future anchor parameter."
Recommendation was to ratify; **user overruled: deeper zoom anchors are
important now — "I don't want to redo this."**

**Considerations:**

- Body-centre storage quantizes at ~nm (f64 at Earth-radius magnitude),
  supporting rock-solid rendering to roughly µm view scale and no further.
- None of the three globe references does camera-state re-anchoring (Cesium:
  plain ECEF f64, stops at 1 m zoom; OpenSpace: absolute doubles, stops at
  ~10 m). The technique comes from the floating-origin lineage in game engines
  (KSP krakensbane, Star Citizen zones, Unreal world rebasing) — used when one
  engine must hold across many orders of magnitude.
- Content caveat stated: state-side precision becomes unbounded, but deep-zoom
  _content_ still needs data authored near the anchor. The camera stops being
  the blocker forever; data becomes the only frontier.

**Decision:** **Anchor in the state vector, in this spec and implementation.**

```ts
type SurfaceCameraState = {
  bodyId: BodyId;
  anchorLocal: Vec3; // body-fixed anchor point; (0,0,0) = body centre
  eyeRelAnchor: Vec3; // small magnitude near the anchor → floor shrinks with zoom
  basisLocal: Mat3;
};
```

Plus a designed **re-anchor** operation (floating-origin shift: move anchor
toward the eye, subtract the same delta — exact by construction). Provider seam,
serialization (Q10b), and the slab rebase all speak anchor + offset from day
one. First landing runs with anchor = body centre until zoom depth triggers
re-anchoring.

## S3: Units — metres

**The question:** km (matches `SCALE_UNITS.KM_TO_n` and registry radii) or m?

**Decision:** **Metres — user: "it is an SI unit after all."** Everything in the
surface path (state, gestures, slab uniforms) is SI metres, f64 on the CPU. Body
radii convert from the km-based registry at one named site; the Mpc seam gets
one `M_TO_n`-style constant, single-site, grep-tested. GPU safety is unit-
independent: uniforms are rebased camera-relative before the f32 narrow.

## S4: What rides the body slab — near-body generic, all bodies, first landing

**The question:** Slab contents. Initial recommendation: Earth-owned content
only (tiles, base globe, atmosphere, clouds, glint), Moon/Sun stay NEAR0, Earth-
specific per the old slab-grill Q2 ruling.

**Considerations (user-driven evolution):**

- User: include **all planets and moons** (not stars) — zoom must generalize to
  them, and they have atmospheres too; one parameterized atmosphere
  implementation, not one per slab arrangement.
- User: the **first landing renders all planets and moons through the slab
  path** — Earth-only-first would leave two live planet-rendering paths, the
  parallel-path smell the design exists to kill.

**Decision:** **Body-slab family, near-body generic — supersedes the old slab
grill's "Earth-specific" ruling.** Each rendered body draws in its own
body-fixed metre frame, constants from the body registry. Atmosphere, base
globe, clouds, glint written once, body-parameterized. Sun and stars stay out
(Sun keeps its bloom path). First landing: all planets and moons ride the slab
(the incumbent sphere path is deleted); Earth is simply the only body with a
tile source in its registry row. The dividing rule: geometry expressed in a
body's frame rides that body's slab.

## S5: Slab activation — none; the slab is the only path

**The question:** When does a body get its slab pass, and how does it hand off
from the far representation? Options considered: angular-size activation with a
same-pixels hard switch; MapLibre-style crossfade (rejected — a second parallel
path that hides drift); always-on.

**Decision:** **A visible body always renders through its slab, at every
distance. No activation threshold, no handoff, no crossfade** (user
simplification). Pass count is bounded by visibility culling; a sub-pixel body
is a very small slab draw. If distant planets need a minimum on-screen size to
stay findable, that clamp is the slab's own far-regime behaviour — a parameter
of the one path, not a second path. Consequence: the only discriminant in the
entire design is the camera's `h/R` regime boolean.

## S6: Cross-slab occlusion

**The question:** Body slabs have private depth buffers in private metre frames;
NEAR0/COSMO have theirs in Mpc. Earth in front of the Sun, Moon in front of
Earth — who wins which pixel?

**Considerations:**

- **Option A (depth-range sort + painter's compositing):** bodies and the Sun
  never interpenetrate — every pair is separated by distances vastly larger than
  their radii — so per-pixel cross-slab depth solves a problem that cannot
  occur. Each pass declares its camera-distance interval; intervals are disjoint;
  composite back-to-front. Assertion fires if intervals ever overlap.
- **Option B (shared depth via re-projection):** the precision minefield the
  slabs exist to escape.

**Decision:** **A.** Exact for disjoint bodies, costs nothing, never touches
depth-precision hell.

## S7: Tile planner goes slab-native

**The question:** `prepareEarthFrame` + the tile planner currently work from the
world-Mpc camera through the ad-hoc rebase — the frame where the false-negative-
cull family lived (z14–19 tile vanish).

**Decision:** **Yes — planner slab-native, Mpc-free.** Planner consumes the
body-local metre pose directly (eye, frustum, horizon test in body-fixed
metres), body-parameterized; Mpc never enters the tile pipeline. The
descent-island known issue (parked "re-check after Plan 2") becomes re-checkable
in a clean frame where its suspects are no longer confounded by precision.

---

**Next:** refactor-ground over this shape (ideal diff, growth/bolt-on verdicts,
prep list, PR-packaging ask), then **two sequenced specs — spec 1: body render
slabs (consuming provider A), spec 2: camera pivot (introducing provider B)** —
each written against the post-refactor architecture.

---

## Addendum — post-checkpoint rulings (2026-08-25)

Refactor-ground ran 2026-08-24/25 (seam maps + ideal-diff + greenfield
cross-check); rulings taken at and after its checkpoint:

- **T1 (radii units):** authored registry radii MIGRATE to `radiusM` (SI metres).
  Boundary: baked wire rows (`FamousStarRow`, tools/ bake outputs) stay
  `radiusKm`, converted once at their ingestion site — no data re-bake.
- **Packaging:** prep P1–P4 (SlabFrame discriminant, frameProgram builder,
  step-level depth load-op, M↔Mpc units + radiusM migration) land as a
  **separate PR off main**, before spec 1's feature commits.
- **T4 (keyframes):** minimal channel-based endpoints + `PoseFrame` tag (spec 2);
  the greenfield `FramedPose` rewrite of the animation system is declined.
- **T2 (camera state union vs both-states-synced):** deferred to spec 2.
- **S5 refinement (glints):** `bodyGlintsLayer` stays one shared NEAR0/hdr
  additive pass — light emission, not body geometry; the sphere↔glint partition
  remains the single presentation seam. S5's min-size clamp recorded as a
  slab-row parameter for later.
- **S6 refinement (invariant wording):** literal always-disjoint intervals is
  too strong (Jupiter+Io overlap at quadrature); the binding invariant is
  **screen-overlapping pairs must have disjoint intervals** — what the painter
  actually needs, guaranteed by non-interpenetration along a shared ray.
- **S4 reading:** "incumbent sphere path deleted" = bodies; `composeBodyMvp`
  survives narrowed to star spheres (S4 keeps stars out of body slabs).

Spec 1: `docs/superpowers/specs/2026-08-25-body-render-slabs.md`.
