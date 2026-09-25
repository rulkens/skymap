# Grill Session: the blackHoles Layer — 2026-09-22

Source: layer-composition roadmap, a `/wt` ask ("extract Sgr A\* from bodies into
its own black holes layer"), two read-only surveys of the Sgr A\* surface and of
the body-table consumers, and the prior session
[`star-catalog-layer-2026-09-21.md`](star-catalog-layer-2026-09-21.md), whose
rulings this one revises in two places.

Goal going in: move Sagittarius A\* — lensing pass, renderer, shaders, tuning,
capture, glint, caption, pick — out of the body pipeline into
`src/layers/blackHoles/`. The session widened twice: the first time when the
position question turned into "who owns the galactic centre", the second when the
user asked for every hook the Layer needs to be a named contract member rather than
an ad-hoc import, which produced four new members (`search`, `sourceCounts`,
`slabs`, a `detailCard` UI slot) and one named-but-deferred (`captures`).

What the surveys found before the first question: the lensing cluster (renderer,
pass, WESL, uniform packer, tuning slice under `layers/body/state/`) is already
Layer-shaped, and `data/blackHoles.ts` is an append-only registry with one row. The
entanglements are (a) the `lens` slab synthesis in `bodyRowSlabs` and the cull
bypass in `visibleSlabBodies`, both keyed on `SGR_A_STAR.id` in core frame code;
(b) the `sky-cubemap` capture row, fed by other Layers' passes; (c)
`MILKY_WAY_CENTER_WORLD`, `bodyGlintsPass` and `starPointsPass` reading the Sgr A\*
seed directly, the caption drawn and picked inside the star points pass.

---

## Q1: What drives this — the dome smoke defect or the roadmap

**The question:** The dome-fisheye smoke (2026-09-22) listed "Sgr A\* cubemaps" as
a defect, and the dome PR has a Friday deadline. A dome-driven extraction would
scope the Layer around capture ownership and inherit the deadline; a roadmap-driven
one covers the whole object with no deadline.

**Considerations:**

- **Dome-driven:** the Layer's core deliverable is its capture row, target and view
  slots, so the rig composes them; caption, glint and pick stay put; sequenced ahead
  of the dome refactor spec. Designs against a defect whose diagnosis was not yet
  written at the time of asking.
- **Roadmap-driven:** full extraction — seed, caption, pick, glint, lensing. Queues
  behind starCatalog PR2, which touches the same `layers/body/state/slices.ts`.

**Decision:** Roadmap-driven. A Layer that owns its capture row is the right shape
under either motive, so the dome deadline does not attach.

## Q2: Does the Layer own Sgr A\* as an object, or only what is drawn — and who owns the position

**The question:** Sgr A\* is two things: a place in the focus graph (root of the
`galactic-centre` region, the orbital focus of 39 S-stars, the alias behind
`MILKY_WAY_CENTER_WORLD`, the carrier of `standoffRadii`/`focusDistanceRadii`) and a
drawn phenomenon. Which does the Layer take?

**Considerations:**

- **Option A (phenomenon only; seed stays a core static):** `sceneSgrAStar.ts`
  unchanged, Sgr A\* stays in `SCENE_BODIES`/`SCENE_ANCHORS`, the Layer takes
  everything drawn. Matches the prior session's "positions declared once, statics
  until the body Layer forms". Leaves milkyWay reading the black hole's file.
- **Option B (seed too):** Sgr A\* leaves `SCENE_BODIES`; needs a boot-composed
  body roster that does not exist; siblings would need a core-mediated read of a
  Layer's position.
- **User's counter (the seed is the place, not the hole):** core declares a
  `GALACTIC_CENTRE` anchor once — Reid & Brunthaler 2004 RA/Dec, GRAVITY 2019
  R₀ = 8178 pc — and the Milky Way hub, the S-star focus, the region root and the
  Layer's hole all read it. Physically accurate: Sgr A\*'s radio position *is* the
  working definition of the dynamical centre. Sibling Layers never import each
  other; the dependency arrow milkyWay → bodies disappears.

**Decision:** The user's counter, refined as B′ below. `MILKY_WAY_CENTER_WORLD`
becomes a read of the core anchor rather than of `SGR_A_STAR_ANCHOR`.

### Q2′: Where the `'sgr-a-star'` focus-graph id lives

**The question:** The focus graph resolves by id: S-stars carry
`focusId: 'sgr-a-star'`, `BODY_REGIONS` roots `galactic-centre` at it,
`deriveBodyStates` looks it up in `SCENE_ANCHORS`, and the `SCENE_BODIES` row is
what makes `body-sgr-a-star` searchable and deep-linkable.

**Considerations:**

- **Option A′ (core keeps the rows, re-pointed at the seed):** anchor and body rows
  stay in `src/data/bodies/` with `positionMpc: GALACTIC_CENTRE`; nothing re-ids.
- **Option B′ (rename the anchor to `'galactic-centre'`; the Layer contributes the
  Sgr A\* object):** conceptually right — the S-stars orbit the place. Priced as
  expensive before the second survey (a Layer-contributed body roster, 30+ S-star
  rows, broken links).

**Decision:** B′. The second survey showed it is cheap on the authoring side: the
S-star `focusId` is authored *once* in `makers/sStar.ts:57` for all 39 stars;
`bodyRegions.ts` already names the region `galactic-centre` and only carries a
`SGR_A_STAR_ID` constant to bridge the mismatch; the module-load pyramid
(`POSITION_DRIVERS` → `deriveBodyStates` → `BODY_REGIONS` →
`FOREGROUND_MAX_DISTANCE_MPC`) only needs the *anchor*, which stays in core. The
expensive part — "how does the Layer make the object focusable" — became Q3.

## Q3: How the Layer makes Sgr A\* focusable, searchable and deep-linkable

**The question:** With the anchor renamed, the `SCENE_BODIES` row is the only
thing keeping Sgr A\* in search, `#focus=`, framing and the InfoCard. A Layer has
two ways to contribute a focusable.

**Considerations:**

- **Option 1 (Layer-contributed body roster, `Layer.bodies`):** Sgr A\* stays a
  "body"; `SCENE_BODIES` becomes boot-composed. `SCENE_BODIES` itself has one
  module-load derivation, but pick rows pack seed-array indices, search names are a
  module-load map, `SCENE_ANCHOR_POINT_BODIES` feeds three module-load capacity
  constants (one sizes the GPU timing query set), and `regionOfBody` must stay
  total. A new contract member with no precedent — the exact work the starCatalog
  spec deferred as "body's ground prep" (spec :168, :215).
- **Option 2 (non-body `blackHole` selection arm via `Layer.selection`):** live
  precedent in `structure`, `milkyWay`, `star` and the Layer-owned
  `zoneOfAvoidance` row, composed at `createLayers.ts:179`. Cost: one
  `SelectionRef`/`FocusableTargetType` arm, one `URL_HASH_FOR` row, one
  `focusFraming` case carrying `radiusM` + `focusDistanceRadii` and delegating to
  `bodyLikeFraming` as the `star` arm does, plus a search source (Q4). Deletes
  `AnchorPointBody`, `SCENE_ANCHOR_POINT_BODIES` and the `'sgr-a-star'` key in
  `BODY_PICK_ROWS` — all one-member tables that exist for Sgr A\*. (Corrected in
  Q7: the deletion holds at the selection level, not at the slab level.)

**Decision:** Option 2. A black hole is not a body in this codebase's sense — no
surface, orbit or mesh — and `AnchorPointBody` exists only to make it fit. Follow-ons
opened: the deep link changes shape (Q9), the InfoCard needs a non-body home (Q12),
and the starCatalog spec's "`Source.SgrAStar` stays a body" (:27) and "core keeps
the Sgr A\* caption" (:174) are reversed and need an amendment note.

## Q4: How the palette learns about a Layer's focusables — the `search` contract member

**The question:** `rankPaletteMatches.ts:91` scores `SCENE_BODIES` directly, and
takes three more loaded inputs (`famousGalaxiesMeta`, `aliasIndex`,
`structureSearchList`), each with its own slice field and selector. The user asked
for one way that every Layer honours, with as little prep in the Layer as
necessary, and where the hook is visible on the contract.

**Considerations:**

- **Option A (store-published list, the `structure` precedent):** one slice field,
  one selector, one container prop per Layer. Right for async rows; a fourth ad-hoc
  field.
- **Option B (module-load export, the `SOURCE_REGISTRY` precedent):** the palette
  imports a static row list from the Layer. Cheapest for Sgr A\*, useless for
  anything loaded — the user rejected it on exactly that ground.
- **Static `Layer.search` folded like `Layer.ui`:** clean for static rows, but
  structures re-publish on every bulk-group land *and clear*
  (`wireStructureProjection.ts:49-68`), so a static member cannot be honoured by
  them.
- **Seed + `reportSearch` callback (facts pattern):** static rows seeded at boot,
  a `LayerCoreDeps.reportSearch` for refreshes. Two doors into one room.
- **Promise-valued `search` + a core saga (user):** covers "loaded once", not
  "clears and re-lands".
- **Subscribe-function + `eventChannel`:** redux-saga's native shape; no adapter
  in a callback-fed Layer; teardown owned by core.
- **Async iterable (user):** language-native, no redux-saga vocabulary in the type;
  a callback-fed Layer needs a ~10-line callback→async-iterator helper once.

**Decision:** One shape, an async iterable.
`search?(runtime): AsyncIterable<readonly LayerSearchEntry[]>` — a static Layer
writes `async function* () { yield ROWS; }`; a loading Layer yields on every
land/clear. Core runs one saga per Layer in `createLayers` (`call(next)` loop,
`put(layerSearchReported)` per yield, `it.return()` on cancel); one store key; one
selector `selectLayerSearchRows` feeding `rankPaletteMatches`. The row carries
`{ id, names, ref: SelectionRef, class: 'primary' | 'catalog' }` — `class` is the
existing ranking distinction (primary rows get `PRIMARY_TIEBREAK` and no cap,
catalog rows are capped at 50), without which the alias index could never migrate.
The three existing loaded inputs keep their fields in this feature and are named in
the contract doc as intended tenants. **Extended by the user to source counts:**
`sourceCounts?(runtime): AsyncIterable<SourceCountReport>` replaces
`LayerCoreDeps.reportSourceCount`; galaxyCatalog's one call site
(`wireGalaxyCatalogSourceSlot.ts:65`) becomes a yield and the helper lands in that
prep commit. `publish` (facts) stays a push callback: `galaxyCatalog/frame.ts`
patches facts per frame, where a channel adds nothing; it is the last push door on
`LayerCoreDeps`, to be re-judged when the body Layer forms.

## Q5: Where the caption and the pick go

**The question:** `starPointsPass.ts:328-357` draws the Sgr A\* caption inside the
*star* points pass, and that glyph is the pick target
(`packSelection(Source.SgrAStar, …)`).

**Considerations:**

- **Option A (caption → `Layer.guides.screenLabels`, pick → the Layer's own pass):**
  constellations precedent for the label row; `starPointsPass` loses its id branch;
  `Source.SgrAStar` keeps code 27 and moves to the Layer's `sources/`.
- **Option B (leave both in `starPointsPass`):** cheaper now, but the starCatalog
  Layer (PR2) would inherit a foreign id branch inside its pass on day one — the
  prior session's named anti-pattern — and the second migration would touch the same
  pass again.

**Decision:** Option A. The pick surface was later merged with the glint (Q8).

## Q6: Who owns the sky capture

**The question:** The lens samples a cubemap baked by core's capture machinery: the
`sgrAStar` row of `CUBEMAP_CAPTURES` (a closed `SkyCaptureKey` union with ~20
consumers), the `sky-cubemap` target allocated by `captureRowAllocateWhen('sgrAStar')`
and sized from the tuning slice, a static `viewSlotBase: 1`, and a frame-graph line
whose position between the additive roster and `body-glints` is load-bearing.

**Considerations:**

- **Option A (captures stay core; the Layer consumes):** the only edit is the
  target's `size` callback reading the tuning slice at its new path; core keeps a row
  that exists for one Layer.
- **Option B (`Layer.captures` now):** opens the key union (`EngineState.cubemapCaptures`
  becomes a boot-built map, every keyed read can miss), moves view-slot assignment to
  boot (three renderers size per-view buffers from `VIEW_SLOT_COUNT` at construction),
  and edits `scheduleSkyCaptures`/`frameSections`/`EngineState` — the same files the
  dome refactor is about to reshape: `smoke-diagnosis.md` §A pins the Sgr A\* defect on
  capture-frame axes (`scheduleSkyCaptures.ts:81-86` builds the frame with no `axes`)
  and per-face uniform races. The roster of *who draws into* a capture stays a core
  listing regardless (Ruling 6 of the render-black-hole spec): a Layer must not name
  other Layers' passes. `solarSystem` and `probe` rows belong to the unformed body
  Layer, so core keeps a roster either way.
- **B split in two (proposed):** a prep commit makes the roster composable with every
  row still in core (open key, boot-built runtime map, boot-allocated view slots,
  slot-disjointness ratchet), then the Layer move is one row.

**Decision:** B as the destination, delivered as A now + the composable-roster prep +
the row move, both sequenced **after #800 (dome) lands** so the composition is built on
the capture machinery dome ends up with. The spec names `Layer.captures` as the target,
lists the prep under Ground preparation flagged "after #800", and keeps
`SCALE_FADE_BANDS.sgrAStarLensing` in core until then (the capture row reads it; the
Layer's slab row imports it — one temporary Layer→core read, noted beside the deferral).

## Q7: The metre-frame slab — `Layer.slabs`

**The question:** The lens cannot draw at NEAR0: at 8 kpc, f32 resolves ~3×10¹³ m
and the lens works at 2–30 r_s (r_s ≈ 1.2×10¹⁰ m). It draws on a `body-m` slab —
RTC about the hole, its own near/far bracket, painter index, `ctx.bodyPose(bodyId)`.
That slab exists because `SGR_A_STAR` is in `slabBodyCandidates`
(`frameContext.ts:64`) via `SCENE_ANCHOR_POINT_BODIES`; the camera's descent floor
(`standoffRadii: 2`) and arrival (`focusDistanceRadii: 30.4`) ride the same row.
`SlabFrame.body-m.bodyId` is typed `BodyId`; 19 files key on `'body-m'`; three
capacity constants count candidates at module load. So "body" is three things — (1)
selection identity, ruled in Q3; (2) slab + camera host; (3) drawn surface — and
Sgr A\* needs (2) whatever it is called. Q3's line that the anchor-point tables "all
get deleted" was wrong at this level.

**Considerations:**

- **Option A (core keeps the slab host):** `AnchorPointBody` survives as "the
  galactic centre is a metre-frame host of radius r_s, standoff 2, arrival 30.4" —
  core carrying the Layer's physics; the `visibleSlabBodies` id branch stays.
- **Option B (`Layer.slabs?(runtime): readonly LayerSlabRow[]`):** the body Layer's
  ground prep taken now. Not in the dome diagnosis, so no collision.

The user asked what a row must describe. From `bodySlabRow` (`slabs.ts:150-235`):
core derives per frame — pose from the anchor's state, `near` (footprint + margin,
altitude floor, `MIN_NEAR_M`), `far`, the f64 `vp`, `distanceRangeM`, painter index,
`precision: 'f64'`, `reversedZ`, the DEV chain-row scan — and the Layer declares the
seven facts only it knows:

| field | why |
| --- | --- |
| `anchorId` | whose position the frame is centred on (`'galactic-centre'`); pose from that anchor's state, so no driver of its own |
| `boundingRadiusM` | bracket, pick and apparent-size reads (r_s) |
| `footprintRadiusM` | the widest thing the row draws — the lens quad's `edgeFadeEndRs × r_s`; today's anchor row carries `[0, 0]` relief and the quad's extent is nowhere |
| `standoffRadii` / `focusDistanceRadii` | descent floor and arrival, for the camera host lookup |
| `activeBand` | the row exists only while the band is open (today `bodyRowSlabs` gates `lens` on `skyCaptureBandAlpha('sgrAStar')`) |
| `cullFloorMpc` | the band-support bypass now an id branch in `visibleSlabBodies` |
| `source` | which core frame-graph line consumes the row: `'foreground'` (painter-ordered depth-clearing fold) or `'lens'` (hdr, after the roster, before `body-glints`) |

`BodyRowSource` generalises: a frame-graph line keeps naming a source (its
*position* stays core data), and the source resolves to the active rows that name it;
`insideAtmosphere` stays core-resolved. The user then asked how other Layers would use
it: the **body Layer** maps Earth, planets and hostless meshes onto the same row
(`source: 'foreground'`, no `activeBand`), which is why designing it generally now
makes that migration a move; **blackHoles** gets one row per `BLACK_HOLES` entry, so
M87\* is a second row with its own anchor, r_s and band and the lens pass filters
`view.slab.frame.hostId` — "data, not code" becomes true at the slab level; **riders**
(the backlogged S-star lensing drawing on the hole's row, a landing site on Mars) are
passes listed on the consuming line filtering by `hostId`, needing no contract field.
The whale-on-Earth rider that *lowers the host's near plane* (`attachedBodiesByHostId`)
stays a body-Layer concern. Core keeps the lines and their order, painter order, and
the capacity ceiling (the three constants become a ceiling + boot assert); a Layer
needing a new *line* still edits core frame data, as every Layer pass name does.

**Decision:** Option B, as its own prep commit with every row still in core, then
the Layer contributes its one row.

## Q8: The far-field glint and the pick surface

**The question:** Outside the band Sgr A\* is a warm-orange additive point packed by
`bodyGlintsPass` (hard-coded tint, `sgrAStarGlintBrightness` crossfading out as the
band opens, a dedicated staging slot, the anchor term in `bodyGlintRenderer`'s
capacity). Q5 moved the pick into "the Layer's own pass".

**Considerations:**

- **Option A (one `black-hole-marker` pass):** the far-field point *is* the pick
  surface — one additive billboard per `BLACK_HOLES` row, brightness
  `base × (1 − fadeBand(row.activeBand))`, writing the pick target with
  `packSelection(Source.BlackHoles, rowIndex)`; inside the band the lens quad takes
  over as the pick surface. Retires the `bodyGlintsPass` branch, the staging slot and
  the capacity term; tint and intensity become row data.
- **Option B (delete the glint):** smaller, but a caption is UI, not scene, and the
  hole would have no far-field presence — which the fade band was designed around.

**Decision:** Option A, with the user's rider: reuse the glint machinery. The pass
instantiates its own `bodyGlintRenderer` in `create` (same module and pack/pick
contract, separate instance — Layers own their GPU objects), so the only new code is
the pass and the row fields.

## Q9: The deep link

**The question:** Under the non-body arm `#focus=body-sgr-a-star` stops resolving
(`bodySelectionRow` decodes via `SCENE_BODIES` membership). In-repo callers: two
featured cards (`featuredTabs.ts:153-157, 418-422`), ~30 test sites, 26 doc mentions.

**Considerations:**

- **Option A (`blackhole-sgr-a-star`, the `star-S2` shape, no alias):** old shared
  links miss.
- **Option B (plus a legacy `body-sgr-a-star` claim on the new row):** keeps old
  links alive at the cost of a permanent second `claims` prefix — a special case a
  reader must be taught.

**Decision:** Option A. The app has no published-link contract anywhere else; the
Milky Way, structures and stars all changed id shape without aliases.

## Q10: Sequencing against the in-flight efforts

**The question:** starCatalog PR2 (next on the roadmap) and dome #800 both touch
files this feature edits; PR2's approved spec says Sgr A\* stays a body and core keeps
its caption, both reversed here.

**Considerations:**

- **Option A (blackHoles first):** PR2 is planned against the post-blackHoles tree
  and can use `search`/`sourceCounts`/`slabs`.
- **Option B (starCatalog PR2 first):** keeps roadmap order; PR2 carries the Sgr A\*
  caption per its spec and this feature removes it again.

**Decision:** Option B — PR2 is essentially done. When it lands, this branch merges
main and reconciles PR2's tree against the new contract (the Sgr A\* caption in its
pass, the S-star focus id, `reportSourceCount`) as part of the prep. Q6's capture prep
is separately sequenced after #800.

## Q11: PR shape

**The question:** Three behaviour-preserving core-contract changes precede the
Layer: (1) `search` + `sourceCounts` as async iterables, the core saga, the
callback→iterator helper, galaxyCatalog moved onto `sourceCounts`; (2) `Layer.slabs`
with core's candidates expressed as rows, `source` naming the line, cull bypass as a
field, capacity ceiling + boot assert; (3) the `'galactic-centre'` anchor rename.

**Considerations:**

- **Option A (one prep PR of three commits + one feature PR):** prep reviewable as
  "nothing moved, contracts widened", CI-gated alone; the feature diff is moves and
  deletions.
- **Option B (one PR):** mixes contract design with the extraction; a halt on the
  feature parks landed-worthy prep.

**Decision:** Option A. No deletion audit on the prep PR; one audit at the feature's
`/feature-done`.

## Q12: Who owns the InfoCard

**The question:** `InfoCard` dispatches on `target.type` through the core
`DETAIL_CARD` table (`detailCardTable.ts:70`), `Record<FocusableTargetType, …>`, two
components per arm. The shipped `zoneOfAvoidance` Layer owns its selection row but
its two card folders sit in core `components/InfoCard/` with a core table row.

**Considerations:**

- **Option 1 (follow that precedent):** `BlackHoleDetailCard` + `CompactBlackHoleCard`
  in core, one table row. One line, and the `FocusableTargetType` union gains
  `blackHole` in core regardless (it is the `SelectionRef` tag).
- **Option 2 (a fourth `Layer.ui` slot, `detailCard`):** the Layer's `ui` carries
  `{ slot: 'detailCard', content: { type: 'blackHole', Detail, Compact } }`; the table
  becomes core rows plus the folded Layer entries; `zoneOfAvoidance`'s two card folders
  move into `layers/zoneOfAvoidance/ui/` for consistency.

**Decision:** Option 2 — consistent with Q4/Q6/Q7: every hook the Layer needs is a
named contract member. The `zoneOfAvoidance` card move is part of the prep PR.

---

## Naming (stated, not asked)

- Layer `blackHoles`; passes `black-hole-lensing`, `black-hole-marker`; tuning slice
  `layers/blackHoles/state/lensingTuning/`; DebugPanel section via the `debug` slot.
- Source row moves to `layers/blackHoles/sources/`, `type: 'blackHole'` (new kind
  beside `body`/`structure`/`starCatalog`/`milkyWay`/`volume`), member
  `Source.BlackHoles`, **value 27 kept**. Its `visible` flag leaves
  `settings.bodies.items` for the Layer's own settings — one more visibility key for
  the derive-settings-snapshot backlog item.
- `'sgr-a-star'` stays the row id inside `BLACK_HOLES`; label and aliases move with
  the source row.

## Rulings

1. Roadmap-driven, no deadline.
2. `'galactic-centre'` is a core place anchor read by milkyWay, the S-stars, the
   regions and the Layer; the Layer contributes the Sgr A\* object.
3. Non-body `blackHole` selection arm via `Layer.selection`.
4. `search?(runtime)` and `sourceCounts?(runtime)` as async iterables; core saga per
   Layer, one store key, one selector; `publish` stays.
5. Caption → `guides.screenLabels`; pick → the Layer's pass.
6. `Layer.captures` is the destination; consumer now; prep + row move after #800.
7. `Layer.slabs` with the seven-field row; `source` names the core line; riders need
   no field.
8. `black-hole-marker` = glint + pick, own `bodyGlintRenderer` instance; tint and band
   as `BLACK_HOLES` data.
9. `blackhole-sgr-a-star`, no alias.
10. starCatalog PR2 first; merge main, reconcile.
11. Prep PR (three commits + the zoneOfAvoidance card move) + feature PR.
12. `detailCard` UI slot; the Layer owns its cards.

## Spec amendments owed

- `docs/superpowers/specs/2026-09-21-star-catalog-layer-design.md` :27 ("`Source.SgrAStar`
  stays a body") and :174 ("core keeps … Sgr A\*" captions) — reversed by rulings 3
  and 5; add a note pointing here.
- `docs/backlog/2026-09-21-derive-settings-snapshot.md` — the black-hole visibility key.
- `docs/backlog/2026-09-03-s-star-analytic-lensing.md` — the S-stars become a rider on
  the hole's slab row (Q7), no contract field needed.

## Post-merge reconcile (main `b1e453e02`: #802 starCatalog PR2, #805 planners, #807)

No ruling is contradicted. Corrections and new facts the spec must carry:

- **Ruling 5 splits.** The caption was never drawn by the star pass: it is a core
  `ForegroundCaption` from `presentation/sceneBodyLabels.ts:105-111` (kind
  `'sgrAStar'`, `captionFadeRules.ts:133-142`, `captionPriority.ts`). The star pass
  owns only the **pick stamp** hanging off it — and PR2 moved that pass into
  `layers/starCatalog/passes/starPointsPass.ts` (`:132-134`, `:175-186`, `:325-360`,
  importing core `sgrAStarCaptionTarget.ts` and `SGR_A_STAR`). So: caption out of
  `sceneBodyLabels` (core), pick out of the *star Layer's* pass.
- **Ruling 9 premise moved.** `body-<id>` now decodes through `BODY_PICK_ROWS` via
  `utils/scene/isRegistryBodyId.ts` (PR2 deleted `isSceneBodyId`); `rankPaletteMatches`
  scores `SCENE_BODIES.filter(isRegistryBodyId)` (`:97`).
- **Ruling 3 has an unpriced cost.** `docs/backlog/2026-09-22-stars-still-in-the-body-tables.md`
  (filed by PR2) names six `findByIdOrThrow`-style readers of `SCENE_BODIES` —
  `cameraDrivers.ts:166`, `bodyHomePose.ts:77`, `selectionHaloTable.ts:101`,
  `focusFraming.ts:109`, `approachTiltedPose.ts:48`, `watchFlyToLonLatSaga.ts:73` —
  that a non-body Sgr A\* trips exactly as the stars do. The `Layer.slabs` row (Q7) is
  the natural host for what they read (radius, standoff, position); `refactor-ground`
  prices whether they move onto it in the prep or the backlog item stays.
- **Ruling 6 has a competitor.** `docs/backlog/2026-09-22-captures-as-views.md`
  proposes modelling a capture face as a view rather than a third step kind — a
  reshape of the machinery the `Layer.captures` prep would build on. Sequence the
  prep after that ruling as well as after #800.
- **`Layer.frame` is gone** (#805): per-frame work is a `planners?` row
  (`FrameContentPlanner`, `scope: 'once' | 'perView'`, result via
  `snapshot.plans.get`). The Layer's band gating and slab activity target that.
- **A seventh `SCENE_ANCHOR_POINT_BODIES` consumer:** `utils/meshBodies/meshBodySlabHostId.ts:19`
  — a mesh body may name the Sgr A\* row as its slab host; the `slabs` row must stay
  nameable as a host.
- `layers/body/state/slices.ts` still holds `bodies`, `earth`, `sgrAStarLensingTuning`;
  PR2 took nothing out. `Source.SgrAStar` row is still core (`data/sources.ts:86`).
- The starCatalog spec is under `specs/completed/` with :27/:174 unamended — the note
  is still owed.

## Refactor-ground checkpoint (2026-09-22, four surveys + blind greenfield cross-check)

Greenfield and sketch agreed on: the anchor stays core (`SCENE_ANCHORS`,
`sceneAnchors.ts:21`, is already that table — `AnchorBody.id: string`), per-Layer
snapshot-replace store keys, one saga helper shared by `search`/`sourceCounts` with
separate members, `detailCard` as a `ui` slot variant. Four divergences were ruled
one by one:

**R13 — `slabs` is static data** (`slabs?: readonly LayerSlabRow[]`, like `targets`),
not `(runtime) =>`. Nothing in a row needs runtime; `footprintRadiusM` is the quad's
design maximum, and `createLayers` calls runtime-bound members once at boot anyway.
Caveat carried, not acted on: hostless mesh rows are store-fed
(`frameContext.ts:59-61`), so the body Layer will need a load-aware feed here later.

**R14 — the camera-driver joint: `SelectionKindRow.driver?(row): DriverGeometry | null`**
with `DriverGeometry = { hostId, footprintRadiusM, datumRadiusM, standoffRadii,
focusDistanceRadii? }`. `focusDriverId.ts:8-12` is a two-arm switch and eight readers
`findByIdOrThrow(SCENE_BODIES, …)` behind it (`cameraDrivers.ts:166`,
`bodyHomePose.ts:77`, `selectionHaloTable.ts:101`, `focusFraming.ts:109-115`,
`approachTiltedPose.ts:48`, `watchFlyToLonLatSaga.ts:73`, `pivotRadiusMpc.ts:24,39`,
`bodyRung.ts:64` — all size reads, none reads position). A `blackHole` arm either throws
there or, returning null, loses the 2 r_s descent floor. The arm's owner answers
instead; `focusDriverId` is deleted; the star arm answering its own geometry is the
reader half of `2026-09-22-stars-still-in-the-body-tables.md`. **Amends ruling 7:** the
slab row keeps render facts only — `anchorId, boundingRadiusM, footprintRadiusM,
activeBand?, cullFloorMpc?, source` — because driving the camera and hosting a metre
frame vary independently (seeded stars drive without a slab; S-star riders draw on a
slab without driving). Rejected: the greenfield `slab?(row) => hostId` link, which keeps
a `SCENE_BODIES` fallback for stars — a second producer.

**R15 — `SlabFrame.body-m.bodyId: BodyId` → `hostId: SlabHostId`**, with
`SlabHostId = BodyId | PlaceId` and `PlaceId = 'galactic-centre'` (core,
`src/@types/scene/PlaceId.d.ts` — authored place anchors that are not bodies; seeded-star
anchors stay `string`). The type must widen regardless; the union makes every stale
`=== 'sgr-a-star'` a compile error. `body-m` hosts today: `earth`, the 24 planets and
moons, `sgr-a-star`, the hostless mesh bodies; after the prep the third is
`galactic-centre`, hosted by the Layer's row. The `'body-m'` tag itself stays (it names
the unit). Rename via `npm run refactor rename`, 19 files.

**R16 — packaging re-confirmed: prep PR + feature PR** (ruling 11), now six commits:

1. `search`/`sourceCounts` async iterables, `runLayerFeed` saga, `callbackIterable`
   helper, `layerSearch` slice key + `selectLayerSearchRows`, `rankPaletteMatches` gains a
   fifth input, 3 call sites migrated, `reportSourceCount` deleted, the
   `layerImportBoundary.test.ts:194` message updated. The `engineSourceCountReported`
   action stays (three sagas pulse on it).
2. `Layer.slabs`: `LayerSlabRow`, `bodySlabRowOf(body)` adapter for store-fed bodies,
   composed candidates, `hostId: SlabHostId`, `bodyRowSlabs.lens` = active rows naming
   `'lens'`, `SLAB_HOST_IDS` composed, capacity ceiling + boot assert (the GPU query set
   is sized before Layers exist, `gpuTimingService.ts:113`). Sgr A*'s row still core.
3. `SelectionKindRow.driver?` + the eight readers; `focusDriverId.ts` deleted.
4. `'galactic-centre'` anchor + `PlaceId` — after 2, so the pose key flips at
   `row.anchorId` and the lens-pass filter only.
5. `detailCard` slot + fold; core table 5 arms + composed entries; ZoA's two card
   folders → `layers/zoneOfAvoidance/ui/`.
6. Docs: starCatalog spec :27/:174 note, backlog amendments.

Growth verdicts needing no prep: selection arm + `URL_HASH_FOR` + `targetIdentityKey`
rows (as `star`); the `sky-cubemap` target moves onto **`Layer.targets`** (exists), so
no Layer→core tuning read is needed — better than Q6 assumed; marker, caption, capture
row per rulings 8, 5, 6.

Adjacent (backlog, not prep): `SCENE_ANCHORS`/`AnchorBody` is the place table under a
body name in `data/bodies/`; `URL_HASH_FOR` beside `SelectionKindRow.focusId.encode`
looks duplicated (unverified); `rankPaletteMatches`' six static inputs are future
`search` tenants.

## Next

Spec (`docs/superpowers/specs/completed/2026-09-22-black-holes-layer-design.md`) against the
post-prep architecture, Ground preparation = R16's six commits; then `writing-plans`.
Worktree `black-holes-layer` (branch `worktree-black-holes-layer`, `public/data` linked
to main).
