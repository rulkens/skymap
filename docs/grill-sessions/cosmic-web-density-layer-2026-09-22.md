# Grill Session: the cosmicWebDensity Layer — 2026-09-22

Source: layer-composition step 4 (the settings-only `src/layers/volume/` stub,
[`2026-09-09-layer-composition-design.md`](../superpowers/specs/2026-09-09-layer-composition-design.md)
§10(e)), a read-only inventory of the scalar-volume surface in core, and the
backlog items
[`2026-09-13-volume-field-vram-release.md`](../backlog/2026-09-13-volume-field-vram-release.md)
and the Edenhofer dust spec's "third joint"
([`2026-08-20-edenhofer-dust-volume.md`](../superpowers/specs/2026-08-20-edenhofer-dust-volume.md)).

Goal going in: form the volume Layer the way the seven prior Layers were formed.
The session widened twice: the first question deleted a dead DEV fixture branch, and
the naming questions turned "volume" from a Layer into a generic rendering mechanism
that two Layers (the cosmic web density field now, the Milky Way dust later) each
instantiate. The Layer that ships is `cosmicWebDensity`, paired by name with the
existing filaments Layer, renamed `cosmicWebFilaments`.

Inventory facts the rulings rest on are collected at the end, so the PR 1 briefs
and the PR 2 spec do not re-derive them.

---

## Q1: The three DEV synthetic volumes

**The question:** `debug-gaussian` / `debug-cartesian` / `debug-spherical` are
registry rows resident in prod, with DEV-only slots minted in `wireSlots`, their own
fetcher and generator (`syntheticVolumeFetcher`, `syntheticScalarField`, ~310 lines),
a lazy-loader (`maybeLazyLoadDebugVolume`), and a special case in the `volumeField`
fade row (constant-true guard plus a `post` hook) that exists only for them. Carry
them into the Layer, or delete them?

What the code says: they are unreachable. Their settings rows are never seeded
(`seedVolumeFields` filters `binBaseName === null`), `writeVolumeField` no-ops on an
unknown id, the Cosmic web panel filters `debug-*` out, and the only loader is the
fade row's `post`, which requires `enabled === true` on a row that cannot exist. No
tour, exhibit, doc or tool references them. The last substantive commit touching them
was the rung-4 ingest consolidation (#583); every later commit was a sweep.

**Considerations:**

- **Option A (delete wholesale):** source codes 12/13/14 retire unassigned (codes
  are baked into formats; append, never renumber). The fade row loses the guard
  short-circuit and its `post` entirely and becomes a plain demand-loaded row like
  every other. `binBaseName` narrows to non-null. `syntheticVolumeSlots` (the one
  slot factory that returns a record of three, breaking `SlotFactory`),
  `EngineAssetSlots.syntheticVolumes`, the `AssetKey` rows, `SyntheticVolumeReq` /
  `SyntheticVolumeShape`, the container's `debug-` filter and the "two load
  mechanisms partition" prose all go. Same ruling shape as the synthetic galaxy
  catalog in 04d.
- **Option B (carry as-is):** the Layer's fade row keeps a three-id special case for
  fixtures nobody can switch on.
- **Option C (fix reachability, then move):** seed their rows in DEV, add a
  DebugPanel toggle. UI for a debugging aid nobody has needed since June.

**Decision:** Option A, as the first commit of the prep PR, so the Layer is designed
against the plain fade row. `tests/fixtures/scalar-volume/tiny-8x8x8.scfd` and
`scalarFieldFormat` stay: they test the real format.

## Q2: Who owns the Cosmic web settings section (first pass)

**The question:** `CosmicWebSectionContainer` is core UI hard-mounted in
`SettingsPanel` after the Layers' `main` sections. It reads two Layers' state
(volumes master + per-cube rows; filaments master + intensity) and its Style picker
(Smooth / Filaments / Both) batches both masters. When filaments formed (05a) the
section stayed core for exactly this reason.

**Considerations:**

- **Option A (stays core):** zero moves; a composition without the volume Layer
  still renders cube rows over an empty map, and the section is the one panel
  surface no Layer declares.
- **Option B (volume Layer owns it, filaments included):** `ui/` is exempt from the
  cross-Layer ban so it compiles, but one Layer's UI owns another's master toggle.
- **Option C (split, picker deleted):** each Layer declares its own section.
- **Option D (core "Cosmic web" group with a new sub-slot kind):** a slot kind whose
  only reason to exist is the picker.

**Decision:** deferred to Q3 (whether the two Layers merge) and then ruled at Q7.

## Q3: Does the Layer absorb filaments?

**The question:** the user reframed the Layer as `cosmicWeb` (see Q4). The filaments
Layer is the DisPerSE skeleton of the same structure the cubes render; its own
`layer.ts` header says its UI "moves with `volume`".

**Considerations:**

- **Option A (no; sibling Layers):** Q2 must then split the section or let one Layer
  own the other's toggle.
- **Option B (yes; one Layer, two slices):** multi-slice precedent exists (`body` has
  four), the section stays whole with its picker, 05a's files fold in under the new
  root.
- **Option C (yes, and flow too):** flow is the CF4 velocity field of the same web,
  but it shares no toggle, has a compute step and a workbench. Nothing gained.

**Decision:** Option B was chosen, then **reversed to Option A** one question later:
"I don't want to conflate multiple different types of rendering in one layer. I'd
rather keep them separate." A Layer is one rendering of one subject; the density
field and the skeleton are two renderings. The naming pair in Q10 is how the shared
subject is expressed instead.

## Q4: The Layer's name, and the CF4 density cube

**The question:** with filaments a sibling, what is the four-cube Layer called? The
user's framing: "volume" names the renderer, which should be generic so the Milky
Way dust can use it later; the Layer should be named for its subject.

**Considerations:**

- **Option A (`cosmicWeb`):** the continuous thing itself; filaments and flow are
  named for what they add to it.
- **Option B (`densityField(s)`):** named for the data shape, not the subject; a
  section title for physicists.
- **Option C (`cosmicWebVolumes` / `scalarVolumes`):** keeps the mechanism in the
  name; the dust Layer would be a volume too.

**Decision:** Option A, later refined to `cosmicWebDensity` by Q10. In the same
ruling the user **deleted the CF4 density cube** ("so uninteresting that it should
go; we haven't shown it thus far"). That strengthened the name: the remaining cubes
(MCPM, Polyphorm 2MRS, the MCPM workbench export) are all Physarum reconstructions of
the cosmic web. Deletion scope: source row + `Source.Cf4Density` retired, fetcher,
slot, wiring row, `cf4_density.scfd` in the R2 allow-list, the `buildCf4Density` /
`auditCf4Anchors` / `verifyCf4Scfd` tools, the e2e spec, `docs/DATA.md` rows. The raw
`d_mean_CF4pp.npy` and its `rawDataRegistry` key **stay**: `tools/flow/buildFlowField`
reads density alongside velocity.

## Q5: Where the cut falls between generic volume mechanism and the Layer

**The question:** which of the volume pieces is mechanism (core, reusable by the dust
Layer) and which is the Layer's? What each piece knows today:

| piece                                    | knows about cosmic web?                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `volumeFieldRenderer` (470 L)            | no: field map + injected `settingsOf` / `fadeOpacityOf` projections, additive blend |
| `scalarVolumePass` (67 L)                | yes: calls `deriveVolumeLiveness`, draws `state.gpu.volumeFieldRenderer` to `volume` |
| `volumeLiveness` (58 L)                  | yes: reads `settings.volumes.*`, the master fade, `volumeField` handles, bands       |
| `volume` target + `volume-upsample`      | by name only; a generic depthless HDR ⅓-scale target                                |
| `uploadVolumeField`                      | yes: dispatches the volumes slice action, writes the one renderer                   |
| gpuHandleRegistry rows                   | yes: one global instance each                                                       |

**Considerations:**

- **Option A (everything into the Layer, renderer included):** the dust Layer would
  import a sibling Layer's renderer (banned) or copy 470 lines.
- **Option B (renderer + pass factory + pure liveness are core; the Layer owns one
  instance of each):** `services/gpu/renderers/volumeField/` stays, gains a
  `createScalarVolumePass(renderer, target, liveness)` factory beside
  `createUpsamplePass`; `deriveVolumeLiveness` becomes a pure function over
  `(renderer, fieldSettingsOf, fadeOpacityOf, cameraDistance)` with no settings read
  inside. The Layer's `create` mints the renderer into its Runtime, declares its own
  target and upsample (`Layer.targets`, ZoA precedent), instantiates the pass with its
  settings projection, and owns the ingest in `load/` (which deletes the
  `uploadVolumeField` ratchet row). The dust Layer later mints a second instance with
  its own target and, when it needs multiply blend, a blend parameter on the factory.
- **Option C (a `VolumeFamily` descriptor table both Layers register into):** a
  registry for two entries.

**Decision:** Option B. It is what "generic renderer" already means here: ZoA owns a
target + an upsample instance over core factories, and the renderer's
projection-based API was built for this. **The Edenhofer spec's "third joint" (an
`absorptive` flag routing one ingest path to two renderers) dissolves**: two Layers,
two instances, no routing. Names follow the Layer: pass `cosmic-web-density`, target
`cosmic-web-density`, upsample `cosmic-web-density-upsample`. Shaders stay under
`src/services/gpu/shaders/scalarVolume/`.

## Q6: Do the settings clusters rename with the Layer? (first pass)

**The question:** the `volumes` cluster (`{ enabled, items }`) is named in tours,
exhibits, `captureSettings`, the fade ids and sixteen readers.

**Decision at the time:** keep `volumes` (Layer name ≠ cluster name is already the
rule for `body` and `galaxyCatalog`). **Superseded by Q11** once the Layers became
single-slice siblings with paired names.

## Q7: The Cosmic web section, with filaments a separate Layer

**The question:** Q2 again, now that Q3 is "separate".

**Considerations:**

- **Option B (the density Layer owns the whole section, filaments toggle included):**
  smallest change, compiles under the `ui/` exemption; drop the Layer from a
  composition and the filaments toggle vanishes with it.
- **Option C (split: two sections, picker deleted):** each Layer declares only its
  own UI; the Smooth / Filaments / Both shortcut goes, with `deriveCosmicWebStyle`,
  its tests and the header prose. The user gets two toggles.

**Decision:** Option C. A Layer that cannot be omitted without taking a sibling's
controls with it is not separate. If the picker matters later it belongs to an
exhibit or a tour cue, both of which already flip several masters at once.

The user added: **the per-cube sliders move to the DebugPanel.** Intensity,
contrast, trim, density scale, exposure and palette become a `debug`-slot section
(the flow / ZoA / Local Bubble precedent), not settings UI.

## Q8: What stays in the main "Cosmic web density" section

**Considerations:**

- **Option A (master toggle + one enable checkbox per shipping cube):** MCPM and
  Polyphorm 2MRS. The workbench cube (`visible: false`, "no UI toggle ships with this
  row") appears only in the debug section, where its enable checkbox sits beside its
  sliders, so promoting a workbench run stays a dev act.
- **Option B (master only; every per-cube control in debug):** demotes a shipped
  217 MB dataset to a dev fixture.
- **Option C (no main section; master as a row elsewhere):** Labels & guides is the
  only row slot and it is the wrong home.

**Decision:** Option A. `VolumeFieldRow` shrinks to checkbox + label in main; the
slider block becomes the debug section's row component, which also retires the
"four controls on one line" layout the current file spends forty lines explaining.

## Q9: The source-row discriminator

**The question:** every formed Layer's registry rows carry the Layer's name as
`type`; `VolumeFieldId` is derived from `type: 'volume'` rows, and its only readers
move into the Layer. The dust cube's row will be a scalar-volume row for a different
Layer, so a shared `'volume'` type would silently widen the id union across Layers.

**Considerations:**

- **Option A (rename to the Layer's name; split the types on that line):** Layer
  types (`CosmicWebDensityFieldId`, `…SourceEntry`, `…RegistryEntry`,
  `…Settings` for the cluster, `…Runtime`, the panel row data) live in
  `layers/cosmicWebDensity/@types/`. Mechanism types stay shared under
  `src/@types/`: `ScalarCube`, `ScalarFieldPaletteId`, `VolumeFieldSettings` (the
  per-field knobs the generic renderer's `settingsOf` reads), `VolumeFieldDefaults`
  (the presentation-defaults shape a row intersects; the dust row reuses it),
  `VolumeFieldRenderer`, `FieldEntry`, `scalarFieldFormat`.
- **Option B (keep `'volume'` as a mechanism-level type):** each Layer would need a
  second discriminant and the id union crosses Layers.

**Decision:** Option A. `type` already means "which Layer owns this row" everywhere
else in the registry. With Q10 the literal is `'cosmicWebDensity'`.

## Q10: Pairing the names of the two cosmic-web Layers

**The question:** the user was not happy with `cosmicWeb` beside `filaments`: "in a
way, they are two views" of one object, and the names should say so in code.

**Considerations:**

- **Option A (prefix pair: `cosmicWebDensity` + `cosmicWebFilaments`):** folders,
  discriminators and section titles ("Cosmic web density", "Cosmic web filaments",
  adjacent in composition order) all pair; the suffix names what each renders. The
  dust Layer is a density field but not cosmic web, so it gets its own prefix. Flow
  is arguably the third view but shares no toggle or section; renaming it would be
  consistency for its own sake.
- **Option B (`densityField` + `filaments`, pairing only in UI titles):** the code
  does not reflect the shared subject.
- **Option C (suffix pair):** same information, sorts and reads worse.
- **Option D (keep `cosmicWeb` + `filaments`):** the asymmetry objected to.

**Decision:** Option A, flow left as is.

## Q11: Do the clusters and fade ids follow the Layer names?

**The question:** single-slice Layers name their cluster after the Layer (`flow`,
`zoneOfAvoidance`, `constellations`); Q10's pair argues for renaming `volumes` and
`filaments` to match. Churn measured: `filaments` cluster + fade id + visibility key
= 21 src files; `volumes` cluster + `volumesMaster` / `volumeField` fade ids and keys
= 28 src files; ~20 test files between them. All mechanical (`npm run refactor --
rename`, the six hand-kept fade tables, three tour cues, two exhibit files,
`captureSettings`' tuple). No persisted state: settings are not in the URL, tour
snapshots are built at runtime.

**Considerations:**

- **Option A (rename both, one sweep commit):** `settings.cosmicWebDensity` beside
  `settings.cosmicWebFilaments`; fade ids `cosmicWebDensity` (master) /
  `cosmicWebDensityField` (per cube) / `cosmicWebFilaments`.
- **Option B (Layers only):** two Layers whose folder ≠ cluster, and `volumes` keeps
  naming the mechanism ruled generic.
- **Option C (rename `volumes` only):** the asymmetry comes back in state.

**Decision:** Option A, as its own commit after the two deletions and before the
Layer forms, so the move commits carry no rename noise.

## Q12: The DebugPanel pass-toggle exclusion for the raymarch

**The question:** `engine.ts`'s `passOverrides.allNames` filters out every pass on
`FRAME_ORDER` lines whose `target === 'volume'` because "the raymarch has no user
toggle", with the frame order as the only statement of which pass that is. Once the
target is Layer-owned, core would be naming a Layer's private target by string.

**Considerations:**

- **Option A (delete the exclusion):** the pass becomes toggleable like ZoA's and the
  aggregate passes, inheriting the already-backlogged "disabling a producer pass
  freezes its upsampled overlay" bug rather than dodging it with a special case.
- **Option B (generalize: exclude every Layer-owned target's passes):** ZoA loses
  its toggle unasked, the bug hides behind a bigger rule.
- **Option C (keep, renamed):** a core string tracking a Layer's target id.

**Decision:** Option A.

## Q13: The VRAM-release backlog item

**The question:** unticking a cube fades it but never frees its texture (Polyphorm
2MRS is 217 MB). The mechanism exists (`release` predicate → `slot.release()` →
`onRelease` → `renderer.unload`); the blocker is that `release` fires the frame after
the untick, mid-fade. The open choice is a fifth `DemandCtx` read surface (fade
opacity), on a core type whose docblock is deliberate about having four.

**Considerations:**

- **Option A (stay backlogged; the Layer PR only repositions the wiring):** the
  eventual fix is two `release` predicates and two `onRelease` lines inside the
  Layer's `load/` plus the core `DemandCtx` decision, which needs its own ruling.
- **Option B (ride):** two designs in one diff; a core contract change reviewed
  beside 100+ mechanical files.

**Decision:** Option A. The backlog doc's file references get updated to the new
paths. `removeVolumeField` (no production dispatcher since #695, which the backlog
item says to delete "with this work") is deleted now under PR 2's deletion audit:
dead today regardless of the release design.

## Q14: Packaging

**The question:** four parts of different character: (1) delete the DEV volumes,
(2) delete the CF4 cube, (3) the rename sweep, (4) form the Layer.

**Considerations:**

- **Option A (two PRs):** PR 1 = parts 1–3, behaviour change limited to "two datasets
  gone", everything else byte-neutral (`INITIAL_SETTINGS` JSON diff is the gate, as in
  #791). PR 2 = part 4 against a tree where every name is final. Two CI rounds.
- **Option B (one PR, ordered commits, the constellations route):** one review over
  ~150 files mixing deletions, a ~70-file rename and a new Layer shape; a rename slip
  and a design slip look the same in the diff.
- **Option C (three PRs):** the deletions are small and self-checking; splitting them
  out buys little.

**Decision:** Option A. PR 1 is prep: no deletion audit, no spec. PR 2 gets a short
spec addendum with a "Ground preparation → PR 1" section, and rewrites the Edenhofer
spec's stale "third joint" paragraph to "two Layers, two instances", since PR 2 is
what makes it true.

## Q15: Execution route

**Considerations:**

- **Option A (PR 1 plan-less; PR 2 spec + plan + SDD):** PR 1 is three mechanical
  sweeps whose shape this transcript pins (the #791 route: grouped Sonnet dispatches,
  one per part, one final review, CI as the gate). PR 2 is not mechanical (pass
  factory + pure liveness signature, Runtime shape, two new UI sections, asset rows
  carrying the arrival-ordering invariant) and gets `writing-plans` + the lean SDD
  protocol.
- **Option B (neither planned):** constellations went plan-less and cost six review
  commits.
- **Option C (both planned):** a plan for three renames is ceremony.

**Decision:** Option A. Carried assumptions: no perf gate for either PR (same
renderer, passes and targets; only ownership moves); a smoke eye-check at PR 2 (MCPM
at boot, Polyphorm 2MRS tick and fade, both sections in the panel, the sliders in
DebugPanel); the PR 2 spec is written while PR 1 sits in CI, in this worktree.

---

## Inventory facts the plan must not re-derive

**Arrival-ordering invariant.** `installFadeOnArrival` snapshots every fade row's
guard before subscribing, then on any slot's `ready` re-runs every guard and opens a
fade on each false→true transition. The density row's guard is
`renderer.listIds().includes(id)` and its intent reads `items[id]?.enabled`; both are
written by the ingest (`dispatch(addVolumeField(id))` then `renderer.upload(id,
cube)`), so **both writes must land synchronously inside the slot's `commit` before it
transitions to `ready`**, or the edge is missed until some other slot loads. The
Layer's `load/` ingest keeps dispatch → upload → resolve, and `wireSlots`' call to
`installFadeOnArrival` must still run after the Layer's slots join `allSlots`. Flow's
cube bypasses this path deliberately (different renderer, arity, fade key; decision
#14).

**Where things are today** (worktree off main `71477b91d`):

- Source rows: `src/data/sources/{mcpm,polyphorm-2mrs,mcpm-workbench}.ts`, registered
  as `UNFORMED_` rows in `src/data/sources.ts`; the `*_FIELD` id constants are
  module-locals in `assetWiring.ts`, not in `src/data`.
- Slots + fetchers: `src/services/loading/slots/{mcpmSlot,polyphorm2MrsSlot,mcpmWorkbenchSlot}.ts`,
  `src/services/loading/fetchers/{mcpmFetcher,polyphorm2MrsFetcher,mcpmWorkbenchFetcher}.ts`;
  wiring rows `assetWiring.ts:156-204`; ingest `src/services/engine/volume/uploadVolumeField.ts`
  (its ratchet row: `tests/conventions/layerImportBoundary.test.ts:94-97`).
- GPU: `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`; passes
  `frame/passes/{scalarVolumePass,volumeUpsamplePass}.ts`; liveness
  `frame/volumeLiveness.ts`; target row `renderTargets.ts:163-170`; handle rows
  `gpuHandleRegistry.ts:210-219`; `FRAME_ORDER` lines `frameSections.ts:95-99,120`;
  `engine.ts:187-188` nulls and `:516-532` the toggle filter (Q12).
- Fades: `fadeLayers.ts` `volumesMaster` `:71-76`, `volumeField` `:125-143`,
  `volumeFieldIds()` `:27-34`; `FadeId`, `VisibilityLayerKey`, `visibilityLayerRows`,
  `visibilityActionRow` members (the six hand-kept tables stay core, per the
  constellations ruling and the 6-table backlog item).
- UI: `SettingsPanel/{CosmicWebSection,VolumeFieldRow}.tsx`,
  `containers/CosmicWebSectionContainer.tsx`, `state/settings/projectVolumeFieldRows.ts`;
  no DebugPanel section exists yet.
- Volume-only shared data that stays core: `src/data/volume/{scalarFieldFormat,
  scalarFieldPalettes,volumeFieldDefaults}.ts`, `src/utils/volume/packLogTraceVoxels.ts`,
  `src/utils/clampVolumeFieldSettings.ts`; `scalarFieldFormat` has 26 importers
  including tools.
- Tools reach only `src/data/volume/*`, `src/utils/volume/*`, `src/@types/data/volume/*`,
  never `src/layers/`. `tools/mcpm-workbench/**` is self-contained.
- Cross-cutting tests to expect churn in: `tests/state/settings/makeSettingsFixture.ts`,
  `tests/visual/renderFrameSplitBaseline.test.ts`, `tests/services/engine/frame/renderFrame*.test.ts`,
  `tests/services/gpu/timing/decodeTimestampBuffer.test.ts` (pass names),
  `applySceneEffect` / `watchFadesSaga` / `runTakeover` / `watchTakeoverSaga` / `tourBody`
  (slice imports).

**Backlog items touched:** `2026-09-13-volume-field-vram-release.md` (paths updated,
stays), BACKLOG.md `:48` source-registry factory (names the volume family: rewrite to
the star remainder), `:71` liveness `undefined` guards (`volumeLiveness.ts` moves),
`:183` third copy of the reduced-res viewport formula (`scalarVolumePass.ts` moves),
`:185` producer toggle freezes overlay (gains the density pass as a reproducer, Q12).
