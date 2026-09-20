# SDD ledger — search palette tabs PR2 (thumbnail capture)

Plan: docs/superpowers/plans/completed/2026-09-19-search-palette-tabs-pr2.md · Spec: docs/superpowers/specs/2026-09-19-search-palette-tabs-design.md
Branch: worktree-search-tabs-pr2 (wt .claude/worktrees/search-tabs-pr2, public/data linked to main) · Draft PR #765 · BASE 56e3971c0 (PR1 merged) · plan commit 1dd751a62
User go: "ok pr 2" (2026-09-19). PR1 wt `search-tabs` is kept on disk; its dev server :5174 (bg bqrv7dcfn) still runs. Don't remove it unasked.

## Dispatches

- A (T1–T3, sonnet): dispatched.
- A done: a85a2cbc5 (launchChromium), 3112a4412 (capture overrides), 7a5a732bd (selectCaptureTargets + poseMismatch, 13 tests). typecheck clean.
- User ruling: harness prep "A" in this PR = Task 1b (bootHookedPage, isNavigationInterruption, collectPageErrors); record.ts breakup = own PR, backlogged (3b17ea096).
- Dev server for this wt: http://localhost:5173 (bg bk7iv86na). Do not kill.
- B (T1b + T4, sonnet): dispatched.
- B done: d5aba28d4 (bootHookedPage/collectPageErrors/isNavigationInterruption; perf + record smoked), 751d6ae94 (capture-featured; smoke captured all 40 cards OK, 1.3–17.2 KB, then deleted). Plan nit: record has no --frames flag.
- NEXT: T5 capture run (controller) → user eye-check every tab → commit images → final opus review.
- Merged origin/main fd07fe22b: #761 bumped .mesh to v3 and main public/data (linked) already had v3 → every mesh body failed "decodeMesh: unsupported version 3" in this wt. Wiped partial captures; full recapture running (log scratchpad/capture-run.log).
- LANDMINE: a linked public/data tracks MAIN; a format bump on main breaks a stale branch → merge main before capturing.
- T5: a3a09877b committed 40 thumbnails (440K) + Curiosity/Spirit own capture t (sites were night at the default). User eye-check of every tab still OPEN. NEXT: user eye-check → fixes via --force → final opus review → /feature-done.
- User eye-check round 1 (all pushed, tree clean at d8a2b8b91, CI green on a3a09877b):
  - Curiosity/Spirit were night at DEFAULT_CAPTURE_T → own `capture.t` at their sites' local midday (Gale 02:00Z, Gusev 23:20Z prev day). Mars turns ~14.6 deg/h; Jezero lit 06:00Z, Meridiani 12:00Z.
  - MW + M31 were small on a busy point cloud → `PaletteCardCapture.hideGalaxyField` + closer poses (MW 0.06, M31 0.24 Mpc, chosen against 0.16/0.32).
  - LANDMINE: `famousGalaxy` is a row in `settings.galaxyCatalogs.items` like the surveys — hiding "the field" must skip it or the subject vanishes (FAMOUS_GALAXY_CATALOG in captureFeatured.ts).
  - LANDMINE: a body focus pins the pivot so `capture.pose.target` is ignored, but a GALAXY focus does not — origin target framed the Milky Way on the m31 card. poseMismatch does not compare target (PR3).
  - User was right twice: per-row actions DO exist (setGalaxyCatalogVisible/setStructureItemEnabled/setOrbitTrailsEnabled/... in src/layers/*/settings/*Slice.ts, NOT under src/state) → declutter now dispatches them instead of a mergeSnapshot clone (40a06ca21).
  - User ask: Deep Space also carries the 3 view placeholders (d8a2b8b91).
- OPEN QUESTION (asked, unanswered): waning-gibbous framing for all Solar System cards. Findings: store `camera.base` is NOT the live camera under a body focus (Saturn and Mars both read the home pose ~1 AU / 2.76e7 m), so body/Sun geometry is not readable from state; existing body poses came from the user's `l`-key logs. Options put to the user: (1) calibrate the body-relative yaw→sun-azimuth map on one planet, then generate 15 poses; (2) user logs poses by eye; (3) defer to a follow-up PR. NOTHING STARTED — do not begin until the user picks.
- Scratchpad probes (throwaway, not for commit): scratchpad/probePose.ts, scratchpad/probeSettled.ts (settled-state probe reusing bootHookedPage).
- NEXT after the ruling: final opus whole-branch review → /feature-done → squash-merge on the user's word. Dev server :5173 (bg bk7iv86na) in this wt; PR1 wt search-tabs still open with :5174 (bg bqrv7dcfn).
- Waning-gibbous ruling RESOLVED (user: "Calibrate once, then compute", then "not the phases, but just a 360 degree parameter" + "from the running app - is it not better to have a pure helper?"):
  - `tools/utils/capture/bodyPhasePose.ts` — PURE: (focusId, instantIso, phaseDeg, fovYRad) -> CameraPose. Body position from the engine's own `deriveBodyStates(simDays)`, radius from `bodyFootprintRadiusM`. No browser in the loop; the tool computes the pose BEFORE booting the page.
  - `PaletteCardCapture.phaseDeg` (0 full, 180 new, <180 lit right, >180 lit left). Cards share `const WANING_GIBBOUS = { phaseDeg: 315 }`. The 113 generated `<BODY>_GIBBOUS` pose constants are DELETED.
  - LANDMINE (the whole detour): a pose's (yaw, pitch) decode through the ORIENTATION BASIS (`ecliptic` by default), not the world axes — `eyeMpcOf` = target + poseBasis·yawPitchToDir(...)·distance. A hand-rolled atan2/asin inverse put every body at a different phase (measured 35-124 deg where 45 was asked) and `poseMismatch` passed it, because the pose round-trips fine. Invert via `orbitAnglesLookingAlong(forward, ORIENTATION_FRAMES.ecliptic)`. Pinned by tests/tools/utils/capture/bodyPhasePose.test.ts (11 tests, 5 bodies).
  - Verified: 14 recaptured thumbnails pixel-identical before/after the pure rewrite; contact sheet checked; 473 files / 1877 tests green; CI green on 0839d3c4d.
- User eye-check round 2: DONE, no findings.
- NEXT: final opus whole-branch review IN FLIGHT -> /feature-done -> squash-merge #765 on the user's word.

## /feature-done in progress (2026-09-20)

- Final opus whole-branch review DONE. Found 5 real "fails quietly" bugs, all fixed in 137712e7d:
  NaN-blind poseMismatch (readLiveCameraState now rejects non-finite); unbounded camera-log wait
  (CAMERA_LOG_TIMEOUT_MS 15s); waitSettled typed against RootState; pose+phaseDeg both set now throws;
  bootHookedPage's lost diagnostics restored (mode-specific error text + navigation-retry warn).
  Verified: re-capturing body-mars/body-earth/body-hubble/m31 after the fixes produced BYTE-IDENTICAL
  files, so nothing visual moved.
- USER RULINGS on the review's four judgement calls (2026-09-20):
  1. Split tools/utils/capture one-function-per-file: YES -> 4d542a1c5 (captureEqual.ts,
     isCapturableCopy.ts + captureEqual.test.ts pinning key-order-independent equality).
  2. bootHookedPage hook timeout: KEEP 15s (was 30s pre-extraction). Do not "restore".
  3. `capture` data shipping in the production bundle: KEEP. Measured 485 bytes gzipped; colocation
     with the card it frames is worth more than the bytes. Do not re-open.
  4. The three "Coming soon" Deep Space view cards: KEEP in this PR (user asked for them).
- DoD audit results so far: full suite 9089 passed; typecheck clean; plan checkboxes 23/23 ticked
  (UNCOMMITTED edit in the plan file — lands with the completion commit); no src/services or
  src/state touched (a DoD constraint); 40 webps for 40 capturable cards, 0 missing/0 orphans;
  no new TODO/FIXME; backlog sweep = nothing to remove (this feature's item went at spec time; the
  record.ts breakup item stays open on purpose as the deferred follow-up).
  Files beyond the plan's File Structure (expected, user-directed after the plan): bodyPhasePose.ts,
  captureEqual.ts, isCapturableCopy.ts + their tests.
- IN FLIGHT: opus deletion-audit agent over main...HEAD (diff at scratchpad/audit-pr2.diff, images
  excluded). HANDLING when it returns: triage per docs/superpowers/conventions/leanness.md — the
  safe-now bin lands as its OWN deletion commit BEFORE the completion moves; needs-ruling items go
  to the user. Its fencing block already told it rulings 2-4 above are settled; if it re-argues them,
  discard those findings.
- QUEUED after the audit, in order:
  1. safe-now deletion commit (if any).
  2. Completion moves: `git mv` the PLAN to docs/superpowers/plans/completed/. The SPEC STAYS PUT —
     it covers PR3 too. Archive this ledger to
     docs/superpowers/plans/completed/2026-09-19-search-palette-tabs-pr2.ledger.md.
  3. Commit `docs(plan): mark search-palette-tabs-pr2 complete` (NO trailer), push.
  4. Watch CI in background, report unprompted.
  5. Squash-merge #765 ONLY on the user's explicit word. Mark the PR ready (currently draft) first.
- CI GREEN on 4d542a1c5 (run 35535006556, 5m16s, + Cloudflare build). Landing note cleared.

## Deletion-audit rulings (user, 2026-09-20): LEAVE ALL FOUR AS-IS

Settled — do not re-open or re-audit these:

1. Collapsing `declutterActions` into `CAPTURE_HIDDEN_PASSES` pass names (~27 LOC): PARKED.
   It should be pixel-identical but would cost a full 42-card re-capture + a fresh user
   eye-check. Two mechanisms for one job is the known, accepted shape here.
2. `selectCaptureTargets`'s `knownId` set and its second `--force` error message: KEEP.
   The vaguer single message is worse curator DX than the ~12 LOC is worth.
3. `WARN_BYTES` (40 KB thumbnail warning, never fired; largest is 13.7 KB): KEEP as a
   regression sentinel for future capture runs.
4. `bodyPhasePose.test.ts` 'frames every body to the same apparent size': KEEP. Near-
   tautological (the radius cancels), but it would catch a swap to `bodyDrawRadiusM` on
   bodies with atmosphere shells. The two reviewers split; the user kept it.

## Capture-tool restructure (user asked mid-landing, 2026-09-20) — DONE, 552c6b256

User rulings that drove it:

- "captureFeatured.ts should be broken up into one entry point file and all helpers
  separately" + "constants and types need to be extracted".
- "it doesnt only capture featured, its a generic image capture tool, right?" — yes; the
  generic/palette line is the split.
- "palette/ is a bit ambiguous name" (it collides with COLOUR palettes, `data/<domain>/palette.ts`)
  -> chose layout B: NO new folder. `tools/capture/` = this tool, `tools/utils/*` = reusable.

Shape now (entry went 345 -> 82 lines):

- tools/capture/ — the only place that knows what a palette card is: captureFeatured.ts,
  selectCaptureTargets, isCapturableCopy, captureEqual, CaptureTarget.d.ts,
  parseFeaturedArgs, featuredDefaults (OUTPUT_DIR, DEFAULT_CAPTURE_T), README.
- tools/utils/capture/ — imports NOTHING from src/@types/palette: captureScene,
  SceneShot.d.ts, ShotOutcome.d.ts, shotDefaults (curator knobs), declutterActions
  (now absorbs the pass disables), writeThumbnail, hiddenPasses, bodyPhasePose, poseMismatch.
- tools/utils/browser/ — talks to the running app: waitSettled, applyPose,
  readLiveCameraState, dispatchActions + the 4 existing.
- `CaptureTarget` -> `SceneShot` is the load-bearing rename: focus + instant + framing +
  outPath + label. captureScene returns a `ShotOutcome` instead of mutating an accumulator.

Verified behaviour-preserving: body-mars / body-hubble / milkyWay re-captured BYTE-IDENTICAL;
m31 differed over an 11x15 px patch by <=7/255 at the same file size (render jitter) and was
restored with `git checkout`. tests/tools 1557 green, typecheck clean.

## DROPPED: `featured` -> `curated` rename

User 2026-09-20: "lets skip featured->curated". The `featured` naming stays everywhere —
featuredTabs.ts/FEATURED_TABS, FeaturedCard/FeaturedGrid/FeaturedCardTip, the
`capture-featured` script, `public/images/featured/`. Do not revive this without a new ask.
(The structure catalog's own unrelated `featured` flag was never in scope either way.)

## Second round of user-driven cleanup (2026-09-20, all landed on #765)

- `shotPose.ts` extracted from captureScene, so captureScene declares only its own symbol;
  POST_ESC_WAIT_MS joined shotDefaults. 4 tests, the load-bearing one pinning the phase path
  to the app's default fov.
- Voyager 2 had NO capture at all -> fly-in standoff derived from the mesh's 14.5 m bounding
  sphere, which the magnetometer BOOM dominates, so the probe sat tiny. Voyager 1's curator
  pose is at 7.27 m, INSIDE that sphere. Voyager 2 now reuses that distance with a
  phase-315 angle. LANDMINE: a computed frame is wrong for any boom/antenna mesh.
- `FILL` -> `SUBJECT_FILL` in shotDefaults; only computed poses honour it.
- `captureFeatured.ts` -> `capture.ts` (folder-name precedent: tools/record/record.ts).
- Capture types into @types: CaptureTarget -> tools/capture/@types/, SceneShot + ShotOutcome
  -> tools/@types/capture/. CLAUDE.md now states the tools rule (tool app -> its own
  @types/, shared helpers -> tools/@types/<area>/). The other 16 offenders swept in #775.
- CARD_IMAGE_DIR (src/data/palette/cardImageDir.ts) is now the single home for the card
  image path; cardImageSrc and the capture tool's OUTPUT_DIR both derive from it. They used
  to be two copies whose drift would break every card silently.

## Queued

1. Squash-merge #765 — AUTHORIZED by the user 2026-09-20 ("merge 765 when CI lands"),
   conditional on CI green.
2. Then merge #775 (tools .d.ts sweep) — also authorized; mark it ready first, it is a draft.
3. Then remove the agent isolation worktree agent-ab857b19a1db4158e (+ its branch).
