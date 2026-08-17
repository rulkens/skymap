# Grill Session: Body sources bear labels — 2026-07-28

Source: fallout from PR #509 (`orbitTrails` visibility layer + the Labels → Labels & Guides
rename). Adding a fourth row to that section exposed that its "category vs non-category"
split tracks storage shape rather than meaning.

`famousStar`, `planet`, and `earth` are `SOURCE_REGISTRY` rows that render text captions,
yet all three carry `bearsLabel: false` and keep their label gates in the cross-cutting
`labels` cluster. The goal is to treat them as the label-bearing source entries they are,
so the SettingsPanel's label rows become fully registry-derived and the residual bucket
disappears.

---

## Background: the two disagreeing splits

The section held ten rows under two boundaries that cut across each other.

**Storage split (6/4)** — six rows derive from `SOURCE_ENTRIES` with `bearsLabel: true`;
four do not. This is the `LabelCategory` / `NonCategoryRow` boundary in the container.

**Semantic split (8/2)** — eight rows gate a _name_ while the thing stays visible; two
(`constellations`, `orbitTrails`) gate the _layer itself_.

"Star names" and "Planet names" are labels in the most literal sense — they live in the
`labels` cluster beside `focusedOnly` — but landed in the non-category bucket, while
`constellations` sits in that same bucket without being a label at all. The bucket is a
residue, not a category, so no name could make it honest.

Two docblocks had to misdescribe reality to sustain it. `LABEL_CATEGORIES` claims to cover
"every source that renders a text label in the 3D scene" (false for the three body rows),
and `LabelSettings` claims its knobs "apply across every label producer at once" (false
for `starLabelsEnabled` / `planetLabelsEnabled`, which are per-source gates).

**Root cause:** `bearsLabel` was being set from an implementation-routing fact ("bodies
bypass the COSMO label system") rather than the capability it names.

---

## Q1: Does Earth get its own label row, separate from planets?

**The question:** `foregroundLabelsLayer` has four caption kinds (`sun`, `earth`, `planet`,
`star`) but today only two toggles. `starLabelsEnabled` maps cleanly onto the `famousStar`
source, but `planetLabelsEnabled` spans _two_ sources — `planet` and `earth`. If label
gates become registry-derived, does that merged toggle split?

**Considerations:**

- **Option A (three rows — split Earth out):** Each body source gets its own gate; rows
  derive from the registry with no hand-merging. Earth already has its own source entry,
  its own caption kind, and its own `CAPTION_PRIORITY` tier above `planet`. Visible UX
  change: "Planet names" no longer covers Earth.
- **Option B (keep Earth with planets):** Preserves today's UX exactly, but requires a
  hand-maintained merge of two source entries into one panel row — reintroducing the
  special case the refactor exists to delete.
- **Option C (nested sub-row):** Three registry-derived gates, but Earth renders nested
  under "Planet names" so the visual grouping matches expectation. Costs a nesting concept
  the section does not have.

**Decision:** Option A. Bundling Earth's caption under "Planet names" is an artifact of the
flat-toggle implementation, not a fact about the domain, and Earth is plausibly the one
caption you would keep while muting the rest during the final descent. Deriving rows from
the registry and then re-merging two by hand would defeat the purpose.

---

## Q2: Where does the body/star label state live?

**The question:** Given the rows become registry-derived, where does each source's
`labelEnabled` actually sit in `EngineSettingsState`?

**Considerations:**

- **Option A (fifth `bodies` cluster holding all three):** `bodies.items` keyed on
  `'earth' | 'planet' | 'famousStar'`. Uniform with the other four source-type clusters.
- **Option B (three ad-hoc singleton clusters):** `famousStars` gains `labelEnabled`, new
  `planets` cluster, `earth` cluster gains one. Smallest diff, but takes
  `projectLabelCategoryVisibility`'s special-case count from one to four.
- **Option C (fifth cluster + fold in Earth's look dials):** Everything about a body in one
  place, at the cost of a heterogeneous item type.

**Precedent consulted:** PR #295 (2026-06-10, "settings by source type") existed precisely
to collapse visibility "stored in 4 different shapes" into a uniform
`settings.<sourceType>.items[id]` accessor. `DataItemSettings = { enabled }` is the shared
base, and `StarCatalogItemSettings` documents carrying `labelEnabled` **inertly** rather
than making it optional — "for no gain over a seeded-but-unread boolean" — establishing
that inert axes are acceptable to keep the shape uniform.

**Decision:** None of the above as stated — **corrected by the user**: stars should work
the same way as galaxies, not be lumped in with bodies.

`famousStar` becomes a **star-catalog row**, the exact mirror of `famousGalaxy` in
`galaxyCatalogs.items`. The codebase already anticipated this: `starCatalogs`' docblock
says "the curated famous-star map will add a label-bearing row later, so all four
source-type clusters expose the same per-item shape", and `StarCatalogId` derives from
`type: 'starCatalog'` rows, so the union widens automatically.

Cost check: `type: 'famousStar'` had almost no consumers — its own entry type and two doc
lines — so the retype is cheap.

```ts
FAMOUS_STAR_ENTRY { type: 'starCatalog', bearsLabel: true }
starCatalogs.items.famousStar = { enabled, labelEnabled }
// absorbs famousStars.enabled AND labels.starLabelsEnabled
```

---

## Q3: How do earth + planet store their state?

**The question:** With `famousStar` routed to `starCatalogs`, where do the two genuine
bodies live?

**Considerations:**

- **Option A (`type: 'body'` + `bodies.items`):** Both entries share a `'body'`
  discriminant; `BodyId` derives as a one-type extract, matching how `StarCatalogId`,
  `GalaxyCatalogId`, and `StructureId` are all one-type extracts. `EarthSourceEntry` and
  `PlanetSourceEntry` stay distinct shapes under the shared discriminant.
- **Option B (keep `type: 'earth'` / `'planet'`, two-type extract):** Same cluster, but the
  id union no longer derives from a single discriminant like the other four.
- **Option C (two singleton clusters):** Smallest diff; keeps per-source special cases in
  the projection.

**Decision:** Option A. Earth's specialness is real but lives in the renderer, not in how
its visibility is stored. Earth's look dials (`atmosphereExposure`, `ambientLight`,
`oceanRoughness`) stay in the `earth` cluster — the same separation `galaxyCatalogs` makes
between shared appearance knobs and per-item visibility.

---

## Q4: What granularity for the new `VisibilityLayerKey`s?

**The question:** The panel rows are per-item, but the tour-addressable intent vocabulary
is hand-curated. How many keys, and at what level?

**Context established:** The foreground captions have **no fade-registry participation
today** — `foregroundLabelsLayer` owns its own ~0.3 s temporal envelope and reads the
toggles directly. Because `VISIBILITY_ACTION_ROW` dispatches real settings actions, a
clip's `hide([...])` flips the toggle and the existing envelope fades the captions out, so
tour control works without any fade handle being _read_.

**Considerations:**

- **Option A (two cluster-level keys):** `starCatalogLabel` and `bodyLabel`, each fanning
  out across its cluster's items via the row's `expand()` — exactly what `surveyLabel` and
  `structureLabel` already do. Per-item fade handles still registered.
- **Option B (three per-item keys):** `starLabel` / `earthLabel` / `planetLabel`, matching
  the panel 1:1, letting a tour mute planets while keeping Earth.
- **Option C (one `foregroundLabel` key):** Simplest vocabulary, but loses the star-vs-body
  split today's two toggles already give tours.

**Decision:** Option A. `VisibilityLayerKey`'s own docblock insists the set is "a stable,
hand-curated enumeration of _intents_, not a mechanical mirror of the registry", so the
discipline is to add `earthLabel` when a beat actually needs it. This is also why the panel
cannot simply drive off `VISIBILITY_ACTION_ROW` — see "Rejected joint" below.

---

## Q5: How is the Sun's exemption from the star-map gate handled?

**The question:** `starLabelsEnabled` (label axis) mutes all star captions _including_ the
Sun; `famousStars.enabled` (layer axis) mutes the map _except_ the Sun, which anchors the
descent. Does that asymmetry survive as the two axes of one item?

**Considerations:**

- **Option A (keep layer-local, backlog the rest):** The exemption stays a `kind === 'sun'`
  branch in `foregroundLabelsLayer`, re-expressed as two axes on
  `starCatalogs.items.famousStar`. Keeps this refactor scoped to label gates.
- **Option B (model the Sun as its own row):** The Sun gets a registry row with its own
  axes; the exemption dissolves into data because the Sun simply is not a member of the
  famous-star map. Pulls in the star layers, `visibleStars`, and `CAPTION_PRIORITY`.
- **Option C (normalize — drop the exemption):** Simplest rule, but the descent's aim point
  loses its name whenever the map is muted.

**Evidence that decided it:** the Sun carries **four** separate special cases — its own
`kind` in the caption union, its own `sunCaption` fade band, the top `CAPTION_PRIORITY`
tier, and this gate exemption. The project's second-special-case trigger says four is well
past the point where the answer is "it wants to be its own row."

**Decision:** Option B. `SUN_ENTRY { type: 'body', id: 'sun', bearsLabel: true }`.
`visibleStars`' exemption filter collapses into two independent gates. `type: 'body'` is
coherent for an object drawn by the star layers — "body" means a discrete named near-field
object, not a statement about which renderer draws it.

---

## Q6: What do the Sun row's two axes do?

**The question:** `bodies.items.sun.enabled` would be a "hide the Sun" capability that does
not exist today, and it is ambiguous what it would mean given the Sun is `RENDER_ORIGIN_MPC`
and its sphere anchors the descent.

**Considerations:**

- **Option A (label live, enabled inert):** `labelEnabled` gets its own "Sun" panel row;
  `enabled` is seeded true and never read, mirroring `gaiaStars`' inert `labelEnabled`.
- **Option B (both axes live):** Most uniform, no inert field — but introduces a toggle
  that can blank the render origin mid-descent, with unclear meaning for the sphere, bloom,
  and orbit foci.
- **Option C (Sun's label folds into Star names):** Avoids a fourth row but relocates the
  special case rather than removing it.

**Decision:** Option A. The exemption still disappears — which was the point of Q5 —
without inventing a hide-the-render-origin capability this refactor has no need for.

---

## Q7: How does `FadeId` carry the new per-item label handles?

**The question:** `{ kind: 'labelLayer'; layer: LabelLayerId; category?: StructureId }` —
`category` is used in exactly one place (the structure row). The new per-item handles need
somewhere to land.

**Considerations:**

- **Option A (`item?: LabelCategory` + new layer ids):** After this refactor
  `LabelCategory` is precisely "the label-bearing source ids" and subsumes `StructureId`.
  New producer values keep `fadeIdToVisibilityKey` a direct switch on `layer`.
- **Option B (one `'foreground'` layer id):** Tidier vocabulary, but
  `fadeIdToVisibilityKey` must inspect `SOURCE_REGISTRY[item].type` to choose between
  `starCatalogLabel` and `bodyLabel`.
- **Option C (widen the `category` union to `StructureId | StarCatalogId | BodyId`):** The
  bolt-on — an optional field typed as a union of unrelated id domains that no reader can
  narrow safely.

**Decision:** Option A, **with naming corrected by the user** — layer ids are named after
the source type, not suffixed with "Names":

```ts
type LabelLayerId =
  | 'milkyWay' | 'structure' | 'galaxy' | 'scaleBar' | 'starCatalog' | 'body';
//                             ^ renamed from 'galaxyNames'

{ kind: 'labelLayer', layer: LabelLayerId, item?: LabelCategory }
```

`CategoryLabelLayer` (`Extract<LabelLayerId, 'galaxyNames' | 'structure' | 'milkyWay'>`)
widens accordingly. `SourceEntryBase` already carries a `labelLayer` field
(`famous-galaxy.ts` declares `labelLayer: 'galaxyNames'`), so bodies declare
`labelLayer: 'body'` and famousStar `'starCatalog'` — the joint already exists.

---

## Q8: What do the four new rows read as?

**The question:** `CATEGORY_DISPLAY_INFO` _throws_ if a `bearsLabel: true` entry lacks
`detailLabel` / `shortLabel` / `plural`, so flipping the flag forces display text onto all
four new rows. Row text then comes from `plural`, replacing today's hand-written
"Star names" / "Planet names".

**Considerations:**

- **Option A (registry plurals):** `Famous Stars` (mirroring `Famous Galaxies`), `Sun`,
  `Earth`, `Planets`. Uniform with `Clusters` / `Voids` / `Milky Way` — every row names the
  labelled thing, nothing hand-written.
- **Option B (keep "…names" phrasing):** Preserves today's wording, but splits the section
  into two naming styles and keeps four labels effectively hand-authored.
- **Option C (forced plural everywhere):** Reads wrong for single bodies (`Suns`,
  `Earths`).

**Decision:** Option A. Under a header that now reads "Labels & Guides" the `…names` suffix
is redundant, and this removes the last place where a row's text is hand-written rather
than derived.

---

## Q9: Sequencing and packaging

**The question:** The change touches registry entry types, a new settings cluster,
`starCatalogs`, `visibleStars`, the caption-kind model, `LabelLayerId`, `FadeId`,
`VisibilityLayerKey`, the panel, and tour capture/restore.

**Considerations:**

- **Option A (green vertical slices, one PR):** Prep first, then one slice per source type,
  each migrating type + seed + readers + writers + React end-to-end and deleting the old
  field within the slice, so every commit is green.
- **Option B (prep PR, then feature PR):** Smaller reviews; prep independently valuable;
  costs a merge-order dependency.
- **Option C (three PRs by subsystem):** Smallest reviews, but serializes into a three-deep
  chain since two slices depend on the first.

**Decision:** Option A, mirroring what #295 chose for the same class of change — explicitly
"GREEN vertical slices per source-type (NOT a global expand-contract / RED window)".

Slice order:

1. **prep** — panel dispatch guard → table keyed on `SOURCE_REGISTRY[cat].type`
2. **bodies** — `type: 'body'`, `bodies.items`, earth/planet/sun rows, `planetLabelsEnabled` deleted
3. **sun** — `visibleStars` decomplection, exemption removed
4. **starCatalog** — `famousStar` retype, `famousStars.enabled` + `starLabelsEnabled` deleted
5. **fade** — `LabelLayerId` rename, `item?: LabelCategory`, two new `VisibilityLayerKey`s
6. **cleanup** — `labels` → `{ focusedOnly }`; entanglement-radar pass

---

## Resulting shape

```ts
// registry
FAMOUS_STAR_ENTRY { type: 'starCatalog', bearsLabel: true, labelLayer: 'starCatalog' }
EARTH_ENTRY       { type: 'body', id: 'earth',  bearsLabel: true, labelLayer: 'body' }
PLANET_ENTRY      { type: 'body', id: 'planet', bearsLabel: true, labelLayer: 'body' }
SUN_ENTRY         { type: 'body', id: 'sun',    bearsLabel: true, labelLayer: 'body' }

// settings
starCatalogs.items.famousStar = { enabled, labelEnabled }
bodies.items = {
  earth:  { enabled, labelEnabled },
  planet: { enabled, labelEnabled },
  sun:    { enabled /* inert */, labelEnabled },
}
labels = { focusedOnly }          // both caption flags gone
// deleted: famousStars cluster, labels.starLabelsEnabled, labels.planetLabelsEnabled

// intents
VisibilityLayerKey += 'starCatalogLabel' | 'bodyLabel'
LabelLayerId = 'milkyWay' | 'structure' | 'galaxy' | 'scaleBar' | 'starCatalog' | 'body'
FadeId labelLayer variant: { layer: LabelLayerId, item?: LabelCategory }
```

Panel, after (`LABEL_CATEGORIES` grows 6 → 10, all registry-derived):

```
Labels                       Guides
  Clusters                     Constellations
  Superclusters                Orbit trails
  Voids
  Groups
  Famous Galaxies
  Milky Way
  Famous Stars
  Sun
  Earth
  Planets
```

The category and label/guide splits now coincide: every "Labels" row is a registry-derived
`labelEnabled`, and the two "Guides" rows are the only genuine _layer_ gates. The
non-category residue is gone.

---

## Rejected joint (do not re-derive)

The panel cannot drive off `VISIBILITY_ACTION_ROW` / `FADE_LAYERS`, despite both already
being total tables over `VisibilityLayerKey` that know how to read and write every layer's
intent. They are **layer-granularity**: `structureLabel` fans out across every structure id
in one action, `surveyLabel` across every catalog. The panel needs **per-item** rows.
Forcing the fit would either coarsen the panel or grow `VisibilityLayerKey` with per-item
keys, which its docblock explicitly rules out.

Two vocabularies at deliberately different granularities. Not a joint.

## Left alone deliberately

`milkyWay` stays a singleton scalar rather than becoming a one-entry `items` record.
`projectLabelCategoryVisibility` already defends this: synthesising a one-entry record to
force uniformity would "pretend the overlay is a catalog". It is the lone singleton by
design, so the type-keyed dispatch table carries one singleton branch — an essential
difference, documented, not un-braided.
