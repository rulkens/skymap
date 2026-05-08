# 0002 — Discrete named shells with crossfade transitions

**Status:** Accepted (proposed by the cosmic-zoom plan author; awaiting team review)
**Date:** 2026-05-08
**Deciders:** the cosmic-zoom plan author (proposed); awaiting review

## Context

The cosmic-zoom narrative spans 17 orders of magnitude, from the Solar System
to the observable horizon. The product vision (see
[`../vision/00-product-vision.md`](../vision/00-product-vision.md)) commits to
a **continuous visual story**: one connected universe, not a slideshow of
unrelated tableaux. Principle 3 ("no hard cuts") is load-bearing for the
emotional arc — a frame of "stars" followed by a frame of "galaxies" reads as
a scene change, killing the sense of pulling continuously back through scale.

At the same time, the rendering reality across that range is starkly
discontinuous. Each scale demands a *different rendering technique*:

- Shell 1 (Solar System) wants textured spheres on Keplerian orbit lines.
- Shell 2 (Stellar Neighborhood) wants 10⁷ instanced point sprites with
  temperature-tinted bp_rp colours.
- Shell 3 (Milky Way) wants a parametric disk + dust-lane composite.
- Shell 4 (Local Group) wants oriented galaxy disks with thumbnails.
- Shells 5–8 want the existing point-cloud + filament + quad pipeline.
- Shell 9 wants a single equirectangular CMB sphere.

These are not parameter tweaks of one renderer. They are nine substantively
different visual treatments backed by nine substantively different data
schemas, projection matrices, and shader sets. The architecture decision is
how to **stage** them: as a single continuous coordinate space whose visual
treatment is gradient-encoded along one axis, or as a discrete set of named
modules that the camera transitions between?

This decision sits between two existing design docs and constrains both:
[`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)
specifies the `ShellRenderer` interface and the per-shell render pass;
[`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md)
specifies the `fadeAlphaAt()` math that runs *between* shells. Both presume
the answer below.

## Decision

We adopt **discrete named shells with crossfade transitions.**

Concretely:

1. There are exactly nine shells (`SOLAR_SYSTEM`, `STELLAR_NEIGHBORHOOD`,
   `MILKY_WAY`, `LOCAL_GROUP`, `LOCAL_SHEET`, `VIRGO_SUPERCLUSTER`,
   `LANIAKEA`, `COSMIC_WEB`, `OBSERVABLE_UNIVERSE`). Each is a first-class
   entity in the type system: `type ShellId = '...' | '...' | ...`.
2. Each shell owns its own `ShellRenderer` module under
   `src/services/gpu/shells/<shellId>/`, with its own data formats, shader
   files, projection-matrix configuration, and asset loading.
3. The camera is always *in* exactly one shell at any instant, and may also be
   *crossing* one boundary (with non-zero `fadeAlpha` on two adjacent shells
   simultaneously). Three-shell overlap is forbidden by construction.
4. Boundaries are crossed via a temporal **crossfade**: both adjacent
   `ShellRenderer`s run for ~1–2 seconds, their outputs composited with alphas
   summing to 1, eliminating any frame where the camera "is between scales"
   visually. The crossfade math is in
   [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md).
5. The orchestrator in `src/services/engine/runFrame.ts` evaluates
   `fadeAlphaAt()` per shell per frame and runs only those with
   `fadeAlpha > 0.001` (lazy activation; outermost-first composition order).

## Alternatives considered

**(a) Continuous log-scale rendering — one mega-renderer.** A single renderer
that accepts a continuous "scale" uniform and adapts its visual style by
interpolating shader parameters along it. Conceptually elegant: the camera
never "changes shells", it just slides along a log-scale axis and the visuals
morph smoothly. Rejected because the visuals at different scales are
*qualitatively* different, not quantitatively. Interpolating between "textured
sphere on a Kepler orbit" and "instanced point sprite with bp_rp colour" and
"oriented galaxy disk with thumbnail" is not a parameter sweep — it is three
incompatible vertex layouts, three shader families, three asset pipelines.
Forcing them into one mega-shader produces either a 3000-line `if` ladder or
an unreadable uber-shader, and couples every shell's visual decisions to every
other's. The "one renderer" abstraction doesn't earn its complexity.

**(b) Discrete shells with hard cuts.** Same module structure as the chosen
option, but boundaries are crossed in a single frame: shell N renders at full
alpha, then shell N+1 renders at full alpha, no overlap. Cheaper (one
render pass per frame, no compositor logic, no double-render budget), but
violates Principle 3 directly. Hard cuts read as scene changes; the user
loses the sense of continuity and the cinematic loses its emotional through-
line. The product vision is non-negotiable on this point. Rejected on
correctness against the design's own goals.

**(c) Continuous coordinate space with per-shell visual modules gated by
distance.** A hybrid: keep one global Mpc coordinate space (no per-shell
units), but layer per-shell renderers that activate based on camera distance.
This is half-way between the chosen option and option (a). Rejected because
it surrenders the precision win from
[`./0001-floating-origin.md`](0001-floating-origin.md): without per-shell
unit conversions, the GPU still receives values in Mpc, so the inner-shell
renderers (Solar System, Stellar Neighborhood) would be operating on
positions like `2.3e-14`, well outside `f32`'s comfort zone. The two
decisions are coupled: discrete shells + per-shell units + per-shell
floating origin form a single design.

## Consequences

**Positive.**

- **Per-shell visual freedom.** Each `ShellRenderer` chooses its own data
  layout, shader set, and projection matrix without negotiating with eight
  other shells. The Solar System team can iterate on Kepler orbits without
  worrying about how a shader edit affects the cosmic web pass.
- **Lazy loading falls out for free.** A shell whose `fadeAlpha` is zero
  doesn't render and (per [`./0003-data-format-strategy.md`](0003-data-format-strategy.md))
  doesn't need its data loaded. The user who never zooms in past shell 8
  never downloads `solarsystem.bin` or `stars.bin`.
- **Per-shell precision.** Pairs cleanly with the per-shell floating-origin
  decision. Each shell's coordinate frame is independent; precision wins per
  shell, no cross-shell leakage.
- **Predictable crossfade math.** `fadeAlphaAt()` is pure, deterministic,
  unit-testable, and the only path between shells. There is no "what if the
  camera is in three shells at once" edge case to reason about — the design
  forbids it.

**Negative.**

- **Nine code paths instead of one.** Per-shell modules duplicate
  scaffolding: each one needs an `init`, a `render`, a `dispose`, an asset-
  slot wiring, a projection-matrix config, a shader set. Nine of each is a
  meaningful surface area to maintain.
- **Crossfade compositing burns frame budget.** During a crossfade both
  shells render, doubling the per-frame cost for ~1–2 seconds at each
  boundary. The
  [performance budget](../rendering/07-performance.md) accounts for this
  (each shell stays well under half its 16 ms slice), but it constrains how
  expensive any single shell can become.
- **Shell boundaries are policy.** The `D_in` / `D_out` distances and band
  half-widths in
  [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md)
  are creative choices, not derived from the data. Tuning them is iterative
  and visual-test-driven; getting them wrong produces either three-shell
  overlap (forbidden) or a perceptible "no-shell" gap (also forbidden).
- **Some objects render twice during transitions.** The Milky Way exists in
  shell 3 (as a structured disk) and shell 4 (as a single point representing
  the LG's largest member). During the 3↔4 crossfade both representations
  render simultaneously — which is artistically correct (the disk smoothly
  becomes a point) but doubles the work for that object.

## References

- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — Principle 3 ("no hard cuts") that drives the crossfade requirement.
- [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — `ShellRenderer` interface, per-shell render passes, composition order.
- [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) — `fadeAlphaAt()` math, smoothstep-in-log-space, two-shell-overlap invariant.
- [`./0001-floating-origin.md`](0001-floating-origin.md) — coupled decision; per-shell floating origin only makes sense if shells are discrete.
- [`./0003-data-format-strategy.md`](0003-data-format-strategy.md) — coupled decision; per-shell bespoke binary formats follow naturally from per-shell discrete renderers.
