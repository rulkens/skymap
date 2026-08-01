# Orbit-trail ribbon impostor — bound the conic test to the stroke

**Status:** approved design, awaiting plan
**Predecessor:** `specs/completed/2026-07-11-conic-orbit-trails.md` (the conic
approach this spec optimises; its math and fragment shader are unchanged)
**Benchmark:** `npm run perf -- --scenario galactic-centre` (added 2026-07-31,
this branch)

> **Amendment (2026-08-01) — shipped design differs from what follows.** This
> spec is preserved as the record of what was proposed; the plan's
> `Amendment (2026-08-01) — the fallback is eliminated, not tolerated` and
> `Amendment 2 (2026-08-01) — CPU closed-form visible arc; fold geometry
> deleted` carry the full history. Superseded passages below are marked
> inline. In short: `ribbonEligible` and the fullscreen-fallback pipeline are
> gone (every orbit takes the ribbon path, one pipeline, one draw count); the
> analytic gradient minors (`minorS`/`minorT`) are gone (the fragment
> measures its stroke gradient with `dpdx`/`dpdy`); the record shipped as
> **34 floats / stride 136**, not 40/160, with the closed-form visible arc
> `arc = [eStart, eSpan]` at `@location(9)` — added because clip-w along an
> orbit is a sinusoid in eccentric anomaly, so the in-front-of-camera part is
> always a single interval, decidable once on the CPU.

## 1. Problem

The conic orbit-trail renderer draws every visible orbit as a **fullscreen
triangle** and lets the fragment shader discard off-stroke pixels. That was the
right call at ≤8 simultaneous orbits (the predecessor spec's §6 premise), but
PR #528 grew the table to 60 rows, 39 of which (the S-stars) are simultaneously
visible near Sgr A\*. Measured at the `galactic-centre` scenario:

- orbit-trails ≈ **7.6 ms real** per frame (floor-subtracted per-layer), the
  largest single layer cost in the scene;
- the `hdr·NEAR0` slot doubles (3.9 → 7.6 ms) when the trails engage, and the
  sweep classifies it **fill-bound, exponent 0.94** — cost is
  `instances × viewport pixels`, independent of on-screen orbit size.

The fragment test itself is fine; the waste is _where it runs_. A stroke
covers ~perimeter × width pixels — for a 500 px orbit that is ~13 k pixels,
not the 5 M the fullscreen triangle rasterizes.

## 2. Design

Rasterize each bounded orbit as a **screen-space ribbon** that hugs the
projected ellipse; keep the fullscreen triangle as a per-instance fallback for
unbounded projections. The fragment shader — `Ginv` back-projection, Sampson
distance, gradient minors, Newton horizon rejection — is **unchanged in both
paths**; the impostor only changes which pixels invoke it. Coverage must be
conservative: every pixel the stroke could touch lies inside the ribbon.
(Amended 2026-08-01: the gradient minors did not survive — see the amendment
at the top.)

### 2.1 The clip-space basis — why no VP bind group is needed

The world ellipse is `X(E) = C + A·cosE + B·sinE` (predecessor spec §3.1).
Projection is linear in homogeneous coordinates, so

    clip(E) = Cc + cosE·Ac + sinE·Bc,   with Cc = VP·C̃, Ac = VP·Ã, Bc = VP·B̃

Three `vec4`s fully describe the projected curve. They are composed on the CPU
in f64 (same seam as `Ginv` — the f64-vs-f32 cancellation landmine in
`composeOrbitConic`'s header), then narrowed: clip-space magnitudes are O(1),
safe in f32. The renderer keeps its deliberate no-bind-group design.

Hull precision is forgiving where stroke precision was not: a ribbon vertex
off by a pixel only shifts the _coverage bound_, absorbed by the margin
(§2.2). The stroke itself still comes from the f64-hoisted fragment math.

### 2.2 Ribbon generation (vertex shader, no mesh buffer)

Same idiom as the current fullscreen triangle: geometry from
`@builtin(vertex_index)`, no position VBO.

- `SEGMENTS` uniform steps in eccentric anomaly `E` (E-parametrization
  clusters samples toward periapsis where curvature concentrates).
  `vertex_index` → (segment `i`, corner) for a triangle-list of
  `SEGMENTS × 6` vertices per instance.
- Per sample: `p = clip(E_i)`; tangent `dp/dE = −sinE·Ac + cosE·Bc`
  projected to NDC; offset the two ribbon edges perpendicular to the NDC
  tangent by `±(STROKE_PX + sagitta_i + MARGIN_PX)` (converted to clip via
  `p.w` and viewport). Width is exact in pixels at every depth — no
  world-space tube radius, no per-vertex depth scaling.
- `STROKE_PX` is the fragment's ONE existing stroke constant (discard radius
  and feather range both) — it moves to a shared `orbitTrail` WESL constants
  module so vertex and fragment read one definition (a copied constant here
  would drift silently).
- The chord sagitta scales with the projected radius (~5 px at a 10 k px
  close-up orbit), so it cannot be a constant: it is computed **per sample**
  in the vertex shader from a second difference of the neighbouring samples.
  `MARGIN_PX` then covers only f32 vertex noise and the per-vertex-normal vs
  chord-normal mismatch — a couple of px.

### 2.3 Ribbon-eligibility classification (CPU, per orbit, per frame)

> **Amended 2026-08-01:** this whole section is deleted. There is no
> eligibility predicate and no fullscreen fallback — every orbit takes the
> ribbon path. See the amendment at the top.

`composeOrbitConic` assembles no explicit conic coefficients (the screen conic
is implicit through `Ginv`), so the test reads straight off the clip basis
instead of a discriminant. The projection is an ellipse iff the whole curve
stays strictly on the camera side of the `w = 0` plane:

    boundedProjection ⇔ Cw − hypot(Aw, Bw) > ε        (f64, from the clip
                                                        basis of §2.1)

— mathematically equivalent to the discriminant sign, with a margin so f64
noise cannot flip the verdict at the boundary. A second clause guards the
near-degenerate-but-still-bounded case, where the projection is so large on
screen that the ribbon (perimeter × width) would cost MORE than the
fullscreen triangle it replaces: a screen-extent bound on the projected
ellipse folds both clauses into one `ribbonEligible` verdict.

Ineligible instances take today's fullscreen path, bit-for-bit. Flying
through an orbit costs one fullscreen instance; the other 38 stay cheap. The
check is a handful of f64 flops beside the Kepler solve the layer already
does per orbit.

### 2.4 Data + draw structure

> **Amended 2026-08-01:** the block below describes the proposed 40-float /
> stride-160 record with a ribbon/fallback partition and two pipelines. None
> of it shipped. The actual record is **34 floats / stride 136**:
> `ginv0/1/2` (locations 1..3), `params`, `phase` (4..5), the clip basis
> `cc`/`ac`/`bc` (6..8, no `minorS`/`minorT`), and the closed-form visible
> arc `arc = [eStart, eSpan]` (`float32x2` at location 9). One production
> pipeline, one instance VBO, one draw count — see `io.wesl`'s
> `OrbitInstance` for the authoritative table.

```
INSTANCE_FLOATS 28 → 40   (+ Cc, Ac, Bc at locations 8..10, offsets 112/128/144;
                           stride 160; layout mirrored in vertex.wesl as always)
composeOrbitConic returns { ginv, minorS, minorT, clipBasis, ribbonEligible }
orbitTrailsLayer pack loop: ribbon-eligible records from the front of `staging`,
                            fallback from the back; both counts to the renderer
orbitTrailRenderer: ribbonPipeline + fullscreenPipeline, ONE fragment module,
                    ONE instance VBO; draw(pass, instances, ribbonCount,
                    fallbackCount) issues ≤2 instanced draws
```

Everything else — CULL_PX/FULL_PX gating, fades, additive/depthless profile,
`enabled()` region cull, buffer growth — is untouched.

## 3. Ground preparation

**None needed.** Refactor-ground pass run 2026-07-31: every touchpoint is
growth at an existing seam — `composeOrbitConic` already returns a record;
the instance-layout contract (`INSTANCE_FLOATS`/attributes/`vertex.wesl`) is
the established convention; the second pipeline shares the fragment module
inside the one renderer file; the pack partition is local to the layer. The
choice of a screen-space ribbon over a 3D tube mesh is what keeps it that way
— a tube would force a VP bind group onto a renderer that deliberately has
none.

Measurement scaffolding (rides this PR as its own commits, already on the
branch): the `galactic-centre` scenario, `PerfPose.clearFocus` (the harness
pivot-pin fix), and `clearFocus` on `milky-way-outside`/`milky-way-close`
(which had silently measured an Earth-pinned framing; baselines before
2026-07-31 are not comparable for those two — re-baselined at 21.4 / 22.7 ms).

## 4. Acceptance

- `galactic-centre`: orbit-trails real cost **< 1.5 ms** (from 7.6), merged
  `hdr·NEAR0` back near its trails-off level; measured before/after with the
  same flags, 30+ frames.
- `solar-system`: no regression beyond run-to-run noise (~0.5 ms).
- Visual parity at: solar-system planet view, Moon orbit close-up, S-star
  cluster, and the edge-on Earth-zoom pose from
  `docs/backlog/2026-07-18-orbit-trail-residual-speckle.md` — edge-on is where
  the ribbon is thinnest, so coverage gaps would show there first. The speckle
  itself is pre-existing and out of scope (fragment math unchanged).
- Camera inside an orbit (fallback path): trail renders exactly as today.
  (Amended 2026-08-01: there is no fallback path; a camera inside an orbit
  draws that trail as an open-arc ribbon like every other orbit.)

## 5. Tests

> **Amended 2026-08-01:** `ribbonEligible` and the ribbon/fallback partition
> below were deleted with the design that produced them (see the amendment
> at the top). The shipped tests instead pin the closed-form visible arc
> (`arc = [eStart, eSpan]`) and the 34-float record's name/location/offset
> contract.

- `composeOrbitConic`: clip basis reprojects sample ellipse points onto the
  known screen conic; `ribbonEligible` flips only when the orbit plane
  approaches the camera or the projection outgrows the screen-extent bound
  (far view → true, in-plane view → false).
- Renderer: partitioned draw issues ribbon draw for the bounded count,
  fullscreen draw for the fallback count, each skipped at 0; count-vs-array
  guard covers the widened record.
- Layer: pack order (bounded front / unbounded back) and both counts reach the
  renderer; existing gating/fade tests continue to pass with the wider record.
- No screenshot tests (house rule); visual passes are user-verified.
