# Deletion audit: feat/clip-studio (whole branch, legacy framing, 2026-11-10)

Range `origin/main...099946a31`; auditor opus-class, read-only. Verdict: little to remove (<2% of ~10.6k added lines).

## Applied (43ef1f1a9, safe-now): 29 files, +52 −216

FieldSpec.tip + InspectorRow tip label + StudioTip `meaning`; ClipCompileErrorInfo `channel`/`message`; snapTime `snapped`;
formatDuration (inlined as `formatQuantity(sec, 's')`) + its test; defaultCollapsed on effectPaths + effectAt;
controlOwnsKey trimmed to the dock's controls; eslint state/ glob for packages/studio; tests onto compileTimeline and
openStudioStore; restatement cases (fieldControls ×2, channelFamilies legend, selectSelectedRow duplicate,
studioImportBoundary toBeDefined, zoomWindow restated bound); studioActions header.

## Needs ruling

- Engine `channel` on CompileFault / ClipCompileError + 8 throw sites (~18 src LOC, 3 assertions): no production reader;
  the plan wanted it on the top-bar error line, which doesn't use it.
- Nested `<aside>` landmarks (StudioDock "Inspector" wraps InspectorPanel "Step settings"): a11y tree change.
- `childEffects` helper to replace the seq/all/fork children ternary in effectAt, effectPaths, buildTimeline.
- `selectRevision`: only tests read it (2 src LOC vs edits in 5 test files); skipped as churn > win.

## Traps (do not remove)

`studioOpened` in REVISION_ACTIONS (saga test fixture); DOCK_HEIGHT_ROW.select dummy (PersistedValue); jsdom guards
(ResizeObserver, setPointerCapture?.); CompositeTrack.knotSecs and the last-knot re-pin; FieldSpec.readOnly (not derivable);
resolveSeqJoins path sort (pinned); StudioHost .catch + studioBodySaga try/catch; docsUrlParams studio row; packages/studio
package.json; familyGlyph `?? 'dist'`; rowKey id format; Button `aria-pressed` style; Q45 icons.

## Checked clean

Every CSS class and custom property, every `.constants.ts` entry, every export outside icons, every slice action/selector
but selectRevision, Button/Slider variants, channel tokens, row-kind fields, engine wiring (withFrozenClockSaga,
isTakeoverView, distanceRung, combineSlices, takeover sagas), comment budget (only studioActions was over among new files).
# Deletion audit 2: feat/clip-studio smoke-feedback wave (legacy framing, 2026-11-10)

Range `3988eb49d..2fa0feed0` over `packages/studio src tests` (153 files, +3042 −444; diff at the session
scratchpad `audit-2.diff`). Auditor opus-class, read-only. Fenced by `deletion-audit-branch.md` (its traps, null
results, and the childEffects / selectRevision items stay recommended-against). Mechanical moves not counted:
rowContext → rowWhere, positionPicked → objectPicked.

Verdict: **little to remove, about 14 LOC safe-now (src −10, tests −4), under 1% of the added lines.** The parallel
lanes mostly merged their duplicates as they landed: `waypointSubject` (rowSubject and buildTimeline),
`rowFace` (buildTimeline and groupMembers), `commitDraft` (paramEdited and startModeSet), `zoomedViewport`
(buttons, keys, wheel), `isPickFor` (slice and FieldRow), `timeline/data/zoom.ts` (ZOOM_FACTOR and LINE_PX
moved out of two component constants files). Every new CSS class, export, slice action and selector has a
reader; no debug code, TODOs or skipped tests.

## Safe-now (one deletion commit), net −14

| # | Where | What | LOC | Why safe |
|---|---|---|---|---|
| 1 | `packages/studio/src/kinds/utils/formatSelectionRef.ts` (whole file); `kinds/utils/object/objectText.ts:4,14` | Inline as `?? String(ref['id'] ?? ref.type)` in objectText and delete the file. Its `null → 'none'` branch is dead: objectText is now the only caller and only passes non-null refs (the sceneKinds and subjectKinds callers went in bb0e53d66 and 8f901f182/4b92a65f5) | −7 src | grep: one importer, no test file. `SelectionRefBase` index signature types `ref['id']` |
| 2 | `timeline/components/TrackLane/TrackLane.tsx:15,16`; `TimelinePane/TimelinePane.tsx:71,72` | Drop the `selected` prop. TimelinePane passes both `selected={row.id === standIn}` and `selectedId={standIn}`, so TrackLane can compute `row.id === selectedId` itself | −2 src | One caller. The TimelinePane tests cover selection |
| 3 | `tests/utils/format/formatPosition.test.ts:11-13` | Delete the "keeps every axis in the unit of the whole length" case (`[300,4,0] → Mpc`). The AU case already checks that small axes share the length's unit, and the plain Mpc output is asserted again in `readoutText.test.ts:7` and `ObjectPicker.test.tsx:82` | −4 tests | A restatement case: it cannot fail on any bug the AU case misses |
| 4 | `timeline/utils/window/zoomWindow.ts:2,15`; `timeline/utils/buildTimeline.ts:6` | Comment drift. zoomWindow still says "about the playhead" and names its param `headSec`, but the wheel now anchors it at the pointer, so rename to `anchorSec` and say "the anchor". Drop buildTimeline's "A waypoint subject carries `last`…" line, which repeats `RowSubjects` and `waypointSubject` | −1 src | Comments only |

## Needs ruling

- **On/off option lists, two copies, opposite order.** `inspector/components/FieldRow/FieldRow.constants.ts:1` `TOGGLE_OPTIONS` is
  Off, On; `SettingsActionField/SettingsActionField.constants.ts:17` `ON_OFF_OPTIONS` is On, Off. Merging them
  into one shared constant saves −4 src but swaps the order in one place (Loop toggle vs Set step Value). **Recommend:**
  merge on Off, On, matching the existing Loop toggle.
- **Look-at positions read two ways.** `kinds/data/cameraKinds.ts:59` (the lookAt label) and
  `kinds/utils/resolvedPosition.ts:6` still use `formatVec3(v, 'Mpc')`. The same step's Target field
  (`objectText` → `formatPosition`) and the zoom-pan Destination use the new `formatPosition`. A look-at at
  Mars reads `0, 0, 0 Mpc` in the outline, bar, title and Resolved line, but `1.2, −0.6, −0.3 AU` in its field. Switching
  both callers to `formatPosition` drops formatVec3's `unit` param (−2 src) and changes visible text. **Recommend:**
  yes. This is the bug formatPosition was written for (f2c63cec5), left unfixed at two call sites.

## Recommended against

- **Inlining `useObjectName`** (`session/hooks/useObjectName.ts`, 9 LOC, 2 callers) would save about 5 LOC. That
  isn't worth losing the shared hook. OutlineRow subscribes to `useObjectIndex` twice (directly and through the hook), but the
  selectors are memoised, so it costs nothing.
- **Folding `zoomWindow` into `zoomedViewport`** would save about 8 LOC but tie the window maths (pinned by its own
  test against plain windows) to the store's null-is-Fit viewport semantics, which can change independently.
- **A shared `PickRow` beside `SliderRow`** would replace the four hand-rolled "segmented or pick row with a default"
  blocks (GeodesicTuningField Ease, PassByField Side, SplineField Curve, StartModeField View) for about 10 LOC net.
  That's a new abstraction for very little gain. The spec-driven FieldRow cannot host these rows because they edit
  sub-keys of one record param, and that is the real reason the parallel `SliderRow` path exists.
- **Sharing in-place list CSS** between `LayerPickField.module.css` and `ObjectPicker.module.css` (`.root`, `.list`
  and focus ring are identical) would save about 8 LOC net through `composes`. The two components may diverge, and the
  churn costs more than the win.
- **The `pickFailed` guard** (`session/state/studioSlice.ts:87`, `isPickFor && focusId ===`): `takeLatest`
  means a failure always belongs to the current pick, so `pick !== null` would do. That saves 1 line of defensive code; leave it.

## Traps (do not remove)

- `useTimelineWheel`'s `mounted` argument: the pane returns null until the clip opens, so the effect has to re-run
  to attach once `root` exists.
- `useNoSwipeBack`, even with `useTimelineWheel` in place: at Fit nothing pans, so a sideways swipe reaches the
  browser as a back gesture (StudioDock test). `overscroll-behavior-x` cannot stop it because nothing scrolls sideways.
- `{ ...base, draft: base.draft }` at both `commitDraft` call sites: it narrows `draft` to non-null for TS.
- `sameParamValue`'s JSON compare: layer lists and settings actions are rebuilt on every edit, so `Object.is`
  would push an empty Undo (studioSlice no-op test).
- `selectSelectionStandInId` is still needed although `rowSelected` now unfolds the selection's holders: a user
  can fold an ancestor after selecting.
- `ancestorKeys` (from the ref path) next to `ancestorChains` (from rows): folded descendants are missing from
  `rows`, so the slice cannot use the rows-based one.
- Fly `fallback: 0` with `resetTo: DEFAULT_*`: buildPathTrack reads an absent ramp or linger as off, while ↺ must
  write what `flyPath()` stamps (FieldRow ↺ tests). The waypoint's function `fallback` plus `pathLinger` is how an
  unset waypoint Linger reads the Fly's value.
- `positiveSeconds` on osc `period`: the engine divides by it. OscMark's `!(periodSec > 0)` and
  resolveFrameBasis's `durationMs > 0` guard against NaN.
- `objectLabel`'s `PGC_ID` regex: `objectLabel.test` pins it against `actionForRow`'s encoded id, since no decoder
  exists in src.
- ObjectPicker's `onMouseDown` preventDefault (otherwise the input blurs and closes the list before the click lands), LayerPickField's
  disabled last checkbox (a step needs a layer), and FieldRow's `waypoints && rowRef.kind === 'effect'` (narrowing
  for `path`).
- The Popover stub in `tests/setup/reactTestEnv.ts` and the open/closed model in `StudioTip.test.tsx`: both are
  needed, because the StudioTip test models `:popover-open` and the global stub only keeps other tests from throwing.

## Checked clean

Engine `channel` removal (no leftover reader or argument at any of the 10 `CompileFault` sites); every new
`FieldSpec` member (`when`, `range`, `group`, `resetTo`, function `fallback`) and `FieldWidget` member (`items`,
`pick`, `clearable`) has a user; `TimelineRow.writes` and `background` are still read by OutlineRow; every CSS class
in the 14 touched modules; comment budget (only type files and constants files run over, which the convention
allows for field docs).
