# Fade ownership — Intent bridge + #38 snapshot seam (Plan B)

> **Depends on** `docs/superpowers/plans/2026-06-16-fade-ownership-A-manifest-seed.md`
> (Plan A). **Execute this plan only after Plan A has landed.** Plan A creates the
> declarative manifest and seed path:
>
> - `src/services/engine/wiring/fadeLayers.ts` — the `FADE_LAYERS` table (one row per
>   fade layer) + `seedFades(state)`. Plan A fills in `key` / `expand` / `handle` /
>   `seed` on every row and absorbs `registerOverlayFades` + the four out-of-band
>   register sites (galaxy-catalog / filament / flow slots + the `volumeFieldRenderer`
>   `onFieldAdded/onFieldRemoved` callback).
> - `src/@types/animation/FadeLayer.d.ts` — the `FadeLayer<Item>` type, which **already
>   includes** the optional `intent` / `writeIntent` / `post` / `guard` fields
>   (spec §1). **This plan FILLS IN those fields on the intent rows and adds the bridge
>   — it does not redefine the type.** If Plan A has not landed yet when you read this,
>   rely on spec §1 for the exact `FadeLayer<Item>` shape.
>
> **Braid #1 already shipped (#309).** The flow re-enable guard was repointed to
> `slotReady(assetSlots.flow)`. Plan B's job on that guard is **delete-only** — it
> becomes dead weight once every handle seeds at construction (Plan A) and the bridge
> owns the flow row's `guard`.
>
> **Spec:** `docs/superpowers/specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md`
> — Plan B is the "intent bridge + #38 seam" row of its Plan-decomposition table,
> driven by spec §2 (the intent bridge), §3 (the snapshot seam), and sequencing notes
> (a) + (b). **Cite the current files — do not trust this plan's line-number cites over
> what Plan A left in the tree.**

**Feature:** Give intent→fade exactly one home. A single public bridge
`syncVisibilityFades(state, { animate, only? })` over a private per-row `applyIntent`
replaces the ~10 hand-coded `fadeTo` calls scattered across the engine setters and slot
commits. The same bridge powers the #38 `captureSettings` / `restoreSettings` /
`applyEffect` snapshot seam the #39 cinematic tour depends on. Behaviour-preserving:
every toggle still fades the same, no frame-1 flash, demand re-evaluates next frame from
restored intent (no demand changes).

**REQUIRED SUB-SKILL:** Execute this plan with `superpowers:subagent-driven-development`
— a fresh implementer subagent per task (dispatched **in the background, EDIT-ONLY: no
`npm`/`npx`**), with spec + quality reviews between tasks. The **main thread** runs
`npm test` / `npm run typecheck` and commits per green slice. Implementers **escalate
before hacking** — if the clean implementation is blocked, STOP and report rather than
work around it; **pause before reaching for the bigger change** (reuse the existing
setter signatures, the existing store actions, the existing `FadeId` kinds).

## Goal

After this plan:

- **One intent→fade home.** `syncVisibilityFades` is the sole place a settings intent
  boolean turns into a `fadeTo` / `setImmediate`. The intent rows of `FADE_LAYERS` carry
  the per-row `intent` / `writeIntent` / `post` / `guard` closures; `applyIntent` reads
  them. No setter, no slot commit, calls `fades.fadeTo` for a visibility toggle directly.
- **The bridge does fades only** — never settings writes, never React echoes. The
  setters keep their signatures, their store writes, and their echo behaviour; only the
  intent↔handle dispatch moves into the shared bridge.
- **No drive-guards remain.** The slot-commit `if (settings.X.enabled) fadeTo(1)` blocks
  dissolve into the commit calling `syncVisibilityFades(only:[key])`; the engine.ts flow
  re-enable guard (`engine.ts:~1228`) is deleted.
- **The #38 seam exists.** `SettingsSnapshot` (whole-cluster `Pick`), `captureSettings`,
  `restoreSettings`, `applyEffect` — all built on the bridge, all round-trip-tested.

## Architecture

- `applyIntent(state, row, item, { animate })` is **private** to the bridge module. It
  reads `row.intent(state.settings, item)` for the target boolean, respects
  `row.guard?(state, item)` (skip when false), issues the fade (`animate` → `fadeTo`;
  else `setImmediate`), then runs `row.post?(state, item)`. It does **not** write
  settings — `writeIntent` is the caller's job on the push path.
- `syncVisibilityFades(state, { animate, only? })` is the single public bridge. It
  iterates the **intent subset** of `FADE_LAYERS` (rows that carry an `intent` closure),
  filtered by `only` when present, expands each row, and calls `applyIntent` per item.
  On the `animate: false` path it issues **one** `scheduler.requestRender()` after the
  whole batch (`setImmediate` deliberately does not wake — `fadeRegistry.ts:14`,
  `:109`); on the `animate: true` path it issues none (`fadeTo` owns the wake —
  `fadeRegistry.ts:99-107`, #300).
- The intent rows are: **survey** (galaxyCatalog), **survey label** (labelLayer
  galaxyNames), **structure ring** (per StructureId), **structure label** (per
  StructureId), **volume field** (per VolumeFieldId), **volumesMaster**, **filaments**,
  **milkyWay disk**, **milkyWay label**, **flow**. The always-on / reused-by-producer
  rows (proceduralDisks, texturedDisks, scaleBar) carry **no** `intent` — registration
  only (spec §"The two overlapping sets").
- `post` carries the per-row side effect the old setter ran after its fade:
  `deriveSourceMasks(state)` for the survey row (`setSourceVisible.ts:63`),
  `maybeLazyLoadDebugVolume(fieldId)` for the volume-field row
  (`engine.ts:918`, `:946`). `guard` carries the flow "only fade once loaded" check
  (`slotReady(state.assetSlots.flow)` — `engine.ts:1230`).
- The **three caller shapes** all route through the bridge:
  - **Checkbox toggle (push):** `writeIntent` (or the existing store action) writes the
    boolean → `syncVisibilityFades(state, { animate: true, only: [key] })` → React echo
    (unchanged — the store write itself notifies React's selector subscriber).
  - **Tour restore (pull):** deep-assign the snapshot clusters → `syncVisibilityFades(
    state, { animate })` over all intent rows.
  - **Slot-commit first-load fade-in:** after `upload`, the commit calls
    `syncVisibilityFades(state, { animate: true, only: [key] })`. This dissolves the
    hand-coded `if (settings.X.enabled) fadeTo(1)` in each slot **and** the engine.ts
    flow drive-guard.
- The #38 seam: `SettingsSnapshot = Readonly<Pick<EngineSettingsState,
  'galaxyCatalogs' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow'>>`
  (one type per file — `src/@types/engine/settings/SettingsSnapshot.d.ts`).
  `captureSettings` = `structuredClone` of those six clusters; `restoreSettings` /
  `applyEffect` = deep-assign back + bridge.

## Tech stack

TS + Vitest. No new runtime deps. `structuredClone` is the platform built-in (no polyfill
needed — used elsewhere in the engine). The fade registry core is untouched (spec §5).

## Conventions (skymap — these override defaults)

- `type` aliases, never `interface`. **One type per file in `@types/`** —
  `SettingsSnapshot.d.ts` holds exactly one type. **One function per file in `utils/`**
  (filename = export name). Didactic comments (explain _why_ + the alternative). Prefer
  immutability / `readonly`; the snapshot is `Readonly<…>`. Use `Vec2`/`Vec3`, never raw
  tuples. No `sed`/`awk`/`grep` via Bash — use Read/Grep tools. Typed `vi.fn<…>()` in
  fixtures, never bare `vi.fn()`. Deep relative imports, no barrels.

---

## Task 0 — Pre-flight baseline

**Files:** none (read-only).

- [x] Confirm Plan A has landed: `src/services/engine/wiring/fadeLayers.ts` exists with
  `FADE_LAYERS` + `seedFades`, and `src/@types/animation/FadeLayer.d.ts` declares the
  optional `intent`/`writeIntent`/`post`/`guard` fields. **If not, STOP and report.**
- [x] `npm run typecheck` + `npm test` → green. Record the test/file counts in the
  commit message of Task 1 as the baseline (per the house "note counts" rule).
- [x] Read the current intent sites so cites are accurate (Plan A may have moved them):
  `setSourceVisible.ts`, `setStructureItemEnabled.ts`, `setStructureLabelEnabled.ts`,
  `setMilkyWayLabelEnabled.ts`, `setGalaxyCatalogLabelEnabled.ts`, the `engine.ts`
  `setVolumesEnabled` / `setVolumeFieldEnabled` / `milkyWay.setEnabled` /
  `filaments.setEnabled` / `flow.set` setters, and the three slot commits
  (`filamentSlot.ts`, `flowFieldSlot.ts`, `galaxyCatalogSourceRegistry.ts`).

---

## Task 1 — Fill in the intent-row closures on `FADE_LAYERS`

Fill `intent` / `writeIntent` / `post` / `guard` on the intent subset of the manifest.
This is **data**, not prose: each closure is the per-row translation the spec §1 table
prescribes. No bridge yet — this task just makes the rows self-describing and tested.

**Files:** `src/services/engine/wiring/fadeLayers.ts` (modify),
`tests/services/engine/wiring/fadeLayers.test.ts` (modify/create).

**Row closures** (read intent from `settings`, write via the existing store-action
pattern):

| Row key | `intent(settings, item)` reads | `writeIntent` writes (existing action) | `post(state, item)` | `guard(state, item)` |
|---|---|---|---|---|
| survey | `galaxyCatalogs.items[id].enabled` | `setGalaxyCatalogVisibleAction` | `deriveSourceMasks(state)` | — |
| survey label | **singleton** — famous catalog's `labelEnabled` (single `galaxyNames` handle, NOT per-`id`) | the existing famous-label setter | — | — |
| structure ring | `structures.items[cat].enabled` | `setStructureItemEnabledAction` | — | — |
| structure label | `structures.items[cat].labelEnabled` | `setStructureLabelEnabledAction` | — | — |
| volume field | `volumes.items[id]?.enabled` | `writeVolumeFieldAction(…, { enabled })` | `maybeLazyLoadDebugVolume(id)` (enable only) | — |
| volumesMaster | `volumes.enabled` | `setVolumesEnabledAction` | — | — |
| filaments | `filaments.enabled` | `setFilamentsEnabled` boring-setter | — | — |
| milkyWay disk | `milkyWay.enabled` | `setMilkyWayEnabled` boring-setter | — | — |
| milkyWay label | `milkyWay.labelEnabled` | `setMilkyWayLabelEnabledAction` | — | — |
| flow | `flow.enabled` | `setFlowAction(…, { enabled })` | — | `slotReady(state.assetSlots.flow)` |

- [x] Test `every intent row exposes intent + writeIntent`: assert the intent subset
  (the ten keys above) all have `typeof row.intent === 'function'` and
  `typeof row.writeIntent === 'function'`; assert the registration-only rows
  (proceduralDisks, texturedDisks, scaleBar) have `row.intent === undefined`.
- [x] Test `survey row intent reads galaxyCatalogs.items[id].enabled`: build a stub
  settings with `sdss.enabled = false`, assert `surveyRow.intent(settings, 'sdss')` is
  `false`; flip to `true`, assert `true`.
- [x] Test `volume-field row post lazy-loads debug volumes on enable only`: assert
  `post` is wired to `maybeLazyLoadDebugVolume` (spy / behavioural — see existing
  `maybeLazyLoadDebugVolume` idempotence at `engine.ts:918`).
- [x] Test `flow row guard gates on slotReady`: assert `flowRow.guard(state)` is `false`
  for an `idle` flow slot and `true` for a `ready` one (reuse the `slotReady` predicate
  — `src/services/loading/slotReady.ts`).
- [x] Test `survey row post recomputes masks`: assert `post` triggers
  `deriveSourceMasks` (the survey toggle's mask recompute — `setSourceVisible.ts:63`).
- [x] `npm test -- fadeLayers` green. Commit.

> **Task 1 deviations:** (a) `writeIntent` is a React-silent direct settings-leaf write
> (the FadeLayer signature takes `EngineSettingsState`, not the store) — the
> store-notifying writes stay in the push setters; the plan table's "existing action"
> column describes what the *push setters* still call, not what `writeIntent` does.
> (b) `maybeLazyLoadDebugVolume` was an inline `createEngine` closure (not importable), so
> it was extracted verbatim to `src/services/engine/volume/maybeLazyLoadDebugVolume.ts`
> (move-the-call, behaviour unchanged). (c) `surveyLabel`'s `seed` was changed `() => 1`
> → settings-derived to match its new `intent` (the approved cross-plan seam decision).

**Note for the implementer:** `post` and `guard` capture engine behaviour that today
lives _in the setter body_. Move the **call**, not a reimplementation — `post` should
invoke the existing `deriveSourceMasks` / `maybeLazyLoadDebugVolume`, `guard` the
existing `slotReady`. If a row's `post`/`guard` can't be expressed as a call to an
existing helper, **STOP and report** — do not inline a new variant.

**⚠️ `surveyLabel` is the cross-plan open seam — resolve it FIRST (see Plan A's top
note).** The famous-galaxy label is the only catalog that renders a label, its
show/hide is **producer-driven** today (`setFamousLabelsVisible` / the label
director), and the `galaxyNames` handle seeds at `1` because the labels consume its
opacity directly. Before adding `surveyLabel`'s `intent`/`writeIntent`, read that
toggle path and confirm whether the bridge should own this fade at all — or whether
`galaxyNames` stays **registration-only** (no `intent` row). If registration-only,
omit `surveyLabel` from this table and from the bridge's intent subset (and from
Plan A's `VisibilityLayerKey`). **STOP and report rather than guess.**

---

## Task 2 — `applyIntent` (private per-row op)

**Files:** `src/services/engine/wiring/syncVisibilityFades.ts` (create — the bridge
module; `applyIntent` is module-private, not exported),
`tests/services/engine/wiring/syncVisibilityFades.test.ts` (create).

**Signature (private):**
```ts
applyIntent(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots'>,
  row: FadeLayer<Item>,
  item: Item,
  opts: { animate: boolean },
): void
```

**Behaviour:** if `row.guard?.(state, item) === false` → return (no fade, no post).
Read `target = row.intent!(state.settings, item) ? 1 : 0`. `animate` →
`fades.fadeTo(row.handle(item), target, <dir-derived dur>)`; else
`fades.setImmediate(row.handle(item), target)`. Then `row.post?.(state, item)`. Never
writes settings; never calls `requestRender` (the batch wake is the public bridge's job).

- [x] Test `applyIntent animate fades to intent target`: stub a fades registry
  (typed `vi.fn<…>()`), assert `fadeTo` called with `row.handle(item)` and `1` when
  intent is true, `0` when false.
- [x] Test `applyIntent non-animate uses setImmediate, never fadeTo`: assert
  `setImmediate` called, `fadeTo` not called.
- [x] Test `applyIntent skips guarded-off rows entirely`: with `guard → false`, assert
  neither `fadeTo`/`setImmediate` nor `post` ran.
- [x] Test `applyIntent runs post after the fade`: assert `post` invoked with
  `(state, item)`.
- [x] Test `applyIntent never writes settings`: drive a row whose `writeIntent` is a spy,
  assert it's not called by `applyIntent`.
- [x] `npm test -- syncVisibilityFades` green. Commit.

> **Task 2 note:** `applyIntent`'s state Pick widened to
> `'settings' | 'subsystems' | 'assetSlots' | 'sources'` (survey `post` →
> `deriveSourceMasks` reads `sources`). `FadeLayer.post`/`guard` take the full
> `EngineState`, so the narrow state is cast at those two call sites (applyIntent only
> ever feeds them the clusters they read). Exposed as `applyIntentForTest`.

---

## Task 3 — `syncVisibilityFades` (public bridge)

**Files:** `src/services/engine/wiring/syncVisibilityFades.ts` (modify — export the
bridge), `tests/services/engine/wiring/syncVisibilityFades.test.ts` (modify).

**Signature (public — pin exactly from spec §2):**
```ts
syncVisibilityFades(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots'>,
  opts: { animate: boolean; only?: readonly VisibilityLayerKey[] },
): void
```
(`VisibilityLayerKey` = `FadeLayer`'s `key` type, per Plan A. The spec's §2 sketch shows
`Pick<…'settings' | 'subsystems' | 'data'>`; use whatever `expand` actually needs — if a
row's `expand` reads `state.data` add it to the `Pick`, otherwise keep it narrow. Confirm
against the manifest rows and **STOP and report if `expand` needs a cluster not in the
spec's Pick**.)

**Behaviour:** iterate the intent subset of `FADE_LAYERS`; when `only` is present, keep
only rows whose `key ∈ only`. For each kept row, `expand(state)` and `applyIntent` per
item. On `animate: false`, after the whole batch, call `scheduler.requestRender()`
**once**. On `animate: true`, issue no extra wake. Does fades only — no settings writes,
no echoes.

- [x] Test `bridge with only filters to that row's handles`: assert `fadeTo` fired only
  for the `survey` handles when `only: ['survey']`, none for structures/volumes/etc.
- [x] Test `bridge with no only covers every intent row`: assert each intent row's
  handle saw a `fadeTo` (and the registration-only rows did not).
- [x] Test `bridge animate:false issues exactly one requestRender after the batch`:
  assert `setImmediate` called per item and `requestRender` called exactly once.
- [x] Test `bridge animate:true issues no requestRender` (fadeTo owns the wake): assert
  `requestRender` not called.
- [x] Test `bridge writes no settings and fires no echo`: drive with spied store
  actions / echo cb, assert none called.
- [x] `npm test -- syncVisibilityFades` green. Commit.

---

## Task 4 — Repoint the checkbox-toggle setters (push) onto the bridge

Each visibility setter keeps its signature, its store write (echo source), and its
no-op short-circuit. Its hand-coded `fadeTo` (and any `deriveSourceMasks` /
`maybeLazyLoadDebugVolume` it ran after) is **replaced** by
`syncVisibilityFades(state, { animate: true, only: [key] })` — the fade + the row's
`post` now flow through the bridge.

**Files (modify):** `src/services/engine/handles/setSourceVisible.ts`,
`setStructureItemEnabled.ts`, `setStructureLabelEnabled.ts`, `setMilkyWayLabelEnabled.ts`,
`setGalaxyCatalogLabelEnabled.ts`; `src/services/engine/engine.ts`
(`setVolumesEnabled` ~860, `setVolumeFieldEnabled` ~939, `milkyWay.setEnabled` ~1181,
`filaments.setEnabled` ~1196). Plus the matching `tests/services/engine/handles/*.test.ts`.

**Before/after sketch (survey setter — apply the analogous shape to each):**
```
// before (setSourceVisible.ts:50-64): write action → fadeTo({kind:'galaxyCatalog',id}) → deriveSourceMasks
// after:  write action (echo) → syncVisibilityFades(state, { animate:true, only:['survey'] })
//         (bridge fires the fade AND runs the survey row's post = deriveSourceMasks)
```

- [x] For each setter, keep the existing no-op short-circuit (e.g.
  `setSourceVisible.ts:50`) and the store write that drives the echo; **delete** the
  inline `fadeTo` and any post-fade `deriveSourceMasks`/`maybeLazyLoadDebugVolume`;
  route through `syncVisibilityFades(only:[<that row's key>])`.
- [x] Update each setter's test: assert the **bridge** is invoked with the right
  `only:[key]` (spy the bridge), the store action still fires (echo preserved), and the
  no-op path still short-circuits. The previously-asserted direct-`fadeTo` calls are
  replaced by bridge assertions.
- [x] Survey test must still assert masks are recomputed (now via the bridge's `post`),
  not dropped. — _moved: mask recompute now lives in the survey row's `post`, asserted in
  `fadeLayers.test.ts`; the mocked-bridge setter test asserts the `only:['survey']` call._
- [x] `volumes.setEnabled` test must still assert the debug-volume lazy-load happens on
  enable (now via the bridge's `post`). — _moved to `fadeLayers.test.ts` (volumeField row
  `post`); engine.ts setters are inline in `createEngine` with no direct unit test._
- [x] `npm test` + `npm run typecheck` green. Commit.

> **Task 4 split:** 4a = the 5 `handles/` setters (commit `ada2e1de`), 4b = the 4
> inline engine.ts setters (commit `be8e0271`). The handle setters widened their state
> param to the bridge's exported `ApplyIntentState`; the engine.ts setters pass the full
> `state`. `surveyLabel` maps to the famous-only `galaxyNames` handle (non-famous label
> toggles, never shown in the UI, re-fade it to its unchanged value — a harmless no-op).

**Decision baked in (spec §2):** the structure/milkyWay/galaxyCatalog-label setters
currently fade _before_ writing the store; the survey setter writes _then_ fades. The
bridge does fades only and reads `intent` from `settings`, so the **store write must
precede the bridge call** in every push setter (the bridge reads the just-written
intent). This is uniform across all setters post-Plan-B — call out any setter where
that reordering changes observable behaviour and **STOP and report**.

---

## Task 5 — Repoint the slot-commit first-load fade-ins onto the bridge

The three slot commits drop their hand-coded `if (settings.X.enabled) fadeTo(1)` and call
`syncVisibilityFades(state, { animate: true, only: [key] })` instead. The flow row's
`guard` (in the manifest) supplies the "only fade once loaded" check the commit used to
inline — but the commit runs _after_ `upload`, so `slotReady` is about to be true; the
guard still correctly gates the toggle path. (Sequencing note (a): the commit now depends
on the manifest, which is constructed before any commit fires — safe.)

**Files (modify):** `src/services/loading/slots/filamentSlot.ts` (~51),
`src/services/loading/slots/flowFieldSlot.ts` (~54),
`src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` (commit ~195). Plus their
slot tests.

- [x] **filamentSlot:** replace `filamentSlot.ts:50-52` (`if (enabled) fadeTo(filament,1)`)
  with the bridge `only:['filaments']` call after `upload`.
- [x] **flowFieldSlot:** replace `flowFieldSlot.ts:53-55` with `only:['flow']`.
- [ ] **galaxyCatalogSourceRegistry:** the commit's fade-in (`:195`) is currently
  **unconditional** (`void fades.fadeTo(id, 1)`) — it does NOT gate on
  `galaxyCatalogs.items[id].enabled` because a survey only loads when visible
  (`reevaluateDemand`). Routing through `only:['survey']` makes the fade-in **intent-
  gated**. Verify this is behaviour-preserving (a load implies the survey is enabled);
  the tier-swap fade-OUT (`:181`) stays as-is (it's a producer-driven mid-commit fade,
  not an intent toggle). **If intent-gating the fade-in would suppress a legitimate
  fade-in, STOP and report** rather than special-casing.
- [x] Update each slot test: assert the commit invokes the bridge with the right
  `only:[key]` after upload (replacing the direct-`fadeTo` assertion); the tier-swap
  fade-out assertion in the galaxy-catalog test is unchanged.
- [x] `npm test` + `npm run typecheck` green. Commit.

> **Task 5 — flow guard fixed at the root (deviation from the plan's slotReady framing).**
> The plan assumed `slotReady` is true during the commit; it is NOT — `AssetSlot`
> dispatches `'ready'` only AFTER `commit` returns, so during the commit the slot is
> `'committing'` and `slotReady` is false, which would have suppressed flow's first-load
> fade-in. Rather than special-case flow (a guard-skip flag or leaving its commit a direct
> fade), the asymmetry was dissolved: the flow row's guard now reads the renderer's own
> `flowFieldRenderer.fieldLoaded()` (the `hasField` flag the pass already gates on) instead
> of the slot-lifecycle proxy. It is true at commit time and correctly gates the toggle, so
> all three slot commits call the bridge identically and flow stops being special. Also
> fixes a latent toggle-while-fetching drop. `ApplyIntentState` gained `'gpu'` (the guard
> reads it). This makes Task 6 cleaner — the engine.ts guard deletion now leans on a
> correct manifest guard.

---

## Task 6 — Delete the flow drive-guard in `engine.ts`

Braid #1 (#309) already repointed this guard to `slotReady`; the manifest's flow `guard`
+ the commit's bridge call now own that logic, so the engine.ts block is dead weight.

**Files (modify):** `src/services/engine/engine.ts` (`flow.set` ~1206-1243),
`tests/…` flow-handle test.

**Before/after sketch:**
```
// before (engine.ts:1219-1237): if (patch.enabled !== undefined) { reevaluateDemand(state);
//   if (slotReady(assetSlots.flow)) fadeTo({kind:'flow'}, patch.enabled?1:0) }
// after:  if (patch.enabled !== undefined) { reevaluateDemand(state);
//   syncVisibilityFades(state, { animate:true, only:['flow'] }) }
//   (the manifest's flow guard = slotReady gates the fade; first-enable fade-in is owned
//    by the slot commit per Task 5; re-enable + fade-out flow through the bridge here)
```

- [x] Replace the `slotReady(...) { fadeTo(...) }` block with the bridge `only:['flow']`
  call. Keep `reevaluateDemand(state)` (it triggers the first-enable lazy-load) and the
  `requestRender` / `maybeReseed` side effects.
- [x] Confirm `slotReady` import in `engine.ts` is now unused there (it lives in the
  manifest guard) and remove it if so. — _removed; also removed now-unused
  `FADE_OUT_DURATION_MS` (`FADE_IN` stays for `addVolumeField`)._
- [x] Flow test: re-enable on a ready slot still fades in; toggle on an idle slot (cube
  not resident) fires no fade (guard skips) but still `reevaluateDemand`s to lazy-load.
  — _now gated by the manifest's `fieldLoaded()` guard, not `slotReady`._
- [x] `npm test` + `npm run typecheck` green. Commit.

---

## Task 7 — `SettingsSnapshot` type + `captureSettings`

**Files:** `src/@types/engine/settings/SettingsSnapshot.d.ts` (create — one type),
`src/services/engine/wiring/captureSettings.ts` (create — one function),
`tests/services/engine/wiring/captureSettings.test.ts` (create).

**Type (pin exactly from spec §3):**
```ts
export type SettingsSnapshot = Readonly<
  Pick<EngineSettingsState,
    'galaxyCatalogs' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow'>
>;
```
(The six clusters confirmed against `EngineSettingsState.d.ts` — NOT `surveys`; the
catalog cluster is `galaxyCatalogs`. `tonemap`/`camera`/`bias`/`thumbnails`/`debug` are
**excluded** per spec scope guards.)

**Signature:** `captureSettings(state: Pick<EngineState, 'settings'>): SettingsSnapshot`
**Behaviour:** `structuredClone` of the six clusters into a detached snapshot (whole
clusters so look-knobs ride along; zero translation layer).

- [x] Test `captureSettings clones the six clusters`: assert the returned snapshot has
  exactly the six keys and deep-equals the source clusters.
- [x] Test `captureSettings is detached`: mutate `state.settings.flow.enabled` after
  capture, assert the snapshot is unchanged (structuredClone, not a reference).
- [x] `npm test -- captureSettings` + `npm run typecheck` green. Commit.

---

## Task 8 — `restoreSettings` + `applyEffect`

**Files:** `src/services/engine/wiring/restoreSettings.ts` (create — one function),
`src/services/engine/wiring/applyEffect.ts` (create — one function), matching tests.

**Signatures (pin exactly from spec §3):**
```ts
restoreSettings(
  state: EngineState,
  snapshot: SettingsSnapshot,
  opts: { animate: boolean },
  cb?: () => void,
): void

applyEffect(
  state: EngineState,
  patch: Partial<SettingsSnapshot>,
  opts: { animate: boolean },
): void
```

**Behaviour:**
- `restoreSettings`: deep-assign the snapshot's six clusters back into
  `state.settings`, then `syncVisibilityFades(state, { animate })` over **all** intent
  rows; call `cb?.()` (the optional React echo) after. Demand re-evaluates next frame
  from the restored intent (spec: no demand changes here).
- `applyEffect`: deep-assign `patch`, then `syncVisibilityFades(state, { animate, only:
  <keys touched by the patch> })`. Map touched cluster → affected row keys (e.g. a
  `structures` patch → the structure ring + structure label rows). Keep that mapping in
  the manifest's vocabulary, not a bespoke translation table — **if a clean
  cluster→rows derivation isn't available, STOP and report** rather than hardcoding.

- [x] Test `restoreSettings deep-assigns clusters then syncs all rows`: spy the bridge,
  assert called with `{ animate }` and no `only`; assert `state.settings.flow` now
  equals the snapshot's.
- [x] Test `restoreSettings invokes cb echo when provided`.
- [x] Test `applyEffect syncs only the touched rows`: patch `{ filaments: {...} }`,
  assert bridge called with `only` containing the filaments key and not the structure
  keys.
- [x] `npm test` + `npm run typecheck` green. Commit.

> **Task 8 deviation:** added a declarative `cluster?: keyof SettingsSnapshot` field to the
> ten intent rows so `applyEffect` derives cluster→keys FROM the manifest (no parallel
> translation table — the plan's "manifest vocabulary" requirement). Deep-assign uses six
> explicit per-cluster assignments (a `keyof`-loop typed the write target as the
> intersection of all six clusters).

---

## Task 9 — Round-trip acceptance test (spec Verification §)

The #38 acceptance criterion: capture → mutate-via-restore/applyEffect → restore-original
→ re-capture deep-equals the first snapshot.

**Files:** `tests/services/engine/wiring/settingsRoundTrip.test.ts` (create).

- [x] Test `capture → restore(mutated) → restore(original) → capture deepEquals first`:
  `const a = captureSettings(state)`; mutate via `restoreSettings`/`applyEffect` to a
  different state; `restoreSettings(state, a, { animate: false })`;
  `expect(captureSettings(state)).toEqual(a)`.
- [x] Test the `applyEffect` partial path round-trips the same way for a one-cluster
  patch.
- [x] `npm test -- settingsRoundTrip` green. Commit.

---

## Task 10 — Entanglement-radar on the diff

**Files:** none (review).

- [x] Run the `entanglement-radar` skill over the full Plan B diff. Confirm these
  invariants hold; if any fails, fix before DoD:
  - **intent→fade has exactly one home** — the bridge. No setter or slot commit calls
    `fades.fadeTo` for a visibility toggle directly. _Radar found two gaps, both
    remediated: (1) the three volume slot commits + `addVolumeField` still faded
    `{volumeField}` directly (Task 5's file list missed them) — no direct
    `fadeTo({kind:'volumeField'})` remains outside the bridge; (2) the three label
    producers (`produceFamousLabels`/`produceMilkyWayLabel`/`produceStructureLabels`)
    each carried a vestigial load-in `fadeTo(handle, 1)` ramp — producers that both READ
    `opacityOf` and WROTE the same handle. `produceFamousLabels` was a live bug (its
    load-in is gated only on `labels.length > 0`, so it could re-fire while the category
    is disabled-but-fading-out); the other two were gated no-ops. All three are now pure
    readers. Final `fadeTo` audit (rg): only `syncVisibilityFades` (the bridge), the
    galaxy-catalog tier-swap fade-OUT (explicitly inline), `structureFocusSubsystem`
    (focus, out of scope), and `fadeRegistry`/`fadeController` internals remain._
  - **the bridge does fades only** — no settings writes, no React echoes inside
    `syncVisibilityFades` / `applyIntent`. ✓
  - **no drive-guards remain** — the slot-commit `if(settings.X.enabled) fadeTo(1)`
    blocks and the engine.ts flow guard are gone; the flow guard lives in the manifest
    (now `fieldLoaded()`, not `slotReady`). ✓
  - **the snapshot is a whole-cluster `Pick`** — `SettingsSnapshot` introduces no
    bespoke per-field translation layer; capture/restore are clone + deep-assign. ✓
  - **the seed/intent rows stay data, not prose** — the manifest closures are calls to
    existing helpers, not reimplemented behaviour; no "remember-to" asymmetry comments. ✓

---

## Definition of Done

- [x] `npm run typecheck` (src + tools) green.
- [x] `npm test` green; test/file counts ≥ Task 0 baseline (now 2802 tests / 508 files).
- [x] `npm run format` on touched files only (not repo-wide).
- [x] `syncVisibilityFades` / `applyIntent` are the **sole** intent→fade path; no
  visibility setter or slot commit calls `fades.fadeTo` directly (rg-audit: only the
  bridge, the inline tier-swap fade-OUT, focus fades, and registry/controller internals
  remain — see Task 10 radar note).
- [x] The engine.ts flow drive-guard (`engine.ts:~1228`) is deleted; the unused
  `slotReady` import (if now unused) is removed.
- [x] `SettingsSnapshot.d.ts` declares exactly one type; `captureSettings`,
  `restoreSettings`, `applyEffect` each live in their own one-function file.
- [x] The round-trip acceptance test passes (Task 9).
- [x] `entanglement-radar` invariants (Task 10) all hold.
- [ ] Visual smoke (ask the user to look — dev server stays running): every toggle still
  fades; no frame-1 flash; tier swaps still fade-out→upload→fade-in; producer/focus
  fades unchanged. **Pending user — cannot self-verify the canvas.**
- [x] Behaviour-preserving: demand re-evaluates next frame from restored intent; no
  demand-path changes shipped.
- [ ] Run `/feature-done` to gate, then relocate this plan + its spec to
  `plans/completed/` + `specs/completed/`. **Held until visual smoke passes (spec STAYS
  live — Plan C pending).**
