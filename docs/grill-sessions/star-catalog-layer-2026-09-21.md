# Grill Session: the starCatalog Layer — 2026-09-21

Source: layer-composition step (e), the last stub Layer
([`2026-09-09-layer-composition-design.md`](../superpowers/specs/2026-09-09-layer-composition-design.md)
§6.4, §10(e)), a read-only inventory of the star surface in core, and the
near-field backlog item
[`2026-07-29-near-field-stars-body-vs-star-domain.md`](../backlog/2026-07-29-near-field-stars-body-vs-star-domain.md).

Goal going in: form `src/layers/starCatalog/` from the settings-only stub the way
the six prior Layers were formed, carrying the god-layer split the spec deferred to
this PR. The session widened when the first question exposed that the seeded stars
(the famous map, the Sun, the S-stars) are stars in every sense but the code's, and
the user ruled that the code follows the physics.

---

## Q1: What the Layer owns — survey only, or the seeded stars too

**The question:** `FAMOUS_STAR_ENTRY` is `type: 'starCatalog'` in the registry,
but everything that touches a famous star is body-domain by folder: seeded from
the body store, drawn by passes under `renderers/bodies/`, captioned by
`sceneBodyLabels`, picked into a body ref, shown in `BodyDetailCard`. Does the
star Layer take the survey (Gaia) alone, or the curated catalog as well?

**Considerations:**

- **Option A (survey only):** `sources: [GAIA_STARS_ENTRY]`; the famous row, its
  meta slot, the label fade row and the hand-authored Labels & guides rows stay in
  core. Pure move, smallest diff, but the star settings slice already owns both
  items, and the near-field question stays open with the famous-star half in core.
- **Option B (both entries declared, draw left in core):** the Layer declares a
  source it neither draws, labels nor picks. The domain disagreement the backlog
  doc names, made structural. Rejected on sight.
- **Option C (both entries plus the near-field draw pipeline):** the Layer also
  takes `starPointsPass`, `starSpheresPass`, `fieldStarSpherePass`, `starRenderer`,
  `starPointRenderer`, `visibleStars`, `positionedVisibleStars`,
  `partitionStarsByResolution`. Verified before ruling: those two renderers are
  used by star passes only — `starRenderer` by `starSpheresPass` AND
  `fieldStarSpherePass` (the Gaia close-approach sphere), `starPointRenderer` by
  `starPointsPass` — and no body pass reads either. Planets and mesh bodies have
  their own renderers. The "bodies" placement is history, not a dependency.

**Decision:** Option C. The analogy the user drew is exact at the declaration
level — famousGalaxy is a curated seeded source beside the survey source in the
galaxy Layer with its own meta slot — and the spec's own ownership table already
sends `famousStarsMeta` to `starCatalog` (§4, line 289). The first framing had
over-weighted folder names.

## Q2: Who produces the famous-star captions

**The question:** `sceneBodyLabels` builds Earth, the famous stars, the planets,
Sgr A\* and the mesh bodies in one function behind one core producer. The Layer
would own the caption fade row and the toggle; if the producer stayed in core the
Layer would caption from outside itself.

**Considerations:**

- **Option A (split the star rows into the Layer):** a `screenLabels` producer on
  the NEAR0 slab, like constellations, over the seeded star set with the `star`
  caption kind. Core keeps Earth, planets, Sgr A\* and mesh bodies. `CaptionKind`,
  `CAPTION_PRIORITY` and `CAPTION_FADE_RULES` stay core as shared vocabulary (the
  constellations ruling). Registration order is fine: Layer producers land after
  core's, which the equal-prominence tiebreak wants.
- **Option B (producer stays in core):** smallest diff; core keeps a hardwired
  gate on a Layer's settings from a core file.

**Decision:** Option A.

## Q3: Where the famous-star meta sidecar lives

**The question:** the slot dispatches a core engine-slice action into
`engine.meta.famousStars`, read by a core selector for the body InfoCard. The
galaxy twin became a Layer fact in 04e.

**Considerations:**

- **Option A (Layer fact, as the galaxy twin):** `StarCatalogFacts =
  { famousStarsMeta }`, seeded `[]` in `layer.ts`, published by the moved slot via
  `deps.publish`. Delete `engine.meta.famousStars`, `engineFamousStarsMetaReported`,
  and the `meta` member if the star entry was its last. `selectFamousStarsMeta`
  stays a core selector reading the fact with a `?? []` guard for the first
  frames, exactly like the galaxy row. Closes the star half of the 2026-07-30
  "meta getters belong on the data stores" item.
- **Option B (keep the slice action):** a core reducer and action existing for one
  Layer's asset — the pattern 04e deleted on the galaxy side.

**Decision:** Option A.

## Q4: Where the S-star orbit trails go

**The question:** the S-stars are drawn twice: their dot or sphere through the
star pipeline, their trail through `orbitTrailsPass`. A first claim that the
trail pass knew nothing of S-stars was wrong — `TRAIL_ELEMENTS` is every
`ORBITAL_ELEMENTS` row minus the mesh bodies, and the `sStar` maker emits one
element row per Gillessen orbit with its own trail tint, so all 39 S-star conics
draw through that pass.

**Considerations:**

- **Option A (trails stay in body's generic machinery, S-star dot drawn by the
  star Layer):** one conic renderer over one element table; the star Layer reads
  `bodies.items['s-star']` as a documented residual.
- **Option B (a second orbit-trail pass instance owned by the star Layer):** two
  passes on one renderer type, two gates for one toggle.
- **Option C (S-stars move whole to the star Layer):** the near-field domain
  grill, pulled into this PR.

**Decision:** neither A as recommended nor C as framed. The user ruled two things
at once: **S-stars belong to the star Layer**, and **orbit trails are generic
core machinery a Layer feeds**, the way labels are. The mechanism is Q6/Q7; the
extent of "belong" is Q5.

## Q5: How far "S-stars belong to the star Layer" goes

**The question:** declaration, settings, draw and captions only — or identity too
(the pick ref, the InfoCard arm, the URL id)?

**Considerations:**

- **Option A (identity stays body):** `S_STAR_ENTRY` becomes a seeded star-catalog
  row, its toggle moves to the Stars panel, the Layer draws and captions it and
  contributes its orbit rows; a click still decodes through the body row to a body
  ref. Consistent with the spec's D6'3 ("a pick source is decoded by the Layer
  that owns the object's identity, not by the one that draws it", which listed
  `famousStar` under the body row).
- **Option B (identity becomes star):** a star-side ref, a star card carrying the
  orbit block, star URL ids. Reverses D6'3 for the seeded stars.

**Decision:** Option B, **for the S-stars and the famous stars alike** — "identity
becomes star. same for famous stars." Recorded consequence: spec D6'3's body-row
listing of `famousStar` is reversed; the body selection row drops `FamousStar`
and `SStar` from its `pickSources`; `BodyDetailCard` loses its star branches. The
ref shape is Q8a.

## Q6: How a Layer feeds orbit trails

**The question:** today nothing subscribes. `ORBITAL_ELEMENTS` is a module-level
constant with three import-time readers: `positionDrivers` (→ `deriveBodyStates`,
which places every orbiting body each frame, S-stars included), `TRAIL_ELEMENTS`
(→ the pass loops it per frame), and `bodyRegions` / `orbitReachByRegion` /
`focusResolveOrder`. The renderer is generic; the pass has no per-body code.

**Considerations:**

- **Option A (data-level composition, like sources):** the S-star seeds, maker and
  element rows move into the star Layer; `orbitalElements.ts` spreads them in as
  `SOURCE_REGISTRY` spreads each Layer's source rows. Positions, trails, regions and
  focus order keep working. Honest label: the Layer owns the rows, core's table
  lists them; no runtime mechanism.
- **Option B (a contract member composed at `createLayers`):** the proper
  subscription. But the same rows drive positions, whose readers are import-time
  statics under `src/data/bodies/` (`POSITION_DRIVERS` and its id index are read
  by eight camera and picking utils). Composing trails alone would declare the
  rows twice.
- **Option C (trail roster composed, positions static):** two declarations of one
  orbit. Ruled out by the "declared once" rule.
- **Side question — could the derivation go through the store?** Mechanically
  yes, but it removes no cost (the module-constant readers still have to receive a
  table), adds a serialise-and-select hop nothing in React reads, and inverts the
  ruled direction (facts flow engine→shell; only settings flow shell→engine; the
  engine already holds the composition at `createLayers`). Rejected.

**Decision:** the contract member for **trails** (Option B's shape, see Q7), with
the S-star rows declared ONCE in the star Layer and two readers: the guide
contract for the trail roster, and `orbitalElements.ts` importing them for
positions (Option A's edge) **until the body Layer forms** and positions compose
at boot too — that is body's ground prep, and the rows will already sit where it
needs them.

## Q7: The shape of the guides contract

**The question:** a new member for orbit trails alone, or an umbrella?

**Considerations:**

- **Option A (`Layer.guides?(runtime): { orbitTrails? }`)**, beside `labels`.
- **Option B (`Layer.guides` absorbs `labels`, flat):** `guides: { screenLabels?,
  worldLabels?, orbitTrails? }`. One map type `LayerGuides`, one level;
  `LayerLabels` deleted; galaxyCatalog, zoneOfAvoidance and constellations rename
  their member and declaration file.
- **Option C (nested):** `guides: { labels?: { screen, world }, orbitTrails? }`.
  Smaller diff, two hop depths for one kind of thing.

**Decision:** Option B — "Layer.guides should also include labels", flat. Orbit
trail rows are static `OrbitalElements`, like `worldLabels` producers are static:
the pass already propagates per frame and only needs the focus body's position
(Sgr A\*, a core anchor). `createLayers` concatenates every Layer's rows after
core's into one roster the pass walks. The `orbitTrails` settings cluster and its
fade row move from `layers/body/state/` to core, because the machinery is core.
Lands as the first prep commit.

## Q8: The Sun

**The question:** the Sun has two identities — `SUN_ENTRY` (`Source.Sun = 26`, a
body row owning a gate no toggle reaches) and `id: 'sun'` in the famous seed table
(the drawn dot, the sphere, the pick, which stamps `Source.FamousStar`). Verified:
`SUN_ENTRY` has four readers (registry, `sceneAnchors` for the id string, the two
gates in `visibleStars` and `sceneBodyLabels`), no panel toggle, no authored tour
or clip ref.

**Considerations:**

- **Option A (ordinary famous-star member; delete `SUN_ENTRY`, retire code 26):**
  smallest. But toggling the famous stars off today leaves the Sun on screen on
  purpose (the descent's aim point survives muting the neighbourhood) — as a
  member it would vanish with them, and every future Sun feature would key on
  `id === 'sun'` inside a shared loop, the exemption the backlog doc criticised.
- **Option B (keep a body row):** the duality kept on purpose.
- **Option C (its own seeded star-catalog row, owned by the star Layer):**
  `SUN_ENTRY` retyped `starCatalog`, `Source.Sun` kept and finally carried by the
  Sun's pick; its own item toggle in the Stars panel; its own seed row, leaving the
  famous table (deletes the `row.id === SUN_ENTRY.id` anchor special case and the
  "index 0 is the Sun" status). Precedent: `sgrAStar` is a one-member row with
  its own pass and tuning slice. Every seeded star then belongs to exactly one
  source and `visibleStars` gates per source with no exemption table.

**Decision:** Option C, after the user flagged that the Sun will grow features
(its own renderer, overlays). Recorded constraints: the Sun stays addressable by
its durable seed id; Sun-specific drawing is a future pass in the star Layer
beside `starSpheresPass` (as `fieldStarSpherePass` already is a special path for
one class of star), routed by a seed-row field, never an id branch in a shared
loop; nothing in this PR flattens the seeded stars beyond what
`partitionStarsByResolution` already does per star.

## Q8a: The ref shape

**The question:** with seeded stars star-identified, what does the `SelectionRef`
arm look like?

**Considerations:**

- **Option A (extend `{ type: 'star'; index }`):** the existing positional Gaia
  arm, with a seeded variant.
- **Option B (`{ type: 'starCatalog'; source; index }`, mirroring
  `galaxyCatalog`):** one arm for all four sources. The pick already packs exactly
  this — a seed-table index for famous, Sun and S-stars, a bin-stable index for
  Gaia. The `star` arm (14 consumer files) is renamed.

**Decision:** Option B — the user's own suggestion ("or starCatalog" … "even
better").

## Q9: URL focus ids for seeded stars

**The question:** a famous star deep-links today as a bare body id (`sirius`), an
S-star the same, a Gaia star as `star-<index>`. One row needs one encoding.

**Considerations:**

- **Option A (durable seed id under the star prefix):** `star-sirius`, `star-S2`,
  `star-sun`; Gaia stays `star-<index>`. The row claims the `star-` prefix, decodes
  a numeric remainder as a Gaia index and anything else by seed-id lookup across
  the seed tables. Famous links survive tier swaps and seed reordering; bare
  `sirius` links break — and no authored tour or clip uses one.
- **Option B (source-qualified index):** `star-famousStar-3`. Unambiguous by
  construction but indexes into tables whose order is a documented landmine, and
  unreadable.

**Decision:** Option A.

## Q10: One star card or several

**The question:** a Gaia star opens `FieldStarDetailCard` from `FieldStarInfo`; a
famous star or S-star opens `BodyDetailCard` (famous eyebrow, meta-sidecar lookup,
S-star orbit block). One ref means one `buildFocusable` arm for four sources.

**Considerations:**

- **Option A (one `StarInfo` view-model, one `StarDetailCard`):** a `source`
  discriminant plus optional blocks — sidecar meta for famous stars, the orbit
  block for S-stars, bin photometry for Gaia. `FieldStarDetailCard` and its
  compact twin become that card; `BodyDetailCard` loses its star branches and the
  `FAMOUS_STAR_IDS` import. The Sun uses the same card until it has something of
  its own.
- **Option B (a card per seeded source):** three cards sharing most rows, plus a
  routing table.

**Decision:** Option A.

## Q11: How the camera follows a moving star

**The question:** five camera files gate on `focusRow.type === 'body'` then read
`focusRow.id` (live position for the follow driver, pivot radius, approach tilt,
focus framing, `bodyMovesThisFrame`). Focusing S2 follows its orbit today because
`bodyFollowsSimClock('S2')` finds an orbit driver for that id. The `star` arm
already frames a static star on `positionMpc` + `radiusM`; a moving S-star under
a `starCatalog` ref is not covered.

**Considerations:**

- **Option A (key the camera on a driven id, not the ref type):** seeded
  `starCatalog` rows carry the seed `id` beside `source` and `index`; Gaia rows
  carry none. `liveBodyPosition`, `bodyMovesThisFrame`, the follow pose and the
  approach tilt ask "does this row have an id the position table drives", which is
  what they meant. Pivot radius and framing keep using `radiusM`. About six files
  change a predicate; no new mechanism; the S-star follow keeps working through
  the body-state map the data-level import feeds.
- **Option B (camera stays body-only):** focusing an S-star stops following it. A
  regression, listed to rule it out.

**Decision:** Option A.

## Q12: Packaging

**The question:** this grew well past the constellations shape — a spec reversal,
two registry retypes, a new ref arm, a new contract member, a settings cluster
move, and the Layer move.

**Considerations:**

- **Option A (two PRs):** PR 1 ground prep, four behaviour-neutral commits, no
  deletion audit — `Layer.guides` with the composed orbit-trail roster and the
  labels rename; the `orbitTrails` cluster body→core; the camera predicates keyed
  on a driven id; `computeStarCut` split into a pure walk plus a separate fade
  advance in `runFrame` so the Layer's `frame` later relocates it. PR 2 the Layer
  with the identity change, the Sun and S-star rows, the `starCatalog` ref,
  `StarDetailCard`, the URL ids, the settings moves. Each reviewable in one
  sitting; PR 1 lands while PR 2's plan is written.
- **Option B (one PR, own commits):** the constellations shape. The review holds a
  contract change and an identity change at once; a prep finding blocks the Layer.

**Decision:** Option A. Process: spec as a decisions-driven addendum to the
layer-composition spec, user review, `writing-plans` per PR, SDD with grouped
Sonnet dispatches.

---

## Pinned by precedent, not asked

- `advanceFades` un-braid: `Layer.frame(runtime)` is the one mutating fade advance
  and returns the `awake` vote; `computeStarCut` loses the flag and stays pure;
  `runFrame`'s `starFadeAnimating` special case is deleted. Every capture-face
  read stays pure via the per-ctx memo.
- Spec D6'1 rides: a star deep link defers via `focusId.decode` returning null
  until the bin lands; the `NOT_YET_LOADED.star` probe in `watchFocusTweenSaga` is
  deleted.
- `star-aggregates` render target → `Layer.targets`; the three survey passes and
  their `starCatalogVisible` gate → `passes/` + `render/` (spec §6.4); the two
  reference-identity tests go.
- `ResolveDeps.stars` dissolves into a runtime argument of the moved selection row,
  as constellations did for its slot.
- 24 star-only types → `src/layers/starCatalog/@types/`; `StarCatalogId`,
  `StarCatalog`, `StarCatalogReq`, `FamousStarMetaEntry` keep core homes while core
  still imports them.
- Shaders stay under `src/services/gpu/shaders/`.
- Backlog items consumed: `2026-08-20-star-catalog-layer-god-layer-split.md`,
  `2026-07-29-near-field-stars-body-vs-star-domain.md`, the star half of
  `2026-07-30-meta-getters-belong-on-the-data-stores.md`.

---

## Ground preparation checkpoint (refactor-ground, same session)

Presented to the user after the grill; **awaiting sign-off** at the time of
writing. Recorded here so the spec's "Ground preparation" section can be written
from disk. Greenfield cross-check ran as a fresh subagent given only the data
requirements; divergences below are priced, the rest agreed.

### Ideal shape

```ts
// registry — three seeded rows, one shape; StarCatalogId grows to 4 by derivation
S_STAR_ENTRY / SUN_ENTRY: type 'starCatalog', codes 28/26 kept, binBaseName: null
// Layer-private, total over seeded ids → a new seeded source is a compile error
SEEDED_STAR_CATALOGS: Record<'famousStar'|'sun'|'sStar', readonly StarBody[]>

// identity — one arm, what the pick packs
SelectionRef |= { type:'starCatalog'; source: StarCatalogSourceType; index: number }
SelectionRow |= { type:'starCatalog'; source; index; id: string|null; label;
                  positionMpc; radiusM; absMag?; bpRp? }      // id = seed id, null for Gaia
StarInfo = { type:'starCatalog'; source; index; id; displayName; x,y,z; distancePc; radiusM;
             detail: {kind:'photometry',…} | {kind:'curated', meta} | {kind:'orbit',…} | {kind:'none'} }

// contract
LayerGuides = { screenLabels?; worldLabels?; orbitTrails?: readonly OrbitalElements[] }
StarCatalogFacts = { famousStarsMeta: readonly FamousStarMetaEntry[] }
state.orbitTrailRows = [...CORE_TRAIL_ELEMENTS, ...layers.flatMap(guides.orbitTrails)]

// camera joint — replaces five `row.type === 'body'` gates
focusDriverId(row): string | null   // body → id; starCatalog → id; else null
```

Files: `src/layers/starCatalog/{layer,create,destroy,frame}.ts`, `@types/` (+24
moved), `sources/{gaiaStars,famousStar,sun,sStar,rows}`,
`load/{starCatalogSlot,famousStarsMetaSlot,…}`,
`passes/{starCatalog,starAggregates,starUpsample,starPoints,starSpheres,fieldStarSphere}`,
`render/{starCatalogRenderer,starCatalogPickRenderer,starRenderer,starPointRenderer,cut/…}`,
`present/{fadeRows,captions,selectionRow,guides}`, `ui/`. Seed tables STAY in
`src/data/` (data is data, as the constellation figures did); `orbitalElements.ts`
keeps importing the S-star rows from data, so no `data/ → layers/` edge is needed.

### Shape tensions (greenfield vs sketch), priced — recommendations

- **Ref arms.** Greenfield: two (`{surveyStar,index}` tier-scoped; `{star,source,id}`
  durable). Sketch: one `starCatalog` arm by index (Q8a). One-arm price: a seeded
  ref carries a seed index; the durable id lives on the row and in the URL.
  Two-arm price: two selection rows, two prefixes, two card-table and
  `rowFocusable` entries. Seeded sources are not tiered, so the hazard the split
  defends exists only for Gaia and exists today. **Recommend one arm.**
- **Where "does it move" lives.** Greenfield: a `sampleMpc` closure on the row.
  Q11: `focusDriverId` + the body-state map, how planets already work. A sampler for
  stars only = a second path beside the body one (bolt-on); for all = body's ground.
  **Recommend Q11; the sampler is the end state when body forms.**
- **URL prefixes.** Greenfield: `gaia:` and `star:`. Q9: one `star-` prefix, all-digits
  remainder = Gaia. Q9 price: one boot assert that no seed id is all digits.
  **Recommend Q9 + the assert.**

Adopted from greenfield without tension: `StarInfo.detail` keyed by shape, not
source; `guides.orbitTrails` derived from each seeded catalog's drivers rather than
hand-listed; settings shape unchanged (`items` already a total record by derivation).

### Missing joints

| Touchpoint | Verdict | Blocker |
|---|---|---|
| Orbit trails walk a static table | bolt-on | `orbitTrailsPass.ts:71` loops `TRAIL_ELEMENTS`; no roster |
| Labels contract has no orbit slot | bolt-on | `Layer.d.ts:85` `labels` only |
| Camera gates on ref type | bolt-on | `liveBodyPosition.ts:9`, `cameraDrivers.ts:111`, `approachTiltedPose.ts:44`, `bodyMovesThisFrame.ts:11`, `focusFraming.ts:111` |
| `computeStarCut` pure/mutating by flag | bolt-on | `computeStarCut.ts:60` |
| `orbitTrails` settings in the body Layer | misplaced | `layers/body/state/orbitTrails/` |
| Registry, selection row, fade row, facts, labels, InfoCard arm, pick rows | growth | seams exist |

Two existing bolt-ons are DELETED by the feature, not prepped: the body row's
seeded-star branch (`bodySelectionRow.ts:36`) and `visibleStars`' Sun/S-star
exemption table.

### Prep list — PR 1, four commits, in order

1. `Layer.guides` replaces `labels`; composed `orbitTrailRows` roster read by the
   pass; core rows only.
2. `orbitTrails` cluster and fade row move from body to core settings.
3. `focusDriverId` replaces the five camera gates.
4. `computeStarCut` splits into the pure walk plus `advanceStarFades` called from
   `runFrame`.

### Adjacent, not required (backlog unless promoted)

`SCENE_BODIES` mixes stars into the body table (stars leave it with the feature;
occluder and apparent-size readers need checking); `ORBIT_REACH_BY_REGION` is
precomputed from the static table (roster-derived, or a harmless superset);
`starRenderer`'s single-uniform once-per-frame caveat.

### Packaging (Q12) — prep as its own PR, feature second.
