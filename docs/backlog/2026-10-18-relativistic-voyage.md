# Relativistic voyage exhibit (1 g to Andromeda)

**Status:** needs-design (idea from 2026-10-18; no brainstorm yet)

## The idea

An exhibit that flies the viewer from Earth to a chosen destination in a ship
that accelerates at 1 g for the first half and decelerates at 1 g for the
second, and draws the universe **as the ship's frame sees it**: distances along
the direction of travel squashed by 1/γ, the sky ahead blue-shifted and the sky
behind red-shifted, with the ship clock and the Earth clock running side by
side. Andromeda is the headline destination: 28.6 years on the ship clock
against 2.54 million years on Earth's. The effect must apply to _everything_ in
the scene — the star catalog and the Milky Way first (they are what fills the
view for the first 20 ship-years), then the galaxies.

## The physics (c = 1, a = 1 g = 1.032 ly/yr²)

Accelerate for proper time τ along unit vector `n` from the launch point:

```
γ(τ) = cosh(aτ)        β(τ) = tanh(aτ)
x(τ) = (cosh(aτ) − 1) / a           ship position along n, Earth frame
t(τ) = sinh(aτ) / a                 Earth-frame time elapsed
```

Deceleration mirrors the same curves from the midpoint. For a trip of length d:
`γ_max = 1 + a·d/2`, proper time `2·acosh(γ_max)/a`, Earth time `≈ d + 2/a`.

| Destination | d | ship time | Earth time | γ_max | d/γ_max at turnaround |
|---|---|---|---|---|---|
| Proxima | 4.24 ly | 3.5 yr | 5.9 yr | 3.2 | 1.33 ly |
| Sgr A\* | 26.7 kly | 19.8 yr | 26.7 kyr | 1.4 × 10⁴ | 1.94 ly |
| Andromeda | 2.54 Mly | 28.6 yr | 2.54 Myr | 1.3 × 10⁶ | 1.94 ly |
| Virgo cluster | 53.8 Mly | 34.6 yr | 53.8 Myr | 2.8 × 10⁷ | 1.94 ly |
| 1 Gly | 1 Gly | 40.2 yr | 1 Gyr | 5.2 × 10⁸ | 1.94 ly |

The invariant worth building the copy around: at turnaround the destination is
never farther than `2c²/g ≈ 1.94 ly` in the ship's frame, whatever it is. The
galaxy that was 2.5 Mly away is, for a moment, two light-years ahead and a
40 kpc-wide pancake 0.03 ly thick.

Timeline of the Andromeda leg by ship time (accelerating half):

| τ | γ | distance covered | Doppler ahead | Doppler behind |
|---|---|---|---|---|
| 1 yr | 1.6 | 0.56 ly | 2.8 | 0.36 |
| 3 yr | 11 | 9.8 ly | 22 | 0.045 |
| 5 yr | 87 | 84 ly | 174 | 0.0057 |
| 7.4 yr | 1060 | 1 kly | 2120 | — (CMB peak reaches 500 nm ahead) |
| 10 yr | 1.5 × 10⁴ | 15 kly | 3 × 10⁴ | 3 × 10⁻⁵ |
| 14.3 yr | 1.3 × 10⁶ | 1.25 Mly | 2.6 × 10⁶ | 4 × 10⁻⁷ |

Doppler for a source at angle θ from the travel direction: `D = 1 / (γ(1 − β cos θ))`
(blue ahead, red behind, with `D = 1` on a cone that drifts forward as β → 1).
A Doppler-shifted blackbody is a blackbody at `D·T`. Bolometric flux scales as
`D⁴` (the headlight effect), which the HDR pipeline can't survive unclamped.
Past γ ≈ 1000 (7.4 ship-years) the CMB itself is shifted into the visible ahead
of the ship — the "starbow" ring — and nothing ahead is still in the visible band.

Two honest pictures exist, and the exhibit should name which it shows:

- **Map**: the ship-frame layout at ship-simultaneous instants — Lorentz
  contraction. This is what the request asks for and it is a _linear map_ of
  world space (below).
- **Window**: what the eye receives — aberration crowds the whole sky forward,
  there is no visible contraction (Terrell–Penrose), only Doppler and headlight.
  Direction warp `cos θ' = (cos θ − β)/(1 − β cos θ)`, per vertex, non-linear.

Map first; Window is the follow-up toggle (§Later).

## Sketch of the mechanism

### Contraction is one matrix, folded where the view-projections are composed

In the ship's instantaneous rest frame, every point at rest in the Earth frame
sits at `x' = s + (I − (1 − 1/γ) n nᵀ)(x − s)`, with `s` the ship position.
That is an anisotropic scale about the ship: a 4×4 `C = T(s)·S·T(−s)`. Every
pass already receives a view-projection composed on the CPU in f64 and narrowed
at upload (ADR 0010, `src/utils/camera/computeViewProj.ts`,
`computeForegroundViewProj.ts`, `slabs.ts:238` `deriveSlabs`, the body slab
composers). Composing `vp · C` there squashes **every** renderer at once —
star points and star catalog, Milky Way splats and presents, galaxy points and
disks, structure markers, filaments, labels (`cosmoLabelProjection` /
`near0LabelProjection` project through the same vp), picking (`galaxyPickRenderer`,
`starCatalogPickRenderer`) — with no shader edits. This is why the request's
"everything, not just galaxies" costs nothing extra for position.

What the fold does _not_ cover, by design, because it only moves positions:

- **Apparent-size and brightness paths** read `p − camPosWorld` in the shader
  (`galaxyCatalog/points/vertex.wesl:159`, the star catalog's focus sphere,
  the disk/thumbnail gates in `galaxyCatalog/subsystems/*`). With the ship as
  the fixed point of `C`, `camPosWorld` stays valid, but distances are still
  Earth-frame. For the Map picture that is defensible (the map moves things,
  physics does not brighten them — Doppler does, below). Thumbnail quads
  trigger on apparent size, so a contracted M31 "on close approach" is a
  choice to make, not a bug.
- **Presents that reconstruct rays** (dust/bubble presents under
  `shaders/milkyWay/field/`, the volume field, the horizon shell) sample a
  field at world points: they need the inverse warp on the sample point
  (`×γ` along `n`), one line each, or they draw an unsquashed interior inside
  a squashed outline. Verify per present shader; the splats need nothing.

### Doppler is per renderer, but a one-liner each

`D` depends only on direction from the ship: `cosθ = dot(normalize(p − s), n)`.
A `dopplerFactor(pRel, n, beta, gamma)` helper in `shaders/lib/camera.wesl`
feeds:

- **Stars**: `starTint(bpRp)` (`shaders/starCatalog/tint.wesl:50`) — shift the
  temperature, `T' = D·T`, so convert BP−RP → T, scale, back, or add the
  equivalent `Δ(BP−RP)`; physically exact for a blackbody.
- **Galaxy points/disks**: the colour index `ci ∈ [0,2]` is K-corrected on the
  CPU with cosmological z (`colourIndex.ts:72`, per-source `kPerZ`); in-shader
  add `kPerZ · (1/D − 1)` (an apparent z of `1/D − 1`), same ramp
  (`lib/colorIndex.wesl:160`). No per-galaxy redshift reaches the GPU and none
  is needed.
- **Milky Way**: tint emission by `D` of the splat / ray direction.
- **Headlight**: multiply radiance by `pow(D, k)` with `k` a didactic dial
  (physics says 4; default lower) and a soft ceiling, or the forward sky is a
  white wall at 3 ship-years. Possibly folded into the exposure instead.
- **Starbow (stretch)**: draw the CMB on the horizon shell as a blackbody at
  `2.725 K · D(θ)`: invisible until ~7 ship-years, then a ring that tightens
  ahead. Cheap (one shell shader) and the most "only this app" moment of the trip.

Where the parameters live: `(s, n, β, γ, mode)` as a per-frame
`RelativisticFrame | null` on `FrameView` (`src/@types/engine/frame/FrameView.d.ts`),
null meaning identity and no shader branch cost. Growing `CameraUniforms` for
the shader side changes an 80-byte prefix that 20 renderers pack behind with
hard-coded byte offsets (`packGalaxyPointUniforms.ts:95` puts `camPosWorld` at
byte 96) — a mechanical sweep, or a second small uniform bound only by the three
renderers that shift colour. Decide at the spec.

### The trip is an exhibit with a profiled clock

The missions timeline is the template (`src/layers/missions/exhibits/timeline/missionTimelineKind.ts`):
a section kind with a `hold` saga that owns the clock and a `cameraDriver` row
(priority 58, `commitsOnEdge: 'displayed'`) whose pose is derived from the
sim instant. For the voyage:

- **Scrub axis is ship proper time τ.** The existing `ClockProfile` (a wall→sim
  table, `src/@types/time/ClockProfile.d.ts`) maps straight on: wall = scaled τ,
  sim = launch JD + t(τ). `deriveSimDays` then gives Earth time for free and
  the TimeBar reads it. A `buildVoyageProfile(destination)` sibling of
  `buildMissionProfile`.
- **Ship position** `s(τ)` along `n = normalize(dest − launch)`; the camera row
  places the eye at (or orbiting) `s`, looking along `n` by default via
  `orbitAnglesLookingAlong`, visitor look offsets as in `missionPose.ts`.
- **Notes column**: destination tabs (Proxima, Sgr A\*, M31, Virgo), readouts
  (ship clock, Earth clock, β as `1 − β`, γ, distance remaining in both
  frames), toggles (contraction, Doppler, headlight, later aberration), and the
  prose: the 1.94 ly invariant, why the Earth clock runs away, Map vs Window.
- **Deep link**: `#exhibit=voyage&t=…` already carries the sim instant;
  destination needs one more param or an exhibit id per destination.
- The launch point is Earth; the fly-in reuses `exhibitBodySaga`'s entry.

### Precision

- COSMO positions are absolute f32 Mpc; with the ship at 0.78 Mpc the
  ship-relative vector has ~0.3 ly resolution. Fine for galaxies.
- NEAR0 (stars, Milky Way) is rebased on the Sun (`RENDER_ORIGIN_MPC`). Mid-trip
  the ship is 1 Mly from the Sun and the stars ahead are squashed into a plane
  2 ly deep; f32 star positions relative to the Sun resolve ~0.1 ly there.
  Marginal. ADR 0010's named extension point — the render origin — should
  follow the ship for the duration of the voyage; this is the one piece of
  ground preparation the feature likely needs, and it is useful on its own.
- `C` is centred on the ship, not the eye, so a third-person view (a GLB ship
  via the `add-mission` skill, orbited by the camera) stays correct.

### Sequencing (bite-sized)

1. Physics helpers + tests: `γ(τ)`, `x(τ)`, `t(τ)`, trip summary, Doppler
   factor; the table above is the fixture.
2. `RelativisticFrame` on the frame view and the `vp · C` fold; everything
   squashes, nothing recolours. Visual check with a debug slider for γ and `n`.
3. The exhibit: profile, camera row, notes, destination tabs, readouts.
4. Doppler in stars, galaxies, Milky Way; headlight dial.
5. Starbow; render-origin follow if step 2 shows the NEAR0 precision wall.

## Later

- **Window mode** (aberration): the direction warp is a function of the
  ship-relative vector like contraction, so a shared `shipWarp(pRel)` in
  `camera.wesl` covers both — but it is per vertex and non-linear, so it is
  the shader-side design, not the matrix fold. Interacts with the headlight.
- A grand-tour beat or clip that plays the whole trip at fixed wall pace.

## Open questions

- Map or Window as the default picture the visitor sees first?
- Headlight exponent and ceiling: physics (4) is unwatchable; what reads?
- Does a contracted M31 at 2 ly trigger the thumbnail quad, and should it?
- `CameraUniforms` growth (one sweep) vs a second uniform for the colour
  shaders only?
- Does the render origin follow the ship (ground prep) or does v1 accept the
  NEAR0 precision loss past ~100 kly?
