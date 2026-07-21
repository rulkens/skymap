# Constellations — true-3D stick figures with labels

Decisions ledger: [`docs/grill-sessions/constellations-2026-07-22.md`](../../grill-sessions/constellations-2026-07-22.md) (Q1–Q9).

## What this is

A new singleton overlay layer drawing the 88 IAU constellation figures as line
segments between real stars, plus a name label per constellation. The lines are
true 3D: each endpoint sits at the same heliocentric position the rendered star
uses, so from Earth's vantage the familiar figures appear, and flying away they
shear apart. The layer makes "a constellation is a coincidence of sightlines"
visible by flight alone — no special mode, no toggle choreography.

Scope decisions (grill): all 88 IAU figures (Q1); endpoints resolved inside the
star-bin build so lines land exactly on rendered stars (Q2); line data derived
from d3-celestial's BSD-3 dataset, not Stellarium's GPL file (Q3); screen-space
pixel gap at each star (Q4); single dim steel-blue additive style (Q5); Latin
name labels at the figure's 3D anchor (Q6); default ON, one toggle + intensity
slider, labels ride the layer (Q7); no interactivity in v1 (Q8); celestial-sphere
morph mode deferred (Q9).

## Ground preparation

Refactor-ground verdicts: the runtime side is pure growth — every touchpoint is
a registry row or a new file at a seam that filaments/flow/structures/famous
already use. Two bolt-ons were found on the build/shader side; each lands as its
own prep PR **before** the feature PR. The rest of this spec is written against
the post-prep architecture.

### Prep 1 — star identity joint + complete bright-star dedup (`stars-rs` + seed)

The blocker: all three population loops drop identifiers inline in their
`Star {}` literals (`tools/stars-rs/src/population.rs:184`, `:225`, `:242`), and
famous-star subtraction keys on Gaia id only — which is why Alpha Centauri
renders twice today (70/119 famous entries have no Gaia id; Gaia DR3 lacks the
brightest, saturated stars). Both the constellation endpoint resolver and the
dedup fix need the same missing joint: **final position and source identifiers
coexisting in the population**.

- `data/seeds/famous_stars.seed.json`: add a structured `hip: number | null`
  field per entry (today HIP exists only as a `"HIP n"` alias string in
  `names[]`, on 98/119 entries).
- `npm run build-famous-stars` regenerates `famous_ids.generated.rs` with a
  `FAMOUS_STAR_HIP_IDS` list alongside the existing 49 Gaia ids.
- `Population` carries per-star ids parallel to `stars`:

  ```rust
  pub struct StarIds { pub gaia: Option<u64>, pub hip: Option<u32> }
  pub struct Population { stars: Vec<Star>, ids: Vec<StarIds>, drops: DropCounts, clamps: ClampCounts }
  ```

- Famous subtraction becomes Gaia ∪ HIP (HIP resolved through the existing
  `hip_to_source_id` crossmatch where applicable, and matched directly in the
  Hipparcos-bright loop, which has `row.hip` in hand).
- **Crossmatch-gap fallback (folded in at the ground checkpoint):** a bright
  Hipparcos star (Hp < `HP_BRIGHT_CUT`) with no `hip2_best_neighbour.csv` row
  currently enters the bin twice — the Hipparcos patch row plus an uncontested
  Gaia row. The builder closes the gap itself: for each such star, positional
  match (small angular radius + magnitude window) against bright Gaia sources,
  and subtract the match before emission. Reported in `DropCounts` so coverage
  is visible in build output.

Independently valuable (fixes visible duplicates with no constellation code),
independently testable, and requires a post-merge `build-stars-rs` + R2 sync
from the main worktree.

### Prep 2 — shared WESL segment-quad expansion helper

`markerLines/vertex.wesl:9` documents that it copies the instanced-quad
expansion from `filaments/vertex.wesl`; the constellation shader would be the
third copy (the second-special-case rule fires at two). Extract the expansion
(project endpoints → NDC tangent/perp → half-width offset → re-multiply by w)
into `src/services/gpu/shaders/lib/` and refactor both existing shaders onto
it, behavior-preserving. The two call sites' differences become parameters:
width convention (pre-halved vs full pixel width) and the marker lines'
`CLIP_Z_EPS` far-plane clamp. `lib/camera.wesl`'s unused `worldToNdc` helper
(written for exactly this, called by nobody) is folded in or deleted as part of
the extraction.

## Build pipeline

New stage inside the existing `stars-rs` run (it must see the population before
`main.rs` drops it after quantization):

1. **Vendored line data**: d3-celestial `constellations.lines.json` (BSD-3)
   committed under `data/raw/constellations/` with provenance README and
   `rawDataRegistry.ts` keys (`constellations.lines`, `constellations.readme`).
   Committed data needs no gitignore edit beyond the existing globs except the
   `.json` itself — add a `!` line with a comment per the raw-data checklist.
2. **Vertex resolution**, per polyline vertex (ra/dec on the J2000 sphere),
   with a starting angular tolerance of ~5 arcmin (tightened or loosened per
   the audit output):
   1. Match against the famous-star seed first (angular tolerance): famous
      positions are authoritative — that's where the labelled body renders,
      whether or not the star was subtracted from the bin.
   2. Otherwise nearest bright star in the id-carrying population (post-dedup,
      post distance-choice — the exact record the bin ships), within the same
      angular tolerance and an apparent-magnitude sanity window.
   3. Otherwise consult `data/seeds/constellation_overrides.seed.json`
      (explicit HIP id or position per problem vertex — expected to stay
      small; d3-celestial's author hand-modified some lines off-star).
   4. Otherwise **fail the build loudly**, printing the constellation,
      vertex, and nearest-miss distance so the override file can be extended.
3. **Label anchors**: per constellation, mean sky direction of its vertices at
   the **median** vertex distance (median so one distant supergiant doesn't
   drag the label off the figure).
4. **Emission**: `public/data/constellations.json`, written next to the
   `stars-*.bin` loop in `main.rs`. Gitignored build artifact; added to the
   `tools/deploy/syncR2.ts` ALLOW list.

Tier-independent: tier selection is brightest-first with superset tiers, so
every figure star is in all tiers; one artifact serves all.

## Artifact contract

```ts
type ConstellationsArtifact = {
  version: 1
  constellations: Array<{
    name: string            // Latin, e.g. "Ursa Major"
    labelAnchorPc: Vec3     // heliocentric equatorial J2000 parsecs
    segments: Array<{
      aPc: Vec3
      aAppMag: number       // endpoint star's apparent mag → glow-radius gap in shader
      bPc: Vec3
      bAppMag: number
    }>
  }>
}
```

~700 segments across 88 figures ≈ a few KB gzipped; JSON like
`structures_meta.json`, no binary format. `version` mismatch or shape-check
failure rejects the artifact with a console warning naming the regenerate
command (`npm run build-stars-rs`).

## Runtime

All growth at existing seams; one row/file per touchpoint.

- **Source**: `Source.Constellations` + `src/data/sources/constellations.ts`
  registry row (`visible: true` default per Q7).
- **Settings**: `settings.constellations = { enabled, intensity }`, seeded from
  the registry; `setConstellationsEnabled` / `setConstellationIntensity`
  reducers + selectors.
- **Loading**: `makeJsonFetcher`-based fetcher with the shape check, an
  `AssetSlot`, and an `ASSET_WIRING` row (demand: layer enabled). Status-only
  store field per the singleton-overlay convention; fetch/parse failure leaves
  the layer empty and logs once.
- **Renderer**: `src/services/gpu/renderers/constellations/` — instanced
  screen-space thick quads via the prep-2 shared expansion helper, additive
  blend, single steel-blue tone, ~1.5–2 px, intensity uniform. Uploaded once;
  no per-frame CPU rebuild. Per-instance data: both endpoints + both endpoint
  magnitudes. The vertex shader pulls each end in by a pixel margin derived
  from the endpoint's magnitude-derived glow radius (Q4's screen-space gap) —
  same magnitude→radius curve the star shader uses, so the gap tracks the
  rendered glow.
- **Pass**: `frame/passes/constellationsLayer.ts`, a `ContentLayer` projecting
  through the NEAR0 slab (parsecs are NEAR0's native unit) and reusing the
  shared `rebaseViewProj` / `narrowMat4` / `writeCameraPrefix` primitives, as
  `starPointsLayer.ts` already does. `enabled()` gates on settings OR fade
  tail (opacity-0 ⇒ no render). Distance fade: one new
  `SCALE_FADE_BANDS.constellations` row + a `fadeBand()` call in the pass —
  full presence through the solar neighborhood, gone before figures go
  subpixel (edges tuned visually over HMR).
- **Fades**: `FADE_LAYERS` row (singleton; guard = slot ready) +
  `watchFadesSaga` `FADE_ROW` entries for both setters.
- **Labels**: `presentation/produceConstellationLabels.ts` — a
  `LabelProducer` registered in `engine.ts` beside `structureLabels`. Latin
  names at the artifact anchors, annotation-tier styling (structure-label
  face, dimmer/smaller), label alpha multiplied by the layer's fade + the
  director's shared declutter/envelope. No abbreviations in v1.
- **UI**: one row in `StarsSection` (the famous-stars singleton-toggle row is
  the exact precedent) + an intensity slider following the Advanced-section
  slider pattern; wired through `StarsSectionContainer`.

No pick integration (Q8): lines and labels are annotation; the famous stars
inside the figures remain the interactive objects.

## Error handling

- Build time: unresolvable vertex = hard build failure with actionable output
  (constellation, vertex, nearest miss) — never a silently dropped line.
- Runtime: missing/invalid artifact = empty layer + one console warning; the
  settings toggle stays functional (guard keeps fades quiet until ready).

## Testing

Per `docs/superpowers/conventions/testing.md` — only what can break for real:

- **Rust**: vertex-resolution tests on known figures (Orion resolves to the
  expected famous/HIP stars; a famous-subtracted star's endpoint comes from
  the seed position; an off-star vertex trips the override path; the
  crossmatch-gap fallback subtracts a synthetic missing-xmatch bright star).
  Median-anchor math on a figure with one distance outlier.
- **TS**: artifact shape validation (rejects wrong version/shape), label
  producer output for a two-constellation fixture (anchors, fade
  multiplication), and nothing else — fade-row/registry restatements are
  exactly what testing.md forbids.
- Visual verification over the dev server (deformation flight, gap behavior,
  label declutter) — user pass before merge.

## Deferred (backlog items added with this spec)

- **Celestial-sphere morph toggle** (Q9): collapse stars onto the fixed sky
  sphere and back — a star-shader morph + tour primitive; the lines layer
  makes it legible later.
- **Constellation interactivity** (Q8): hover highlight / "fly to Orion" —
  composes better via search/tour than line picking.

## Rollout

1. Prep PR 1 (`stars-rs` identity joint + dedup) → merge → `build-stars-rs` +
   `sync-r2-secure` from main.
2. Prep PR 2 (WESL helper extraction) → merge.
3. Feature PR (build stage + artifact + runtime layer) → `/feature-done` →
   merge → `build-stars-rs` emission + R2 sync of `constellations.json` from
   main.
