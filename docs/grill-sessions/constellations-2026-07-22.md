# Grill Session: 3D Constellations Layer — 2026-07-22

Source: user feature idea ("investigate a new feature, constellations"), building on the
"Constellation Lie" concept ranked top pick in
`docs/research/2026-07-19-feature-ideation-clips-to-social.md`.

A new settings overlay layer drawing constellation stick figures as true-3D line segments
between real stars, with name labels. From Earth's vantage the familiar figures appear;
flying away, they shear apart because the endpoints sit at real Gaia/Hipparcos distances —
the layer makes "a constellation is a coincidence of sightlines" visible by flight alone.

Pre-grill exploration established the load-bearing facts: the shipped star bins contain
**no per-star identifiers** (HIP/Gaia ids are dropped inside `stars-rs`'s
`build_population` before packing), famous stars are subtracted from the bin by Gaia id
only and rendered as scene bodies from `data/seeds/famous_stars.seed.json`, two
instanced-quad line renderers exist (filaments = additive emissive, marker lines =
premultiplied UI), labels go through the `LabelProducer` registry with shared declutter,
and no constellation line data exists anywhere in the repo.

---

## Q1: Coverage — which constellations, from what line data?

**The question:** Do we ship all 88 IAU constellations or a curated subset, and what
line-figure dataset do we start from?

**Considerations:**

- **Option A (all 88 IAU, Stellarium-style Western figures):** ~650–700 segments,
  ~600 unique stars, a few KB of data. Complete sky, no curation debt, deformation
  effect strengthens with full coverage (the whole sphere shears). Density risk is low
  because stick figures are sparse by nature and the label declutter already exists.
- **Option B (curated ~15–25 famous figures):** less visual noise, but permanent
  hand-curation cost and a permanent "why isn't X shown" question.
- **Option C (Orion only as proof of concept):** fastest demo, but re-opens the data
  pipeline question immediately after.

**Decision:** Option A — all 88. Data is trivially small; if visual noise appears in
practice, a curated "famous" filter flag can be layered on later as a *filter*, not a
data decision now.

## Q2: Where do line endpoint positions come from?

**The question:** Lines must end exactly on the rendered stars. The bin's positions come
from `stars-rs`'s specific Gaia/GCNS/Hipparcos crossmatch and distance choices (published
distances for e.g. Betelgeuse spread ~150–220 pc across sources), so an independent
resolver would visibly miss stars at close range — and flying close is the point.

**Considerations:**

- **Option A (extend `stars-rs`):** during the star-bin build, resolve the constellation
  HIP ids against the same crossmatched records the bin is built from; emit a small
  constellations artifact (endpoints + label anchors). Endpoints coincide with rendered
  stars by construction. Ships like the other build outputs (public/data + R2).
- **Option B (standalone TS script + committed seed):** no Rust changes, data visible in
  git — but a second resolution pipeline that drifts from the bin's choices; the
  local-volume distance work already taught us the cost of second-source position drift.

**Decision:** Option A, verified feasible before committing (see Q2a). Famous-star
endpoints use the famous seed's own `ra/dec/distancePc` since that is where the rendered
body actually sits.

### Q2a: Feasibility check (performed, not assumed)

- All raw data is on disk in `data/raw/gaia/`: full Hipparcos-2 (`hip2.dat`, 117,955
  rows, HIP retained by the parser), HIP↔Gaia best-neighbour crossmatch (99,525 pairs),
  Gaia main (~16.8M rows), GCNS. Nothing to fetch.
- The HIP→final-position join is buildable inside `build_population`, assembled across
  its three loops (Gaia main / GCNS / Hipparcos-bright). Hipparcos positions win only for
  Hp < 4.0 crossmatched stars; 4.0–6.5 comes from Gaia — the resolver must mirror the
  dedup, not re-derive positions.
- Tier selection is brightest-first with strict superset tiers → all constellation stars
  are present in every tier including small.
- **Famous-subtraction caveat:** 49 famous stars are subtracted from the bin by Gaia id,
  and many are core stick-figure stars (five Big Dipper stars, Cassiopeia's W, Saiph,
  Albireo…). Their only authoritative position is the famous seed. 70 famous entries
  have no Gaia id and are *not* subtracted → they render twice (anonymous bin star +
  famous body), e.g. Alpha Centauri. See Q3a.

## Q3: Line-data licensing and derivation

**The question:** Stellarium's `constellationship.fab` (the standard HIP-pair file) is
GPLv2+ with no separate data license; skymap is MIT. How do we source line data cleanly?

**Considerations:**

- **Option A (ship Stellarium data as marked GPL third-party file):** legally defensible
  (data, not linked code) but muddies an MIT repo.
- **Option B (derive our own HIP table from d3-celestial's `constellations.lines.json`,
  BSD-3, ra/dec polyline vertices sourced from the IAU charts):** at build time, match
  each vertex to the nearest bright star in our crossmatched population with a
  magnitude + angular-tolerance sanity check (flag anything > ~5 arcmin); hand-patch
  misses in a small committed overrides file. Output is our own derivation under our
  license. Known risk: the d3-celestial author "modified some lines", so a few vertices
  may not sit exactly on a star.
- **Option C (hand-author 88 figures from the traditional shapes):** cleanest provenance,
  most work.

**Decision:** Option B. Keeps the repo MIT-clean; the matching is a one-time auditable
build step. Option A remains the fallback if matching proves messier than expected.

### Q3a: Famous-star dedup fix (ground preparation)

User observation: duplicate stars exist today (e.g. Alpha Centauri = anonymous bin star
+ famous body). Filling in Gaia ids alone can't fix it — Gaia DR3 lacks entries for the
very brightest (saturated) stars; that's why the seed has nulls. Decision: extend the
bin's famous subtraction to key on **HIP id as well as Gaia id** (98/119 famous entries
carry a `HIP n` alias in `names[]`; the bright stars entered the bin via the
Hipparcos-bright loop which has `row.hip` in hand), add a structured `hip` field to
`famous_stars.seed.json` entries (user: "yes, add a HIP entry"), regenerate the
subtraction ids from it, and fill real `gaiaDr3` values where Gaia genuinely has one.
Self-contained dedup fix, independent of constellations → its own prep PR before the
feature (refactor-ground convention). It also makes "famous seed position = the one true
position" actually hold on screen, which the line endpoints rely on.

## Q4: What is the "spacing" on the lines?

**The question:** The original ask says lines connect star to star "with some spacing" —
pin down the gap geometry.

**Considerations:**

- **Option A (screen-space gap):** each segment stops short of its endpoint by a pixel
  margin scaled with the star's rendered glow size. Classic planetarium look; gap stays
  visually constant near or far; computed in the vertex shader from the projected
  endpoints; zero data cost. Gaps stay pinned to the stars while a figure shears apart.
- **Option B (world-space gap, fixed fraction in 3D):** simplest shader, but the gap
  balloons up close (line looks broken) and vanishes at distance.
- **Option C (no gap):** rely on additive blending; lines touch star centers.

**Decision:** Option A — screen-space pixel gap scaled with the star's glow.

## Q5: Visual style — color, weight, blend

**Considerations:**

- **Option A (single dim desaturated steel-blue/cyan, ~1.5–2 px, additive, intensity
  slider):** star-atlas annotation look; additive matches the filament renderer (the
  structural template) and glows through dense star fields / Milky Way instead of
  cutting hard edges.
- **Option B (per-constellation hue variation):** separates adjacent figures but reads
  toy-planetarium and fights the restrained palette.
- **Option C (white premultiplied-OVER, UI-style like marker lines):** crisp but heavy,
  and inconsistent with every other emissive overlay.

**Decision:** Option A. A future hovered/selected highlight would be a per-instance
brightness multiplier, not a new style system.

## Q6: Labels — text and anchor

**The question:** The mechanism is settled by convention (new `LabelProducer` under the
label director, shared declutter + appear/disappear envelope). What does each label say,
and where does it hang in 3D?

**Considerations:**

- **Option A (Latin name, anchored at mean sky direction of the figure's vertices at the
  *median* star distance):** label lives inside the figure from Earth and shears with it
  in flight; median resists one distant supergiant dragging the anchor off.
- **Option B (anchor on brightest star):** always on a real star, but lopsided for
  sprawling figures and collides with that star's famous-star caption.
- **Option C (IAU chart 2D label positions):** faithful to paper atlases but sphere-only
  — no natural depth.

**Decision:** Option A. Styling: same MSDF face as structure labels but dimmer/smaller
(annotation tier). No abbreviations in v1; declutter handles crowding.

## Q7: Settings wiring and defaults

**Considerations:**

- **Option A (default ON; one toggle + one intensity slider; labels ride the layer):**
  the scale fade makes "on" self-limiting — figures fade out beyond the solar
  neighborhood where they're subpixel anyway; the layer is the naked-eye anchor of the
  zoom-out story, so hiding it by default buries the feature. Placed with the
  star/famous-star controls.
- **Option B (default OFF):** conservative, buries the app's best "only here" moment.
- **Option C (separate label toggle):** more control, more surface, no known want.

**Decision:** Option A. A lines/labels split later would be an additive settings change.

## Q8: Interaction in v1

**Considerations:**

- **Option A (pure annotation — no hover, click, or InfoCard):** pick system untouched.
- **Option B (clickable labels → camera frames the figure):** drags in pick codes, 88
  camera poses, 88 InfoCard entries.
- **Option C (hover highlight):** needs per-figure instance ranges + pick readback on
  thin quads — terrible pick targets.

**Decision:** Option A. Famous stars inside the figures are already the interactive
objects (InfoCard shows a constellation chip). "Fly to Orion" composes better as a
search/tour feature later; B and C are backlog candidates once the layer exists.

## Q9: "As seen from Earth" comparison mode

**The question:** The ideation doc's "Constellation Lie" includes a toggle collapsing
stars onto a fixed celestial sphere and back. In scope?

**Considerations:**

- **Option A (defer):** deformation-by-flight already tells the story; the morph toggle
  is really a star-layer feature (per-star morph uniform in the hot-path shader) + tour
  primitive, deserving its own brainstorm. Constellation lines shipping first makes the
  morph far more legible when it lands.
- **Option B (include now):** roughly doubles scope.

**Decision:** Option A — defer; capture as a backlog item linked to this feature.

---

## Outcome

Proceed to design presentation → refactor-ground → spec
(`docs/superpowers/specs/2026-07-22-constellations-design.md`) → plan. Ground
preparation identified so far: famous-star HIP dedup (Q3a) as its own prep PR.
