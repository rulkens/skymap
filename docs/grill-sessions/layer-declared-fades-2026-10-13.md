# Grill Session: Layer-declared visibility — 2026-10-13

Source: heliosphere shell prep PR 2. The brief (rulings 2026-10-06 to 2026-10-12, the per-Layer row sketch the user called "great", and a 7-point agenda) lived in session memory. Main at `7d93f2da6`.

Goal: adding a toggleable, fading Layer needs no edit in a core file beyond the composition lists. Today it needs a hand row in seven tables (`FadeId`, `serializeFadeId`, `VISIBILITY_KEY_BY_KIND`, `RECESSION_BY_KIND`, `VisibilityLayerKey`, `VISIBILITY_LAYER_ROWS`, `VISIBILITY_ACTION_ROW`). The eighth, the tour settings snapshot, was derived in prep PR 1 (#890).

Already ruled before this session: scope is everything (single toggles, per-item and label fades); one generic fade identity `{ key, item? }`; the Layer member is called `visibility`; one key belongs to exactly one Layer.

## Q1: How is the key vocabulary typed?

**The question:** today `VisibilityLayerKey` is a hand union, so `hide(['flwo'])` in tour data fails to compile. If Layers declare their own entries, does that guarantee survive?

**Considerations:**
- **Option A (derived type):** each Layer exports a `visibility.ts` tuple; `src/compositions/` gathers them into one `as const` tuple; the key type is `(typeof APP_VISIBILITY)[number]['key']`. Same pattern as `LayerSettingsClusterKey` from prep PR 1. Typos still fail at compile time; no core edit per Layer. Trap: the tuple must come from each Layer's own file, not be read off `APP_COMPOSITION`, because a pass declaring `fade: '<key>'` makes the Layer type depend on the key type, and reading the key type off the Layer is a circular alias `tsc` refuses (documented at `src/layers/galaxyCatalog/state/slices.ts:4-6`).
- **Option B (open strings, validated at boot):** simplest types, but tour data loses compile-time checking; a test must run every tour to catch typos.
- **Option C (keep the core union, rows `satisfies` it):** compile-time safety kept, but a new Layer still edits core, which is the thing this PR removes.

**Decision:** A. It keeps the compile-time guarantee and removes the core edit. Scoped cue names derive as `${key}:${ItemId}` for entries with `items`.

## Q2: The `label:` cue names, which have nothing to derive from

**The question:** today `label:milkyWay`, `label:survey`, `label:structure` and `label:<StructureId>` are hand aliases in `scopedVisibilityActions.ts`. With derived names they have no source. (Side fact found: scoped cues ignore a cue's `over` and use the default 600 ms in / 100 ms out, while bare keys honour `over`.)

**Considerations:**
- **Option A (drop `label:`, use the derived `*Label` keys):** four tour edits; those beats start honouring their written `over`.
- **Option B (keep `label:` as a core alias table):** no tour edits, but a core table a new label Layer must edit.
- **The user's direction:** "define per layer what labels it has and have the `label:{item}` derive from that."

**Decision:** the user's direction. A Layer's `visibility` holds two entry kinds: show entries `{ key, … }` (addressed `key`, `key:<item>`) and label entries `{ label: '<name>', … }` (implying the `labelEnabled` field, addressed `label:<name>`). The `'labels'` aggregate is "every label entry", so the `group` field goes, as do the `*Label` keys (`milkyWayLabel`, `surveyLabel`, `structureLabel`, `starCatalogLabel`, `bodyLabel`, and the previously ruled `blackHoleLabel`) and the `LABEL_SLICES` table. `label:milkyWay` tour uses stay unchanged.

### Q2b: Per-item label names

**Considerations:**
- **Option A (nested, `label:structure:galaxy-group`):** unique by construction, since the label name scopes the item.
- **Option B (flat, `label:galaxy-group`, as today):** shorter, but ids of different Layers share one namespace and the derived type cannot prevent a collision.

**Decision:** A (nested). No tour or exhibit data uses the per-item form today, so it costs no edits.

### Q2c: How a label switch relates to the existing label producers

**The question:** Layers already declare label *producers* in `guides(runtime).screenLabels` / `.worldLabels`. Can those serve as the source? They are a runtime function (no type can derive from them), and producers and switches are not one-to-one: structure has two producers behind one switch, and constellations, lightTime and zoneOfAvoidance have labels with no switch of their own.

**Considerations:**
- **Option A (declare once, reference by name):** the switch lives in static `visibility`; the producer row gains `label: '<name>'` and is handed its fade, like a pass's `fade:`; switchless producers omit it.
- **Option B (merge them):** the producer row becomes the switch; needs `guides` split into static and runtime parts, misfits the two-producer case, needs an opt-out for switchless labels.

**Decision:** A. Each declaration does one job, and the reference makes drift impossible. The user asked to see it in code first; the sketch (Milky Way and structure) was accepted.

### Q2d: Who skips a label producer that is off

**The question:** each producer today reads the raw intent opacity *and* the resolved one, checks its own `labelEnabled`, and decides whether a fade-out tail is still running (`produceMilkyWayLabel.ts:46-53`). Getting it wrong truncates the fade-out tail.

**Considerations:**
- **Option A (core skips the call when the switch is off and the fade-out finished):** one rule in one place.
- **Option B (core only hands over opacity):** smaller change; every producer keeps its own check.

**Decision:** A.

### Plain values, not functions

The user asked why the handed-over fade was a function (`fade.opacity(item?)`). It need not be: an entry without items hands `fade: number`; an entry with items hands `Readonly<Record<ItemId, number>>`, each value already fade × recession × clip. Core resolves every item per frame (at most a few dozen bodies; a lookup and two multiplies each). A pass declaring `fade: '<key>'` gets `opacity: number`, which is also what core checks to skip the pass at 0. Accepted.

## Q3: The galaxy-catalog label (formerly `surveyLabel`)

**The question:** the cue writes `labelEnabled` on every galaxy catalog (`visibilityActionRow.ts:73-78`), but the fade and the producer read only `famousGalaxy` (`galaxyCatalogFadeRows.ts:24-25`, `produceFamousGalaxyLabels.ts:177`), and only `famousGalaxy` has `bearsLabel: true`. The other bits are written and never read.

**Considerations:**
- **Option A (items = the label-bearing catalogs):** `{ label: 'famousGalaxy', cluster: 'galaxyCatalogs', items: <catalogs with bearsLabel> }`; same rule as the star-catalog and body labels; the cue stops writing dead bits; nothing visible changes.
- **Option B (items = all catalogs, matching today's writes):** keeps the dead writes and needs the fade to name which item it reads.

**Decision:** A, named `famousGalaxy` for what it shows (no tour data says `label:survey`). Found on the way: `src/data/labels/labelHomeBySourceType.ts`, another hand table of per-type label reads and writes, handled in Q6.

## Q4: Reveal order of the `labels` group

**The question:** `VISIBILITY_LAYER_ROWS` claims "declaration order is reveal order". `applySceneEffect.ts:30-48` dispatches every key of one `show`/`hide` in the same tick and calls `syncVisibilityFades` once, so all label fades start on the same frame.

**Considerations:**
- **Option A (composition order, no explicit order):** delete the claim; tests that pin list order compare sets.
- **Option B (keep an explicit order list in core):** a hand table ordering something nobody can see.

**Decision:** A. A staggered reveal, if ever wanted, is a cue feature, not a table order.

## Q5: How an entry waits until its assets are loaded

**The question:** seven fade rows have a `guard` reading the renderer (`hasMesh()`, `hasData()`, `hasCloud()`, `fieldLoaded()`, `hasCatalog(id)`, `listIds().includes(id)`), and an arrival edge (`installFadeOnArrival.ts`) re-runs every guard whenever any slot turns ready. The user asked why the ready signal has to come from the renderer at all.

**Investigation:** it doesn't. `AssetSlot.ts:17-27` awaits `commit` (the GPU upload) before dispatching `committed`, and release clears the renderer through `onRelease`. The right reading is `slot.committed() !== null`, not `state()`: a reload passes through `loading`/`committing` while the previous upload is still drawn, and `committed()` is documented as the one reading of "has a committed value". Checked per Layer: localBubble (the only one that releases; `onRelease` → `clearMesh()`), constellations, cosmicWebFilaments, flow and cosmicWebDensity all match. Bonus: the renderer-read guard is what forces the trap documented at `createCosmicWebDensitySlot.ts:4-7` (the upload must be synchronous inside `commit`). The exception was the galaxy catalog: at a tier that excludes it, `galaxyCatalogFetcher.ts` committed an empty catalog that `catalogStore.ts` read as "free", so a committed value could mean "no data".

**Considerations (first pass):**
- **Option A (`ready` function on the entry, reading the renderer):** exactly today's check, moved.
- **Option B (entry names its asset slot):** pure data, but per-item Layers key slots by `code` and items by `id`, needing a second mapping.
- **Option A' (the asset row names what it gates):** `gates: '<key>' | { key, item }` on the asset row, which knows both id and code.

**The user's objection:** "all these things feel very complected. I'm missing the linear flow (no deep dependencies). Somehow the galaxy catalog system seems like the odd one out."

**Decision:** one straight line. target(entry, item) = switch && present, recomputed whenever a settings write or a slot notification changes either input; present = `committed() !== null` of the slot whose asset row `gates` the entry, true when nothing gates it; the fade moves toward the target; core multiplies in recession and clip and hands the number to the pass or producer. This deletes the fade-row `guard`, the arrival edge's open/closed snapshot, the guard short-circuit in `syncVisibilityFades`, the separate seed rule (the seed is the target at boot) and the density commit-ordering trap. The one visible change: an evicted Local Bubble now fades out with its mesh and fades back in, where today it pops in.

The galaxy catalog conforms rather than the design bending to it, in its own PR (ruled: "catalog change can go as own PR"): an excluded tier loads nothing and releases what it held. Shipped as #892, merged `7d93f2da6` 2026-10-13. Remaining edge: a download still in flight when the tier drops uploads, then releases one frame later.

## Q6: Who writes the switch

**The question:** every visibility setter checked (Milky Way, galaxy catalogs, structures, bodies, star catalogs, black holes, cosmic-web density) is a plain field write; black holes build a missing item. `settingsReducer.ts:19` already runs one root-level case (`mergeSnapshot`).

**Considerations:**
- **Option A (one generic root action):** `setVisibility({ cluster, item?, field, on })` beside `mergeSnapshot`; writes `settings[cluster].enabled` or `.items[item][field]`, creating a missing item. Derives the write side of `VISIBILITY_ACTION_ROW`, the `scopedVisibilityActions` families and `labelHomeBySourceType.ts`; its read side derives the same way. Cost: two write paths per field (panels keep their own setters). The extraReducers silent-drop trap does not apply at the root.
- **Option B (each entry names its setter):** one write path, but a function per entry and each `visibility.ts` importing its slice: the per-Layer boilerplate being deleted.

**Decision:** A.

## Q7: The three entries without a switch

**The question:** `proceduralDisks`, `texturedDisks` and `scaleBar` (`fadeLayers.ts`) register a fade fixed at 1 with no intent, no setting and no cue. Asked by the user to double-check: the disk passes, subsystems and renderer read no fade (the textured disks' own per-galaxy fade is internal); the three loops over all rows skip them; no tour or clip names them.

**Considerations:**
- **Option A (delete):** plus `FadeId`'s `'overlay'` kind, `OverlayId`, and `LabelLayerId`'s `'scaleBar'` if nothing else needs it. Answers backlog `2026-08-20-fade-row-totality-question.md` (delete its index line and detail file).
- **Option B (keep as switchless entries):** a new entry form for fades nobody reads.

**Decision:** A.

## Q8: The body Layer has no `layer.ts`

**Considerations:**
- **Option A (core keeps a short `CORE_VISIBILITY` list):** the body label entry lives in core until the body Layer is migrated.
- **Option B (create a minimal `src/layers/body/layer.ts` now):** `defineLayer` with `settings: bodyLayerSettings` and `visibility`; render and load code stay in core.

**Decision:** B (the user's call, over my recommendation of A). The body caption entry `{ label: 'body', cluster: 'bodies', items: <label-bearing body ids> }` lives in the body Layer.

## Q9: Where the orbit trails switch lives

**The question:** `orbitTrails` is a core settings cluster, and its master switch covers core planet and moon trails and the star-catalog Layer's S-star trails (`guides().orbitTrails`).

**Considerations:**
- **Option A (a one-entry `CORE_VISIBILITY`):** honest about the cross-Layer switch.
- **Option B (move it into the body Layer):** no core list at all; the body Layer's switch also governs the star catalog's S-star trails.

**Decision:** B (the user's call). The `orbitTrails` cluster moves from `src/state/settings/core/orbitTrails/` into the body Layer, so no core visibility list exists and `orbitTrails` leaves `CORE_SNAPSHOT_CLUSTERS` (captured as a Layer cluster). The cross-Layer read is accepted.

## Q10: The Labels & guides panel rows

**The question:** localBubble, constellations, lightTime and zoneOfAvoidance each declare a panel row whose `select`/`set` repeat their entry's switch; the heliosphere would be the fifth.

**Considerations:**
- **Option A (the row names its entry):** `{ slot: 'labelsAndGuides', toggle: '<key>', label: '<text>' }`; core reads and writes via `setVisibility`; four `*SettingsRow.ts` files go.
- **Option B (leave them):** smaller PR; every new toggleable Layer repeats the pair.

**Decision:** A. The richer panels (galaxy catalogs, stars, structures) stay out of scope.

## Resulting shape (summary for the spec)

- Per Layer, a static `visibility.ts`: show entries `{ key, cluster?, field?, items?, recession? }` and label entries `{ label, cluster?, items?, recession? }`.
- `src/compositions/` gathers them; key, scoped and label types derive from the tuple.
- Asset rows declare `gates`; target = switch && present; one generic identity `{ key, item? }`; `recession` on the entry.
- Passes declare `fade: '<key>'` and get `opacity: number`; label producers declare `label: '<name>'` and get `fade: number | Record<ItemId, number>`; core skips both at 0 / fully faded out.
- One root `setVisibility` action; panel rows name their entry.
- Deleted: the seven fade tables, `scopedVisibilityActions`' hand families, `labelHomeBySourceType`'s hand rows, the three switchless rows, fade-row guards and the arrival snapshot, four panel-row files.
- New: `src/layers/body/layer.ts`; the `orbitTrails` cluster moves into it.
