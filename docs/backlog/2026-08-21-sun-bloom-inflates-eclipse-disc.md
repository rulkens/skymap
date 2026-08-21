# Sun bloom inflates the solar disc against a transiting Moon

**Observed** (2026-08-21, simulating the 2026-08-12 total eclipse from ~600 km above Earth): the Moon transits the Sun but reads ~⅓ of the Sun's visible diameter. The data layer is correct — the code's own numbers give Moon/Sun angular ratio ≈ 1.006 that day (Moon radius 1737 km at a Kepler-propagated ~371,000 km, within 0.4% of truth; Sun 696,340 km at 1 AU), correctly reproducing a total eclipse.

**Root cause — photometric, not geometric.** The resolved Sun sphere is filled flat-emissive at 12.0 (`src/services/gpu/shaders/bodies/star/fragment.wesl`, invariant codified in `src/data/starRenderConstants.ts`: `DEFAULT_BLOOM_THRESHOLD (2.0) < STAR_KNEE (8.0) <= STAR_EMISSIVE (12.0)`), deliberately seeding the screen-space bloom pyramid — so its visible silhouette is the true 0.53° disc plus a glow halo. The Moon is Lambert-lit albedo (≤ ~1.0), never crosses the bloom threshold, and shows its exact geometric limb. Both discs share the same `composeBodyMvp` f64 geometric path; only the photometry diverges.

**Fix directions** (design call):

1. **Attenuate the Sun's bloom seeding as its resolved disc grows on screen** — glare is right for a point-like star, wrong for a resolved photosphere; scale emissive down with apparent px so the visible edge converges to the geometric limb on close approach. (Recommended.)
2. Occlusion-aware emissive — dim by the transiting body's covered fraction so glare collapses toward totality (prettier; more machinery).

**Adjacent context**: `docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md` (Sun's dual identity body-row vs famous-star row) touches the same rendering split. The 2024-04-08 eclipse regression test (`tests/data/bodies/orbitalElements.test.ts`) checks alignment only, not apparent size.
