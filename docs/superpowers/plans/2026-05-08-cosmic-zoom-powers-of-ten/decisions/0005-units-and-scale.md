# ADR 0005 — Per-shell native units (not a single canonical unit)

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** Alexander Rulkens (project lead), with input from the cosmic-zoom plan working group

## Context

The Powers-of-Ten tour spans ~17 orders of magnitude in length: from the Sun's photosphere (~7 × 10⁵ km ≈ 2.3 × 10⁻¹⁴ Mpc) at the inner edge to the CMB sphere at ~14 Gpc at the outer edge. WebGPU shaders only have `f32` available (no `f64` in WGSL), and `f32` provides ~7 decimal digits of precision. Spanning 17 orders of magnitude in a single coordinate space is therefore impossible without precision loss that is visible as jitter, snapping, or outright clipping.

The architectural response — described in detail in [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — is the **floating-origin nested-shell** technique used by space-simulation games (Kerbal Space Program, Elite: Dangerous). Each shell has its own origin (Sun, Local Group barycentre, M87, etc.) and its own near/far projection planes; positions are stored in `f64` in absolute heliocentric Mpc and rebased per-frame to the active shell's origin before being narrowed to `f32` for the GPU.

That architecture leaves one design question open: **what unit do the positions use after the rebase?** Three plausible choices:

1. Keep megaparsecs everywhere — the existing skymap convention.
2. Switch the entire codebase to SI metres — universally understood, no mental conversion.
3. Give each shell a **native unit** chosen so typical positions in that shell have magnitudes between roughly 0.001 and 1000 — and convert at the upload boundary.

This ADR records the choice between those three. The conclusion is foreshadowed in [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §Piece-2 (the `SCALE_UNITS` constants) and in the per-shell table; this document is the *why*.

## Decision

**Each shell uses its own native unit:**

| Shell | Native unit | Typical magnitudes |
|-------|-------------|--------------------|
| 1 — Solar System | AU (astronomical units) | 0.01–100 |
| 2 — Stellar Neighborhood | parsec (pc) | 0.1–100 |
| 3 — Milky Way | kpc | 0.1–100 |
| 4 — Local Group | Mpc | 0.01–10 |
| 5 — Local Sheet | Mpc | 1–100 |
| 6 — Virgo Supercluster | Mpc | 10–500 |
| 7 — Laniakea | Mpc | 100–1000 |
| 8 — Cosmic Web | Gpc | 1–10 |
| 9 — Observable Universe | Gpc | up to 14 |

The conversion constants live in `src/data/scaleUnits.ts` as a single `SCALE_UNITS` object exporting `AU_TO_MPC`, `PC_TO_MPC`, `KPC_TO_MPC`, `MPC_TO_MPC`, `GPC_TO_MPC`, plus an `LY_TO_MPC` for *copywriting only* (overlay text uses light-years; renderers never do — see [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) for the copy convention).

**The flow is:**

1. Catalog data is loaded in absolute heliocentric Mpc (`f64`) — unchanged from today.
2. The engine maintains `CameraScale` with `shellOrigin` and `shellUnit` for the active shell ([`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §Piece-1).
3. At GPU upload time, `shellRelative()` subtracts `shellOrigin` in `f64`, divides by `shellUnit`, and narrows to `f32`. Positions on the GPU are now in the active shell's native unit, with magnitudes in the f32-friendly range.
4. The shell's projection matrix uses near/far values *also* expressed in the shell's native unit (e.g., shell 1's near = 0.01 AU, far = 200 AU).
5. Shaders treat the unit as opaque; they do scalar math on positions without knowing or caring whether `1.0` means an AU, a parsec, or a Mpc. The unit lives entirely in the upload boundary and the projection matrix.

## Alternatives considered

**(a) Megaparsecs everywhere.** Keep skymap's existing single-unit convention and let small-shell positions be tiny: the Sun-to-Earth distance becomes 4.85 × 10⁻¹² Mpc. **Rejected** because positions of that magnitude push into f32 denormal territory (smallest normal positive f32 is ~1.18 × 10⁻³⁸; 10⁻¹² is fine in isolation but anything that multiplies two such numbers, or compares one to `epsilon`, breaks). More practically, every shader constant becomes awkward — the Sun's 1.4 × 10⁶ km radius is `4.5 × 10⁻¹⁵ Mpc`, and any author touching that code has to reason about the exponent before they can reason about the geometry. This is exactly the friction the architecture is trying to eliminate.

**(b) Metres (or another single SI unit) everywhere.** Universal, unambiguous, taught in every school. **Rejected** because it fails the *opposite* end of the scale: galaxy positions become ~10²² m, the CMB sphere is ~10²⁶ m, and `f32` cannot represent integers in that range without precision loss. A galaxy at 10²² m and another galaxy at 10²² m + 10¹⁸ m (one parsec apart) round to the same f32 bit pattern — the parsec separation is *invisible* at that magnitude. We would have invented a brand-new precision crisis at the outer shells in exchange for fixing the inner ones.

**(c) Per-shell native units (chosen).** Each shell sits in the f32 sweet spot (magnitudes between ~10⁻³ and ~10³). Conversion happens at one well-defined boundary (`shellRelative()`), not at every shader call. Authors of any given shell reason in the unit native to that shell — Solar System code reads `1.0` as "1 AU," cosmic-web code reads `1.0` as "1 Gpc," and neither has to think about the other's regime. The trade is a one-time mental cost ("which unit am I in?") that is paid by reading the shell's `shellUnit` field, which is already where they would look anyway.

## Consequences

**Engineering:**
- `src/data/scaleUnits.ts` becomes the single source of truth for unit conversions. Every renderer that consumes shell-relative positions accepts them in the active shell's unit; no renderer hardcodes a unit.
- Per-shell projection matrices ([`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §Depth-precision) declare their `near`/`far` planes in the shell's native unit. The matrix builder doesn't need to know what the unit is; it only needs the numbers and the FoV.
- Catalog ingestion (`tools/buildAllBins.ts`, the parsers, the binary format in `src/data/pointCloudFormat.ts`) is **unchanged**. Stored data stays in Mpc — the per-shell units are a render-time concept only. This protects the existing data pipeline from churn and means already-built `.bin` files continue to work.
- The existing wide-view code path is shell 8 (cosmic web), and shell 8's native unit is *Gpc*, not Mpc. This is a behavioural change for the existing renderer: positions arriving at the GPU are now ~1000× smaller than today. Mitigation: the migration in [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §The-transition-from-today defaults `shellUnit = 1` (Mpc) at Step 1, then introduces Gpc for shell 8 at the per-shell-renderer step (Step 4) — keeping the existing renderer untouched until its dedicated migration. The "byte-equivalent same-frame, same-precision" guarantee in that doc holds because shell 8's render pass is the legacy renderer with its scaling argument set.

**Authoring (script + shells):**
- Camera waypoints in [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) are written in the *waypoint's own shell's* unit. A Solar System waypoint reads `position: [0, 0, 50]` meaning 50 AU; a Laniakea waypoint reads `position: [0, 0, 200]` meaning 200 Mpc. The `shellId` field on the waypoint disambiguates. This is more legible to script authors than a global Mpc convention would be.
- Overlay copy is written in light-years and other reader-friendly units (Pluto-distances, light-minutes, billions of light-years) per [`../vision/00-product-vision.md`](../vision/00-product-vision.md) Principle 2. The reader-facing unit is fully decoupled from the render-time unit; the `LY_TO_MPC` constant in `scaleUnits.ts` exists *only* so that copy authors can sanity-check their numbers against the same source of truth.

**Testing:**
- A snapshot test on `SCALE_UNITS` pins the conversion constants. These are physical constants and should never change; if a future commit edits them, the snapshot must be deliberately regenerated and the change reviewed.
- A round-trip test for `shellRelative()`: take a heliocentric Mpc position, rebase to a shell, check that the result is in the expected magnitude range for that shell. If a shell's positions are systematically outside [0.001, 1000], the shell's `shellUnit` is wrong — the test catches the misconfiguration at CI time, not in a visual artefact at runtime.
- Per-shell projection-matrix tests assert that the near/far values are in the same unit as the renderer expects, by rendering a known-distance test point and reading back the depth value.

**Documentation:**
- Every shell-spec doc declares its native unit at the top. Readers reasoning about a shell's geometry should never have to flip back to this ADR; the unit convention is local to each spec.
- This ADR is referenced from [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) for the "why per-shell units" question, so the architecture doc can stay focused on the *technique* (floating origin) rather than the *unit choice*.

**Forward compatibility:**
- Adding a future shell (say, "Sub-AU — Earth–Moon system") means picking a new native unit (km, probably) and adding the conversion constant. No existing shell is affected.
- If WGSL ever gains `f64`, this architecture remains correct — it just becomes over-engineered for the precision problem it was built to solve. The per-shell unit *aesthetic* benefit (each shell's authors reason in the right unit) survives independently of the `f64` question.

## References

- [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — full multi-shell coordinate architecture; §Piece-2 lists the per-shell units this ADR ratifies
- [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) — waypoint type carries `shellId`, which determines the unit of `position` and `lookAt`
- [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) — the narrative copy uses reader-friendly units (light-years, AU); render-time units never leak into overlay text
- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — Principle 2 ("zero text below the fold") which keeps overlay copy unit-friendly
- `src/data/pointCloudFormat.ts` — catalog binary format stays in Mpc; this ADR does not affect it
- `src/data/scaleUnits.ts` (planned) — the single source of truth for the conversion constants
