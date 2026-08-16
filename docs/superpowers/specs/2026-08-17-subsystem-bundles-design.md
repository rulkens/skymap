# Subsystem bundles — declarative engine-core walkers (Track A) — design

> **Status.** Ground preparation for Track C (analytic Milky Way field landing).
> **Date.** 2026-08-17.
> **Scope.** Track A only — P1 (contract + walkers + legacy adapter), P2
> (migrate 5 provers), P4 (`MilkyWaySettings` split). Track B (field renderer
> extraction) and Track C (MW field landing) are separate specs, sequenced
> after this one merges. Decisions this spec implements are recorded in
> [`docs/research/engine/decisions.md`](../../research/engine/decisions.md);
> evidence is in
> [`engine-composition-map.md`](../../research/engine/engine-composition-map.md)
> and [`subsystem-sweep.md`](../../research/engine/subsystem-sweep.md) — cited,
> not re-derived.

## 1. Motivation

Five confirmed accretion sites sit on the path a real-time analytic
Milky-Way field would extend:

1. **`runFrame.ts:211-281`** — two hand-wired MW-specific "generated buffer
   no longer matches the setting that produced it" branches, inline in the
   one function every layer's per-frame work funnels through. Own comments
   call out "the same shape asked about a different input" (`:256-261`).
2. **`renderTargets.ts:220-225`** — `createRenderTargets(device, swapFormat,
   size, mwAggregateDivisor)` threads ONE consumer's live tuning knob by name
   through an otherwise-generic function; the only non-constant `scale` in
   the target table (`:199`).
3. **`frameProgram.ts:209-224`** — `PASS_GROUP_TITLES`, a hand-maintained
   `groupKey → title` map; a new `(target, slab)` pair needs a manual entry
   or silently falls back to its own DebugPanel group.
4. **Five separate `state.gpu.*` handles for one singleton layer**
   (`milkyWayCloud`, `milkyWayCloudRenderer`, `milkyWayPickRenderer`,
   `milkyWayAggregateUpsample`, the `mw-aggregate` target row), each
   hand-constructed in `initGpu.ts` and hand-torn-down in `engine.ts:846-891`.
5. **`MilkyWaySettings = { enabled, labelEnabled } & MilkyWayTuning`**
   (`MilkyWaySettings.d.ts:21-26`) flattens two singleton-overlay visibility
   axes with eight v1-sprite look knobs; a v2 field's knobs have no seam to
   land in without repeating the coupling.

The 14-subsystem sweep confirms these aren't MW-only: wake is one
hand-maintained boolean expression, four shared derivations are recomputed
at every call site instead of hoisted, and "new render target ⇒ new
frameProgram step" is a hand-edit for every subsystem. Track A names the
shape once — a `SubsystemBundle` contract plus engine-core walkers — and
migrates five subsystems through it, so Track C's field bundle is bundle #6,
not accretion site #6.

## 2. Non-goals

- **No render-graph / toposort.** `frameProgram()`'s hand-authored step list
  stays the ordering artifact (decisions.md #4) — order encodes semantic
  constraints a derived ordering would have to re-encode as constraints
  anyway. A walker validates layers land on an existing step; it does not
  compute order.
- **No schema-generated settings UI** (rejected Level 4). `SettingsContribution`
  states where a bundle's settings live, not how to render them.
- **No unified presentation-producer registry.** LabelProducer / `produce*`
  markers / `drawPick` stay three named mechanisms (decisions.md #6).
- **No focusability/selectability consolidation** — a ~10-file-per-kind
  surface as large as rendering itself; on the backlog, not this contract.
- **No field-renderer extraction** (Track B) and **no MW field landing**
  (Track C). The MW prover migrated here is v1 **as-is** — re-homed, not
  rebuilt.
- **No long-tail migration.** Solar-system bodies, galaxy point cloud,
  structures, cosmic flow, horizon shell, selection halo, labels/marker-lines,
  debug overlays stay on the legacy adapter (§5) — see §9.
- **No wake registry.** `shouldKeepTicking`'s `anim` bag stays a hand-edited
  parameter; a bundle's `wake` folds one more term into it.

## 3. The contract

Contract types only — one file per type under `src/@types/engine/bundle/`,
`type` never `interface`. Implementation bodies are the plan's job.

```ts
// src/@types/engine/bundle/SubsystemBundle.d.ts
export type SubsystemBundle = {
  readonly key: string;
  readonly settings?: SettingsContribution;
  readonly targets: readonly RenderTargetContribution[];
  readonly artifacts: readonly ArtifactDecl[];
  readonly handles: (device: GPUDevice, targets: RenderTargets) => Record<string, Disposable>;
  readonly layers: readonly BundleContentLayer[]; // ContentLayer & { devOnly?: true }
  readonly computes?: readonly ComputeContribution[];
  readonly planner?: (state: EngineState, ctx: ReadyFrameContext) => unknown;
  readonly liveness?: DeriveLiveness | InlineGates;
  readonly wake?: (state: EngineState, ctx: ReadyFrameContext) => boolean;
  readonly fades?: readonly FadeLayer[];
  readonly labelProducers?: readonly LabelProducer[];
  readonly markerProducers?: readonly MarkerProducer[];
  readonly debug?: BundleDebugContribution;
};
```

### `targets` — fixes accretion site #2

```ts
export type RenderTargetContribution = {
  readonly spec: Omit<RenderTargetSpec, 'scale'>;
  readonly scale: number | ((state: EngineState) => number);
};
```

`scale: n | (state) => n` lets ANY bundle contribute a live-scaled row
without widening `createRenderTargets`'s signature again. The
**target-allocation walker** resolves every contribution's `scale` once per
frame and rebuilds only rows whose resolved scale changed — the generalized
form of `runFrame.ts:211-245`.

### `artifacts` — the four kinds (decisions.md #7, sweep MISFIT 1)

```ts
export type ArtifactDecl =
  | { readonly kind: 'baked' }
  | { readonly kind: 'fetched'; readonly wiring: AssetWiringRow }
  | { readonly kind: 'streamed'; readonly engage: () => void; readonly disengage: () => void }
  | {
      readonly kind: 'generated';
      readonly stalenessKey: (state: EngineState) => unknown;
      readonly regenerate: (state: EngineState, device: GPUDevice) => void;
      readonly budget?: (state: EngineState) => number;
    };
```

`fetched` reuses `AssetWiringRow` verbatim — no new mechanism. `streamed` is
earthTiles-style paged (engage/disengage lifecycle, not a single load).
`generated` carries `stalenessKey` (a pure projection of whatever setting
built the artifact) + `regenerate`; the **staleness-sweep walker** is the
promoted, named form of `runFrame.ts:247-281` — compares this frame's key
against the key recorded at last `regenerate`, calls `regenerate` on
mismatch. `budget` is for the fly-by target (§8) — unused (`undefined`) by
every P2 prover.

**"Imperative upload" is not a fourth-and-a-half kind** — investigated
2026-08-17: `handle.volumes.add` has zero in-repo callers; every real volume
load already goes through a slot whose commit calls `renderer.upload`
directly (`syntheticVolumeSlots.ts:80`), hand-mirroring the handle's
upload + row-seed + fade + wake bookkeeping (its own comment says so). The
handle is the legitimate entry point for runtime-supplied cubes the demand
system cannot express (no URL, not in the registry). The volumes prover
migration (§6) therefore consolidates ingest into ONE function that slot
commits and the public handle both call; the bundle declares the artifact
once, and the duplicated bookkeeping is deleted with the migration.

### `handles` — shared-handle slab-partition pattern

Called once at bootstrap; the returned record installs under
`state.gpu.bundles[bundle.key]` and tears down via one walker call in
`engine.ts`'s existing destroy loop, replacing N hand-written lines. A
bundle whose OWN layers share one mutable GPU resource (the selection-halo
precedent: two `ContentLayer` rows, one uniform buffer, safe only via a
documented slab-partition invariant) declares that resource once here; both
layers close over the same key. This is the pattern named: N layers, M < N
handles, folded in one map — not a second bespoke `Map` elsewhere.

### `layers` — frame-assembly validation

Unchanged `ContentLayer` type. The **frame-assembly walker** splices every
bundle's layers into the flat `CONTENT_LAYERS` array (bundle order ++
per-bundle layer order) and, new: asserts every layer's `(target, slab)`
matches some `frameProgram()` step. A mismatch is a silent no-op today (the
executor's `.filter()` returns nothing); the walker turns it into a loud
dev-time throw — the automatable half of "new render target needs a
frameProgram step."

### `devOnly`, `computes`, `planner`, `liveness`, `wake`, `fades` — one paragraph each

- **`devOnly`**: per-LAYER, not per-bundle — the sweep's actual case is
  `disk-radius-ring`, a debug layer inside the production galaxy-point-cloud
  subsystem, so a bundle-level flag has the wrong granularity. Debug layers
  (`disk-radius-ring`, `clip-path-debug`) sit in production `CONTENT_LAYERS`
  today with no flag. Still spliced + validated; excluded from any future
  production-only manifest walk. No P2 prover uses it.
- **`computes`**: rows folded into the existing `COMPUTE` name→fn record
  (`executeFrame.ts:82`) at handle-construction time; a duplicate `name`
  across bundles throws loudly.
- **`planner`**: "planner" is the adopted noun (decisions.md #6). Called once
  per frame per bundle, result memoised at `ctx.bundlePlanner[bundle.key]` —
  the general form of `prepareStarCut`'s shared-walk pattern, answering
  sweep MISFIT 4 (shared derivations recomputed per call site).
- **`liveness`**: `DeriveLiveness = (state, ctx) => unknown | null` (the
  `deriveXLiveness` shape) or the literal `'inline'` meaning the bundle's own
  `enabled()` gates handle it. Only 2 `deriveXLiveness` files exist today —
  the contract permits both forms; no walker forces the heavier one.
- **`wake`**: folds into `shouldKeepTicking`'s `anim` bag as one extra
  `anim.bundleWake` OR-term, per its own docblock rule ("extend the bag,
  never a hidden state read"). `shouldKeepTicking`'s signature is not
  rewritten to accept a bundle list — existing named terms stay fast,
  allocation-free reads. A bundle without self-animating state omits `wake`.
- **`fades`** (decisions.md #7, fades amendment): a bundle declares its
  `FADE_LAYERS` manifest rows — the same `FadeLayer` row shape
  (`{expand, handle, seed, intent, post, guard}`), unchanged. The
  **fade-manifest walker** builds the wired manifest as
  `concat(bundle.fades) ++ LEGACY_FADE_LAYERS`, where the legacy list shrinks
  as provers migrate their rows out (filaments, constellations, and MW v1
  each carry one today; volumes reads `fades.isAnyAnimating` without its own
  row and stays row-less). `FadeId` and `VisibilityLayerKey` remain type-level
  unions — a bundle declares which existing keys it services, it does not mint
  them. **Track C invariant, stated here because this contract enforces it:
  the field bundle reuses `{kind:'milkyWay'}` and the
  `milkyWayDisk`/`milkyWayLabel` visibility keys — new keys would silently
  break every tour/clip that scripts hide/show intents against them.**

### `labelProducers` / `markerProducers` — two arrays, not one registry

Matches decisions.md #6: three named presentation mechanisms, not a
fake-unified one. `MarkerProducer` is new, "grown from LabelProducer's
shape" (same `(state, ctx) => Output[]` call convention, separate type).
`drawPick` stays on `ContentLayer` — pick is a parallel program over the
same registry, not a bundle-level concern.

### `debug` — derived, not hand-maintained

```ts
export type BundleDebugContribution = {
  readonly groupTitle: string;
  readonly sliders?: readonly SliderField[];
};
```

The **derived-debug walker** builds `PASS_GROUP_TITLES` from every bundle's
`groupTitle` instead of the hand-maintained literal — closing accretion site
#3. `sliders` reuses the existing `SliderField` shape
(`MILKY_WAY_SLIDER_FIELDS` pattern); the walker concatenates every bundle's
list into the DebugPanel registry.

## 4. Engine-core walkers

| Walker | Called from | When | Replaces |
|---|---|---|---|
| Target allocation | `initGpu.ts` + `runFrame.ts` | bootstrap + per frame | `mwAggregateDivisor` param; `runFrame.ts:211-245` |
| Handle construction | `initGpu.ts` | bootstrap once | hand-written `state.gpu.<x>` construction lines |
| Teardown | `engine.ts` `destroy()` | registered once, run at teardown | flat per-handle destroy lines |
| Staleness sweep | `runFrame.ts` | per frame | `runFrame.ts:247-281` |
| Frame-assembly validation | `CONTENT_LAYERS` build (dev-time) | once, dev-only | nothing — new safety net |
| Derived debug | `frameProgram.ts` + slider registry assembly | module load | `PASS_GROUP_TITLES` literal |
| Wake fold | `runFrame.ts`'s `shouldKeepTicking` call site | per frame | nothing — additive `anim.bundleWake` |
| Fade-manifest derivation | `wiring/fadeLayers.ts` assembly | module load | hand-maintained `FADE_LAYERS` literal (concat over bundles ++ legacy) |

**ctx-ambient-state rule** (decisions.md #7): `structureFocus → ctx.focusBlend
→ state.gpu.focusUniform` stays engine-core. Bundles read `ctx`, never write
it — the only bundle-writable slot is `ctx.bundlePlanner[bundle.key]`, scoped
to that bundle's own key; the shared ambient fields (`ctx.focus`,
`ctx.drawCamPos`, `ctx.nowMs`, …) keep their existing types unchanged.

**Step-level gates stay engine-core.** `FOREGROUND_MAX_DISTANCE_MPC` ANDs
into ~9 layers today, owned by no single bundle. The contract does not add a
bundle-level "step gate" field in P1 — none of the five P2 provers sit behind
it. Recorded so a later `bodies/` migration doesn't invent a second mechanism.

**Engine-core keeps** (decisions.md #8, unchanged): shared accumulators
(`hdr`, `swap`, `foreground:0`, bloom mips), step-level gates, ctx ambient
state, `pickProgram` infra, tone/bloom post, camera/input. A bundle's
`targets` are additive rows only.

## 5. The legacy adapter

Every unmigrated subsystem keeps working through one adapter bundle, so P1
lands with zero behaviour change before any prover migrates:

```ts
// src/services/engine/bundles/legacyAdapterBundle.ts
function legacyAdapterBundle(layers: readonly ContentLayer[]): SubsystemBundle {
  return { key: 'legacy', targets: [], artifacts: [], handles: () => ({}), layers };
}
```

At P1's end, the full 30-row `CONTENT_LAYERS` array is wrapped in one
`legacyAdapterBundle` call, registered alongside any real bundles. The
frame-assembly walker treats it like any other bundle; validation passes
trivially (every legacy layer's `(target, slab)` already matches a step). P2
shrinks the adapter's layer list by exactly what migrates out — it does not
touch the adapter mechanism.

## 6. P2 — migrating the five provers

Confirmed clean fits (filaments is the sweep's explicit "reference case for
the contract"; constellations "clean fit"). Order, easiest first:

| Order | Prover | Layers | Artifact | Liveness | Planner | Wake |
|---|---|---|---|---|---|---|
| 1 | Filaments | `filaments` (hdr·COSMO) | `fetched` (filamentSlot) | inline | none | none |
| 2 | Constellations | `constellations` (hdr·NEAR0) | `fetched` (constellationsSlot) | inline (shared with label producer) | none | none |
| 3 | Scalar volumes | `scalarVolumeLayer`(volume·COSMO) + `volume-upsample`(hdr·COSMO) | `fetched` (cf4/mcpm) + `generated` (addVolumeField) | `deriveVolumeLiveness` (moved unchanged) | none | none |
| 4 | Star catalog | `star-aggregates` + `star-catalog` + `star-upsample` (NEAR0) | `fetched` (per-source starCatalogSlot) | inline (`starCatalogVisible` + crossfade) | `prepareStarCut` (moved into `planner`) | `anyNodeFading` → `wake` |
| 5 | MW v1, as-is | `milky-way-aggregate` + `milky-way-upsample` + `milky-way` (NEAR0, +pick) | `generated` (stalenessKey = `(starCount, tier)`) | `deriveMilkyWayCloudAlpha` (moved unchanged) | none | none |

Filaments/constellations first: zero planner, zero wake, one artifact each —
proves the walkers' happy path before the harder cases. Star catalog and MW
v1 exercise every non-trivial field (planner, wake, generated staleness,
live-scaled target) once the walkers are already proven. Each prover's
`FADE_LAYERS` rows move into its bundle's `fades` in the same commit —
filaments (`{kind:'filament'}`), constellations (`{kind:'constellations'}`),
volumes (`{kind:'volumesMaster'}` + per-field `{kind:'volumeField'}`), MW v1
(`{kind:'milkyWay'}` + its `labelLayer` row); the star catalog carries only a
`labelLayer` row, whose home (catalog bundle vs. the labels subsystem's
eventual bundle) is a migration-time call, defaulting to the catalog bundle.
The fade-manifest walker's legacy list shrinks in step with the adapter's
layer list.

**MW v1 migration closes accretion sites #1, #2, #4:**

- `mwAggregateDivisor` param **deleted**; `mw-aggregate` becomes an ordinary
  `RenderTargetContribution` with `scale: (state) => state.settings.milkyWay.aggregateDivisor`.
- `runFrame.ts:211-245` and `runFrame.ts:247-281` **both deleted**, replaced
  by the two generic walkers.
- The five `state.gpu.milkyWay*` handles collapse into one `handles()` call
  (`{ cloud, cloudRenderer, pickRenderer, aggregateUpsample }`), torn down by
  one teardown-walker call instead of the four hand-written pairs at
  `engine.ts:846-847,878-881,890-891`.
- `PASS_GROUP_TITLES`'s three MW rows become the bundle's `debug.groupTitle`
  declaration; `frameProgram.ts`'s consumers (`groupRows`, `timedSlotGroupsOf`)
  are unchanged — only the map's construction site moves.

Bundle definitions in the plan state `key`/`targets`/`artifacts` and which
existing functions move into `handles`/`planner`/`liveness` **unchanged** —
cite file:line, don't paste (plan-style.md).

### Behaviour-neutrality gates (each migration, own commit)

- `npm run typecheck` + `npm test` green before and after.
- Byte/pixel-neutral: no shader, uniform-layout, or target-spec change beyond
  `scale`'s type widening from `number` to `number | (state) => number`
  (every existing constant `scale: N` stays valid).
- Dev-server visual smoke per prover (filaments cloud; constellation lines +
  names; volume raymarch + upsample; survey star leaf/aggregate crossfade;
  MW cloud + dust + pick) — typecheck-green does not prove a shader pipeline
  didn't silently blackscreen (iOS-shader landmine precedent).
- `TIMED_SLOTS` unchanged in name and order across each migration's commit.
- `mwAggregateDivisor` deletion is the LAST step of migration 5, after the
  new target contribution is confirmed live.

## 7. P4 — `MilkyWaySettings` identity/tuning split

Closes accretion site #5.

```ts
// src/@types/settings/MilkyWaySettings.d.ts — after
export type MilkyWaySettings = { enabled: boolean; labelEnabled: boolean };
```

`MilkyWayTuning` (the 8-knob type) is unchanged in shape but no longer
intersected in. Since v1 is deleted wholesale in Track C (F3), P4 doesn't
invent a permanent new home for knobs that are themselves scheduled for
deletion — it moves `MilkyWayTuning` to be imported directly by its three
remaining consumers (`MILKY_WAY_TUNING_DEFAULTS`, `setMilkyWayTuning`,
`milkyWayCloudRenderer`'s draw args) as a v1-scoped type, siblings of
`MilkyWaySettings` rather than merged into it. `SettingsSnapshot` (tour
capture) repoints to read both sibling types instead of one intersection.
Behaviour-neutrality gate: existing DebugPanel MW tuning-section tests keep
passing (they exercise the panel, not the type intersection) — this is a
type split, not a UI change.

## 8. Fly-by target — why `generated` carries `budget`

Per decisions.md #5 (real-time per-galaxy generation, MW = instance #1):
generated artifacts are budgeted/time-sliced/async-completable. P2's
`generated` artifact (MW v1's cloud) has no budget — `regenerate` runs
synchronously, same as today. `budget` exists in the type NOW so Track C's
field bundle can populate it with no contract change; no time-slicing walker
is built in P1/P2 (no consumer needs one yet) — the contract is deliberately
ahead of its P2 usage, recorded rather than left implicit.

## 9. Ground preparation — this spec IS the ground prep for Track C

Track C's ground prep is Track A (this spec) + Track B — Track C's own spec
carries "Ground preparation: none needed — done by Track A/B" rather than
re-deriving one. What Track C inherits:

- A `SubsystemBundle` contract the field bundle implements directly — bundle-
  native from day one, unlike the five P2 provers migrated FROM legacy.
- Deleted accretion sites #1/#2/#4 — a live-scaled target + staleness-tracked
  generated artifact are now generic walker behaviour, not hand-wiring to
  extend a third time.
- `budget` on `generated` artifacts (§8), ready for time-sliced generation.
- P4's proof that `enabled`/`labelEnabled` read independently of tuning — the
  field bundle declares its own tuning shape without inheriting v1's.
- The frame-assembly validation walker — a field target missing its
  `frameProgram` step fails loud in dev instead of silently drawing nothing.

## 10. Long-tail follow-ups (not migrated here)

- **Galaxy point cloud** — resolve the GALAXY_CATALOG_SOURCE_REGISTRY /
  ASSET_WIRING double-registration before or during migration, not carry it
  into the bundle contract as a third registry.
- **Structures** — `structureFocus.isAwake()`'s wake mechanism needs a call:
  fold into the `wake` bag fold, or stay a dedicated `shouldKeepTicking` term.
- **Cosmic flow** — the only other `'compute'`-step owner besides atmosphere;
  straightforward `computes` + `fetched` mapping.
- **Solar-system bodies** (12 layers, hardest case) — 4 un-hoisted shared
  derivations need `planner` homes first; the un-owned
  `FOREGROUND_MAX_DISTANCE_MPC` gate needs the step-gate mechanism this spec
  left unbuilt.
- **Horizon shell** — zero settings, zero FadeRegistry handle; first prover
  to exercise an omitted `settings` contribution.
- **Selection halo, labels/marker-lines, debug overlays** — `devOnly: true`
  candidates.
- **Adapter deletion** — once every layer has migrated out.

## 11. Testing strategy

Per `testing.md` — what can actually break:

- **Target-allocation walker**: two bundles contributing the same target
  `id` → loud construction-time throw (a real collision, not a restated
  registry). A bundle's `scale` fn resolves to different values across two
  `state`s with different settings — not `scale(state) === setting` (mirror).
- **Frame-assembly validation**: a layer whose `(target, slab)` matches no
  `frameProgram()` step throws at construction — the exact silent-no-op bug
  class this walker exists to catch; genuinely load-bearing.
- **Staleness-sweep**: `stalenessKey` changing between two calls →
  `regenerate` called exactly once (not on first bootstrap call, not twice
  for one change) — the exact double-regenerate-per-drag-tick bug the old
  inline branch could introduce by hand.
- **Legacy adapter**: the full `CONTENT_LAYERS` array round-trips through the
  frame-assembly walker unchanged in content and order — the splice logic is
  new code that could reorder or drop rows.
- **P2 migrations get no new behavioural tests.** Each prover's existing
  suite (liveness derivation, layer `enabled()`/`draw()`, `TIMED_SLOTS`
  ordering) already covers the behaviour; moving the same functions into a
  bundle's fields doesn't change what they compute. The behaviour-neutrality
  gates (§6) — existing-suite-green + visual smoke — catch a migration
  mistake; no new assertions earn their place.
- **Not testing**: the `SubsystemBundle` type shape (a `tsc --noEmit` fact);
  `PASS_GROUP_TITLES`'s exact derived content post-migration (a registry
  restatement — the existing `TIMED_SLOTS`/`groupRows` structural-invariant
  tests already cover what matters).

## 12. Open questions

- **PR packaging: RESOLVED** (user confirmation, 2026-08-17) — one PR per
  track. Track A ships as one PR whose commits are P1 (contract + walkers +
  adapter-wrap), P2's five migrations (one commit each), and P4's split.
- **OPEN**: whether the target-allocation walker's per-frame scale re-resolve
  should run unconditionally (cheap: N bundles × 1 call) or only on a
  suspected setting change. P2's single live-scaled row makes this moot in
  practice — default unconditional (matches today's `runFrame.ts:232-245`),
  revisit only if `npm run perf` shows a future bundle count makes it visible.
