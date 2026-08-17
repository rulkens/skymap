# Grill Session: Analytic sphere primitive for body rendering — 2026-07-28

Source: investigation of `docs/backlog/2026-07-24-atmosphere-limb-transparent-seam.md`,
which began as "raise the vertex count a bit" and escalated once the seam's mechanism
was pinned down. Spike proven and visually confirmed at `e4bd0dbb`, gated behind
`?impostor`.

Goal: replace the tessellated UV-sphere silhouette for sphere bodies with a ray-traced
analytic sphere, so the drawn edge is pixel-exact and matches the analytic radius the
atmosphere shell already tests against. This session decides which renderers convert,
how far oblateness comes along, and what happens to the mesh path.

---

## Context: two corrections made during the session

Both are recorded because they changed the shape of the work.

**"Four renderers" was wrong — there are five.** `earthRenderer` is separate from
`texturedBodyRenderer` (Earth's atmosphere and specular path diverge). Earth was
accidentally scoped out of the analysis for most of the session.

**The `camPosLocal` oblateness parameter was speculative prep.** It was presented as a
required prep item on the grounds that it "fixes a live error in the Minnaert view
vector for oblate stars." That is false: `starRenderer`'s fragment is
`u.tint * EMISSIVE` with zero varyings and no camera uniform, so stars never call
`camPosLocal` at all. Every renderer that does call it passes oblateness 0. The frame
mismatch is real arithmetic that affects nothing today. Caught by the user; withdrawn.

---

## Q1: Does `earthRenderer` convert in this feature?

**The question:** Earth is the most-viewed body and would benefit most from an exact
silhouette. It is also the only renderer where the surface, cloud shell, and atmosphere
shell must all agree about where the limb is. Does it convert now, later, or not at all?

**Considerations:**

- **Option A (include Earth, sequenced last):** Highest payoff — Earth is what users
  look at. Sequencing it after textured bodies and pick would let the shared module
  prove itself somewhere simpler first. Risk: it is the most complex renderer in the
  set, and the cloud shell interacts with the same limb.
- **Option B (leave Earth on the mesh):** Much smaller feature, no interaction with the
  cloud shell. Cost: Earth becomes the only body still showing the transparent limb
  seam after the feature ships.

**Decision:** Option B — Earth stays on its own renderer and its own mesh.

The deciding factor is external to this feature: a deep-zoom Earth surface effort is in
flight (`project_earth_surface_virtual_texture`, texture-only virtual texture behind a
provider seam) and genuinely needs its own renderer. Converting `earthRenderer`
concurrently would collide with that work.

Consequence accepted: Earth keeps the seam until its new renderer lands. That new
renderer is a likely third consumer of `lib/analyticSphere.wesl` — a renderer built for
zooming into a surface wants an exact silhouette more than any other — which
strengthens rather than weakens the case for extracting the module.

---

## Q2: How far does oblateness scope go?

**The question:** `composeBodyMvp` supports flattening and six famous stars use it (up
to 0.35 on Achernar). Saturn's real flattening is 0.098 and it currently renders as a
perfect sphere. Does this feature touch oblateness at all?

**Considerations:**

- **Option A (full oblateness):** Add the `camPosLocal` frame parameter, add
  ellipsoid-normal correction (`normalize(p.x, p.y, p.z/c²)`), and actually flatten
  Saturn and Jupiter. Correct-looking gas giants. But flattening a body reopens the
  atmosphere shell question: `bottomRadius` is a scalar ratio and the entire
  Bruneton/Hillaire LUT model assumes spherical symmetry, so an oblate body against a
  spherical shell puts a 10% radius mismatch at the poles — the limb seam again at
  fifty times the scale. Workable only by flattening the shell proxy by the same
  factor, which is more plumbing and more risk.
- **Option B (frame parameter only):** Fix `camPosLocal` to know about flattening,
  without flattening anything new. Unblocks `starRenderer`. But nothing visible
  changes, so it is prep for a feature nobody has committed to.
- **Option C (hold entirely):** No oblateness work of any kind.

**Decision:** Option C — hold oblateness entirely.

This removes from scope: the `camPosLocal` parameter, ellipsoid normals, flattening
Saturn and Jupiter, the `*Local` family rename, and reopening the atmosphere shell's
scalar `bottomRadius`.

**Non-obvious consequence:** holding oblateness also blocks `starRenderer` (see Q3).

---

## Q3: Does `starRenderer` convert?

**The question:** A star sphere is uniformly emissive, so its silhouette carries _all_
the shape information — no texture, no shading, no terminator. A 48-sided polygon
against black space is where faceting reads worst, and the Sun is a body you can fly
right up to. Strong case for converting. But it is also the most awkward renderer in
the set: no camera uniform, zero varyings, uniforms built inline rather than through a
packer, and a known same-frame buffer race.

**Considerations:**

- **Option A (convert):** Best silhouette payoff per body after Earth. Requires a new
  `packTintedSphereUniforms`, a `camPosLocal` field star does not currently have, and —
  critically — the oblateness frame fix.
- **Option B (convert only the round stars):** The Sun has no oblateness, so it could
  convert while the six flattened stars stay on the mesh.
- **Option C (stay mesh):** No work, no risk.

**Decision:** Option C — `starRenderer` stays on the mesh, derived from Q2.

Converting star without the `camPosLocal` fix would visibly break the six oblate stars.
The fragment intersects a unit sphere in local space using `camPosLocal` as the ray
origin; for Achernar (oblateness 0.35) that origin's Z is wrong by a factor of
`1/(1−0.35)`, a 54% error along the polar axis. The result is not a slightly-wrong
ellipse but a badly-wrong one. So star conversion _requires_ the oblateness work, and
holding oblateness holds star.

Option B is explicitly rejected as the trap this whole refactor-ground pass exists to
catch: branching on oblateness inside one renderer is the second-special-case pattern.

**Carried forward:** "convert `starRenderer`" and "flatten Saturn and Jupiter" are now
a _single_ backlog item, not two, because neither can happen without the `camPosLocal`
frame fix.

---

## Q4: Does `planetRenderer` convert?

**The question:** `planetRenderer` draws the `flat` partition — bodies with no
committed surface texture, in one instanced draw with no bind groups at all (explicit
empty pipeline layout). Converting it would need a per-instance ray origin, which means
a new per-instance attribute and a model matrix reaching the fragment.

**Considerations:**

- **Option A (convert):** Consistency — every sphere body drawn the same way.
- **Option B (stay mesh):** No per-instance camera plumbing.

**Decision:** Option B — stays mesh, and likely permanently.

Checked against the texture registry: the registry covers mercury, venus, earth, mars,
jupiter, saturn, uranus, neptune, moon, io, europa, ganymede, callisto. The only bodies
in `SCENE_PLANETS` _not_ covered are **Phobos and Deimos** (radii 11 km and 6 km).
Everything else this renderer touches is a transient loading state before a bitmap
arrives.

So converting `planetRenderer` permanently buys a smooth silhouette on two bodies that
are almost always sub-pixel — and both of which are famously potato-shaped in reality,
so a mathematically perfect analytic _sphere_ is arguably the wrong primitive for them
regardless.

---

## Q5: Does `bodyPickRenderer` convert, or keep a mesh at finer tessellation?

**The question:** The pick silhouette must agree with the drawn silhouette or a click
near a body's limb resolves against an edge that is not where the pixel is. This is
already live and broken: with `?impostor` on, the drawn edge is exact while the pick
edge is still the polygon 0.214% inside it, leaving a hairline ring that looks like the
planet but does not respond to clicks.

**Considerations:**

- **Option A (convert to analytic):** `SpherePickUniforms` grows 80B → 96B for
  `camPosLocal`, `fsPick` writes `frag_depth`, shares `lib/analyticSphere.wesl`. Pick
  and visual compute the same silhouette from the same code and cannot drift. The pick
  pass is the cheapest place in the renderer to pay for `frag_depth` — a tiny on-demand
  pass, a handful of bodies, no shading, so the lost early-Z costs nothing that matters.
- **Option B (raise the pick mesh alone to 256×128):** Mismatch drops to 0.0075%,
  sub-pixel at any reachable zoom, so no user can land a misclick. One constant. But two
  notions of the silhouette still exist and can silently drift apart again. Also inverts
  the stated rationale of `src/data/bodies/sphereTessellation.ts` (merged in #510),
  whose whole purpose is pick and visual sharing one tessellation.

**Decision:** Option A — convert.

"Identical by construction" beats "close enough by a tuned number". Option B pushes the
drift class below the noise floor rather than removing it, and the cost argument that
usually favours a mesh does not apply in a pass this cheap.

Note either option changes `sphereTessellation.ts` again: under A the constant stops
describing the visual silhouette and becomes proxy-geometry-only.

---

## Q6: Does the mesh path survive as a fallback?

**The question:** The spike is gated behind `?impostor`. On adoption, does
`texturedBody/{fragment,vertex,io}.wesl` get deleted, or does the gate invert to
`?mesh` and keep an escape hatch?

**Considerations:**

- **Option A (delete):** One code path. The `ringSunVisibility` helper, currently
  duplicated verbatim between `texturedBody/fragment.wesl` and
  `impostorFragment.wesl`, collapses to a single copy — which the spike's own comment
  anticipates. Future body-shading changes are made once.
- **Option B (keep behind `?mesh`):** Escape hatch on hardware that cannot be tested
  locally. This codebase has been bitten by WebKit being stricter than Tint, and the
  impostor uses `frag_depth`, `textureSampleGrad`, and derivatives-before-discard — all
  places a stricter implementation could differ.
- **Option C (delete, but as a follow-up PR after iOS exposure):** Ship inverted to
  `?mesh`, confirm on iOS, then delete.

**Decision:** Option A — delete.

The iOS risk was raised and the user chose deletion anyway. A fallback nobody exercises
is a fallback that rots, and two paths means every future change to body shading is made
twice or silently diverges.

**Mitigation folded into the plan:** iOS verification is a gate _before_ the feature PR
merges, so the fallback is not removed on untested hardware. It is a sequencing
requirement, not a code artifact.

Note the mesh does not fully disappear: the impostor still uses `uvSphereMesh` as its
1.05× circumscribing proxy. Only the shading path goes.

---

## Q7: Q5 and Q3 don't compose — does the pick conversion need the `camPosLocal` fix after all?

**The question:** Q5 decided `bodyPickRenderer` converts to analytic. Q3 held
`starRenderer` on the mesh, on the strength of Q2 holding oblateness entirely. Those two
decisions were made independently and do not compose the way the session assumed:
`bodyPickRenderer` is **one** renderer serving every body type, star included.
`starSpheresLayer.ts:126` passes `star.oblateness` into `composeBodyMvp` for the draw,
and `starSpheresLayer.ts:178` passes the same `star.oblateness` into
`drawFlooredSpherePick` for the pick — the comment at line 146 states the pick
silhouette matches the draw precisely _because_ of it. Converting the pick to analytic
therefore converts it for oblate stars regardless of what `starRenderer` does on the
visual side. Six famous stars carry non-zero oblateness, up to 0.35 on Achernar, and an
analytic pick whose ray origin ignores flattening is wrong by `1/(1 − oblateness)` along
the polar axis — 54% for Achernar. The failure is **silent**: the star still draws
correctly through the mesh `starRenderer`, while clicks near its limb resolve against a
shape that is nowhere on screen. Does the pick conversion take the `camPosLocal`
oblateness parameter back into scope?

**Considerations:**

- **Option A (give `camPosLocal` an optional `oblateness` parameter, default 0):** One
  line in one pure util — divide the local z by `1 − oblateness` — plus a test, plus one
  extra argument at the single call site in `drawFlooredSpherePick`, which already
  receives `oblateness` today. The four existing callers pass nothing and get the
  identical result back, so nothing already shipped changes behaviour. Fixes the six
  stars for the same reason Q3 diagnosed the break in the first place.
- **Option B (revert Q5 to its Option B — raise the pick mesh to 256×128):** Removes the
  need for an analytic ray origin entirely, so the composition problem cannot arise. But
  this is exactly the two-notions-of-the-silhouette outcome Q5 rejected: pick and visual
  would drift again, just below today's noise floor instead of at it.
- **Option C (convert the pick but drop `oblateness` from the ray origin):** No new
  parameter, no new scope. But it makes the pick shape wrong for the six oblate stars in
  the _other_ direction — a stretched sphere instead of a squashed one — trading one
  silent misalignment for another.

**Decision:** Option A.

This does **not** reopen the Q2 oblateness hold. Nothing new is flattened, no ellipsoid
normal appears anywhere, and the atmosphere shell's scalar `bottomRadius` is untouched —
none of the three things Q2 actually dropped. It is a correctness precondition of scope
already decided at Q5, not the deferred oblateness feature, and all four existing
`camPosLocal` callers stay byte-identical via the default.

Worth recording honestly, since this parameter has a history in this session: it was
first proposed as prep on a justification that turned out to be **false** (a claimed
Minnaert-view-vector error for oblate stars — `starRenderer`'s fragment is
`u.tint * EMISSIVE` and never calls `camPosLocal` at all, see "Context" above), and was
correctly withdrawn there. It returns now for a different reason: Q5's pick conversion
gives it a real consumer for the first time. This is a new justification, not a reversal
of the earlier withdrawal.

**Consequence:** once this lands, the deferred "convert `starRenderer` + flatten Saturn
and Jupiter" backlog item is no longer gated on the `camPosLocal` frame fix — that fix
will already exist. What remains gating that item is ellipsoid normals,
`packTintedSphereUniforms`, and flattening the atmosphere shell proxy.

---

## Resulting scope

**Converts:** `texturedBodyRenderer`, `bodyPickRenderer`
**Stays mesh:** `earthRenderer` (Q1), `starRenderer` (Q3), `planetRenderer` (Q4)

**Ground preparation — two items:**

| item                                             | status                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| extract `lib/analyticSphere.wesl` from the spike | keep — two consumers immediately, Earth's new renderer likely third                               |
| `camPosLocal` oblateness param, default 0        | keep — Q7: the pick conversion (Q5) needs it for six oblate stars; not a reopening of the Q2 hold |
| ~~`packTintedSphereUniforms`~~                   | dropped — star not converting (Q3)                                                                |

**Packaging:** one prep PR containing both items, merged; then feature PRs stacked on
main afterwards. Prep, adjacent cleanup, and feature stay three separate diffs.

## Deferred to backlog

- `starRenderer` conversion + Saturn/Jupiter flattening — one item, both gated on the
  `camPosLocal` frame fix.
- In-atmosphere haze: the shell cannot render over the disc when the camera is inside
  it, because a proxy shell has no geometry in front of the planet. Needs a full-screen
  pass, which is the first half of Hillaire's aerial-perspective froxel.
- `starRenderer`'s single-uniform-buffer same-frame race.
- Analytic equirect UV degrades mip quality at the poles (`v = asin(z)/π` has unbounded
  derivative there). Inherent to the approach, not fixable with the wrap trick.
- `planetRenderer`'s `MAX_PLANETS = 24` cap.
