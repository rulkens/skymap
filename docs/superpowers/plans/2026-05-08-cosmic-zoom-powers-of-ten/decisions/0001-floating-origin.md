# 0001 — Per-shell floating origin with snap-once anchors

**Status:** Accepted (proposed by the cosmic-zoom plan author; awaiting team review)
**Date:** 2026-05-08
**Deciders:** the cosmic-zoom plan author (proposed); awaiting review

## Context

Skymap today represents every world-space position as `f32` Cartesian Mpc. The
existing dynamic range is comfortable: the largest catalog object sits at
~5 Gpc, the smallest rendered structural feature is ~10 kpc, ~10⁵·⁵ orders of
magnitude end to end. `f32`'s ~7.22 decimal digits of significand absorb that
without complaint.

The cosmic-zoom plan blows the budget. A "Powers of Ten" cinematic spans from
the Sun's photosphere (~7 × 10⁵ km ≈ 2.3 × 10⁻¹⁴ Mpc) to the observable
horizon (~14 Gpc ≈ 1.4 × 10⁴ Mpc). That is **~17 orders of magnitude in a
single coordinate space.** A single `f32` Mpc representation cannot carry it:
positions near the horizon snap to a grid ~30 kpc wide, which is itself larger
than every Solar System and Stellar-Neighborhood feature combined. Subtracting
two such positions in a view-matrix multiply triggers catastrophic cancellation
— the bits we care about have already evaporated before the GPU sees them.

WebGPU offers no escape. WGSL exposes `f32` only; there is no `f64` storage,
no `f64` arithmetic, no hardware path on the consumer GPUs we ship to. The
`f32`-on-the-GPU constraint is non-negotiable for the foreseeable future.

We need a representation that lets the renderer span 17 orders of magnitude
while keeping every value the GPU sees inside `f32`'s comfort zone (roughly
`[−1000, 1000]`). The cosmic-zoom architecture builds nine logarithmically
spaced **shells** ([`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md))
and each shell needs a coordinate system that is precision-friendly at *its*
scale. This decision picks the precision strategy.

## Decision

We adopt a **per-shell floating-origin** scheme with **snap-once anchors**.

Concretely:

1. **`f64` is the truth on the CPU.** Every absolute position (catalog body,
   camera, anchor) is stored as a JS `Number` or `Float64Array` in heliocentric
   Mpc. JavaScript is already `f64` end to end — the work is to *not lose it*
   to a premature `Float32Array`.
2. **Each shell has a stable anchor.** The Sun for shells 1–3, the Local Group
   barycenter for shell 4, M87 for shell 6, Great Attractor for shell 7,
   heliocentric origin for shells 8–9. The anchor is selected at shell entry
   and **does not move** for the lifetime of the shell.
3. **Each shell has a native unit** (AU, pc, kpc, Mpc, Gpc) chosen so typical
   in-shell positions have magnitudes in `[10⁻³, 10³]` shell-units after
   subtraction.
4. **GPU uploads carry `f32` shell-relative positions.** The CPU computes
   `f32(absolutePos − shellOrigin) / shellUnit` once at shell entry; the result
   is reused frame after frame.
5. **The view matrix is built from a shell-relative camera position**, so the
   GPU never sees a large translation column.

The full math, snapping policy, and worked examples are in
[`../rendering/05-floating-origin.md`](../rendering/05-floating-origin.md).

## Alternatives considered

**(a) Single global Mpc `f32` (status quo).** Keep doing what we do today. The
cosmic-zoom design simply does not extend the existing scheme; it asks for a
17-OOM range that `f32` cannot hold without re-anchoring. Rejected on
correctness — there is no parameter knob that makes this work.

**(b) `f64` emulated in WGSL (split-precision / "double-single").** A pair of
`f32` values storing high-bits and low-bits, with custom add/subtract/multiply
routines (the DSFUN90 trick popularised by Cesium and Outerra). Doubles every
attribute's GPU bandwidth and roughly triples ALU cost on hot paths. Brings
its own footguns (special handling for FMA, denormals, subtraction of
near-equals). Rejected on cost: the per-shell snap-and-subtract pattern gives
us all the precision we need without spending ALU on every vertex. We keep
this in the back pocket as a fallback if a future shell ever needs sub-meter
precision *inside the GPU* (Solar System surface detail, gravitational lensing
on individual stars).

**(c) Re-anchor every frame to the camera position.** The textbook camera-
relative form: `shellOrigin = cameraAbsolutePos`, recomputed each frame. Gives
the best possible precision (camera *is* the origin), but the per-instance
`Float32Array` would have to be re-uploaded every frame to keep up — millions
of writes per second for 3.5M points. It also produces sub-pixel shimmer on
static objects because rounding error in the per-frame subtraction differs
frame to frame. Rejected on cost and determinism.

**(d) Hierarchical scene graph with per-node frames.** A full Cesium-style
quadtree of coordinate frames, with implicit transforms composing at draw
time. Solves precision at every depth but introduces a runtime hierarchy we
have no other use for: skymap renders flat point/billboard data, not nested
articulated 3D scenes. The complexity-to-benefit ratio is poor. Rejected on
overkill — discrete shells give us the same precision-per-scale property with
a flat data structure that mirrors the rest of the codebase.

## Consequences

**Positive.**

- **Precision wins.** Each shell renders with ~7 decimal digits of resolution
  *at its own scale*. A 30 pc detail in shell 4 (Mpc) is just as crisp as a
  30 km detail in shell 1 (AU), because both fit `f32`'s sweet spot in their
  native units.
- **Per-instance buffers are cheap.** The shell origin is constant within a
  shell, so we upload once at shell entry and the GPU buffer is byte-identical
  every subsequent frame. Render-on-demand and screenshot-diff testing both
  rely on this determinism.
- **No GPU-side `f64` work.** WGSL stays simple; no split-precision tricks,
  no extra attributes, no shader complexity tax.

**Negative.**

- **CPU pays for unit conversions.** Every catalog must be converted to
  shell-units at load time. Adds a small one-time cost per shell entry
  (subtraction + division for each record) and a small recurring cost for any
  per-frame world→shell mapping (e.g. label projection).
- **Two camera positions.** Code reading `camera.position` must now know
  whether it wants `absolutePos` (heliocentric Mpc, `f64`) or shell-relative
  (shell-units, `f32`). Confusing the two is a class of bug we'll need lint
  rules and code review to catch.
- **Catalog `.bin` files must be re-readable as `f64`.** Today's
  `pointCloudFormat` writes `f32` positions directly; for inner shells (1–3),
  any `.bin` we generate must either preserve the `f64` source until the
  re-anchoring step or accept that the source's precision was already capped
  at `f32` (and therefore cannot resolve sub-grid features, which is fine for
  catalogs derived from observations whose own positions are `f32`-precision
  to begin with).
- **Shell crossings must re-upload.** Crossing a shell boundary is the only
  event that recomputes the per-instance buffer. Crossings are rare (every
  few seconds during a tour, on demand otherwise), so the cost is amortised,
  but the upload spike is a thing to budget for.

## References

- [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — multi-shell architecture overview; the `CameraScale` type lives here.
- [`../rendering/05-floating-origin.md`](../rendering/05-floating-origin.md) — long-form companion: precision math, `f64`/`f32` split, snap-once anchor policy, common bugs, testing strategy.
- [`../rendering/06-depth-precision.md`](../rendering/06-depth-precision.md) — the matching per-shell projection-matrix decision (depth-buffer precision is the *other* half of the precision problem).
- [`./0002-shell-discrete-vs-continuous.md`](0002-shell-discrete-vs-continuous.md) — the discrete-shell decision this scheme presupposes; floating-origin per-shell only makes sense if shells are discrete.
- Outerra blog, _"Floating point precision in space"_ — practical reference for the `f32` precision-vs-magnitude analysis used in the rendering doc.
- Cesium engine docs, _"Precisions, Precisions"_ — WebGL prior art for floating-origin with per-tile re-anchoring.
