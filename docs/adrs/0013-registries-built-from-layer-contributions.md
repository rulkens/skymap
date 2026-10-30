# ADR 0013 — A Registry Is Built From Layer Contributions, Never Written in Core

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Supersedes:** — (narrows one carve-out of ADR 0011, see Decision)
- **Superseded by:** —
- **Related:** [ADR 0011](0011-engine-composition-bundle-rows.md) ·
  [ADR 0012](0012-layers-declare-visibility.md) ·
  [Layer composition design spec](../superpowers/specs/2026-09-09-layer-composition-design.md)
  (§4.6 seam table, §4.7 source rows) ·
  [grill transcript](../grill-sessions/cross-layer-content-2026-10-29.md) ·
  the registry ledger, `src/compositions/README.md` ·
  ratchet `tests/conventions/layerImportBoundary.test.ts`

## Context

A Layer (`src/layers/<name>/`) owns everything about one slice of the scene and contributes it
through the members of the `Layer` contract: `sources`, `bodies`, `exhibits`, `visibility`,
`passes`, `selection`, `ui`, and so on. The composition root, `src/compositions/`, assembles the
app from a tuple of Layers. Anything a reader needs across all Layers, a **registry**, is meant
to be collected from those members: `APP_EXHIBIT_REGISTRY`, `APP_VISIBILITY_REGISTRY`, the settings root and the
boot-time pass and selection tables are built that way, and ADR 0011 set the direction for the
engine families.

Two shapes slipped past that rule while the Layers were being formed, and both leave a per-Layer
fact written in core.

**Registries core builds by importing the Layers.** `src/data/sources.ts` and
`src/data/bodies/layerBodyRows.ts` import every Layer's rows array and spread them into
`SOURCE_REGISTRY` and `LAYER_BODY_ROWS`. The contract's own comments admit it: `sources` and
`bodies` are "typing only" (`src/@types/engine/layer/Layer.d.ts:153-156`). Three exhibits, two
exhibit helpers, a clip, `SettingsAction.d.ts` and `urlHashFor.ts` do the same on a smaller scale,
each importing one or more Layers' modules from core. Fourteen core files import a Layer today; the
import ratchet never saw them because it swept only `services/engine` and `state`.

**Tables core writes by hand, one row per kind.** A second family has no import signature at all.
Core keeps a closed union per concept (`SelectionRef`, `FocusableTarget`, `CaptionKind`,
`ExhibitId`, `ClipId`, `TourId`) and a table keyed by it: `REF_OF`, `BUILD_FOCUSABLE`,
`SELECTION_HALO_TABLE`, `TARGET_IDENTITY_KEY`, `focusFraming`, `mayHaveLabel`, `URL_HASH_FOR`, the
palette row tables, `CAPTION_FADE_RULES`, `SCENE_ANCHORS`, `DEBUG_OVERLAY_ROWS`. The compiler
catches a missing row, which is why they felt safe, but adding the satellites kind edited fourteen
core files (`docs/backlog/2026-10-28-selection-kind-facts-in-the-layer.md`), and the fact about a
satellite lives wherever the question is asked rather than with the satellite.

ADR 0011 explicitly left the pick/selection tables out of its row scheme, and the September review
counted eighteen registry-like tables without saying which had moved. The spec's §4.6 names the
seams but nothing records their status, so the state of the migration existed only in whoever had
last read all of it.

## Decision

**The Layers hold the data. Every collection with a row per Layer or per Layer-owned kind, and
every union of such kinds, is derived from the Layers' contract declarations. Nothing of that
shape is written by hand anywhere: not a table, not a `switch`, not a type union, in core or in
the composition root.**

Concretely:

- **Two mechanisms, both already in use, and no third.** A *static* registry is data the Layer
  declares as a plain member (`exhibits`, `visibility`, `sources`, `bodies`): the composition root
  builds it by import, one file per registry, `src/compositions/app<Name>.ts`, and core reads it by
  importing that file, as nineteen core files already read `appVisibility` and `appExhibits`. A
  *runtime* registry is composed in `createLayers` from a runtime-bound member
  (`passes(runtime)`, `selection(runtime)`, `guides(runtime)`), and core reads it off
  `EngineState`. The composition root's own files (`app.ts`, the `app<Name>.ts` registries,
  cross-Layer exhibits) are assembly and content, never a per-kind table: `APP_EXHIBIT_REGISTRY` lists
  Layers' exhibit rows, it does not list kinds.
- **Per-kind facts are fields on the Layer's row, and kind unions are derived.** The fact a
  per-kind table answers (how a selection kind frames, what halo it draws, which caption tier it
  has, how its id encodes into the URL) is a field on the declaration the Layer already
  contributes for that kind, and core reads the field off the composed row. The closed unions
  core keys those tables on (`SelectionRef`, `FocusableTarget`, `CaptionKind`, `ExhibitId`,
  `ClipId`, `TourId`) are derived from the composition's declarations, as `ShowKey` already is
  from `APP_VISIBILITY_REGISTRY` (ADR 0012); none stays hand-typed. Where no contract member carries the
  fact yet, the migration adds one, and that widening is sequenced and consented to per member,
  which decides the order of the work, never whether it happens.
- **The composition root is the only place that may import more than one Layer.** It holds the
  composition, the static registries and cross-Layer authored content (an exhibit that imports
  two Layers' state, a clip that drives one Layer's action), in flat concern folders
  (`exhibits/`, `clips/`, `@types/`). Content that imports no Layer module is not cross-Layer:
  `ShowKey` strings are core's vocabulary (ADR 0012).
- **The ledger is the overview.** `src/compositions/README.md` lists every registry: the
  Layer member that feeds it, where it is built, by which mechanism, who in core reads it, and its
  status. `ls src/compositions/` is the index of the static ones. The import ratchet sweeps all
  of `src/` outside `layers/` and `compositions/`, its allow-list is exactly the not-yet-migrated
  static registries and cross-Layer content, and a test requires every allow-listed file to be a
  ledger row, so the ledger cannot drift from the code.
- **ADR 0011's carve-out ends.** It left "pick/selection kind tables" outside the row scheme.
  They are inside this one: the same defect, migrated the same way, one table family per change,
  and the ledger lists every one of them with no "may stay". The ratchet for this family is the
  end state itself: once a family has migrated, its hand-typed union no longer exists, and the
  compiler enforces what an allow-list cannot.

**Not decided here.** The order and design of each migration (that is the ledger's status column
and the backlog items it links); whether a Layer may read another Layer's facts (the dependency
DAG item); and the shape of any particular new contract member. ADR 0011's three named
presentation mechanisms (`LabelProducer`, `MarkerProducer`, `drawPick`) stay named mechanisms,
but any per-kind row inside them falls under this rule like every other.

## Consequences

### Positive

- One rule a new developer can check from the tree: a per-Layer row is in that Layer's folder,
  its registry is in `src/compositions/` or on `EngineState`, and the ledger says which.
- The contract stops lying: `sources` and `bodies` become the rows the registry is built from,
  not a typing echo of a fold core performs elsewhere.
- A new Layer, or a new kind inside one, edits its own folder and one composition line. The
  fourteen-file cost of the satellites kind becomes the measure of what each migration removes.
- Cross-Layer exhibits stop needing an exception to "core never imports a Layer"; the ratchet's
  allow-list only shrinks.

### Negative

- Until the migrations land the picture is mixed, as it was under ADR 0011: some registries are
  composed, some are still core-built or hand-written. The ledger exists to make that mixture
  legible rather than to hide it.
- Core reading a static registry by importing `src/compositions/` is a dependency on the app
  composition. A second composition (the reference engine the spec plans in §7) will have to
  either share those files or inject the registries; that bridge is crossed when the second
  composition exists, not before.
- Migrating a hand-written table onto a contract member adds a member per family, so the Layer
  contract grows by as many members as there are per-kind facts. Each widening is consented to
  per member, which paces the work; the alternative, a fact about a kind kept away from the Layer
  that owns the kind, is what this ADR rules out.

### Neutral / forward-looking

- The seam table in the composition spec (§4.6) remains the per-seam design; this ADR adds the
  status and the rule for the two families the spec did not cover. The spec's status line points
  at the ledger.
- Three backlog items describing the per-kind tables (the 2026-08-17 focusable-kind registry, the
  J2 selection-presentation item and the `URL_HASH_FOR` duplication) consolidate into the ruled
  2026-10-28 selection-kind-facts item, which becomes the first kind-B migration.

## Implementation notes (non-binding)

- Static moves are symbol moves: `SOURCE_REGISTRY` becomes `src/compositions/appSources.ts`
  built with the spec's `composeSources` over the tuple, `LAYER_BODY_ROWS` becomes
  `appBodies.ts`; importers are rewritten with the refactor CLI, and the `Source` code enum stays
  in `src/data/source.ts` as the spec rules.
- The three core exhibits and the clip move to `src/compositions/exhibits/` and `clips/` with
  their whole-cluster snapshot helpers; `SettingsAction.d.ts` to `compositions/@types/`.
- `URL_HASH_FOR` is a runtime registry already declared (`SelectionKindRow.focusId.encode`); it
  goes with the selection-facts migration.

## References

- ADR 0011 — the row-registry direction for the engine families and the carve-out this narrows.
- ADR 0012 — `ShowKey` as a core vocabulary derived from `APP_VISIBILITY_REGISTRY`.
- `docs/research/engine/layer-composition-review-2026-09-09.md` §2 — the eighteen-table inventory.
- `docs/backlog/2026-10-28-selection-kind-facts-in-the-layer.md` — the kind-B migration brief.
- `docs/backlog/2026-10-11-layer-dependency-dag.md` — Layer-to-Layer reads, out of scope here.
