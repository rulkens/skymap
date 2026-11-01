# Grill Session: Where cross-Layer content lives — 2026-10-29

Source: the Layer leftovers sweep (`docs/backlog/2026-10-29-layer-migration-leftovers.md`, item
M5) and the question it opened: three exhibits in core import several Layers' state, and the
rule "core never imports a Layer" has no home for content that is about more than one Layer.

The aim: one rule for authored content and registries that span Layers (exhibits, tours, clips,
featured tabs, `SettingsAction`, capture declutter), stated so a new developer can see from the
tree where such a thing goes, and a migration path for what sits in core today. The outcome is
[ADR 0013](../adrs/0013-registries-built-from-layer-contributions.md) and the registry ledger in
`src/compositions/README.md`.

Premises carried in from earlier rulings (not re-litigated): a Layer never imports a sibling
Layer; single-Layer exhibits stay in their Layer; the 2026-09-09 composition spec's seam table
(§4.6) and its source-row ruling (§4.7, Q13/P7).

---

## Q1: Who owns content that is about more than one Layer?

**The question:** The Cosmic Flows exhibit switches the flow Layer on and the galaxy catalogs
off; the Zone of Avoidance exhibit touches four Layers' settings. Today those files sit in core
(`src/data/exhibits/`) and import each Layer's `initialState`, which no other core file may do.
Who may import several Layers' modules?

**Considerations:**

- **Option A (core, as an allowed exception):** keep the exhibits where they are and allow-list
  them in the import ratchet. Cheap now; but then "core never imports a Layer" has exceptions a
  new developer has to learn, and every new cross-Layer exhibit widens the list.
- **Option B (the composition root):** `src/compositions/` already assembles the app from
  Layers and is the one place that knows which Layers exist, so it is the one place that may
  import any of them. Cross-Layer content moves there. Core keeps its rule intact.
- **Option C (a Layer owns it, the others are read through core state):** the subject Layer
  (flow for Cosmic Flows) holds the exhibit and reaches the other Layers' settings through core
  selectors. Hides a Layer-to-Layer dependency behind core and contradicts the DAG backlog item.

**Decision:** Option B. The composition root owns cross-Layer content and may import Layer state
modules; core and Layers never import a sibling Layer. The import ratchet then needs no exception
list for content.

## Q2: What makes a piece of content "cross-Layer"?

**The question:** The trigger has to be mechanical, or the rule is taste. An exhibit that only
toggles `ShowKey` strings touches other Layers' visibility without importing them. Does that
count?

**Considerations:**

- **Option A (any mention of another Layer's facts):** `ShowKey` strings included. Would pull
  most exhibits into the root, because nearly every exhibit sets some visibility.
- **Option B (importing a Layer module):** the trigger is an `import` from `src/layers/<other>/`.
  `ShowKey` strings are core's vocabulary (ADR 0012: the address types derive from
  `APP_VISIBILITY`, which core imports), so using them is not a Layer dependency.

**Decision:** Option B. Content is cross-Layer when it imports a Layer module. `ShowKey` strings
stay a core vocabulary.

## Q3: How is `src/compositions/` laid out?

**The question:** With cross-Layer exhibits, clips and types arriving, does the root grow
per-composition folders (`app/`, `galaxiesOnly/`) or per-concern folders?

**Considerations:**

- **Option A (per composition):** `compositions/app/{exhibits,clips}/`. Right once a second
  composition exists; today there is one, so it adds a level that names nothing.
- **Option B (flat concern folders):** `compositions/exhibits/`, `compositions/clips/`,
  `compositions/@types/`, beside the `app*.ts` registry files. Mirrors a Layer's own layout
  (`exhibits/`, `@types/`), so a developer who knows a Layer knows the root.

**Decision:** Option B, flat concern folders; a per-composition folder comes with the second
composition.

## Q3b: What else may live in `src/compositions/`?

**The question:** Reading the folder found remote-command, remote-menu, dome-status and
toggle-row modules there. They are features, not composition. Does the root hold anything
beyond the composition, its registries and cross-Layer content?

**Decision:** No. The root holds the composition (`app.ts`), the registries it builds
(`app<Name>.ts`) and cross-Layer content. The six feature modules moved to their homes
(`state/remote/`, `utils/remote/`, `state/settings/`) in #971, before anything else landed.

## Q4: What happens to registries core builds by importing Layer contributions?

**The question:** `SOURCE_REGISTRY` (`src/data/sources.ts`, 178 importers) and
`LAYER_BODY_ROWS` (`src/data/bodies/layerBodyRows.ts`, 8 importers) are built in core by
importing every Layer's rows array, so the contract's `sources` and `bodies` members are
"typing only" (`Layer.d.ts:153-156`). Do they move, and if so how do core's many readers reach
them?

**Considerations:**

- **Option A (move `LAYER_BODY_ROWS` now; `SOURCE_REGISTRY` an allowed exception, moved later):**
  the recommendation before the spec was re-read. Priced on the 178 importers.
- **Option B (move both):** each becomes `src/compositions/app<Name>.ts`. The reader seam
  already exists: nineteen core files import `appVisibility` and `appExhibits` today, so core
  reading a static registry by importing the root is the house pattern, not a new seam.
- **Option C (core may build registries):** declare the current shape correct. Leaves the
  contract members decorative and the two folds invisible from the Layer side.

**Decision:** Option B, and not as a fresh ruling: the composition spec already rules it. §4.7
(ruled 2026-09-10, Q13) says the flat registry "is reconstituted from the Layer tuple" through
`composeSources(layers)`; PR-D shipped only the half-step `sourceRecordOf(rows)` inside core. Both
registries move, each in its own fork; `SOURCE_REGISTRY`'s move is a symbol move over its
importers, not a redesign.

## Q5: Does the rule also cover tables core writes by hand, one row per kind?

**The question:** A second family of registries never imports a Layer: core hand-writes a table
keyed by a closed kind union (`Record<FocusableTargetType, …>`, `SELECTION_KINDS`, the palette
row tables, `CAPTION_FADE_RULES`, `ExhibitId`, `ClipId`, …). Adding the satellites kind edited
fourteen such files. Is this the same problem, or a separate one with its own backlog item?

**Considerations:**

- **Option A (separate):** keep ADR 0011's carve-out ("pick/selection kind tables stay out of
  the row scheme") and the three backlog items that describe them. Two rules for one smell: a
  per-Layer fact kept in core.
- **Option B (one rule, two mechanisms):** the rule is about where a per-Layer row is written,
  not about imports. A hand-written per-kind table is the same defect with no import signature.
  It migrates onto a contract member, static (built by import in `app<Name>.ts`) or runtime
  (composed in `createLayers` from `layer.member(runtime)`, as `selection` already is).

**Decision:** Option B. The ADR covers both. Kind-B tables migrate step by step, one fork per
table family, and every new or widened contract member is still asked for before it lands. The
2026-10-28 ruling in `docs/backlog/2026-10-28-selection-kind-facts-in-the-layer.md` already
consents to widening `SelectionKindRow`, so the selection facts go first.

## Q6: Where does the developer overview live?

**The question:** The spec's §4.6 table names each seam but nothing records which has landed;
the September review counted eighteen registry-like tables. A developer needs one place that
answers "which registries exist, which Layer member feeds each, where is it built, who reads it,
and is it done?"

**Considerations:**

- **Option A (`src/compositions/README.md` table + ratchet test):** one row per registry,
  beside the files it describes; `ls src/compositions/` doubles as the index because every
  static registry is one `app<Name>.ts`. A test keeps it honest: every file on the ratchet's
  allow-list must be a ledger row.
- **Option B (the ADR carries the table):** ADRs are immutable; a status column would rot or
  force edits to an accepted record.
- **Option C (update spec §4.6 in place with a status column):** the spec is 1,455 lines and
  already stale in its status line; status buried there is not an overview.
- **Option D (a generated tab in `tools/structure-audit`):** finds kind A mechanically (it has
  a "core → Layer" rule) but cannot see kind B, and a generated page cannot carry intent.

**Decision:** Option A. The ledger is `src/compositions/README.md`; the ADR stays short and
points at it; the spec's status line gets a pointer to the ledger.

## Q7: How do the foundation pieces land?

**The question:** ADR 0013, the ledger, the extended ratchet, this transcript and the backlog
consolidation (the 2026-08-17 focusable-kind item, J2 and the `URL_HASH_FOR` item fold into the
ruled selection-kind-facts file) are five pieces and no behaviour change. One PR or several?

**Decision:** One PR. The ratchet and the ledger are what make the ADR checkable, so they are
reviewed together; splitting would review the rule without its proof.

---

## Vocabulary fixed in this session

- `src/compositions/` is the **composition root**.
- A Layer **contributes** rows through a contract member.
- The root (or `createLayers`, for runtime-bound members) collects them into a **registry**.
- The word "fold" is retired; it named the import-time collection and nothing else.
