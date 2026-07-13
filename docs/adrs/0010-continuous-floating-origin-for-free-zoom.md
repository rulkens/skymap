# ADR 0010 — Continuous Per-Object Floating Origin for Interactive Free Zoom

- **Status:** Accepted
- **Date:** 2026-06-29
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Tags:** engine, rendering, precision, camera, scale
- **Amends (does not reverse):** ADR 0001 (per-shell floating origin) — keeps
  its precision core, drops its discrete-shell register for the free-zoom case.
  ADR 0001's source doc
  (`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md`)
  lives on the `cosmic-zoom-plan` branch, **not** on `main`; it is referenced
  by that path throughout.

## Context

Skymap stores every world position as `f32` Megaparsecs (1 world unit = 1 Mpc),
and WebGPU/WGSL is `f32`-only on the GPUs we ship to. `f32` carries ~7.2 decimal
digits, but the descent this feature builds spans from the cosmic horizon
(~1.4×10⁴ Mpc) down to Earth's radius (~2×10⁻¹⁶ Mpc) — roughly **17 orders of
magnitude in one coordinate space**. No single global `f32` Mpc space can hold
that: near the horizon, `f32` positions already snap to a ~30 kpc grid, larger
than the whole Solar System. Some form of floating origin is unavoidable.

ADR 0001 (from the 2026-05-08 "Powers of Ten" cosmic-zoom plan) already reached
that conclusion and chose a specific shape: **discrete per-shell** floating
origins. The camera would move through nine _curated_ shells (Earth, Solar
System, local stars, the Galaxy, …); each shell carried its own origin and its
own native unit register, and the camera **snapped once** to a shell's anchor on
entry. That shape is well-matched to what it was designed for — a **scripted
cinematic tour** that visits a fixed, ordered set of stops. When the itinerary
is known in advance, there is always a well-defined "current shell," and a
snap-once anchor per shell is both cheap and precise.

This feature is a different interaction: **interactive free zoom**. The user
drives a continuous exponential zoom and can **park anywhere on the continuum** —
halfway between the Moon and Jupiter, or drifting past Proxima. There is no
"current shell" to be in, because the itinerary is the user's, not the author's.
Applied to free zoom, discrete snap-once anchors misbehave in exactly the way
their scripted-tour design never had to face: crossing a shell boundary would
re-anchor the origin and produce a visible **re-anchor pop** mid-gesture. The
discrete-shell register is answering a question — "which of nine curated stops
are we at?" — that free zoom never asks.

ADR 0001's status was "proposed, awaiting review." Because it was never ratified
and because its precision _core_ is sound, adapting it for the free-zoom case is
a legitimate refinement, not a reversal of a standing decision. This ADR records
that refinement so the two coordinate schemes — scripted-shell and free-zoom —
are distinguishable in the record rather than silently divergent.

## Decision

Adopt a **continuous per-object floating origin** for interactive free zoom.
It **keeps ADR 0001's precision core** and **drops its discrete-shell
machinery**:

**Kept from ADR 0001 (the precision core):**

- **`f64` truth on the CPU.** Every absolute position — body and camera pose —
  is a JS `Number` / `Float64Array` in heliocentric Mpc, the existing catalog
  convention (Sun at origin), just never prematurely narrowed.
- **`f32` only at the GPU boundary.** The `f64 → f32` narrow happens at exactly
  one seam: matrix upload. `src/utils/math/narrowMat4.ts` is that one-line narrow
  (`new Float32Array(m)`); every helper that produces a slab or per-body matrix
  returns a `Float64Array` and leaves narrowing to its caller. The CPU keeps the
  double-precision truth for as long as anything might still need it — for
  example `src/utils/camera/rebaseViewProj.ts` returns `Float64Array` precisely
  so a CPU-side matrix _inversion_ (caption leader-line placement) can run before
  the narrow, rather than inverting an already-lossy `f32` matrix.
- **Per-object MVP composed in `f64`, then narrowed.** Each foreground body
  composes `MVP = proj · view · model` in `f64` (wgpu-matrix `mat4d`), with the
  camera expressed relative to the render origin and geometry in the body's
  native unit, and only narrows the finished matrix. Composing _before_ narrowing
  is what dodges the catastrophic cancellation that a large view translation
  minus a small body offset would otherwise suffer.
- **Native units per body.** Earth/planets in km, stars in pc — model-scale
  factors stay sane instead of every body sharing one register's unit.

**Dropped for free zoom:**

- **The global shell-unit register and the shell registry.** Free zoom has no
  discrete shells, so it has no need for a per-shell unit register or a registry
  of curated stops. Native-unit-per-object (above) already gives well-conditioned
  model matrices without a shell to hang the unit on.
- **Snap-once anchoring.** There is no shell boundary to snap at, so there is no
  snap.

**One continuous origin, held fixed, with a named extension point.** The render
origin is a single `f64` Mpc point that all per-object matrix math is expressed
relative to: `RENDER_ORIGIN_MPC` in `src/data/renderOrigin.ts`. **For this
feature it is fixed at the Sun `(0, 0, 0)`** — every body we render (Sun, Earth,
Moon, Jupiter, Proxima) sits within ~1.3 pc of it, so a moving origin would buy
nothing. It is imported directly **as a constant**, not carried as per-frame
context state, and is consumed by the near-field slab derivation
(`src/services/engine/frame/slabs.ts`) and the debug-spheres layer. That constant
_is_ the named extension point where a future moving origin plugs in — the
`NEAR0` slab row already declares `originRelative: true` and `precision: 'f64'`
against it, and its module comment spells out that a future floating origin would
re-derive a per-slab `camPos` there. We deliberately do **not** build
threshold-rebasing or per-instance buffer re-upload we would not exercise while
the origin is fixed (YAGNI); the seam is named, not pre-built.

## Consequences

### Positive

- Continuous zoom has no re-anchor pop, because there is no boundary to re-anchor
  at — the single fixed origin removes the class of artifact discrete shells
  would have introduced into a free gesture.
- The precision core (`f64` CPU truth, single `f32` narrow at upload, compose
  before narrow) is inherited wholesale from ADR 0001, so this ADR carries no new
  precision risk — only a simpler origin policy laid over the same seam.
- Dropping the shell register and shell registry removes machinery the free-zoom
  case never uses, leaving a smaller thing to reason about: one origin, one narrow
  boundary.
- The extension point is explicit (`RENDER_ORIGIN_MPC` + the `NEAR0` slab's
  `originRelative`/`precision` fields), so a later moving origin — flying into M31,
  say — is a change at one named location, not a scheme rewrite.

### Negative

- Holding the origin fixed at the Sun is only correct while every rendered body
  stays close to it. The moment content lives far from the Sun (a distant shell),
  the fixed origin no longer conditions its matrices well, and the deferred
  moving-origin work (threshold-rebasing, per-instance re-upload) becomes real.
  This ADR accepts that debt knowingly and marks where it lands.
- Two coordinate schemes now coexist in the codebase's intent — scripted-shell
  (ADR 0001, unbuilt) and free-zoom-continuous (this ADR, built). A reader must
  know which one a given descent uses; that is the cost of refining rather than
  replacing.

### Neutral / forward-looking

- No on-disk format change: positions stay `f32` Mpc in the `.bin`; the `f64`
  truth is a runtime CPU representation, not a stored one.
- The single `NEAR0` near-field slab that this origin backs is expected to
  **tile** as the descent matures. A follow-up will split the depthless
  parsec-scale star field (points, captions, connectors) onto its own `STARS`
  slab, sized for its own content, while depth-tested bodies (Earth, planets,
  resolved star spheres) stay in `NEAR0` — see the "star field → its own slab"
  backlog item (`docs/backlog/2026-07-13-star-field-own-slab.md`), which tiles a
  further slab onto **this same continuous-origin scheme** and names this ADR as
  its anticipated predecessor.
- The parsec regime (Proxima at ~1.3 pc) is where compose-in-`f64`-then-narrow
  is _visibly_ load-bearing — at AU scale `f32` still holds a ~700× margin — so
  that regime is the concrete motivator both for the `f64` compose kept here and
  for the future third slab above.

## References

- [Zoom-to-Earth true-scale design](../superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md)
  §3 ("Precision model — continuous per-object floating origin") — the design this
  ADR ratifies, including the "Relationship to ADR 0001" subsection it distils.
- ADR 0001 — per-shell floating origin (refined here). Its source doc lives on
  the `cosmic-zoom-plan` branch at
  `docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md`,
  **not** on `main`; the spec above references it by that path in its own
  References section.
- [ADR 0005 — engine data layer + asset loading](0005-engine-data-layer-and-asset-loading.md)
  — the data-type-vs-presentation axis these foreground bodies (star/planet/earth)
  follow, and the units single-source-of-truth (`scaleUnits.ts`) reserved there.
- `src/data/renderOrigin.ts` — `RENDER_ORIGIN_MPC`, the fixed origin and named
  extension point.
- `src/services/engine/frame/slabs.ts` — the `NEAR0` slab row
  (`originRelative: true`, `precision: 'f64'`) built against that origin.
- `src/utils/math/narrowMat4.ts` and `src/utils/camera/rebaseViewProj.ts` — the
  `f64` truth / `f32`-at-upload boundary idiom (the latter returns `Float64Array`
  so a CPU-side inversion runs before the narrow).
- `docs/backlog/2026-07-13-star-field-own-slab.md` — the anticipated follow-up
  that tiles a `STARS` slab onto this same continuous-origin scheme.
