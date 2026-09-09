# Grill Session: Layer composition — 2026-09-09

Source: [`docs/research/engine/layer-composition-review-2026-09-09.md`](../research/engine/layer-composition-review-2026-09-09.md),
six read-only surveys over `src/`, `tools/`, `docs/`, and agent memory (no code
changed).

Goal going in: define a data layer in one place as data, one place where a
layer plugs into the subsystems (settings, loading, rendering, UI, pick), and
— added mid-session — make a small engine composable at build time from a
chosen subset of layers instead of the current monolith.

---

## Q1: Composition mode

**The question:** Build-time or runtime composition for a subset engine?

**Considerations:**

- **Option 1 (build-time):** a second entry point imports a list of layer
  modules; absent layers never make it into the bundle. Forces a real
  boundary — a layer that reaches for something it shouldn't fails to
  compile rather than lurking behind a flag.
- **Option 2 (runtime):** one bundle, unwanted layers left unloaded behind
  `if (enabled)` guards. Cheaper to build, but the monolith stays intact and
  the store shape stays fixed regardless of which layers are actually in
  play.

**Decision:** Option 1. A boundary that only compile errors can enforce is
worth more than the convenience of a single bundle.

## Q2: First consumer

**The question:** Which engine proves the composition seam first?

**Considerations:**

- **Option 1 (galaxies-only reference engine, in-repo):** a compile gate,
  not a shipped product — the smallest possible proof that a subset engine
  builds and renders.
- **Option 2 (scene workbench):** already has its own device/camera/loop
  glue; plan 2 (splats) is next on its roadmap anyway.
- **Option 3 (embeddable view):** a real external consumer, but no current
  demand.
- **Option 4 (perf/record harness):** exercises rendering but not settings
  or UI composition.

**Decision:** Option 1 first, then Option 2. The reference engine proves the
seam cheaply; the scene workbench is the first consumer with a real reason to
adopt it.

## Q3: Unit of composition

**The question:** What is the thing that gets included or omitted — an
individual source, or something coarser?

**Considerations:**

- **Option 1 (source-type family):** `galaxyCatalog`, `starCatalog`,
  `structure`, `volume`, `body`, singletons. Sources stay data rows;
  renderers, fetchers, settings clusters, and asset slots are already
  organized per family. Keeps the existing one-family-per-PR normalization
  ladder (ADR 0011) intact.
- **Option 2 (individual source):** ten near-empty modules per family, each
  re-exporting the same family-level machinery — plumbing with no payoff.

**Decision:** Family (Option 1).

The user then asked: "what do we do with subsystems?" Answer recorded as
decision: subsystems become private state of the owning Layer; the
`state.subsystems.*` bag on `EngineState` dissolves. Ownership split: `galaxyCatalog`
owns `biasCorrection`, `bitmapStream`, `galaxyAtlas`, `hiResFamous`,
`proceduralDisk`, `texturedDisk`, `diskPlannerWalk` (7 of 14 subsystems);
`structure` owns `structureFocus` (its `focusUniform` output is a genuine
cross-Layer contract, so it gets a named core seam rather than a shared bag
field); `body` owns `earthTile`; core keeps `inputAggregator`,
`renderScheduler`, `loadProgressAggregator`, `label2DDirector` (mechanism,
fed by per-layer producers), plus `clipPlayer`/`clipPathInspector` (tour and
debug, not data). Payoff: `ContentPass`es close over Layer-private state
instead of reading a global bag — which is what makes omitting a Layer a
compile-time fact rather than a runtime hope.

## Q4: Naming

**The question:** User challenged the vocabulary — "you call it family, but
isn't it a `ContentLayer`?" It isn't: `ContentLayer` is one draw contribution
(target, slab, blend, draw), and a family owns several — `galaxyCatalog` owns
five, `starCatalog` four, `milkyWay` three. The composition unit is 1:N over
`ContentLayer`s, so it needs its own name.

**Considerations:**

- **Option 1 (unit = `Layer`, rename `ContentLayer` → `ContentPass`):** the
  directory is already `frame/passes/`, so the rename lines the type up with
  where it lives; ~32 file renames plus the one type rename via the refactor
  CLI, as its own prep PR. Also consistent with `gpu/passes/`, which already
  means GPU passes.
- **Option 2 (unit = `Bundle`, keep `ContentLayer`):** matches the
  vocabulary of the deferred `SubsystemBundle` spec, zero renames — but says
  nothing about data, and collides in spirit with the deferred umbrella
  type.
- **Option 3 (unit = `Family`, keep `ContentLayer`):** describes the row
  grouping (a `SOURCE_REGISTRY` `type`), not the plug-in unit — conflates
  "how sources are grouped" with "what composes."

**Decision:** Option 1. `Layer` is the composition unit; `ContentLayer`
becomes `ContentPass`.

## Q5: Settings

**The question:** Does each Layer own a fragment of settings that composes
into a root type, or does every engine carry the full settings shape
regardless of which Layers it has?

**Considerations:**

- **Option 1 (composed):** each Layer exports its cluster type, seed, and
  reducers; the root settings type is derived from the tuple of Layers in an
  engine. The galaxies-only engine's settings type has only
  `settings.galaxyCatalogs` — reading `settings.volumes` from core is a type
  error, not a runtime `undefined`. Selectors, the tour-capture entry, and
  layer-specific sagas (flow reseed, bias bake) move into their owning
  Layers. Cost: the root settings type becomes generic instead of today's
  plain literal type.
- **Option 2 (shared type):** every engine carries the full
  `EngineSettingsState`; absent Layers are simply inert. Costs nothing today
  but leaves the compile gate blind on exactly the axis where most
  cross-layer reads actually live (fade rows, the wake saga, tour capture) —
  the gate would pass even if a subset engine silently depended on a Layer
  it doesn't have.

**Decision:** Option 1.

## Q6: Core boundary

**The question:** What is uncontested core, and where does the line fall on
the genuinely disputed pieces?

Uncontested core: device, camera/input, frame executor + step order, render
targets, tone-map/bloom, pick program, fade registry, render scheduler, asset
queue + demand loop.

**Considerations, for the contested pieces:**

- **(a) Labels + selection:** core mechanism with per-Layer producer/resolver
  rows (the rung-8 contracts — `Label2DProducer`, `Label3DProducer`,
  `MarkerProducer`, `drawPick`, `RESOLVE_PICK`) vs. optional Layers wired
  together by a dependency graph with "contribute if present" logic between
  Layers.
- **(b) Tour/clip machinery:** not a data layer at all, and not needed by
  the galaxies-only engine.
- **(c) Earth home pose:** currently seeded unconditionally in `wireInput`.

**Recommendation:** labels/selection/pick stay core — the mechanism is
small, every consumer wants it, and keeping it core avoids introducing
inter-Layer dependencies; fonts become lazy, loaded on first producer rather
than unconditionally. Tour/clips stay core for now, flagged as a later
optional split. Home pose moves out of `wireInput` into the engine
composition config.

**Decision:** Agreed as recommended.

## Q7: Frame order in a subset engine

**The question:** Derived ordering (toposort) was already rejected earlier
in the review — frame order is semantic, not inferrable. Given a
hand-authored order stays, how does a subset engine get a _subset_ of that
order?

**Considerations:**

- **Option 1 (one global total order, filtered):** `frameProgram` keeps one
  total order of pass names; an engine passes its Layer list, and the
  program filters to owned passes, dropping empty steps. A pass with no
  matching line fails at startup — this closes the silent
  target/pass/step mismatch named as finding 4 in the review.
- **Option 2 (per-engine order lists):** full control per engine, but two
  copies now drift, and the scene workbench would end up restating
  compositor/label pass positions it doesn't actually want to own.

**Decision:** Option 1.

## Q8: Layer location

**The question:** Where does a Layer's code live on disk — colocated per
Layer, or gathered by a manifest that leaves everything else where it is?

**Considerations:**

- **Option 1 (colocated `src/layers/<name>/`):** holds everything the Layer
  owns, including its `SettingsPanel` section. Landed incrementally — each
  Layer's migration PR carries its own move via the refactor CLI; tests
  mirror along; WESL `package::` literals and symlinks get grepped per
  Layer as they move.
- **Option 2 (manifest-only `src/layers/<name>.ts`):** groups references to
  pieces that stay where they are today — one place to plug in, but still
  ten places to edit; near-zero churn to introduce, but doesn't actually
  solve the "thirteen homes" problem from the review.

**Decision:** Option 1, incrementally.

User then asked for a sub-structure. Proposed and worked through on
`galaxyCatalog` — fixed subfolder names, omitted when empty:

- `layer.ts` — the `Layer` object; the only file core/engine compositions import.
- `sources/` — registry rows, one per source.
- `settings/` — cluster type, seed, reducers, selectors.
- `load/` — fetcher, slot factory, asset-wiring rows, tier-reload hook, companions.
- `subsystems/`
- `render/` — renderer factories.
- `passes/` — `ContentPass` records.
- `present/` — label/marker producers, fade rows, owned scale-fade bands, pick resolver, styles, info-card builder.
- `ui/` — component folder per the `create-component` conventions.
- `types/` — one type per file (amends "types live in `@types/`" to "`@types/` or `<layer>/types/`").
- `tests/layers/<name>/` — mirrors the above.

Layer object sketch: `defineLayer({ name, sources, settings:{key,seed,reducers,selectors}, assets, gpu, subsystems, passes, fades, labels, pick, ui })`,
generic over the settings key/type.

Stays outside any Layer on purpose: the append-only `Source` code enum
(`src/data/source.ts`) and the selection encoding — both cross-cut every
Layer and belong to none of them.

User then raised a doubt mid-decision: "im not sure if shaders should move
to layers folder." Resolved separately — shaders **stay** in
`src/services/gpu/shaders/<layer>/`. Grounds: they form one WESL package
rooted there; 50+ `package::<dir>::…` literals resolve against that single
root, and the current plugin setup doesn't support multiple packages; the 23
existing shader subdirs are already named per Layer; two external consumers
pin paths against the current location (the galaxy-renderer tool, via leaf
symlinks + `wesl.toml`; shader parity tests with bare directory literals).
Rule going forward: a Layer's shader directory in the shared package is
named after the Layer, and `render/` imports `…?static` from there.

**Decision:** subfolder layout as above; shaders stay put. User accepted
both.

## Q9: Migration order

**The question:** In what sequence do the pieces land?

**Considerations:**

- **Option 1 (staged: prep → first family → remaining families → greenfield proof → workbench):**
  1. Prep: `ContentLayer` → `ContentPass` rename; boot de-coupling
     (`wireSlots.ts:97-101`, `wireInput.ts:68-69`, `startLoop.ts:88-97`
     become "if present"; home pose moves to the composition config);
     `defineLayer` + composed settings root, with the app still passing all
     Layers (behaviour-neutral).
  2. `galaxyCatalog` Layer formed and moved; the galaxies-only reference
     engine compiles and renders — first proof.
  3. Remaining Layers, one PR each, in dependency order: `starCatalog`,
     `milkyWay` (its fade is keyed on the star hand-off), `structure`,
     `volume`, `body`, singletons.
  4. Edenhofer dust as a greenfield proof: a new Layer folder, no core edit
     except its frame-order line.
  5. Scene workbench re-based on core, with LiDAR as a Layer; splats
     authored as a Layer.
- **Option 2 (pull the workbench forward, right after step 2):** rejected —
  core would still be shedding Layers at that point, and each subsequent
  Layer PR could break the workbench along the way.

**Decision:** Option 1.

## Q10: PR packaging

**The question:** House rule requires an explicit ask, no default, on
whether the three prep changes ride together or land separately, and
whether they precede or ride the `galaxyCatalog` PR.

**Considerations:**

- **Option A (three separate prep PRs, then the `galaxyCatalog` PR):** the
  rename would otherwise drown any shared review; the boot-decoupling +
  home-pose change is a behavior-relevant contract worth its own review
  surface; the `defineLayer` + composed-settings contract deserves its own
  PR too. Landing them separately means the `galaxyCatalog` PR then shows
  only the move itself.
- **Option B (prep rides as leading commits on the `galaxyCatalog` PR):**
  fewer PRs, but the actual family move gets buried under three unrelated
  concerns in the same diff.

**Decision:** Option A — three separate prep PRs, in the order given, ahead
of the `galaxyCatalog` PR.

---

## Session continued — 2026-09-10

Grounded against the files: `interface` is banned (type aliases only), the
`EngineData`/`EngineAssetSlots` split named in Q3/Q9, `SOURCE_REGISTRY`'s 32
rows, and the `CONTENT_LAYERS`/`frameProgram()` double-ordering named as
finding 4 in the review.

## Q11: Settings-cluster access without a cast

**The question:** How does a Layer read its own settings cluster without a
cast, given `interface` is banned?

**Considerations:**

- **Option (a) (widening accessor per Layer):** one widening accessor per
  Layer in its `settings/` folder — ten known casts in ten known files, each
  under test.
- **Option (b) (`EngineState` generic over the composition):** infects every
  signature that mentions it — `ContentPass`, `FadeLayer`, `AssetWiringRow`,
  `GpuHandleRow`, every selector.
- **Option (c) (declaration-merged registry `interface`):** banned by the
  type-aliases-only convention.

**Recommendation:** (a).

**Decision:** (a).

## Q12: Do `EngineData` and `EngineAssetSlots` dissolve too?

**The question:** Do `EngineData` and `EngineAssetSlots` dissolve the way the
subsystems bag does? Ruling #4 named subsystems only, but the galaxy/
structure/volume stores and slot fields are per-family in the same way;
leaving them on core means a galaxies-only engine still declares a
structures store.

**Recommendation:** they follow, in the same per-Layer PR, accepting that
step (d) grows.

**Decision:** yes.

## Q13: Does `SOURCE_REGISTRY` stay flat or split per Layer?

**The question:** Does `SOURCE_REGISTRY` stay one flat table or split per
Layer? The `Source` code enum stays global (append-only numbering is
cross-cutting); the 32 entry rows could stay flat (galaxies-only engine
imports every row's metadata) or split into each Layer's `sources/` with the
flat registry reconstituted from the Layer tuple.

**Recommendation:** rows split, enum stays.

**Decision:** split.

## Q14: One pass-order artifact or two?

**The question:** Today ordering is expressed twice: `CONTENT_LAYERS` array
order within a (target, slab) group, and `frameProgram()`'s step sequence
between groups, with `ContentLayer` carrying `target`, `slab`, `skyCapture`,
`hdrPostLensing` on itself — the untyped duplication behind the silent
mismatch.

**Considerations:**

- **Option (a) (two artifacts):** array becomes `PASS_ORDER`, step function
  stays hand-authored.
- **Option (b) (one hand-authored nested list `FRAME_ORDER`):** of steps
  (`compute`, `capture`, `render {target, slab, passes: [names]}`, `lens`,
  `composite`, `bloom`, `tonemap`), passes referenced by name; `ContentPass`
  loses the four fields (capture roster becomes a step, pre/post-lens split
  becomes two steps around a `lens` step); executor resolves names against
  passes contributed by present Layers, drops absent names and empty steps;
  startup check: every contributed pass appears exactly once; existing
  conditionals stay as step-level gates. Trade: one ~60-line list a reader
  must trust; a pass file no longer says where it draws.

User asked "what is the cleanest implementation?"; recommendation (b).

**Decision:** (b).
