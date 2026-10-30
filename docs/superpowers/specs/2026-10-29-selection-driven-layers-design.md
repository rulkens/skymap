# Selection-driven Layers

**Status:** design, approved shape 2026-10-29 (asks Ao51, 2rMY). Folds two backlog items:
_the selection row carries its positioner_ and _a link or search pick switches its subject's Layer on_.

**Layer-contract consent.** Three Layer-facing types change, each approved by name in ask 2rMY:
`DemandCtx.selectedKinds` (new member), `ShowEntry.selects` (new optional member) and
`LayerCoreDeps.store` → two thunks (breaking). Nothing else on the Layer contract may change; an
implementer who finds they need more stops and reports.

## Intent

You select or link something, say a satellite. The camera flies to it and follows it, its card and
orbit trail show, its data loads, and its Layer switches on. Today each of those works through a
copy of the selection that the satellites Layer keeps for itself, and the last one doesn't work at
all: a cold `#focus=satellite-25544` with Satellites off (the default) waits 30 s under the loading
veil, with no UI reachable, and lands on Earth.

The principle: **the selection refs are the only state.** Everything about a selected object is
derived from `(ref, simDays)` by the kind row that owns it, and what a Layer needs to know about
the selection it reads from core, never from a store subscription of its own.

## Goals

- Core places a moving selection (a satellite) in the frame's body snapshot itself; no Layer writes
  a global position registry.
- The satellites Layer learns "a satellite is selected" from core (demand) and "which ones" from
  `PassState` (the trail pass). `createSelectedSatellites` and `LayerCoreDeps.store` go.
- Selecting or focusing a subject whose section switch is off turns it on, for every kind whose
  visibility entry declares it. Links, search and the remote count; tours set visibility through
  their own cues; hover never does.
- A cold satellite deep link loads the catalog and arrives.

## Non-goals

- Per-item reveal: a debris link with Debris off, a planet, a structure category. Six of the ten
  selection kinds sit behind per-item switches only (blackHole, body, craft, galaxyCatalog,
  structure; earthScene has no visibility entry). They keep today's behaviour. Open below.
- The arrival timer. It stays 30 s; failing on the owning asset's `error` instead is an adjacent
  finding (backlog).
- Persisting a reveal. Layer settings aren't persisted (`persistedValues.ts` holds only the splash
  and camera controls), so a reveal lasts the session.

## Anti-goals

- No `SelectionKindRow` member (ruled for the reveal; also not needed for position).
- No function in the Redux store: `selectionRows` lives there (`engine.ts:128` is a getter onto it).
- No second module-global mirror of the selection anywhere.

## Design

### 1. The frame snapshot places the moving selection

`deriveBodyStates(simDays)` stays pure over time and loses step 1e (the `transientPositions` loop,
`deriveBodyStates.ts:122-127`) and the registry version in its memo key (`:57-62`).

A new core helper, `placeLiveSelection` (name the builder's call), takes the snapshot
`deriveBodyStates(simDays)` returns, the two selection refs (select, focus; never hover), the
composed kind rows (`state.selectionKindRows`) and `simDays`. For each ref whose current row's
`driver.followsSimClock` is set, it calls that kind row's `extractRow(ref, simDays)` and, when it
returns a row, adds `driver.poseId → BodyState` to a copy of the snapshot: `positionMpc` from the
row, `orientation` from `orientationForBody(poseId, simDays, positions)` exactly as phase 2 gives a
transient id today (`deriveBodyStates.ts:130-137`), `orbit` undefined. Bodies never set
`followsSimClock`, so with no moving selection the snapshot passes through unchanged: the same Map
object.

`followsSimClock` keeps its field and gains its exact meaning: _core re-extracts this row every
frame to place it_. Every `poseId` reader stays as it is (7 code lines: `bodyMovesThisFrame.ts:13`,
`stepCameraRuntime.ts:136`, `liveBodyPosition.ts:21` with its 5 callers, `cameraDrivers.ts:113`,
`approachTiltedPose.ts:44,48`, `runFrame.ts:209`): the satellite is in the snapshot under its
`poseId` exactly as today.

**Placed once per frame, at `runFrame.ts:91`**, the snapshot the camera step already takes. That
one placed Map is handed to `deriveFrameContext` in place of its own `deriveBodyStates(simDays)`
(`frameContext.ts:53`), and `sceneBodyStates` returns the frame context's map instead of calling
`deriveBodyStates` itself, so `PassState` gains nothing and its ~40 per-view callers cost nothing
new. One `extractRow` per moving select/focus ref per frame.

**Identity.** Two caption producers cache on "the same Map while `simDays` is unchanged"
(`produceStarCaptions.ts:32-42`, `produceSceneBodyCaptions`' `baseLabelsFor`). With no moving
selection that still holds (pass-through). With a satellite focused the placed map is new each
frame, so those caches recompute per frame, as they already do whenever the clock runs. A paused
clock with a satellite focused is the one case that gets slower; the perf run below measures it.

The remaining direct `deriveBodyStates(` callers (Layers' Earth reads, clips, asset rows,
`liveFocusRow`) don't need the selection and keep calling it directly.

**Landmine (recursion).** The satellites row's `extractRow` itself calls
`deriveBodyStates(simDays)` for Earth (`satellitesSelectionRow.ts:52`). Placement therefore sits
after `deriveBodyStates` returns, never inside it; inside, the memo isn't written yet and the call
would recurse.

**Cost.** One `extractRow` per moving select/focus ref per frame. The satellites row builds a
satrec per call (`satellitePositionMpc` → `satrecOf`); give the Layer a one-entry memo keyed by
`(catalog, k)` if the perf run shows it. Expected well under 0.1 ms per frame.

### 2. The trail pass reads the selection from `PassState`

`satelliteOrbitsPass` reads `state.selection.select` and `.focus` (`PassState` already picks
`selection`), keeps the `satellite` refs, and looks each up in its own catalog (`catalogIndexOf`,
`satrecOf`). `SelectedSatellites.tracked()` and `TrackedSatellite` go.

### 3. Demand reads `DemandCtx.selectedKinds`

`DemandCtx` gains `selectedKinds: ReadonlySet<SelectionRef['type']>`: the kinds in the select and
focus slots, never hover. `buildDemandCtx` (`buildDemandCtx.ts:15`, the one construction site)
fills it from the store's selection. The satellites asset row's two `runtime.selected.any()` reads
(`satellitesAssetRows.ts:40,45`) become `ctx.selectedKinds.has('satellite')`. Core's selection
wake (`watchSelectionWakeSaga.ts:38`) already re-runs demand on select and focus changes.

With 1–3 in place `createSelectedSatellites`, `SelectedSatellites`, `transientPositions`,
`TransientPositioner` (its only producer is `satellitePositionMpc`, which the row keeps as a plain
function) and the Layer's store subscription go. `LayerCoreDeps.store` becomes two thunks for its
two remaining lazy readers, `settings()` (`starCatalog/create.ts:95`) and `debugPanelOpen()`
(`body/create.ts:95`): re-apply #965's reverted commit `efe978552`.

### 4. The reveal: `ShowEntry.selects`

`ShowEntry` gains `readonly selects?: readonly SelectionRef['type'][]`, the selection kinds that
entry's switch hides, beside its existing `bodies` declaration (`ShowEntry.d.ts:9`). Four entries
declare it today, the ones with a section switch:

| Layer | entry | kind |
| --- | --- | --- |
| satellites | `satellites` | `satellite` |
| starCatalog | `starCatalog` (cluster `starCatalogs`, not `sStarTrails`) | `starCatalog` |
| milkyWay | `milkyWayDisk` (cluster `milkyWay`) | `milkyWay` |
| zoneOfAvoidance | `zoneOfAvoidance` | `zoneOfAvoidance` |

A boot check asserts each kind is named by at most one entry, beside `assertSelectionRowsDisjoint`.

A core saga, `watchSelectionRevealSaga`, runs on `updateSelectionSelect` and `updateSelectionFocus`
only (so hover can never reach it), wrapped in `suspendDuringClip`
(`src/state/selection/suspendDuringClip.ts`): a tour's visibility belongs to its cues, applied
through `setVisibilityActionsFor` so the tour fold and playback agree, and a reveal written behind
the fold's back would survive a seek back. A tour that focuses a hidden kind carries its own `show`
cue. Links, search and the remote reveal. For the new ref's kind it finds the entry that `selects` it
in `APP_VISIBILITY`. If that entry's cluster has a section switch (`hasSectionSwitch`) and the
switch is off, it puts `setVisibilityActionsFor(settings, entry.key, true)`. Only the section switch
is written: on a per-item cluster, `setVisibilityActionsFor` with a bare key would turn every item
on, which is never what a link means.

**Cold deep link, in order.** The hash read puts `arrivalPending`. The arrival saga's
`navigateSaga` puts `requestFocus`, and the satellite id decodes by prefix with no catalog
(`satellitesSelectionRow.ts:76`), so `updateSelectionFocus` lands with the ref. The reveal saga
switches Satellites on. The selection wake re-runs demand, which holds (`selectedKinds` has
`satellite`, a class is shown), and the catalog loads. `watchSelectionRowsSaga`'s gap-fill
re-extracts the row on `engineSourceCountReported`, `frameFocusSaga` sees a row, and the camera
arrives, well inside the 30 s race.

## Ground preparation

Refactor-ground ran 2026-10-29: a counted call graph plus a fresh greenfield cross-check, page
`ground-selection-driven.html`, signed off in ask 2rMY. Verdicts:

| Touchpoint | Today | Verdict |
| --- | --- | --- |
| Live position | satellites writes a module-global registry from a store subscription | bolt-on → prep 1 |
| Trail pass's selection | reads the Layer's mirror (`tracked()`) | bolt-on → prep 2 |
| Catalog demand | reads the mirror (`any()`) | bolt-on → prep 3 |
| `LayerCoreDeps.store` | kept alive by that one subscriber | goes in prep 3 |
| Reveal | no seam maps a kind to its switch | growth: `ShowEntry.selects` + one saga |

**Prep, one commit each, before the feature; prep 1–3 ride one PR, the reveal its own PR:**

1. Core places the moving selection (§1); `transientPositions` and step 1e go.
2. The trail pass reads `PassState.selection` (§2).
3. Demand reads `selectedKinds`; the mirror and `LayerCoreDeps.store` go (§3).

**Greenfield cross-check.** It agreed on the kind→owner map from composition, the select/focus-only
trigger and keeping non-serializable state out of the store. It proposed a cached
`positionAt(t)` closure per resolved ref; that was priced against re-extraction (shape B below) and
re-extraction won: no new member, and a reloaded catalog is read automatically instead of by cache
invalidation. It also proposed failing the arrival on the asset's `error` rather than a timer
(adjacent, backlogged).

**Rejected shapes.**
- B, `SelectionKindRow.positionerOf?(ref)` replacing `followsSimClock`, core as the registry's only
  writer: smallest diff (no snapshot builder touched), but keeps a module-global mirror and adds a
  member.
- The backlog's `DriverGeometry.position`: a function in Redux.
- `DemandCtx.ownsSelection: boolean`: the ctx is built once per pass for every row, so a per-Layer
  flag needs a ctx per Layer and an asset-row→Layer map.
- Revealing the owning Layer's section switch: ambiguous for starCatalog (two section switches), and
  core loses Layer ownership at `createLayers.ts:215` anyway.

## Tests (what can break)

- `placeLiveSelection`: a followsSimClock focus row lands under its `poseId` at the frame's
  `simDays`; a body row leaves the snapshot identical (same object); hover is ignored; a ref whose
  `extractRow` returns null is left out. Port `transientFollow.test.ts` (camera follows a moving
  transient) onto it rather than deleting it.
- The cold-link arrival: a saga test, Satellites off, `#focus=satellite-25544` → `setVisibility`
  on → catalog demand → arrived. Written failing first.
- The reveal saga: never on hover; never during a clip; nothing when the switch is already on; a
  per-item-only cluster writes nothing.
- `selectedKinds`: hover excluded.

## Verification

- Eye-checks, before/after against main, each with a deep link: cold `#focus=satellite-25544`
  (main: 30 s veil then Earth; branch: arrives), the ISS trail and follow at 1 h/s unchanged.
- `npm run perf:cpu` at an Earth pose with the ISS focused, before and after, clock running and
  paused (the paused case is the one the caption caches feel).

## Open (not ruled)

- Per-item reveal for the six item-only kinds: needs a ref → item mapping (a planet ref → its
  `bodies` item). A later step on the same seam, e.g. `selects` per item.
- Whether a reveal should also clear when the selection lets go (today: no; the switch stays on).
