# Wake-vote fold — rung 5 of the engine-composition ladder

**Status.** Ready to execute on `refactor/wake-vote-fold` (base `e34ca2a6c`).
**Date.** 2026-08-19.
**Scope.** Rung 5 of the ladder in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md)
(decision #9): _"**5** wake-vote fold"_, carrying decision #7's contract
amendment (_"Wake: bundle votes fold into `shouldKeepTicking`'s `anim` bag"_,
`decisions.md:49-51`) and the two hand-offs the previous rungs left here:
**site 6's wake half** (#13, `decisions.md:189-193`) and the **deletion of the
volume-ingest wake** (#14 D2, `decisions.md:249-254`). Under #10 (row-divergence
rule), #12 (rows identified in their own domain) and #13's survey-first method.
There is **no separate spec** — decisions.md is this rung's authority, as for
rungs 2, 3 and 4.

**Evidence of record.** Three exhaustive surveys were run at this HEAD before
this plan was written: the mandate sweep (decisions.md clauses + the four maps),
the receiving-end survey (`renderScheduler`, `shouldKeepTicking`, the two wake
sagas, the test coverage map), and the sending-end census (28 genuine
`requestRender()` call sites, classified). They were session scratchpad
artifacts, not repo files; **every load-bearing claim below was re-verified
against the tree at `e34ca2a6c`** and is cited `file:line`. Nothing in this plan
depends on reading them.

**Ground preparation.** None needed — the ladder **is** the ground-prep
programme (#9), and this rung is itself ground prep for the deferred
`SubsystemBundle` umbrella: it settles what a bundle's `wake` field would mean
(`decisions.md:395`) before any umbrella type is minted. `refactor-ground` is
not re-run recursively per rung. Rungs 1 (#571), 2 (#575), 3 (#579) and 4 (#583)
have landed; no prep refactor precedes the tasks below.

**Headline.** The docs describe rung 5 as a fold and #14 hands it a deletion.
The census says both, and says the fold is **one field**. Of 28 genuine
`requestRender()` sites, 3 are the mechanisms themselves, 15 are essential, and
of the 10 that look foldable exactly **two** are deletable and exactly **one**
is a genuine scattered vote. The real smell is a triple the codebase already
half-fixed: three ramp mechanisms solving "a mid-ramp frame needs another
frame", one folded into the `anim` bag (`runFrame.ts:649-652`) and two still
calling the scheduler from inside a pass. This rung folds the reachable one (the
label director), deletes the two volume wakes #14 handed it, rules the
remaining **seven** sites **keep** with three comment amendments, and builds
**no registry, no row type, no walker** — the `anim` bag goes from 2 fields
to 3.

## What this rung does and does not touch

**In scope:**

- `labelDirectorSubsystem.runFrame`'s in-pass wake (`:478-480`) → a returned
  vote → a third `anim` bag field. The one structural change.
- The two volume-ingest wakes rung 4 relabelled and handed here:
  `uploadVolumeField.ts:30`, `unloadVolumeField.ts:26`, and their comments.
- Three comment amendments at kept sites: `biasCorrectionSubsystem.ts:272-273`
  (silent about the route coverage), `startLoop.ts:144-148` (the ignition rule),
  `wireInput.ts:363-378` (a site the census classified MIXED that this rung's
  verification proves **essential** — finding 3).
- **decision #15** in decisions.md: the ten rulings below, plus #9's rung-5
  entry amended in place. The rung's durable deliverable.
- The doc sweep across the four research maps that this rung makes stale.

**Out of scope, with reasons:**

- **`foregroundLabelsLayer.ts:810`'s caption wake — rung 8's** (D6). It is the
  third leg of the ramp triple, and the only one that cannot be folded without
  minting new cross-frame machinery inside the exact file #11 assigns to rung 8.
- **`watchWakeSaga` and `watchSelectionWakeSaga`** — mechanisms, not scattered
  calls (D3). The hover exclusion (`watchWakeSaga.ts:41-46`) and the route set
  are untouched.
- **`installSlotReadyWake`** — named by #14 as a wake owner to "reckon with";
  reckoned with in D3 and left alone: it is prior art for this exact fold (one
  subscription replacing per-slot calls, `installSlotReadyWake.ts:8-11`).
- **The seven non-bag disjuncts** of `shouldKeepTicking` (camera, texturedDisks,
  fades, structureFocus, flow, manual-playing, follow-ease). D2 rules they are
  not votes.
- **A `WAKE_LAYERS` manifest, row type or walker** (D4).
- **The `SubsystemBundle` umbrella and its `wake?: (state, ctx) => boolean`
  field** — deferred by #9 until the rungs land.
- **`syncVisibilityFadeItem`'s production-dead `animate:false` branch**
  (`:192`) — dead-branch hygiene on the FADE_LAYERS bridge, which is **rung 7's**
  family (#11: "rung 7 widens to full fade-path canonicalization"). D8.
- **The marker path's `🔴` in `current-contracts-map.md:190`** — its "no wake
  vote" half closes here with evidence (D9); its shadow-producer/registration
  half stays open and unowned by this rung.
- **Rungs 6+** — debug derivation, the `FADE_ROW`/`VISIBILITY_ACTION_ROW`
  derivation decision, label-mechanism unification.

## The census, in one table

28 genuine `requestRender()` invocation sites in `src/` (dependency-wiring sites
that merely thread a `requestRender` closure through a factory's deps are
plumbing, not invocations, and are excluded).

| class                | count | this rung                                          |
| -------------------- | ----- | -------------------------------------------------- |
| MECHANISM            | 3     | untouched (`watchWakeSaga.ts:54`, `watchSelectionWakeSaga.ts:26`, `runFrame.ts:714`) |
| ESSENTIAL            | 15    | untouched                                          |
| REDUNDANT-COVERED    | 5     | **2 deleted** (volume pair), 3 kept — D7, D8       |
| VOTE/PREDICATE       | 2     | **1 folded** (label director), 1 → rung 8 — D5, D6 |
| MIXED / uncertain    | 3     | all kept; 1 reclassified ESSENTIAL — D8, D9        |
| **total**            | 28    | 1 folded · 2 deleted · 7 kept · 18 untouched       |

The five class counts sum to 28; carry that arithmetic into decision #15. The
source census labelled ESSENTIAL "14" while listing fifteen sites — re-counted
here: `fadeRegistry.ts:131`, `engine.ts:734`, `runFrame.ts:474`,
`installSlotReadyWake.ts:32`, `biasCorrectionSubsystem.ts:247` and `:264`,
`hiResFamousSubsystem.ts:252`, `bitmapStreamSubsystem.ts:144` and `:155`,
`applySwapFormat.ts:37`, `structureFocusSubsystem.ts:113`, `wireInput.ts:345`,
`inputBindings.ts:120`, `:133`, `:166`.

**The ramp triple** (the rung-4-shaped smell) — three independent
appear/disappear mechanisms solving the same problem, one already fixed:

| mechanism            | site                                | today                                    |
| -------------------- | ----------------------------------- | ---------------------------------------- |
| star-cut LOD fade    | `runFrame.ts:641-655`               | **folded** — `anim.starFadeAnimating`    |
| label director       | `labelDirectorSubsystem.ts:478-480` | in-pass `requestRender()` → **this rung** |
| foreground captions  | `foregroundLabelsLayer.ts:810`      | in-pass `requestRender()` → **rung 8**   |

`runFrame.ts:649-652` states the fix in its own words — _"The wake vote used to
fire from inside the pass (a `requestRender` scattered away from the single
authority); now the pass computes the vote and `shouldKeepTicking` decides"_ —
sitting ten lines below one of the two sites that still does it.

## Decisions this rung takes

**D1 — the fold is one `anim` bag field plus two deletions. No table.** #14 D2
hands rung 5 a deletion ("rung 5 owns deleting it"); #7 and the contract sketch
(`decisions.md:395`) describe a fold "into the anim bag". Both are right, and
both are small: after the census the fold has exactly **one** genuine
contributor (the label director) and the deletion exactly **two** lines. Rung
3's precedent applies unchanged (`decisions.md:198`: _"No registry, no walker,
no row type was built"_) — the bag **is** the seam, and extending it is growth.

**D2 — a "vote" is an `anim` bag entry, and that fixes the rung's boundary.**
`shouldKeepTicking` has nine disjuncts but only two votes.
`shouldKeepTicking.ts:19-29` draws the line itself: every term except `anim` is
read off `(state, s, nowMs)`, and `anim` is _"an explicit bag of IN-FRAME
animation votes collected by the planners runFrame has already run this frame …
a planner or subsystem computes the vote, this predicate decides, and nothing
wakes the loop on its own behalf."_ A vote is therefore a fact that (a) is
computed as a side effect of per-frame work already running and (b) has no
resting-state home to be read from. The seven other disjuncts fail (a): they are
selector or resource reads (`selectCameraActive`, `fades.isAnyAnimating`,
`structureFocus.isAwake`, `texturedDisks.hasInFlightWork`, `slotReady`,
`selectIsManualPlaying`, `followApproachEaseActive`) and are already correct.
**Scope = the bag's contributors, not the disjunction.**

**D3 — the three wake owners #14 named are reckoned with, and two of them
stay.** `decisions.md:253-254` names `watchWakeSaga`, `installSlotReadyWake` and
the volume line. Accounting: `watchWakeSaga.ts:24-56` is a route table whose
per-action alternative already exists and is deliberately separate
(`watchWakeSaga.ts:41-46` — route-level wake would net `updateSelectionHover`,
which must stay wake-free); `installSlotReadyWake.ts:26-35` is one subscription
over every slot in `allSlots`, i.e. the same "N scattered wakes → 1
subscription" fold this rung performs, already done — its own header says so at
`:8-11` ("the alternative … scatters the obligation across every slot factory …
One subscription here absorbs it for all slots"). Neither is a scattered call;
both stay, and the deletion is the third owner alone.

**D4 — no `WAKE_LAYERS` manifest; the accretion cost is ACCEPTED, not fixed.**
`current-contracts-map.md:193` and `:211` (§6 item **6**, "Wake accretion" —
**not** `:208`, which is the off-registry-lifecycles row that records #13's and
#14's rulings) flag "wake terms accrete by hand (each = a signature edit)" as a
loose spot. Ruled: the signature edit is the **feature**.
A vote is only reachable if the planner that computes it is already running, so
a required bag field is the compile-time gate that catches a dropped vote — a
manifest of rows would have to carry closures over per-frame planner output,
which #14 D4's standing form forbids (`decisions.md:211-212`: rows are plain
data, readable at the table, never closures). Three fields, three different
producers, no shared row shape: #13's clauses fail exactly as they did for
staleness. The "9-term disjunction is hand-maintained" observation is
re-deferred to the **umbrella reassessment**, not to another rung.

**D5 — the label director's vote folds into the bag. The rung's structural
change.** `labelDirectorSubsystem.ts:478-480` calls
`state.subsystems.scheduler.requestRender()` from inside per-frame producer
polling — the pattern `runFrame.ts:649-652` says was eliminated. It folds
cleanly because the ordering permits it, verified precisely:
`labelDirector.runFrame` is called at `runFrame.ts:639`, the only early return
in the frame body is at `:475` (far above it), and the tail vote is at
`:708-714` — so the vote is computed **before** the decision point, in the same
frame, with nothing between them that can return. The scheduler clears its token
before `onFrame` (`renderScheduler.ts:70-77`), so an in-frame wake schedules the
_next_ frame either way: firing at `:479` and firing at `:714` schedule the same
frame. **No frame can be skipped.** The director is `runFrame`'s single caller
(grep-confirmed), so the signature change has one call site.

**D6 — `foregroundLabelsLayer`'s caption wake is rung 8's, and the split is
clean.** Four reasons, in order of weight:

1. **No return channel exists.** The label director is invoked directly by
   `runFrame` and can return its vote; `foregroundLabelsLayer.draw` is invoked
   deep inside `executeFrame`'s program walk. Folding it needs either a new
   module-level remembered flag or a new per-frame vote sink on
   `ReadyFrameContext` — a **new mechanism for exactly one row**, which is
   #13/#14's method and #10's row-divergence rule both saying no.
2. **A remembered flag is a behaviour risk in a behaviour-neutral PR.** Any
   frame where the row's `enabled()` gate is false leaves the last frame's
   `anyRamping` in place: stale-true pins 60 fps, stale-false freezes a caption
   mid-fade. Today's in-pass call has neither failure mode.
3. **It deepens the outlier rung 8 exists to fix.** `renderer-layer-outliers.md:59`
   flags this file 🔴 precisely for `draw` writing module state its own `enabled`
   reads back (`captionAlpha` → `anyCaptionAlive`, `:263-280`, `:416`). A second
   piece of module state read from `runFrame`'s tail makes that knot worse.
4. **Rung 8 dissolves the site rather than folding it.** #11 assigns
   `foregroundLabels`' private director to rung 8 (label-mechanism unification);
   once its captions are `LabelProducer`s, their ramp rides the director's vote —
   the field **this** rung mints. Building a parallel channel now is work rung 8
   deletes.

**D7 — the two volume wakes are deleted, discharging #14 D2.** #14 kept them
"so the ingest path's wake does not depend on saga wiring order" and handed the
deletion here. Rung 5's accounting answers that hedge: each function **dispatches
its own covering action** — `uploadVolumeField.ts:27` dispatches
`settings/addVolumeField`, `unloadVolumeField.ts:24` dispatches
`settings/removeVolumeField`, both `settingsRoute` members that
`watchWakeSaga.ts:47-55` wakes on unconditionally. The coverage is internal to
the function, so no caller and no wiring order can break it; and if
`watchWakeSaga` were ever unwired the symptom would be the entire settings
surface going dark, not a silent volume-only miss. The upload path is covered
three times over (the dispatch, `syncVisibilityFades`→`fadeTo`'s own wake at
`fadeRegistry.ts:131`, and the slot's ready transition via
`installSlotReadyWake`). Neither line is pinned by a positive test — the reason
rung 4 could relabel them without touching a test, and the precedent for
deleting them without one.

**D8 — the internal-coverage test, and the three sites that fail it.** The rule
D7 applies, stated once so it is reusable — and **both clauses are load-bearing**:
**delete a redundant `requestRender()` only where the same function performs a
dispatch that covers _the same fact_.** A same-body dispatch about a different
fact is not coverage; neither is coverage that depends on who called. The second
clause is what separates the two volume functions (whose dispatch _is_ the state
change the wake announces) from `startLoop`, which dispatches in the same body
but about something else entirely. Under it:

- **`biasCorrectionSubsystem.ts:274` (`setMode` entry) — KEEPS, comment
  amended.** `setMode` dispatches nothing; its coverage is that its one caller
  today (`watchBiasBakeSaga.ts:19`) is fired by a `settings/` action. It is a
  public subsystem method any future caller could invoke without one. Its
  comment (`:272-273`) is not false the way #14 found the door's "essential
  wake" false — _"the only wake identity modes need"_ is a true statement about
  wake **count** within the subsystem (identity modes return at `:282` and issue
  no second wake). It is **silent** about the route coverage, which is the thing
  a future reader needs; the amendment adds that clause and keeps the true
  identity-vs-bake contrast. Cost: one line, no test churn
  (`biasCorrectionSubsystem.test.ts:265,377,381,385` stay green untouched).
- **`clipPlayer.ts:206` (fade cue) — KEEPS, untouched.** Its redundancy is a
  different species: a **continuation vote** (`selectCameraActive` is
  `c.clip !== null`, true for the clip's whole duration), not route coverage.
  A future clip primitive whose cues fire while `camera.clip` is transiently
  null makes it essential again, silently. No comment change: the existing one
  ("Wake the render loop so the fade ramp actually gets drawn") is true.
- **`startLoop.ts:149` (boot kick) — KEEPS, one line added. The rule's worked
  exception, and the reason its second clause exists.** Its neighbouring
  `goLiveNowAction()` dispatch (`:142`) is a `time/` route write **in the same
  function body**, so clause one alone would predict DELETE — but it covers a
  **different fact** (a clock snap), which clause two excludes. The failure mode
  if that dispatch is ever moved, gated or re-routed is an application that
  never draws its first frame. The ignition must not depend on the clock snap's
  route membership; that is worth one line where a future reader would otherwise
  delete it as redundant. `startLoop.test.ts:130,167` stays green untouched.

**D9 — the three MIXED sites: all keep, and one is reclassified.**

- **`wireInput.ts:378` (`onZoom`) — ESSENTIAL, not mixed.** The census flagged
  the unconditional wake beside a conditional dispatch as uncertain, reading the
  `null` return as "zoom clamped to a no-op". Verified false:
  `src/services/engine/camera/applyWheelZoom.ts:72-75` returns `null` on exactly
  one path — the follow branch, **after mutating
  `clock.followDistanceTarget`**. So a wheel tick while following a body changes
  real state and dispatches nothing, and steady follow after saturation does
  **not** keep the loop ticking (`shouldKeepTicking.ts:97-104`, deliberately);
  `applyWheelZoom` does not touch `followStartMs`, so the tick cannot restart
  the ease either. Without this line, zooming a followed planet from a resting
  camera would not repaint until something else woke the loop — the next
  interaction, or, under a LIVE clock, the 500 ms idle heartbeat
  (`runFrame.ts:715-721`). One comment line records it.
- **`syncVisibilityFades.ts:152` (batch snap wake) — KEEPS, untouched.** It is
  not a scattered call: it is the paired half of a stated contract —
  `fadeRegistry`'s `setImmediate` snap path deliberately does not wake, so the
  batch caller issues exactly one wake for the whole batch (`:118-128`).
  Deleting it would make the function's correctness depend on every caller
  having dispatched a settings action first.
- **`syncVisibilityFadeItem.ts:192` (`animate:false`, production-dead) —
  KEEPS, and the branch is rung 7's.** The only production caller
  (`galaxyCatalogSourceRegistry.ts:233`) always passes `animate: true`. It is
  dead-branch hygiene on the FADE_LAYERS bridge, and it exists to mirror its
  sibling's wake policy; deleting it here would mint an asymmetry between two
  functions whose symmetry is documented, inside rung 7's family.

**D10 — site 6 is already the reference shape. Nothing to build.**
`earthTileSubsystem.ts` has **no** `requestRender()` for the staleness fact #13
handed here: `isAnimating()` (`:311-315`) is a pull-vote read at
`runFrame.ts:629` and threaded into the bag. #13's hand-off is discharged by
recording that the wake half was already in its final shape — and it is the
model D5 measures the label director against. Also confirmed with evidence
(closing half of `current-contracts-map.md:190`): the marker path has no wake
gap — `produceStructureMarkers.ts:57,75` reads `fades.opacityOf`, so its ramps
ride `fades.isAnyAnimating`, and its apparent-size fades ride camera motion.

## Findings the executor must know before writing code

1. **The vote must be a REQUIRED bag field, and that is the only guardrail
   against dropping the wiring.** TypeScript does not complain about an ignored
   return value, so `labelDirector.runFrame(state, ctx)` returning a boolean
   nobody reads compiles silently. Making `labelsAnimating` required in
   `shouldKeepTicking`'s `anim` parameter forces `runFrame.ts:708-711` to pass
   *something*, so dropping the vote becomes a deliberate `false`, not an
   omission. Do not make it optional.
2. **The director stops touching the scheduler entirely.** After the fold,
   `labelDirectorSubsystem.ts` has no reference to
   `state.subsystems.scheduler` — verify by grep, it is the fold's completion
   check. Its module header's `### Awake aggregation` paragraph (`:19-27`)
   must be rewritten to describe the vote, at the same length or shorter.
3. **`applyWheelZoom` mutates and returns null on the follow path** — D9. Read
   `src/services/engine/camera/applyWheelZoom.ts:72-75` before writing the
   comment (it is **not** in `src/utils/camera/`, where its own `zoomedDistance`
   / `zoomedPose` helpers live); the note is that the follow branch has no
   dispatch, not that "zoom might be clamped".
4. **`NO_ANIM` absorbs the churn in `shouldKeepTicking.test.ts`.** That file
   builds its bag from a shared `NO_ANIM` constant, so a third required field is
   one line there plus the new test — the other 18 tests are untouched. If you
   find yourself editing them, you changed the wrong thing.
5. **`runFrame.test.ts` cannot pin the wiring, and should not be made to.** Its
   fixture sets `gpu.galaxyPointRenderer: null` and carries no `labelDirector`
   stub (`:157-199`), so every case short-circuits at the `!ctx.isReady` return
   (`runFrame.ts:471-476`) and never reaches `:639`. Building a ready fixture to
   pin a one-line thread is disproportionate; finding 1's required field plus
   Task 6's smoke are the coverage. **Do not add a runFrame-level test.**
6. **`shouldKeepTicking.ts`'s module header is already 72 lines.** Add the new
   term to the predicate breakdown in ≤4 lines, and make exactly one other edit
   there: `:20-23` enumerates the bag's contributors by name ("the star LOD-fade
   `anyNodeFading` from `prepareStarCut`, and the Earth tile subsystem's
   `isAnimating()`") and goes stale with a third — a few words, not a rewrite.
   Change nothing else: the ruling's reasoning belongs in decision #15, and
   trimming the existing header is out-of-scope churn.
7. **No file in this rung is moved or renamed.** There is no `move-files` or
   `refactor` invocation to make. If a task seems to want one, it has drifted.
8. **`unloadVolumeField` loses its last `state.subsystems` reference** when its
   wake goes. The `ApplyIntentState` parameter type does not change —
   `uploadVolumeField` still reaches `subsystems` through `syncVisibilityFades`.
   Do not "tidy" the signature.
9. **Both volume files must keep one line saying why there is no wake.** A
   reader who greps for the ingest path's wake and finds none will add one back.
   One line each, naming the dispatch immediately above as the wake
   (`watchWakeSaga`'s settings route) — that is the whole note, and it replaces
   more prose than it adds (`uploadVolumeField.ts:5-7`,
   `unloadVolumeField.ts:25`).

## The contract

```ts
// src/@types/engine/subsystems/LabelDirectorSubsystem.d.ts — signature change only
/**
 * Per-frame entry point — poll producers, merge, flush. Returns the frame's
 * label-animation vote (any producer awake, or any appear/disappear envelope
 * mid-ramp) for `shouldKeepTicking`'s `anim` bag; the director never wakes the
 * loop itself.
 */
runFrame(state: EngineState, ctx: ReadyFrameContext): boolean;
```

```ts
// src/services/engine/helpers/shouldKeepTicking.ts — the bag grows by one
anim: {
  starFadeAnimating: boolean;
  earthTilesAnimating: boolean;
  labelsAnimating: boolean;
},
```

The bag stays an inline object literal: three fields, one call site, and a named
type would be a new `@types` file (one-type-per-file) for a shape with a single
producer and a single consumer. Revisit only if a fourth contributor appears.

## Tasks

**Execution order (binding).** Task 1 → 2 → 3 are one behavioural concern, one
mechanical concern, one comment concern, in that order and in separate commits.
Tasks 4 and 5 may run in either order after Task 3. Task 6 is the gate.

### Task 1 — Fold the label director's vote into the `anim` bag (TDD)

**Files:** `src/@types/engine/subsystems/LabelDirectorSubsystem.d.ts`,
`src/services/engine/subsystems/labelDirectorSubsystem.ts`,
`src/services/engine/helpers/shouldKeepTicking.ts`,
`src/services/engine/frame/runFrame.ts` (modify);
`tests/services/engine/helpers/shouldKeepTicking.test.ts`,
`tests/services/engine/subsystems/labelDirectorSubsystem.test.ts` (modify)

The test rewrites **preserve** coverage: the director's two wake tests keep
their exact frame sequence and expectations, asserting the returned vote instead
of a spy's call count. The bug they catch is unchanged — a director that stops
reporting mid-ramp sleeps the loop and freezes a label mid-fade.

- [ ] Rewrite `labelDirectorSubsystem.test.ts:506-529` (`keeps the loop awake
      while any envelope ramps, and goes quiet once settled`) against the return
      value: same five `runFrame` calls at `nowMs` 0/150/300/400/700, expecting
      `true, true, false, true, false`. Rewrite `:134-144` (`calls
      scheduler.requestRender when any producer is awake`) the same way —
      "reports the vote when any producer is awake". Drop `makeState`'s
      `requestRender` parameter (`:11-18`); the `fades.fadeTo` spy stays (other
      tests assert the director never fires a layer load-in).
- [ ] Add to `shouldKeepTicking.test.ts`, beside the star and Earth-tile term
      tests (`:215-235`): `a label envelope mid-ramp → true even with everything
      else at rest`, driven as `{ ...NO_ANIM, labelsAnimating: true }`. Extend
      `NO_ANIM` with the third field (finding 4).
- [ ] Implement: `runFrame` returns `anyAwake || anyRamping` (and `false` from
      the `!labelRenderer || !lineRenderer` early return at `:442`); delete the
      `requestRender` call at `:478-480`; rewrite the `### Awake aggregation`
      header paragraph (`:19-27`) to describe the vote, no longer.
- [ ] Thread it: `runFrame.ts:639` captures the return; the bag at `:708-711`
      gains `labelsAnimating`; `shouldKeepTicking` gains the required field and
      the disjunct, plus ≤4 header lines (finding 6).
- [ ] `grep -n "subsystems.scheduler" src/services/engine/subsystems/labelDirectorSubsystem.ts`
      → **no hits** (finding 2). The gate is on the *reference*, not the word:
      the rewritten header may still say "the director never wakes the loop
      itself" — that is in fact the sentence to write.
- [ ] `grep -n labelsAnimating src/services/engine/frame/runFrame.ts` → exactly
      **two** hits: the capture at `:639` and the bag entry at `:708-711`. Read
      the first one — it must be the director call's return value, not a literal
      `false` and not a re-passed `earthTilesAnimating`. A required bag field
      forces the call site to pass *something* (finding 1); this grep is what
      makes it the *right* something, since a wrong-but-typed value compiles and
      passes every unit test.
- [ ] `npm run typecheck` + `npm test -- labelDirector shouldKeepTicking`.
- [ ] Commit.

### Task 2 — Delete the two volume-ingest wakes (mechanical, D7)

**Files:** `src/services/engine/volume/uploadVolumeField.ts`,
`src/services/engine/volume/unloadVolumeField.ts`,
`tests/services/engine/volume/uploadVolumeField.test.ts` (modify)

Neither line has a positive assertion anywhere. One negative assertion goes with
them: `uploadVolumeField.test.ts:84`
(`expect(state.subsystems.scheduler.requestRender).not.toHaveBeenCalled()`) is
true today because the early return skips the call; after the deletion it is
true because no code path can reach a call that no longer exists. Per
[`testing.md`](../conventions/testing.md) it can no longer fail on a real bug.
Its two siblings on `:82-83` (`store.dispatch`, `bridge`) still carry the
null-renderer early-return contract in full, so only the wake line goes.

- [ ] Delete `uploadVolumeField.ts:30` and `unloadVolumeField.ts:26`, and the
      "kept local until rung 5" / "Redundant-but-local" clauses that justified
      them (`uploadVolumeField.ts:5-7`, `unloadVolumeField.ts:25`). Replace each
      with one line: the wake rides the settings dispatch on the line above,
      which `watchWakeSaga`'s route table turns into a render request
      (finding 9). `uploadVolumeField`'s header nets ~2 lines shorter;
      `unloadVolumeField` is flat.
- [ ] Delete `uploadVolumeField.test.ts:84` — that line only, keeping `:82-83`
      and the `scheduler.requestRender` spy in the fixture (other cases may
      still construct it). This is the rung's one deleted assertion and it is
      an assertion about deleted code.
- [ ] `grep -rn requestRender src/services/engine/volume/` → no hits.
- [ ] `npm run typecheck` + `npm test -- uploadVolumeField volumeSlotIngest`.
- [ ] Commit.

### Task 3 — Correct the three kept sites' comments (comment-only, D8/D9)

**Files:** `src/services/engine/subsystems/biasCorrectionSubsystem.ts`,
`src/services/engine/phases/startLoop.ts`,
`src/services/engine/phases/wireInput.ts` (modify)

Zero behaviour, zero test churn — the point is that a future reader re-running
this census finds the ruling instead of redoing it. One or two lines each; a
paragraph is over budget.

- [ ] `biasCorrectionSubsystem.ts:272-273` (the comment; `:271` is `mode = next;`
      and `:274` the call) — **add** the missing clause, do not replace the
      existing one: "the only wake identity modes need" is true about wake count
      and stays. What is missing is that the wake is redundant with the settings
      route today (`setBiasMode` → `watchWakeSaga`) and kept because `setMode`
      dispatches nothing itself, so the coverage is its caller's (D8).
- [ ] `startLoop.ts:144-148` (the comment; `:149` is the call) — one line: the
      ignition must not depend on `goLiveNowAction`'s route membership; the
      neighbouring dispatch covers a different fact (D8).
- [ ] `wireInput.ts:376-378` — record why the wake is unconditional while the
      dispatch is not: the follow branch of
      `src/services/engine/camera/applyWheelZoom.ts:72-75` mutates
      `clock.followDistanceTarget` and returns `null`, so a wheel tick on a
      followed body dispatches nothing and steady follow does not keep the loop
      ticking (D9, finding 3).
- [ ] `npm run typecheck` + `npm test -- biasCorrection startLoop wireInput` —
      all green with **no test edited** (that is the check that these are
      comment-only).
- [ ] Commit.

### Task 4 — decisions.md gains decision #15

**Files:** `docs/research/engine/decisions.md` (modify)

Rungs 6–8 and the umbrella reassessment are written against decisions.md long
after this plan moves to `plans/completed/`. This is the rung's durable
deliverable.

- [ ] Add **decision #15** carrying D1–D10: the census counts — **28 sites = 3
      mechanisms + 15 essential + 5 redundant-covered + 2 votes + 3 mixed**, and
      check the sum before writing it (the source survey labelled ESSENTIAL "14"
      while listing fifteen; #15 is what rungs 6–8 read as ground truth); the
      outcome split **1 folded / 2 deleted / 7 kept / 18 untouched**; the "a vote
      is an `anim` bag entry" boundary (D2) with the seven non-votes named; the
      label-director fold and its ordering proof (D5); the **internal-coverage
      test** (D8) stated as the reusable rule **with both clauses — same
      function, same fact** — plus the `startLoop` worked exception that shows
      why the second clause exists; the `onZoom` reclassification with the
      `applyWheelZoom` evidence (D9).
- [ ] Record **#14 D2 as discharged** (D7): the hedge it kept the line for
      ("does not depend on saga wiring order") is answered — each function
      dispatches its own covering settings action, and the upload path is
      covered three ways. Record that `watchWakeSaga` and `installSlotReadyWake`,
      the other two owners #14 named, are reckoned with and **stay** (D3).
- [ ] Record **#13's site 6 as closed** (D10): the wake half was already the
      reference shape (`isAnimating()` → the bag), nothing was built, and it is
      what the label director was measured against. Include the marker-path
      no-wake-gap finding.
- [ ] Record **no manifest, and the accretion cost accepted** (D4): a required
      bag field is the compile-time gate a closure-bearing row table could not
      be; the "hand-maintained disjunction" loose spot is re-deferred to the
      umbrella reassessment, not to a rung.
- [ ] Record the **rung-8 hand-off** (D6) with all four reasons, so rung 8's
      author inherits the finding rather than re-deriving it.
- [ ] Record the **rung-7 hand-off** (D8): `syncVisibilityFadeItem`'s dead
      `animate:false` branch.
- [ ] Amend **#9's rung-5 clause in place** (`decisions.md:104`), the way #13
      and #14 amended theirs: the fold is one bag field, the deletion is two
      lines, no table — with a pointer to #15, so a reader of #9 alone does not
      expect a wake registry.
- [ ] Commit.

### Task 5 — Doc sweep across the four maps

**Files:** `docs/research/engine/engine-composition-map.md`,
`docs/research/engine/subsystem-sweep.md`,
`docs/research/engine/current-contracts-map.md`,
`docs/research/engine/renderer-layer-outliers.md` (modify)

Locate each by its quoted text — line numbers are as of `e34ca2a6c`. **Verify
before editing:** several wake claims survive this rung intact (the `anim`
parameter mechanism is extended, not replaced), and an edit that only restates
the same fact is churn.

- [ ] `engine-composition-map.md:165-168` — "**the one** layer family with its
      own dedicated wake term" is now false; labels have one too. Its `runFrame`
      pointer is also dead: `:167` cites `runFrame.ts:776-779` for the star vote
      in a 722-line file — the real site is **`:708-711`**. Fix both in the same
      edit.
- [ ] `subsystem-sweep.md:17` (Star-catalog row, non-fit column) — "Its own
      bespoke wake-vote field" is stale in exactly the way the line above is:
      the bag now has a second layer-family vote. Same edit, same reason.
- [ ] `engine-composition-map.md:224-227` ("threaded explicitly through
      `shouldKeepTicking`'s `anim` parameter") — **verify only**: the mechanism
      is unchanged, so this should need no edit.
- [ ] `subsystem-sweep.md:22` (Labels/marker-lines row, Wake column) — "settings
      route (indirect)" → the director's per-frame vote into the bag.
- [ ] `subsystem-sweep.md:29` (Misfit #2) — the named-field list gains
      `labelsAnimating`, and the misfit gets #15's ruling: hand-maintained is
      the accepted shape, not a gap awaiting a registry.
- [ ] `subsystem-sweep.md:54` (Task B "wake vote" row) and `:66` (summary #5,
      "bundle votes should fold into the anim bag, not a subscription model") —
      done; point at #15 for what the fold turned out to be.
- [ ] `current-contracts-map.md:25`, `:180` — the disjunction is 10 terms and
      the bag 3 fields.
- [ ] `current-contracts-map.md:166` (mermaid WAKE node), `:193`, and **`:211`**
      (§6 item 6, "Wake accretion") — carry D4's ruling; the 🟠 is a recorded
      acceptance, not an open item for the rungs. **Do not touch `:208`** — that
      is §6 item 3, "Off-registry lifecycles", which records #13's and #14's
      rulings and has nothing to do with wake.
- [ ] `current-contracts-map.md:226-233` (§7 `W7` "wake fold") and `:256`
      (surface table wake row) — the fold shipped; describe what it was (one
      field, two deletions) rather than a planned walker.
- [ ] `current-contracts-map.md:190` (marker path 🔴) — close the "no wake vote"
      half with D10's evidence; leave the shadow-producer half open and say so.
      Its pointer is dead too: the row cites `runFrame.ts:731-734`; the real
      site is **`:663-666`**. Fix it in the same edit.
- [ ] `renderer-layer-outliers.md:59`, `:75` — record that rung 5 examined
      `foregroundLabelsLayer.ts:810` and ruled its wake half to **rung 8** with
      the fold, so the row stops reading as unassigned.
- [ ] Commit.

### Task 6 — Full gate + visual smoke

The smoke is the only coverage the fold's wiring has (finding 5), so it is not
optional and each behaviour below must be observed with the **camera at rest** —
a moving camera keeps the loop ticking on its own and would pass every one of
these regardless.

- [ ] `npm run typecheck` (both tsconfigs) + `npm test` — green, no skips added.
- [ ] Dev-server smoke, with the user's eyes — **label envelope**: fly toward
      the Milky Way label's fade band and **stop the camera** mid-crossing. The
      label must keep easing to its settled opacity with no input; a step, a
      freeze mid-fade, or a jump on the next mouse move is the regression this
      task exists to catch.
- [ ] **Label appear/disappear**: with the camera at rest, toggle a structure
      category (or focus a cluster) so labels enter and leave. They must fade in
      and out, not pop.
- [ ] **Volume ingest**: with the camera at rest, toggle **mcpm** and
      **cf4-density** off and on in the Volumes panel. Each must still fade in —
      this is the settings-route wake standing in for the two deleted lines
      (D7).
- [ ] **Bias mode**: with the camera at rest, switch the bias mode in the
      settings panel. The scene must repaint — the coverage Task 3's corrected
      comment now asserts.
- [ ] Confirm the loop still **sleeps**: open the **DebugPanel** and watch its
      always-on `FrameStatsRow` (the fps + CPU-frame-time line,
      `src/components/DebugPanel/FrameStatsRow.tsx`) with the scene at rest and
      everything settled — it must stop updating, not sit at a steady ~60 fps.
      A stuck-true vote pins the loop and is invisible without this panel open.
- [ ] Commit (if any smoke-driven fixes were needed).

## Global Constraints

- **Behaviour-neutral PR** (#9). `requestRender()` is coalescing
  (`renderScheduler.ts:79-82`, `if (token !== 0) return;`), so deleting a
  genuinely-redundant call is runtime-neutral — but that is an argument about
  *this* frame's scheduling, never a licence to delete a call whose coverage is
  a caller's (D8). No deletion in this plan changes a trigger, a cadence or an
  ordering.
- **Test edits preserve what-can-break coverage.** Task 1's two rewrites keep
  their frame sequences and expectations and only change what they read the vote
  from. **No test of surviving behaviour is removed.** Exactly one assertion is
  deleted in the whole rung — `uploadVolumeField.test.ts:84`, an assertion about
  a line this rung deletes, which after the deletion cannot fail on any bug
  (Task 2).
- **One mechanical or behavioural concern per commit** — Task 1 (behaviour),
  Task 2 (mechanical deletion), Task 3 (comments) are three commits, never
  folded together. Stage by explicit path; never `git add -A`.
- **No file moves or renames in this rung** (finding 7). Should one become
  necessary, it goes through `npm run refactor` / `npm run move-files` with
  `--dry` first, never `git mv` plus hand-edited imports.
- **Didactic comment budget** — module headers ≤10 lines, comment lines ≤half
  the code lines in the file. This rung's net comment count is **flat**: two
  justification blocks traded for two one-liners, plus one added clause and two
  added lines at the kept sites. Do **not** read this as a mandate to trim
  unrelated comments to make a number go down. Reasoning belongs in decision
  #15, not inlined.
- **UNTOUCHABLE invariants** — a diff that moves any of these has drifted:
  1. `state.subsystems.fades.tick(nowMs)` runs **before** `shouldKeepTicking`
     reads `isAnyAnimating` (`runFrame.ts:703-707`) — tick is the single
     resolution site for `fadeTo` promises; reordering hangs every awaited
     fade-out forever.
  2. The **hover exclusion** — `updateSelectionHover` must stay wake-free, which
     is why `watchSelectionWakeSaga` is per-action and selection is not a wake
     route (`watchWakeSaga.ts:41-46`).
  3. The **LIVE idle-heartbeat suppression** — LIVE time stays out of
     `shouldKeepTicking` and rides `requestIdleFrame(LIVE_IDLE_TICK_MS)`
     (`runFrame.ts:715-721`); the two channels suppress each other by design
     (`renderScheduler.ts:98-105`), they do not compose.
  4. `produceFocusUniforms(nowMs)` fires **exactly once per frame**
     (`runFrame.ts:486-494`) — it ticks the focus-fade controller; a second call
     double-advances the ramp.
- **No new mechanism without ≥2 rows** (#13's method, #14's precedent): no
  registry, row type, walker, ctx vote sink, or `WAKE_LAYERS` manifest. The
  `anim` bag is the existing seam; extending it is growth.

## File Structure

**Created:** none.

**Modified:**

- `src/@types/engine/subsystems/LabelDirectorSubsystem.d.ts` — `runFrame`
  returns the vote.
- `src/services/engine/subsystems/labelDirectorSubsystem.ts` — returns instead
  of waking; no scheduler reference remains.
- `src/services/engine/helpers/shouldKeepTicking.ts` — third bag field, tenth
  disjunct.
- `src/services/engine/frame/runFrame.ts` — captures the vote at `:639`, passes
  it at `:708-711`.
- `src/services/engine/volume/uploadVolumeField.ts`,
  `src/services/engine/volume/unloadVolumeField.ts` — wake deleted, one note
  each.
- `src/services/engine/subsystems/biasCorrectionSubsystem.ts`,
  `src/services/engine/phases/startLoop.ts`,
  `src/services/engine/phases/wireInput.ts` — comments only.
- `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts`,
  `tests/services/engine/helpers/shouldKeepTicking.test.ts`,
  `tests/services/engine/volume/uploadVolumeField.test.ts` (one assertion
  removed).
- `docs/research/engine/decisions.md` and the four research maps.

**Deleted:** none.

## Definition of Done

- [ ] `LabelDirectorSubsystem.runFrame` returns `boolean`, and
      `labelDirectorSubsystem.ts` contains **no reference to
      `state.subsystems.scheduler`** — the fold's completion check. The `anim`
      bag has exactly three required fields and `shouldKeepTicking` ten
      disjuncts.
- [ ] The ramp triple is **two folded, one assigned**: star-cut and label
      director both vote through the bag; `foregroundLabelsLayer.ts:810` is
      untouched and recorded as rung 8's in both decisions.md and
      `renderer-layer-outliers.md`.
- [ ] `src/services/engine/volume/` contains **no `requestRender` call**, and
      both files carry one line naming the settings dispatch as the wake.
- [ ] Of the **ten** non-mechanism, non-essential sites: **two deleted, one
      folded, seven kept with rulings rather than patches** — and the three whose
      comments were silent or incomplete (`biasCorrectionSubsystem`, `startLoop`,
      `wireInput`) now say why they stay. `clipPlayer.ts:206`,
      `foregroundLabelsLayer.ts:810` and both `syncVisibilityFades` calls are
      byte-identical.
- [ ] **No registry, row type, walker, ctx vote sink or `WAKE_LAYERS` manifest
      was built** — the deliberate outcome of D4, and the thing a reviewer
      expecting "the wake fold" must find explained in decision #15.
- [ ] **No test of surviving behaviour was deleted.** Task 1's two director
      tests keep their exact frame sequences and expectations, reading the vote
      instead of a spy. The single deleted assertion is
      `uploadVolumeField.test.ts:84` — an assertion about the line Task 2
      deletes, unfalsifiable once it is gone (`testing.md`); its two siblings on
      `:82-83` keep the early-return contract. `biasCorrectionSubsystem.test.ts`,
      `clipPlayer.test.ts`, `startLoop.test.ts`, `syncVisibilityFades.test.ts`,
      `foregroundLabelsLayer.test.ts`, `watchWakeSaga.test.ts` and
      `watchSelectionWakeSaga.test.ts` are all untouched.
- [ ] `decisions.md` ships in this PR with decision #15 (the census, the vote
      boundary, the internal-coverage test, the fold, the two deletions
      discharging #14 D2, site 6 closed, the rung-7 and rung-8 hand-offs, the
      accretion acceptance) and #9's rung-5 clause amended in place. Rungs 6–8
      must read the current north star from decisions.md alone, without this
      plan file.
- [ ] The doc sweep is done across all four maps: neither
      `engine-composition-map.md:165-168` nor `subsystem-sweep.md:17` still
      calls the star catalog the *one* family with a dedicated wake term; the
      wake-accretion ruling landed on `current-contracts-map.md:211` and **not**
      on `:208`; and the two dead `runFrame.ts` pointers in the swept rows
      (`:776-779` → `:708-711`, `:731-734` → `:663-666`) are corrected.
- [ ] Named observable behaviours for the manual smoke pass, **all with the
      camera at rest**: the Milky Way label keeps easing after the camera stops
      mid-band; structure labels fade rather than pop on a category toggle;
      mcpm and cf4-density still fade in from the Volumes panel; a bias-mode
      switch repaints; and a fully settled scene stops advancing frames.
- [ ] Deferral boundary — a reviewer should NOT expect to find, in this PR: any
      change to `watchWakeSaga`, `watchSelectionWakeSaga`, `installSlotReadyWake`
      or `renderScheduler` (D3); any change to the seven non-bag disjuncts (D2);
      `foregroundLabelsLayer`'s caption wake or its `enabled()`/`draw` inversion
      (D6, rung 8); `syncVisibilityFadeItem`'s dead `animate:false` branch (D8,
      rung 7); a wake registry, manifest or bundle `wake` field (D4, #9's
      umbrella deferral); a `runFrame`-level integration test (finding 5); any
      file move or rename (finding 7); the marker path's shadow-producer
      registration (D10); rungs 6+.
