# Accurate orbit trails via screen-space conic projection — design

> **Status.** Approved approach (user-ratified 2026-07-10, brief in
> `docs/backlog/2026-07-10-conic-orbit-trails.md`). This spec + its plan
> (`docs/superpowers/plans/2026-07-11-zoom-to-earth-04-conic-orbit-trails.md`)
> **supersede that backlog detail file** — the controller deletes it when this
> lands. Executes AFTER zoom-to-Earth plan 03, on the same branch/PR.
> **Date.** 2026-07-11.
> **Relationship to prior work.** Replaces the interim circle-SDF orbit rings
> shipped as the plan-02 debug affordance (PR #425). Consumes the zoom-to-Earth
> precision architecture (`f64` NEAR0 slab, compose-then-narrow) unchanged.

## 1. What we're building

The zoom-to-Earth foreground draws three guidance orbits — Earth around the
Sun, Jupiter around the Sun, the Moon around Earth. Today each is a perfect
**circle** in the ecliptic, drawn as a plane-quad SDF (`|length(p) − 1|` with
`fwidth` AA — `orbitRing/fragment.wesl`). We replace those with **accurate
Keplerian ellipses from real J2000 orbital elements**, rendered by projecting
each orbit's conic into **pixel space** and evaluating it analytically per
fragment.

The ellipse stays mathematically exact at every zoom (no tessellation, no
segment ever becomes visible), and the fragment math runs in pixel
coordinates (O(1000)), which is numerically benign where the current
unit-orbit-space SDF catastrophically cancels (§2).

### Goals

- Real orbit shapes: eccentricity, inclination, node, and periapsis from J2000
  mean elements (§7), not circles in the ecliptic.
- Exact, jitter-free stroke from galaxy scale down to Earth-surface scale — the
  regime where the current `length(p) − 1` field breaks down.
- A **direction cue**: brightness trails behind the moving body, brightest just
  behind it, using **mean anomaly** so the fade tracks the body's real
  (Kepler-equal-area) speed.
- The orbiting body's sphere sits **exactly on** its own trail, by construction
  (§5): both the body position and the trail derive from one element table.

### Non-goals (deferred)

- Live ephemeris / time propagation. The scene is static at a single epoch
  (J2000); element rates are recorded for provenance (§7) but the code stores
  only the epoch values (YAGNI — no clock, no per-frame Kepler propagation).
- Orbits for any body beyond the three seeded guidance orbits.
- Pick / selection / InfoCards for the trails (the rings aren't selectable
  today either).

## 2. Why screen-space conic, not a better ellipse-SDF

Two independent problems with the circle rings, one design that removes both:

1. **Not real orbits.** A circle carries no `e`, `i`, `Ω`, `ω`. A Keplerian
   orbit is an ellipse in its plane — and an ellipse under perspective
   projection is still a **conic** (ellipse / parabola / hyperbola / line-pair).
   So the projected curve is exactly representable by a 3×3 symmetric conic
   matrix in pixel space, with no approximation and no tessellation.

2. **`f32` breakdown at deep zoom.** The circle fragment works in
   **unit-orbit space** and evaluates `d = |length(p) − 1|`. At Earth-surface
   zoom the stroke must be resolved at ~1e-11 of the orbit radius; `f32`'s ~7
   significant digits cancel catastrophically in `length(p) − 1`, and the ring
   goes steppy/jittery exactly where the user is looking. No ellipse-SDF variant
   in that coordinate space fixes this — the coordinate space is the problem.

The screen-space conic sidesteps both: the per-frame heavy lifting (composing
the orbit's plane basis through the `f64` NEAR0 view-projection) happens **on
the CPU in `f64`**, exactly the compose-then-narrow philosophy `composeBodyMvp`
(`src/utils/camera/composeBodyMvp.ts:57-91`) and `composeOrbitMvp`
(`src/utils/camera/composeOrbitMvp.ts:59-102`) already use. The fragment
receives a single narrowed `f32` matrix and works in **pixel coordinates**,
which are O(1000) at every zoom — no small-difference cancellation anywhere on
the GPU.

### Rejected alternatives

- **Tessellated line-strip ellipse.** Needs per-zoom segment-count LOD to stay
  smooth AND a screen-space width recompute to stay visible — the exact two
  costs the SDF ring was introduced to avoid. A conic keeps both properties (no
  tessellation, constant pixel stroke) while adding real orbit shape.
- **Ellipse-SDF in the orbit plane (keep the coordinate space, add `e`).**
  Would carry problem 2 unchanged — the deep-zoom cancellation is intrinsic to
  evaluating a distance field in unit-orbit space, independent of shape.
- **Tight screen-space bounding quad per orbit** (instead of fullscreen).
  Rejected: a projected conic can be a **hyperbola open to infinity** when the
  orbit plane passes near the camera, so a finite AABB is either wrong or needs
  a special case exactly at the degeneracy. A fullscreen triangle per orbit is
  robust for all conic types and, with ≤8 additive orbits over a near-field
  scene, cheap (§6).

## 3. The math (precise enough to implement)

All world positions are heliocentric Mpc in the scene's **equatorial J2000**
frame (`raDecDistToCartesian.ts`: +x vernal equinox, +z celestial pole). Orbit
elements are referenced to the **ecliptic** J2000 frame; the ecliptic→equatorial
rotation is `ECLIPTIC_BASIS` (`src/data/bodies/eclipticBasis.ts:38-42`).

### 3.1 Element table → the ellipse as an affine image of the unit circle

Classical elements `(a, e, i, Ω, ω, M)` (semi-major axis, eccentricity,
inclination, ascending-node longitude, argument of periapsis, mean anomaly).

**Perifocal → ecliptic rotation.** `R = Rz(Ω) · Rx(i) · Rz(ω)`. Its first two
columns are the unit **perifocal axes** in ecliptic coordinates: `P̂` (toward
periapsis) and `Q̂` (90° ahead in the orbit plane).

**Ecliptic → equatorial.** A vector with ecliptic components `(vx, vy, vz)` maps
to the scene's equatorial frame as
`vx·[1,0,0] + vy·ECLIPTIC_BASIS.yAxis + vz·ECLIPTIC_BASIS.normal`
(the equinox line +x is shared by both planes; the other two axes rotate by the
obliquity ε ≈ 23.44°). Apply this to `P̂` and `Q̂` to get world-frame `P̂w`, `Q̂w`.

**The ellipse in world space.** With semi-minor `b = a·√(1 − e²)` and the focus
at the parent body, a point at eccentric anomaly `E` is

    X(E) = focus + Rw·[ a(cos E − e), b·sin E, 0 ]
         = C + A·cos E + B·sin E

where the three constant world vectors are

    A  = a · P̂w            (semi-major, toward periapsis)
    B  = b · Q̂w            (semi-minor, prograde)
    C  = focus − a·e · P̂w  (the ellipse CENTRE, i.e. focus + centre-offset)

So in **plane coordinates** `(s, t)` with basis `(A, B)` about `C`, i.e.
`X = C + s·A + t·B`, the Keplerian orbit is the **unit circle** `s² + t² = 1`,
and the plane angle **is the eccentric anomaly** `E = atan2(t, s)`. This is the
key structural fact the whole design rests on: real orbit geometry lives
entirely in the three constant vectors `(A, B, C)`; the curve is always the
unit circle. (The circle rings are the special case `A ⟂ B`, `|A| = |B|`,
`C = focus`; ellipses relax all three.)

`A`, `B`, `C` are **static per orbit** (elements + parent position are fixed at
the scene epoch), so they are derived once into a table (§5), not per frame.

### 3.2 Plane coords → pixel coords: one homography `G`

Homogeneous plane point `p = (s, t, 1)` maps to homogeneous world
`[X; 1] = M · p` with the 4×3 matrix `M = [ [A; 0] | [B; 0] | [Crel; 1] ]`,
`Crel = C − renderOrigin` (the origin-relative frame the NEAR0 slab `vp` is
built for — same subtraction `composeBodyMvp`/`composeOrbitMvp` perform).

Compose through the slab's `f64` view-projection `VP` (`slab.vp`,
`src/@types/engine/frame/Slab.d.ts:38`) and keep only the **x, y, w** rows of
each clip column (z is unused — depthless additive draw):

    cS = (VP · [A;0]).xyw       cT = (VP · [B;0]).xyw       cC = (VP · [Crel;1]).xyw
    H  = [ cS | cT | cC ]        (3×3, columns)

The NDC→pixel viewport transform, acting on the `(x, y, w)` sub-vector of clip
(it never mixes z), is the 3×3

    V = | 0.5·Wpx     0        0.5·Wpx |
        | 0          −0.5·Hpx   0.5·Hpx |
        | 0           0         1       |

(`Wpx`, `Hpx` = backing-store viewport from `SlabView.viewportPx`; the −0.5·Hpx
row flips NDC-y-up to pixel-y-down to match WGSL `@builtin(position)`).

Then `G = V · H` maps plane `(s, t, 1)` → homogeneous pixel `(px·w, py·w, w)`,
and the design's working matrix is its inverse

    Ginv = G⁻¹        (3×3, pixel → plane)

**everything the fragment needs is `Ginv` alone** (§3.3). All of `H`, `V`, `G`,
`Ginv` are built and inverted in `f64` (`mat3d`) and narrowed once at the upload
boundary — the cancellation between the large `VP` translation and the tiny
`Crel` is resolved at double precision before any bits are lost, exactly as in
`composeOrbitMvp`.

### 3.3 Fragment: one matrix, both the stroke and the trail

Let `x = (px, py, 1)` be the fragment's pixel position (`@builtin(position).xy`,
homogeneous 1). Compute **once**

    q = Ginv · x            // q = (s/w, t/w, 1/w) — plane coords, scaled by 1/clip-w

From this single product:

- **Behind-camera clip.** `q.z = 1/w`. The projective image of a conic includes
  the arc **behind** the camera; those pixels have `w < 0`, i.e. `q.z ≤ 0`.
  Discard them. (This is the "sign of the back-projection's `w`" clip from the
  brief — it falls out of `q.z`, no extra plumbing.)
- **Plane coords / anomaly.** `s = q.x / q.z`, `t = q.y / q.z`;
  `E = atan2(t, s)` is the eccentric anomaly (§3.1).
- **Conic value.** `f = q.x² + q.y² − q.z²`  (∝ `(s² + t² − 1)/w²`; zero on the
  orbit, signed inside/outside). This is `xᵀ·C·x` with the pixel-space conic
  `C = Ginvᵀ · diag(1, 1, −1) · Ginv` — but never assembled: `f` reads straight
  off `q`.
- **Sampson distance (constant-width AA stroke).** The first-order geometric
  distance from the pixel to the conic's zero set, in **pixels**:

      d = Ginvᵀ · (q.x, q.y, −q.z)              // = ½·∇ₓf, a 3-vector
      sampson = |f| / (2 · length(d.xy))
      stroke  = 1 − smoothstep(0, STROKE_PX, sampson)     // STROKE_PX ≈ 1.5

  Sampson handles **general conics** uniformly — ellipse, and the edge-on
  degeneracies (parabola / hyperbola / line-pair) as the orbit plane goes
  edge-on — because it never assumes ellipse-specific coefficients; it is just
  `|value| / |gradient|` of the quadratic. No `fwidth` is needed: `sampson` is
  already a pixel distance, so the stroke width is a fixed pixel constant, not a
  derivative.

- **Trail recency (mean anomaly).** Convert the eccentric anomaly to **mean**
  anomaly by Kepler's equation in the **forward** (closed-form) direction — no
  root-find on the GPU:

      M = E − e · sin(E)
      Δ = mod(M_body − M, 2π)         // mean-anomaly angle BEHIND the body
      brightness = TRAIL_FLOOR + (1 − TRAIL_FLOOR) · exp(−TRAIL_DECAY · Δ)

  `M_body` (the body's mean anomaly at the scene epoch) and `e` are per-orbit
  constants. Using mean anomaly makes the fade track the body's real angular
  speed: near periapsis the body moves fast, so equal mean-anomaly steps cover
  more true angle and the tail fades faster there — the physically honest cue.
  (`TRAIL_DECAY ≈ 1.2`, `TRAIL_FLOOR ≈ 0.15`, carried over from
  `orbitRing/fragment.wesl:44-48` so the whole orbit stays legible.)

- **Output.** `color · brightness · stroke`, alpha 1, one/one additive — the
  HDR convention every additive layer shares.

**Why the fragment's `f32` is safe.** `x` is O(1000) pixels and `Ginv` maps it
to O(1) plane coords, so `q` and every derived quantity are well-conditioned —
none of the tiny-Mpc cancellation that breaks the unit-orbit-space SDF survives
into pixel space. The back-projection `(s, t)` feeds only the **brightness**, a
smooth, slowly varying function of angle, so even a sub-pixel `f32` error in
`Ginv·x` produces an invisible brightness error — the back-projection's own
precision is irrelevant by construction, and that is *why* it is allowed to be
the one thing computed on the GPU.

## 4. Where it maps onto the renderer (unchanged axes)

Identical slab / target / blend placement to the ring it replaces
(`orbitRingsLayer.ts:42-52`):

- **Row: `(NEAR0, hdr, additive)`.** The orbits live at AU-to-lunar scale, far
  inside COSMO's 0.01 Mpc near plane, so they project through the NEAR0 slab
  (adaptive near/far via `foregroundFrustum` — its `FAR_MIN_MPC = 3e-11` floor
  already encloses Jupiter's orbit, `foregroundFrustum.ts:47-53`) and accumulate
  into the HDR target so they ride the same tone-map as everything else. The
  existing `(hdr, NEAR0)` frame step (`frameProgram.ts:64`) drives it — **no new
  program step**, same group as `starPointsLayer`.
- **`f64` seam.** The layer composes `Ginv` from `view.slab.vp` (the `f64`
  matrix), never the narrowed `view.vp` — the same hard invariant
  `orbitRingsLayer` documents (`orbitRingsLayer.ts:14-21`).
- **Pixel space matches the HDR target.** The HDR target is full-resolution, so
  the fragment's `@builtin(position).xy` shares the pixel space
  `SlabView.viewportPx` measures — the two agree with no scale factor.

## 5. Data model — one element table is the single source of truth

Today the dependency runs **body seed → orbit ring**: `sceneOrbits.ts` derives
each ring's radius/centre from `|body − parent|` (`sceneOrbits.ts:83-102`) so a
circle always passes through its body. That inversion cannot survive real
ellipses: a body at an arbitrary placeholder position is not generally *on* a
Keplerian ellipse fitted from independent elements, so the sphere would float
off its own trail.

We invert the dependency: **orbital elements → body seed AND trail**. One
`ORBITAL_ELEMENTS` table is the single source of truth; both the body's rendered
position and its trail derive from it, so body-on-trail consistency is
structural (not a "remember to keep them in sync" invariant — the entanglement
the brief flagged, un-braided at design time rather than documented).

    ORBITAL_ELEMENTS (a, e, i, Ω, ω, M, parentId, colour)
       │
       ├── keplerianPositionMpc(elements) + parent position ──▶ body positionMpc
       │        (sceneBodies.ts Earth / Jupiter / Moon seeds are DERIVED)
       │
       └── keplerianEllipse(elements) + parent position ──────▶ SCENE_ORBIT_CONICS
                (A, B, C world vectors — the §3.1 ellipse, absolute-world)

- **Parent resolution.** `parentId: null` → heliocentric, focus at the Sun
  (`RENDER_ORIGIN_MPC`, the origin). `parentId: 'earth'` → the Moon's focus is
  **Earth's derived position** (the flagged Moon gotcha: the Moon's elements are
  ecliptic-relative and orbit **Earth**, not the Sun — handled by resolving the
  focus to the parent's already-derived world position, so the Moon's trail
  follows Earth automatically).
- **No cycle.** `ORBITAL_ELEMENTS` imports only `ECLIPTIC_BASIS` +
  `SCALE_UNITS`; `sceneBodies` imports elements + `keplerianPositionMpc`;
  `sceneOrbitConics` imports elements + `SCENE_EARTH` (Moon's parent) +
  `keplerianEllipse`. Elements never import bodies.

**Visible consequence (a user-confirmed visual gate).** Deriving positions from
real J2000 elements moves Earth off the current `[1 AU, 0, 0]` placeholder to
its true J2000 direction (and likewise Jupiter/Moon). The descent therefore
lands in a different direction than today. This is more truthful and is what
makes the body sit on its trail; it is called out as a visual gate in the plan
so the user confirms the relocation deliberately.

### Contract sketch (`@types`, one type per file)

```ts
// src/@types/scene/OrbitalElements.d.ts — the single source of truth
export type OrbitalElements = {
  readonly id: string;
  readonly parentId: string | null; // null → heliocentric (Sun at origin)
  readonly semiMajorMpc: number; // a, authored via SCALE_UNITS
  readonly eccentricity: number; // e
  readonly inclinationRad: number; // i
  readonly ascendingNodeRad: number; // Ω
  readonly argPeriapsisRad: number; // ω = ϖ − Ω
  readonly meanAnomalyRad: number; // M at the scene epoch (J2000) = L − ϖ
  readonly color: Vec3; // dim linear-RGB tint for the additive draw
};

// src/@types/scene/OrbitConic.d.ts — the derived, absolute-world ellipse
export type OrbitConic = {
  readonly id: string;
  readonly centerMpc: Vec3; // C: absolute world (parent focus + centre-offset)
  readonly semiMajorMpc: Vec3; // A = a·P̂w (equatorial world)
  readonly semiMinorMpc: Vec3; // B = b·Q̂w
  readonly eccentricity: number; // e (for E → M in the fragment)
  readonly meanAnomalyRad: number; // M_body at the scene epoch
  readonly color: Vec3;
};
```

## 6. Renderer — instanced fullscreen triangle, per-instance `Ginv`

Structurally the twin of the ring renderer it replaces (`orbitRingRenderer.ts`):
one instanced `drawIndexed`/`draw`, per-instance record streamed as vertex
attributes (no bind group, no per-draw uniform to clobber — the
writeBuffer-vs-submit landmine), additive one/one into the caller's
`rgba16float` HDR target, no depth, `cullMode: 'none'`.

Two differences:

- **Geometry is a fullscreen triangle**, generated in the vertex shader from
  `@builtin(vertex_index)` (no position VBO) — the projected conic can land
  anywhere on screen, so each instance must cover the whole viewport (§2's
  rejected bounding-quad). One instance = one orbit.
- **The per-instance record is `Ginv` + trail params**, not an MVP:
  `3 × vec4` for the padded `mat3x3` columns of `Ginv` (locations 1–3) +
  `vec4(color.rgb, eccentricity)` (location 4) + `vec4(meanAnomalyRad, 0, 0, 0)`
  (location 5) = **20 floats / 80-byte stride** — the same stride the ring
  renderer used, so the instance-buffer sizing (`MAX_ORBITS`, `INSTANCE_FLOATS`)
  carries over verbatim.

WESL shader family `shaders/orbitTrail/` with `io.wesl` shared by both stages
(`VSOut` carries `@builtin(position)` + the three flat `Ginv` columns + flat
`color` + flat `eccentricity` + flat `meanAnomaly`). Meticulous WGSL — no
backtick characters in comments (parse errors; single quotes), verify
visually. The fragment implements §3.3 exactly.

## 7. Verified orbital elements (J2000 mean elements)

**Planets — JPL SSD "Keplerian Elements for Approximate Positions of the Major
Planets", Table 1 (valid 1800–2050 AD), referenced to the mean ecliptic and
equinox of J2000.** Source:
<https://ssd.jpl.nasa.gov/planets/approx_pos.html> (verified 2026-07-11).
JPL gives `L` (mean longitude) and `ϖ` (longitude of perihelion); we derive
`ω = ϖ − Ω` and `M = L − ϖ`. Rates recorded for provenance only — the scene is
static at J2000 (§1), so the code stores just the epoch column.

| Element (J2000)        | Earth (EM barycenter) | Jupiter        |
| ---------------------- | --------------------- | -------------- |
| a (au)                 | 1.00000261            | 5.20288700     |
| e                      | 0.01671123            | 0.04838624     |
| i (°)                  | −0.00001531           | 1.30439695     |
| L, mean longitude (°)  | 100.46457166          | 34.39644051    |
| ϖ, long. perihelion (°)| 102.93768193          | 14.72847983    |
| Ω, long. asc. node (°) | 0.0                   | 100.47390909   |
| ⇒ ω = ϖ − Ω (°)        | 102.93768193          | −85.74542926   |
| ⇒ M = L − ϖ (°)        | −2.47311027           | 19.66796068    |
| (rate) dL/dt (°/cy)    | 35999.37244981        | 3034.74612775  |
| (rate) da/dt (au/cy)   | 0.00000562            | −0.00011607    |
| (rate) de/dt (/cy)     | −0.00004392           | −0.00013253    |

**Moon — JPL SSD "Planetary Satellite Mean Orbital Parameters", the Moon's mean
elements referenced to the ecliptic, epoch J2000 (DE405/LE405 fit).** Source:
<https://ssd.jpl.nasa.gov/sats/elem/> (verified 2026-07-11). Parent = Earth.

| Element (J2000, ecliptic, geocentric) | Moon        |
| ------------------------------------- | ----------- |
| a (km)                                | 384400      |
| e                                     | 0.0554      |
| i (°)                                 | 5.16        |
| Ω, long. asc. node (°)                | 125.08      |
| ω, argument of periapsis (°)          | 318.15      |
| M, mean anomaly (°)                   | 135.27      |

> JPL notes these Moon mean elements "are not intended for ephemeris
> computation" — they describe the shape/orientation of a precessing mean
> ellipse. That is exactly (and only) what a guidance trail needs. The backlog
> brief cited slightly different round numbers (e ≈ 0.0549, i ≈ 5.145°) from
> other tabulations; we use the JPL sats/elem values above as the authoritative
> single source, noting the minor variance.

All values authored via `SCALE_UNITS` (au/km → Mpc) and `deg → rad` at the seed
site, never as a buried Mpc/radian literal — the same discipline `sceneBodies.ts`
observes.

## 8. What it replaces / consumes

**Replaces (deleted — grep-gated in the plan, no references left):**

- `src/services/gpu/renderers/orbitRingRenderer.ts` +
  `src/@types/rendering/OrbitRingRenderer.d.ts`
- `src/services/gpu/shaders/orbitRing/{io,vertex,fragment}.wesl`
- `src/services/engine/frame/passes/orbitRingsLayer.ts`
- `src/data/bodies/sceneOrbits.ts` (`SCENE_ORBITS`) +
  `src/@types/scene/SceneOrbit.d.ts`
- `src/utils/camera/composeOrbitMvp.ts`
- their mirror tests

**Consumes (unchanged):**

- `ECLIPTIC_BASIS` (`eclipticBasis.ts:38-42`), `SCALE_UNITS`
  (`src/data/scaleUnits.ts`), `RENDER_ORIGIN_MPC` (`src/data/renderOrigin.ts`).
- The NEAR0 `f64` slab `vp` + `foregroundFrustum` far floor (`slabs.ts:70-95`,
  `foregroundFrustum.ts:47-62`), the `(hdr, NEAR0)` frame step
  (`frameProgram.ts:64`), `SlabView.viewportPx` (`SlabView.d.ts:31`).
- `narrowMat4`'s sibling narrow pattern (`narrowMat4.ts:29`); `mat3d` (f64 3×3
  with `inverse`/`multiply`) from `wgpu-matrix` — note its 12-element padded
  layout (3 columns × vec4-aligned), matching WGSL `mat3x3<f32>` std140.

**New:**

- `src/@types/scene/OrbitalElements.d.ts`, `src/@types/scene/OrbitConic.d.ts`,
  `src/@types/rendering/OrbitTrailRenderer.d.ts`
- `src/data/bodies/orbitalElements.ts` (`ORBITAL_ELEMENTS`),
  `src/data/bodies/sceneOrbitConics.ts` (`SCENE_ORBIT_CONICS`)
- `src/utils/orbit/eccentricAnomalyFromMean.ts`,
  `src/utils/orbit/keplerianEllipse.ts`,
  `src/utils/orbit/keplerianPositionMpc.ts`
- `src/utils/camera/composeOrbitConic.ts`, `src/utils/math/narrowMat3.ts`
- `src/services/gpu/renderers/orbitTrailRenderer.ts`,
  `src/services/gpu/shaders/orbitTrail/{io,vertex,fragment}.wesl`,
  `src/services/engine/frame/passes/orbitTrailsLayer.ts`
- `src/data/bodies/sceneBodies.ts` **modified** — Earth/Jupiter/Moon positions
  re-seeded from `ORBITAL_ELEMENTS` (§5).

## 9. Testing

- **Unit (pure, hand-computed expectations — never a mirror of the source
  formula):**
  - `eccentricAnomalyFromMean`: `e = 0 ⇒ E = M`; forward/back round-trip
    (`M = E − e·sin E` then invert ≈ E); residual `E − e·sin E − M < 1e-10`.
  - `keplerianEllipse`: a circular equatorial orbit (`e = 0, i = 0, Ω = ω = 0`)
    → `|A| = |B| = a`, `A · B = 0`, both `⟂ ECLIPTIC_BASIS.normal` is **false**
    only via the tilt — assert `A`, `B` lie in the ecliptic (dot with the
    ecliptic normal ≈ 0) and centre-offset ≈ 0; an eccentric orbit →
    `|C_offset| = a·e` along `−A`.
  - `keplerianPositionMpc`: at `M = 0` (periapsis) the focus-relative distance is
    `a(1 − e)`; at `M = π` (apoapsis) it is `a(1 + e)` — hand-checked magnitudes.
  - `composeOrbitConic`: with a simple constructed `f64` `VP` + viewport,
    forward-project the periapsis world point (`C + A`) to a pixel by the
    standard pipeline, feed that pixel to the returned `Ginv`, assert
    `(s, t) ≈ (1, 0)` and `q.z > 0`; the `E = 90°` point (`C + B`) → `(0, 1)`; a
    point at `C + 2A` → `(2, 0)` (outside, `s² + t² = 4`). A **round-trip**
    property (forward projection is independent of the inverse under test), the
    face-on-circle and edge-on behaviours pinned as fixtures.
- **Visual (user-verified on the dev server, needs `?deepZoom`):** each orbit is
  a smooth exact ellipse with a constant-width stroke from galaxy scale to
  Earth-surface (no steps, no jitter); the body sphere sits **on** its trail;
  the brightness tail trails **behind** the moving body; no phantom arc appears
  behind the camera as an orbit plane sweeps edge-on.

## 10. Open questions

None blocking. The two decisions worth surfacing are recorded above rather than
left open:

- **Body relocation (§5).** Deriving positions from real elements moves the
  bodies off their placeholder axis. Resolved: accept it (truthful + structural
  consistency), gated on a user visual confirm.
- **Scene epoch.** Fixed at J2000 (static scene, no clock). Element rates are
  recorded for provenance (§7) but unused — a future animated ephemeris is the
  named extension point (store epoch + rates, propagate `M`), explicitly not
  built now (YAGNI).

## References

- Backlog brief: `docs/backlog/2026-07-10-conic-orbit-trails.md` (superseded by
  this spec + plan).
- Zoom-to-Earth true-scale design:
  `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md`
  (the `f64` NEAR0 slab + compose-then-narrow architecture this consumes).
- `docs/superpowers/conventions/simplicity.md` (§5 the element-table un-braid),
  `docs/superpowers/conventions/testing.md`, `renderers.md`,
  `wesl-shaders` skill (no backticks in WESL comments, `?static`,
  `package::` imports).
- JPL SSD approximate planetary elements
  <https://ssd.jpl.nasa.gov/planets/approx_pos.html>; JPL SSD satellite mean
  elements <https://ssd.jpl.nasa.gov/sats/elem/>.
</content>
</invoke>
