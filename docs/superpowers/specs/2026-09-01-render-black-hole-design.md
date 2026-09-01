# Render Sgr A\* — black-hole close-up

A viewer who descends past the S-stars to within a few hundred AU of Sgr A\*
sees it for the first time: a faint orange glint that resolves, on approach,
into a lensed close-up — black shadow, photon ring, a doubled and warped
starfield bending around it, and a thin doppler-brightened emission annulus
matched to the EHT Sgr A\* image geometry. Today `AnchorPointBody` draws
nothing; this feature is that dedicated follow-up, reserved explicitly by the
S-star-orbits spec's non-goals.

Design decisions and their rejected alternatives are recorded in
[`docs/grill-sessions/render-black-hole-2026-09-01.md`](../../grill-sessions/render-black-hole-2026-09-01.md);
this spec cross-references those as **Q1**–**Q11** rather than restating the
reasoning. **Decision provenance:** every visual-ambition, physics, technique
and scope call (Q1–Q10) and the sequencing ruling (Q11) come from that
transcript and are implemented here as settled — this spec does not
re-litigate them. What follows fills in the engineering shape the transcript
deliberately left to spec time: exact file/type contracts, draw-order
placement, and the ground preparation the post-#634 architecture requires.

## Goal

Within `SCALE_FADE_BANDS.sgrAStarLensing`'s band (engage ≤ 500 AU, full by
100 AU — Q6), the screen shows a physically-grounded Schwarzschild close-up of
Sgr A\* built from a captured environment cubemap and a per-pixel geodesic
trace. Outside the band, a faint orange point-glint marks the anchor from
afar, present the moment Sgr A\* is on screen at all, and crossfades out as
the close-up crossfades in. The camera may descend to 2 Schwarzschild radii
(Q10); beyond that the standoff floor stops it. Zero new user-facing settings
(Q9).

## Non-goals

- **No Kerr metric.** Schwarzschild only (Q4) — spin is unconstrained for
  Sgr A\*, and the shadow-shape difference is a few percent.
- **No full-GR observer view below 2 r_s.** No local-frame aberration or
  sky-wide redshift; the descent floor (Q10, P2) stops the camera at the
  boundary where the shader's static-viewpoint model is still defensible.
- **No cinematic accretion disc.** The emission is the faint EHT-style glow
  only (Q2/Q7) — visually honest, with the false-colour licence documented
  inline, not a bright fictional disc.
- **No M87\* or any second black hole.** `BLACK_HOLES` is built to hold more
  than one row; a second row is data, not a code change, and is explicitly
  not built here.
- **No tour beat.**
- **No lensing of annotations.** Orbit trails, marker rings, labels and
  picking stay unlensed, composited on top (Q5).

## Data

| quantity                             | value                                              |
| ------------------------------------- | --------------------------------------------------- |
| Sgr A\* mass                          | 4.297 × 10⁶ M☉ (GRAVITY Collaboration 2019, A&A 625, L10) |
| Schwarzschild radius (derived)        | `2GM/c²` ≈ 12.69 × 10⁶ km ≈ 0.085 AU — same figure `sgrAStarSchwarzschildRadiusKm.ts` hand-authored today |
| Emission annulus                      | 3–6 r_s (ISCO outward to the ~5 r_s EHT-measured lensed ring) |
| Inclination                           | ≲ 30° from face-on (EHT constraint) |
| Position angle                        | unconstrained observationally; one value chosen and noted as such |
| Flicker                               | one global sim-clock brightness modulation, minute-scale timescale, no patch structure (Q7) |
| Lensing band (Q6)                     | engage ≤ 500 AU, full by 100 AU |
| Descent floor (Q10)                   | 2 r_s, via per-body `standoffRadii` override |

```ts
// src/data/bodies/sgrAStarMassSolar.ts — one symbol per file.
export const SGR_A_STAR_MASS_SOLAR = 4.297e6; // GRAVITY Collaboration 2019, A&A 625, L10

// src/utils/physics/schwarzschildRadiusM.ts — one symbol per file.
// r_s = 2GM/c²; pure function so the S-star pericentre conversion and the
// registry radius both read the SAME formula rather than a transcribed constant.
export function schwarzschildRadiusM(massSolar: number): number;
```

`sceneSgrAStar.ts`'s `SGR_A_STAR.radiusM` becomes
`schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR)` — the function returns metres,
no unit intermediate — replacing the import of
`SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM`. `sgrAStarSchwarzschildRadiusKm.ts` is
deleted; its second reader (the S-star pericentre-in-r_s card row,
`BodyOrbitInfo.pericentreSchwarzschildRadii`) switches to the same function
or reads `SGR_A_STAR.radiusM` directly — implementer's call, cited so the
two readers this file's own docblock names are not silently orphaned.

```ts
// src/@types/data/BlackHoleRow.d.ts — one symbol per file.
export type BlackHoleRow = {
  readonly bodyId: BodyId; // 'sgr-a-star' today; a second row is future data, not code (M87*)
  readonly emission: {
    readonly innerRs: number; // 3
    readonly outerRs: number; // 6
    readonly inclinationRad: number; // ≲30° from face-on, EHT
    readonly positionAngleRad: number; // unconstrained; chosen, documented at the row
    readonly flickerAmp: number; // fractional brightness modulation
    readonly flickerTimescaleS: number; // ~minutes
  };
};

// src/data/blackHoles.ts
export const BLACK_HOLES: readonly BlackHoleRow[]; // one row: sgr-a-star
```

---

## Ground preparation

Three prep refactors, each its own commit, packaged as its own PR sequenced
before the feature PR (checkpoint ruling, Q11 resume checklist item 2 — this
is the `refactor-ground` pass the resume checklist calls for, run once the
body slab had a real body to grow onto). All three verdicts are **bolt-on**:
the post-#634 body-slab architecture already has the joints this feature
needs; P1–P3 remove the three places that still hardcode "earth + planets"
where the correct statement is "every body-slab candidate."

### P1 — slab candidacy derived from body data, not a hardcoded union

**Bolt-on.** `visibleSlabBodies` (`src/services/engine/frame/visibleSlabBodies.ts:26-30`)
takes `earth`/`planets` as two separate typed params and builds its candidate
list as `earth === null ? planets : [earth, ...planets]` — closed over
exactly those two `SceneBody` arms. `AnchorPointBody` was never a candidate
because an anchor "draws nothing" (its own docblock,
`src/@types/scene/AnchorPointBody.d.ts:2-3`) — true until this feature, false
after. `BODY_SLAB_CAPACITY` (`frameProgram.ts:77`,
`1 + SCENE_PLANETS.length`) is the same hardcoded pair one level up: a
compile-time query-set size (see the GPU-timing-service note at that line)
that must stay in lock-step with whatever `visibleSlabBodies` can emit.

Prep: `visibleSlabBodies` becomes a predicate over `SceneBody` (any arm
carrying `radiusM`), admitting anchor bodies alongside Earth and the planets;
`BODY_SLAB_CAPACITY` derives its count from the same admitted set rather than
`1 + SCENE_PLANETS.length` as a separate literal. The apparent-diameter and
frustum culls already in `visibleSlabBodies` (`bodyApparentDiameterPx`,
`isInsideFrustum`) are unchanged — an `AnchorPointBody` competes for a slab
row on the same terms a planet does, sub-pixel-culled the same way. `AnchorPointBody`'s
docblock line 2–3 ("DRAWS NOTHING: no mesh, no point, no glint") is corrected:
Sgr A\* now draws a glint and, inside the band, the lensing pass — both via
its own new `ContentLayer` rows below, not via the flat/textured/glint
partition planets use (an anchor still carries no orientation state for
`bodyRelativePose` to rotate by beyond identity, which P1 explicitly verifies
rather than assumes).

**Proof obligation:** with Sgr A\* far outside the band (any framing wider
than the galactic centre), `visibleSlabBodies` returns exactly what it
returns today for Earth + planets — the anchor's frustum/pixel culls reject
it at any sane viewing distance until the feature's own band engages, so this
prep is a zero-behaviour-change proof over the existing test suite for every
scene except the one this feature adds.

### P2 — per-body camera-standoff floor

**Bolt-on.** `clampDistance` (`src/utils/camera/clampDistance.ts:70-77`)
floors at `pivotRadiusMpc * SURFACE_STANDOFF_RADII`, one global ratio
(`1.0000024`, `:38`) tuned for Earth's imagery resolution. Q10's floor is a
different multiple (2.0) for one specific body — a second global constant
would either regress Earth's tuned value or under-floor Sgr A\* with Earth's.

Prep: an optional `standoffRadii` field on body data (the arm(s) that supply
`pivotRadiusMpc` to a focus/zoom call site), read by `clampDistance` with
`SURFACE_STANDOFF_RADII` as the default when absent —

```ts
// src/utils/camera/clampDistance.ts — signature delta.
export function clampDistance(
  d: number,
  pivotRadiusMpc: number | null,
  standoffRadii: number = SURFACE_STANDOFF_RADII,
): number;
```

Sgr A\*'s record sets `standoffRadii: 2.0` (Q10's floor). Earth, the planets
and the Sun carry no override and keep today's `1.0000024`. This is
independent of P1 — P1 is about which bodies get a SLAB ROW at all; P2 is
about how close the CAMERA may sit once one has, and applies whether or not
the camera is currently orbiting that body's slab.

### P3 — fixed-size render targets, for the sky cubemap

**Bolt-on, narrowest of the three.** `RenderTargetSpec`
(`src/@types/engine/frame/RenderTargetSpec.d.ts:13-33`) sizes every existing
row off the canvas: `scale` is a divisor (1, 3, or a live-setting function)
applied to `canvasSize`. Every current offscreen (`volume`, `zoa`,
`mw-aggregate`, `star-aggregates`, `foreground:0`) is canvas-proportional by
design — they exist to be upsampled back into a canvas-sized HDR target. The
sky cubemap is not: it is 256²–512² per face regardless of the viewport
(Q8), and it is six layers of ONE texture (sampled as a cube in the shader),
not six independent 2D targets — WebGPU cannot attach a `cube`-view render
target, so the six faces render as six layers of a `2d-array` texture and the
sampling shader binds that array as `texture_cube`.

Prep: `RenderTargetSpec` gains a fixed-size form alongside the existing
canvas-divisor `scale` —

```ts
// src/@types/engine/frame/RenderTargetSpec.d.ts — delta only.
//   scale: number | ((state: EngineState) => number)   ← existing, canvas-relative
// + fixedSizePx?: { readonly size: number; readonly layers: number }
//                                                          ← NEW: canvas-independent, P3
```

`renderTargets.ts`'s reconcile path (the module backing this type) grows the
one branch that currently derives width/height from `canvasSize / scale` to
instead read `fixedSizePx` when present — a P3 implementation task, not
pinned further here; the contract is the field, not the branch.

---

## Architecture

### The fade band — engagement and the far-field glint

New `SCALE_FADE_BANDS` row, following the `milkyWayApproachGc` pattern
(`milkyWayCloudLiveness.ts:38-41`) exactly: region-relative distance via
`regionRelativeDistanceMpc(camPosMpc, regionById('galactic-centre'), bodyStates)`,
fed through `fadeBand`.

```ts
// src/services/engine/presentation/scaleFadeBands.ts — new row.
// Keyed on: CAMERA distance from the `galactic-centre` region's anchor
// (Sgr A*), Mpc — regionRelativeDistanceMpc, the milkyWayApproachGc pattern.
// A recede band (fullAt < goneAt): full strength at the CLOSE edge, gone at
// the FAR edge — the opposite direction from milkyWayApproachGc, which fades
// OUT on approach. Q6's envelope, in AU:
sgrAStarLensing: {
  fullAt: 100 * SCALE_UNITS.AU_TO_MPC,
  goneAt: 500 * SCALE_UNITS.AU_TO_MPC,
},
```

The far-field glint's alpha is `1 - fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, distMpc)`
— the same two edges, read in the opposite sense, rather than a second
authored pair. Two constants for one crossfade is exactly the kind of drift
risk `scaleFadeBands.ts`'s own `backdropBand` shape exists to avoid; deriving
the glint's alpha from the pass's own band alpha keeps the handoff popless by
construction, the same reasoning `bodyGlint`'s `goneAt = BODY_GLINT_MAX_PX`
share already documents.

Two presences, on two different mechanisms — deliberately, because they live
on opposite sides of P1's apparent-diameter cull:

- **The far-field glint** rides the existing body-glint machinery (the
  subpixel-body sprite path), NOT a body-slab layer: at glint range Sgr A\*
  is subpixel, so `visibleSlabBodies` correctly denies it a slab row, which
  is exactly when a glint mechanism exists to take over. Its roster admits
  the anchor (a P1-adjacent widening), alpha = `1 - lensingBandAlpha`,
  warm-orange. Exact wiring is a plan task. No pick aspect — Sgr A\*'s
  existing pick stamp is untouched by this feature.
- **`sgrAStarLensing`** — a new `ContentLayer` row, `slab: 'body'`, gated on
  `view.slab.frame.bodyId === 'sgr-a-star'`: the geodesic screen pass,
  detailed below. Skips its own dispatch entirely when
  `lensingBandAlpha <= 0` — the exact "pass cost is exactly zero outside the
  band" guarantee Q6 states.

### The lensing pass

**Technique (Q3):** per pixel, classify the Schwarzschild geodesic through
that screen direction from the current eye: **escape** (samples the captured
sky cubemap — lensed background), **crosses the 3–6 r_s emission annulus**
(accumulates glow: doppler + gravitational shift, one global flicker
modulation — Q7), or **captured** (black). The asymmetric ring look emerges
from this classification, not from a painted texture (grill clarification,
Q3).

**Deflection via a precomputed LUT, not per-pixel root-finding** — the same
move PR #365 made for its NFW lens (`src/utils/lensing/buildNfwLensLut.ts`,
a CPU generator inverting the lens equation over a grid, uploaded as a GPU
texture by `createNfwLensLutTexture` and sampled from `lensing.wesl`), one
dimension smaller here because Schwarzschild's bending angle is a function of
impact parameter alone:

```ts
// src/@types/lensing/SchwarzschildDeflectionLut.d.ts — one symbol per file.
export type SchwarzschildDeflectionLut = {
  readonly samples: Float32Array; // total bending angle, radians, indexed by impact parameter
  readonly minImpactParamRs: number; // in units of r_s
  readonly maxImpactParamRs: number;
};

// src/utils/lensing/buildSchwarzschildDeflectionLut.ts — CPU generator.
export function buildSchwarzschildDeflectionLut(sampleCount: number): SchwarzschildDeflectionLut;
```

The pass fully classifies escape/capture from the LUT's bending angle alone —
that lookup is O(1) per pixel. A **short bounded march (~32–64 steps)** runs
only for rays whose impact parameter puts them near the 3–6 r_s annulus band,
to accumulate the emission glow along the ray (the LUT gives total
deflection, not the ray's full path, which the annulus crossing needs). This
is the one per-pixel cost that scales with anything beyond a texture fetch,
and it is bounded and gated to the annulus-adjacent subset of pixels — most
of a frame's pixels (background far from the shadow) take the O(1) path.

**Draw order.** `CONTENT_LAYERS`' additive-HDR group interleaves the roster
("sky") rows with annotation rows today — `orbit-trails` (item 12) and
`body-glints` (item 12b) sit BETWEEN `star-points` (11) and `star-catalog`
(14/15). Q5's "sky lensed, annotations on top unlensed" requires the lensing
pass to draw strictly after every roster row it samples (`point-sprites`,
`milky-way`, `star-points`, `star-aggregates`, `star-catalog`) and strictly
before any annotation that should stay unwarped over it. `orbit-trails` and
`body-glints` therefore move to draw AFTER `sgrAStarLensing` in
`CONTENT_LAYERS`' order (a two-row reorder inside the existing additive-HDR
group — mechanical, flagged here so it is not silently dropped, not pinned
further since the exact insertion index is an implementation task). Per-pixel
alpha does the rest of the work: a ray far from the shadow deflects
negligibly, so the pass's own output there is near-transparent and the
already-drawn roster pixels underneath show through unchanged — the pass
does not need to (and does not) suppress the roster layers' own draws
elsewhere on screen.

### Sky capture

**What gets captured (Q5, Q8):** an explicit opt-in roster — `point-sprites`
(galaxy points), the Gaia survey stream (`star-catalog` + `star-aggregates`,
composited the same way `star-upsample` already does), and whichever
partition branch is currently rendering the S-stars (their apparent size at
GC-relative framing puts them in the `bodyGlints`/`planets`/`starSpheres`
branch of the body/star partition machinery, filtered to S-star ids). Never
the full frame program — the roster is a fixed, named list of layers, not
"everything."

**Cubemap and per-face capture:**

```ts
// src/services/engine/frame/skyCubemapFaceContext.ts — one symbol per file,
// the pickFrameContext.ts precedent (src/services/engine/helpers/pickFrameContext.ts):
// re-derive a full ReadyFrameContext from a synthetic camera rather than
// threading a swapped vp through every consumer, because several roster
// layers read ctx.fovYRad / ctx.canvasSize / ctx.drawPxPerRad frame-globals
// for angular sizing, not just viewProj.
export function skyCubemapFaceContext(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>; // Sgr A*'s anchor position — the cubemap's eye
  readonly face: CubeFace; // 0..5, ±X/±Y/±Z
  readonly faceSizePx: number;
}): ReadyFrameContext | null;
```

256²–512² per face, `rgba16float` (Q8), via the P3 fixed-size 2d-array
target. Cubemap content is treated as at-infinity — a deliberate, stated
approximation (Q5): the strong-field region spans a few AU while the nearest
real content (the S-stars) sits at hundreds of AU, so a star crossing behind
the hole still doubles/rings correctly even though its capture-time position
is not re-projected for the viewer's exact eye offset within that few-AU
range.

**Amortization (Q8):** full 6-face capture once on band entry (so the first
close-up view is never stale), then round-robin one face per frame — a full
refresh every 6 frames, invisible for a quasi-static background at this
distance scale. Each captured face renders the roster at reduced LOD (a
per-pass concern of the roster layers themselves, not a new mechanism).
**Escape valve:** a face is re-captured out of turn only when camera movement
or sim-clock time since its last capture exceeds a threshold — data tuning
(the threshold value), not new architecture.

### Perf

The fragment cost of the six-face capture is trivial: 6×256² ≈ 400k pixels,
far below the point-sprite/star-catalog draw the app already does every
frame. **The watched cost is walking the roster layers a second time** — an
extra `ReadyFrameContext`, an extra vertex pass, an extra CPU-side visibility
walk, per captured face, per frame. Mitigations, restated from Q8/Q9:

- the roster is opt-in and fixed — never the full frame program;
- round-robin caps the extra walk at one reduced-LOD face per frame, not six;
- the threshold-based re-capture escape valve avoids re-walking a static
  face every frame even within the round-robin's own cadence;
- the pass itself dispatches nothing when the band alpha is 0 (Q6) — zero
  cost outside ~500 AU of Sgr A\*.

**Hard gate:** `npm run perf` before and after (read the `perf` skill first;
worktree runs need `--url` against this worktree's own dev-server port). Zero
delta expected outside the band; bounded, measured cost expected inside it.
A neutral-or-negative reading on either measurement halts the landing
pipeline per the project's code-is-liability convention — it does not get
waved through on the strength of the design.

### Settings

Zero new user-facing settings (Q9) — physically parameterized from
`BLACK_HOLES` and the shipped anchor body (mass → r_s). Dev tuning of the
emission/LUT/capture constants rides the existing debug panel and is removed
before merge, the same posture the grill session settled on.

---

## Testing

**Unit-testable, pure:**

- `schwarzschildRadiusM` against the known Sgr A\* figure (0.085 AU /
  12.69 × 10⁶ km, within float tolerance of the hand-authored constant it
  replaces).
- `buildSchwarzschildDeflectionLut` against known Schwarzschild bending-angle
  values at a few chosen impact parameters (the same posture
  `buildNfwLensLut.test.ts` takes against its own closed-form limits).
- `fadeBand` over `SCALE_FADE_BANDS.sgrAStarLensing`'s edges (the band math
  itself — direction, the 100/500 AU envelope in Mpc).
- The P1 `visibleSlabBodies` predicate, over a fixture anchor body, both
  admitted (inside frustum, above pixel floor) and culled (outside either).
- Uniform packing for the emission/deflection data fed to the shader (the
  usual byte-offset table discipline for a WGSL uniform struct — pinned at
  plan time, not here).

**Not unit-testable — user visual gate.** The geodesic tracer's correctness
is a shader-visual question; checklist for the gate:

- shadow diameter reads as ~5.2 r_s (the EHT-consistent apparent size);
- an Einstein ring is visible on background stars crossing near the shadow;
- doppler asymmetry favours the correct side of the annulus (the approaching
  material's side, given the chosen inclination/position-angle);
- the fade band crossfades without a pop at either edge;
- the far-field glint hands off to the close-up without a visible seam.

**Perf** via `npm run perf`, per the Perf section above — a standing gate,
not a one-time check.

**Prep proof obligations**, restated: P1's `visibleSlabBodies` returns the
same set it does today for every scene outside the new band (zero-change
proof); P2's `clampDistance` floor is unchanged for every body that doesn't
set `standoffRadii` (Earth's `1.0000024` untouched); P3 adds a target form,
touching no existing target row's derivation.

---

## Sequencing

1. **PR #634 (`globe-camera`)** merges first — the body-slab architecture
   this entire spec is written against.
2. **Ground-preparation PR** — P1, P2, P3, each its own commit, its own PR
   per the checkpoint packaging decision (unlike the S-star spec's
   one-PR-with-prep-first packaging; the black-hole feature is large enough,
   and cleanly separable enough from the prep, that the prep lands and is
   reviewed on its own).
3. **2 r_s descent probe** (Q11's resume-checklist item 1) — focus Sgr A\*,
   force distance to ~2 r_s under the merged slab, observe jitter / frustum /
   S-star sprite stability. This is the first implementation task of the
   feature plan, ahead of any shader work, because it validates the
   precision assumption (`bodyRelativePose`'s f64-cancel-then-scale-to-metres
   seam, `oneMpcSeam.test.ts`) the rest of the feature is built on.
4. **Feature implementation** — data rows, fade band, glint layer, LUT
   builder, geodesic shader, cubemap capture, lensing `ContentLayer`, draw-
   order reorder, debug-panel dev tuning (removed before merge).

## Relationship to open items

`docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md` — the
Q11 resume checklist names this as a candidate to fold into prep "if the
probe implicates it." This spec does not resolve it; the descent probe
(sequencing step 3) is the point at which that judgment call gets made, not
spec time. Left standing, untouched by this spec.

`docs/backlog/2026-09-01-render-black-hole.md` and its `BACKLOG.md` index
line describe exactly this feature; both are retired in the same change that
adds this spec, per the backlog-hygiene convention — this spec is now the
source of truth.
