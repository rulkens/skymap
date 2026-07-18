---
name: tour
description: Author or tune a beat of the grand tour ("The Long Way Out"). Use when the user types `/tour`, asks to add/implement the next tour beat, tune a beat's choreography or pacing, or work on anything under docs/tour/. Front-loads the file map, authoring vocabulary pointers, and the add-a-beat checklist so a fresh or post-compaction session starts immediately.
---

# `/tour` — grand-tour beat authoring

The grand tour is a narrated powers-of-ten journey (Milky Way → edge of the
observable universe → home), built **beat-by-beat in an interactive
live-tuning loop**: author a beat, the user visually verifies it in the clip
debugger, tune, commit. NOT plan-driven subagent execution — work inline,
one beat at a time, and never start the next beat unprompted; each lands
after the user's visual pass.

Branch: `grand-tour`, draft PR #400. Full suite must stay green.

## Read these first (in this order)

1. `docs/tour/implementation-notes.md` — the running log of gotchas +
   conventions discovered while building. Newest first. **The single most
   valuable file after compaction.**
2. `docs/tour/stages/NN-<slug>.md` — the stage doc for the beat being
   authored (intent, camera, narration, on-screen state). The sibling
   `.facts.md` holds optional "did you know" candidates — usually not needed.
3. `docs/animation/clip-primitives.md` — the full primitive reference
   (flyPath knobs, passBy, spline config, per-waypoint opts).
4. Memory `project_grand_tour.md` — which beats exist, what's pending.

## File map

| What                                                       | Where                                             |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Storyboard (beat order, captions, dwellClips)              | `src/data/animation/tours/grandTour.ts`           |
| One choreography per beat                                  | `src/data/animation/tours/grandTour/<beat>.ts`    |
| Debugger clip wrappers (ids `tour*`)                       | `src/data/animation/clips/grandTourBeats.ts`      |
| Clip id union (append-only)                                | `src/@types/animation/ClipId.ts`                  |
| Clip registry                                              | `src/data/animation/clips/clipRegistry.ts`        |
| Registry key-freeze test                                   | `tests/data/animation/clips/clipRegistry.test.ts` |
| Authoring vocabulary (all helpers)                         | `src/services/engine/animation/effectHelpers.ts`  |
| Default dwell (`dwellDrift(sec, { rampSec, cruiseRate })`) | `src/state/tour/dwellDrift.ts`                    |
| Scene cues union (`SettingsAction`)                        | grep `SettingsAction` in `src/@types/animation/`  |
| Tour script + stage docs                                   | `docs/tour/script.md`, `docs/tour/stages/`        |

Focus ids: structures are `${category}-${seedId}` (`cluster-virgo-m87`,
`group-m81-group`, `void-bootes-void`); famous galaxies are bare (`m31`,
`m87`); the Milky Way is `milkyWay` (resolves with no catalog loaded).
Scoped visibility: `'survey:<catalogId>'`, `'structureRing:<category>'`,
`'label:milkyWay'|'label:survey'|'label:structure'|'label:<category>'`.

## flyPath plumbing chains

`clip-primitives.md` documents what each knob _does_; this maps the seams a knob
_passes through_, so tuning or adding one you know every file to touch. Two chains,
because a knob is authored on the clip and separately exposed as an inspector
override (A/B live-tuning before it's baked as a default).

**The plumbing chain for a new flyPath knob** (author → runtime path):

1. `pathDefaults.ts` — the `DEFAULT_*` constant (e.g. `DEFAULT_LINGER`,
   `DEFAULT_SPLINE_CONFIG`, `DEFAULT_PASS_BY_OFFSET`). flyPath stamps these when the
   node authors nothing, so both clips inherit the tuned-by-eye default.
2. `src/@types/animation/Effect.d.ts` — the `kind: 'flyPath'` node type carries the
   knob's field.
3. `effectHelpers.ts` — the `flyPath(...)` authoring helper reads the opt and stamps
   the default onto each waypoint.
4. `resolveClipFoci.ts` — carry-through: the knob rides the resolved foci from
   `id`-form to `at`-form.
5. `compileClip.ts` — passes the value into `buildPathTrack.ts` (the flythrough
   builder; `sample(localSec)` closure), which does the geometry.
6. `applyPathTuning.ts` — the optional per-clip override merge.

**The inspector chain** (live A/B override, defaults to no-op):

1. `src/@types/settings/EngineSettingsState.d.ts` — the `clipPathInspect` state
   (knob scalars + an `active` gate per knob).
2. `src/state/settings/selectors.ts` — reads it back out.
3. `src/state/settings/settingsSlice.ts` — the drag-to-activate setters (a setter
   flips `active.<knob> = true` as it writes the value).
4. `src/@types/settings/ClipPathTuningActive.ts` — the union of override-able knobs
   (`{align, rampSec, linger, spline}`).
5. `src/components/DebugPanel/ClipPathInspectorSection.tsx`
   (+ `ClipPathInspectorSectionContainer.tsx`) — the slider UI; sub-sliders render
   only when their parent gate is on.

## Add-a-beat checklist

1. Read the stage doc + the last few implementation-notes entries.
2. **RED**: add the new `tour*` key to the expected-keys list in
   `clipRegistry.test.ts`, run that test, watch it fail.
3. Author the choreography in a new `src/data/animation/tours/grandTour/<beat>.ts`
   (didactic module header explaining the beat's grammar and scene shifts).
4. Wire four places: storyboard beat in `grandTour.ts` (caption from the
   stage doc's narration, dwellClip), `ClipId` union, wrapper in
   `grandTourBeats.ts` (label `Grand tour NN — <name>`), registry entry.
5. `npm run typecheck` + full `npm test` (GREEN).
6. Add an implementation-notes Log entry if the beat taught something new.
7. Prettier-check the touched files only, commit on `grand-tour`
   (`feat(tour): beat NN — <name>`, user's git identity + Claude trailer,
   stage specific paths — never `git add -A`), push.
8. Report tuning points for the user's visual pass; **stop** — don't start
   the next beat.

## Load-bearing gotchas

- **Phantom LSP diagnostics**: `enterClip` not on `BeatData`,
  `setLabelsFocusedOnly` not in `SettingsAction` — stale-tsserver noise that
  recurs constantly in these files. Trust `npm run typecheck` (it has been
  clean every time). Do not chase them.
- **Captions reveal on clip LAND**, not clip start — in-clip motion is
  wordless lead-in; the dwell carries the captioned motion.
- **focusedOnly label mode is beat-scoped**: set it in every beat that
  cares (`scene(setLabelsFocusedOnly(...))`); don't inherit from the
  previous beat.
- **Scale steps swap their scene**: each beat reveals its own subject-matter
  data (`show(['survey:…'])`, ring-category swaps) and hides the previous
  scale's — the opening strip hid everything precisely so beats own their
  reveals.
- **`lookAtId`/`strafeId` bake from the live pose at resolve time** —
  opening moves only; anything that moves the target first invalidates them.
- **Single-writer rule**: one base writer per channel per `all`. Target vs
  yaw/pitch vs distance are separate channels — that's what makes
  `all([lookAtId, strafeId])` and drift+dolly dwells legal.
- **Zero-duration camera cues snap** (evaluator holds at `to`) — the
  "snap far, then approach" cold-open idiom.
- Never commit the user's untracked `docs/audits/` or `docs/powers-of-ten/`
  files; format only touched files.
