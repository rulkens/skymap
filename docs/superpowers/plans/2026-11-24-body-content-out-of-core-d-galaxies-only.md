# Body content out of core, PR D: core runs with no bodies

> **For agentic workers:** execute with `superpowers:subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax.

**Goal:** a composition with no body rows loads, draws the survey, and stays that way: the fade
edge has a fallback, a test fails the day core names a body at load again, and the docs and an
ADR record the rule.

**Spec:** [`2026-11-24-body-content-out-of-core-design.md`](../specs/2026-11-24-body-content-out-of-core-design.md)
§7, §10. Last of the PRs; A (#1155), B (#1157), C (#1162) and the clip prep (#1164) have landed.

**Why it is safe to land alone:** the app's registries are unchanged, so every app value is the
one it has today. Only the no-rows case gains a defined value.

**Not in this PR:** committing a galaxies-only composition or the measuring kit; registry
injection; moving any renderer (spec §8).

## Global constraints

- Never stage `tools/reference-engine/`, `src/compositions/galaxiesOnly.ts`, `.payoff-dist*`,
  `src/services/engine/frame/checkFrameOrder.ts` or `src/services/engine/frame/runPlanSteps.ts`
  (the last two carry a local measuring patch; `tests/services/engine/frame/checkFrameOrder.test.ts`
  fails locally because of it and passes without it). Never `git add -A`. Do not run
  `npm run format`; run `npx prettier --write` on the files you edited.
- One commit per task, no `Co-Authored-By` line. Git as plain single commands, never `git -C`.
- Never run `build-meshes`, `build-famous-stars`, `build-data-manifest`, `build-all`.
- Moves and renames go through `npm run move-files` / `npm run refactor` (see the refactor skill).
- One constant per file in `src/data/`, filename = export. `type`, never `interface`.

## Rulings made at plan time (where the spec and the code differ)

- **The value with no rows is 0, not `-Infinity`.** `BODY_REGIONS` always has its three rows; with
  no bodies each extent is 0, so `FOREGROUND_MAX_DISTANCE_MPC` is 0 and `SURVEY_DEEP_ZOOM`'s band
  inverts (the survey fades out everywhere). The fallback triggers on a zero maximum.
- **The sky-capture row stays in core and needs no change.** Its band is a fixed 500/1000 au, not
  extent-derived, and with no Sun state its anchor distance is infinite, so it never bakes and
  never allocates. The band that does read a zero extent is `bodyGlintBackdrop`, which draws
  nothing without bodies. The spec's "zero-extent solar-system bands" bullet is corrected (Task 4).
- **Clips are already out** (#1164), so the import test covers `rootSaga` (spec §8 said clips
  were out of scope; the owner moved them first).
- **`EARTH_HOME` folds into `APP_HOME`** (owner, 2026-11-24): the app's home is stated once, in
  the composition. `EARTH_REF` stays in core; the lightTime Layer reads it.

---

### Task 1: The survey's fade edge has a value with no bodies

**Files:** `src/data/rendering/foregroundFallbackDistanceMpc.ts` (create),
`src/data/rendering/foregroundMaxDistance.ts`, `tests/data/rendering/foregroundMaxDistance.test.ts`.

**Contract:**

```ts
// src/data/rendering/foregroundFallbackDistanceMpc.ts
/** The foreground gate when no region has an extent: today's app value, so the survey's
 *  deep-zoom fade sits where it does with bodies composed. */
export const FOREGROUND_FALLBACK_DISTANCE_MPC = 0.23;

// foregroundMaxDistance.ts: the max extent × MARGIN, or the fallback when that is 0.
```

- [x] Failing tests first, in the existing test file: (a) with the app's registry the value is
      the derived one (between 0.2 and 0.6 Mpc, the two edges the header names: above the
      neighbourhood, inside the Milky Way label's near edge); (b) with `compositions/appBodies`
      mocked to no rows (`vi.doMock` + `vi.resetModules`, dynamic import) the value is
      `FOREGROUND_FALLBACK_DISTANCE_MPC` and `SURVEY_DEEP_ZOOM`'s band is not inverted.
- [x] Implement. The header's last sentence ("Both edges are pinned by this file's test") becomes
      true; add one line on the fallback and why 0.23. Stay within the comment budget.
- [x] `npm run typecheck`, the touched tests. Commit.

### Task 2: The app's home is stated in the composition

**Files:** `src/compositions/appHome.ts`, `src/data/selection/earthHome.ts` (delete); importers
`tests/layers/body/layer.selection.test.ts`, `tests/state/arrival/arrivalSaga.test.ts`,
`tests/state/selection/watchGoHomeSaga.test.ts`,
`tests/services/engine/camera/framing/homePose.test.ts`,
`tests/services/engine/phases/wireInput.test.ts`.

- [ ] `APP_HOME` is the literal (`focus: followedBodyHome(EARTH_REF)`, `seedSelection: true`).
      Repoint the five tests to `APP_HOME`; delete `earthHome.ts`. Use `refactor` where it fits.
- [ ] `git grep -n "earthHome\|EARTH_HOME"` finds nothing outside `*/completed/` history.
- [ ] `npm run typecheck`, the touched tests. Commit.

### Task 3: A test that fails when core names a body at load

**review: yes** (the guard the whole effort leaves behind)

**Files:** `tests/compositions/emptyBodyRegistry.test.ts` (create).

- [ ] The test mocks `src/compositions/appBodies` to no rows and gives the other registries that
      state body content at load a no-content stand-in (`appHome` → `{ focus: null,
      seedSelection: false }`; `appVisibility`, `appTours`, `appClips`, and any other `app*.ts`
      that throws once bodies are empty: find them by running the test, and mock only those).
      Then it imports core's entry modules (`src/services/engine` entry, `src/store/rootSaga`,
      `src/store/rootReducer`) and asserts: nothing throws, and `deriveBodyStates` at J2000
      returns only core places (`galactic-centre`).
- [ ] Prove it can fail: temporarily make one always-loaded core module read `SCENE_EARTH` at
      module scope, see the test go red, revert. Say in the report which module you used.
- [ ] If a core module (outside `src/compositions/` and `src/layers/`) still throws with the
      mocks above, **stop and report it** with the import chain: that is a finding for the
      controller, not something to mock away or patch.
- [ ] The header says what bug the test catches, in two or three lines. Commit.

### Task 4: Docs, ADR 0016, spec corrections

Runs after the controller's measurements; the numbers come in the dispatch.

**Files:** `docs/adrs/0016-body-content-rides-layer-rows.md` (create, the repo's ADR template),
`docs/RENDERER.md`, `src/layers/README.md`, `src/compositions/README.md`,
`docs/superpowers/specs/2026-11-24-body-content-out-of-core-design.md`, `docs/BACKLOG.md`.

- [ ] **ADR 0016**: the principle of spec §3 (core keeps mechanisms that run on an empty body
      list; body content is Layer body rows), the contract growth it took (`BodyPosition` `anchor`
      arm and `correction?` / `pair?`; `LayerBody.shapeModel?`; `LayerCoreDeps.meshBodies`), the
      clip registry moving to the composition, the fade-edge fallback, the guard test, the
      measured result, and what it does not do (registries are still chosen by import, spec §8).
- [ ] `docs/RENDERER.md`: the "bodies stay core" bullet near the top says what is true now.
- [ ] `src/layers/README.md`: status lines that still say core owns mesh slots or body content.
- [ ] `src/compositions/README.md`: recount `APP_BODY_REGISTRY`'s core readers with the README's
      recipe; the `APP_HOME` row no longer names `earthHome.ts`.
- [ ] Spec: correct §7's sky-capture bullet and the no-rows value (rulings above), note that
      clips moved first (#1164), and fill §10 with the measured numbers.
- [ ] Backlog sweep: remove any index line and detail file this effort finished.
- [ ] Commit.

## Definition of Done

- [ ] Payoff build with an empty body registry and no stubs: loads, settles, and its
      `#pose=a,0,0,0,0.5,0.3,300,0` shot matches the `PAYOFF_OFF=1` baseline (owner's check).
- [ ] Its gzip size is reported against the spike's 279 kB and today's baseline.
- [ ] The app is unchanged in before/after shots of the Earth home, a planet and a mission focus.
- [ ] `npm run perf` and `npm run perf:cpu` before and after: no regression.
- [ ] `npm run typecheck`, `npm test`, `npm run build` green (without the local frame patch).
