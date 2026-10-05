# Ledger — docs/superpowers/plans/2026-09-20-search-palette-tabs-pr3.md (PR 3b)

Worktree `search-tabs-pr3b`, branch `worktree-search-tabs-pr3b`, **draft PR #793**.
Base was `c9ed78a29` (3a); `origin/main` has since been merged in (it moved — see Log).
This ledger is gitignored and dies with the worktree — the durable resume map is the
memory file `project_search_palette_tabs.md`.

## Landing

| PR | Tasks | State |
| --- | --- | --- |
| 3a #781 | 10, 1, 2, 3 | MERGED `c9ed78a29` |
| **3b #793** | **4, 5, 6, 8** | **RUNNING** — draft, review done, fixes in |
| 3c | 7, 9, 11, 12 | after 3b; `/feature-done` gates all 12 there |

## Standing rulings (do not re-ask)

- `featured` → `curated` rename DROPPED. Names all stay.
- A view hides the palette exactly like a tour (`App.tsx` hide term is `takeoverActive`,
  shipped in 3a) — cross-source supersede unreachable from the UI, not a smoke item.
- Subagent-driven, lean protocol. **No perf gate** for 3a/3b/3c.
- The user writes all view copy. The `cosmicWeb` draft on artboard V6 is approved copy.
- **Fonts are SELF-HOSTED** (user, 2026-09-21). No `fonts.googleapis.com` link in
  `index.html` — `@font-face` in `src/styles/global.css` beside Cormorant's. Reason:
  an external request blocks first paint, and the backlog's desktop-offline build
  would break on it.
- **Body font is Sora Thin 100**, 13.5px/1.6, `#cfd8ff`, fallback `system-ui, sans-serif`.
  (The user floated Space Grotesk 300 and then corrected themselves — Sora stands, and
  spec §4.3 / plan Task 8 were right all along and need NO edit.)

## THE DESIGN IS THE CONTRACT

The user's ruling 2026-09-21: *"you have to look at the design, and make sure you can
reproduce it fully."* What shipped first reproduced ~1/3 of it.

- Canvas: **https://claude.ai/code/artifact/71771eee-45d3-41f5-957a-01bd03d931fc**
- Authoritative artboard: **`ViewIntegrated.dc.html` = "V6 · V5 without the card,
  galaxy toggle (round 3)"**, 1440×900. Body-font authority: `BodySora.dc.html`
  = "Body · Sora · 100".
- To get them back: `Artifact action:read` the URL (saves the full page under
  `tool-results/`), then
  `node <bundled-skills>/design/seed-canvas.mjs --extract <that file> --to <fresh dir>`.
  The current extract is in the session scratchpad, which does NOT survive the session.
- Where artboard and spec §4.2 disagree, **the artboard wins**.

## Dispatches

- A — T4 + T5 (`View`/`ViewSection`, `viewRegistry`, `flyToPoseClip`): DONE `57e19bcbd`, `b07539ec9`
- B — T8 (`ViewOverlay` first cut): DONE `68fa7b13f`
- C — T6 (`openView`, `viewBody`, watcher): DONE `998daf034` + fix `def6a5877`
- D — doc-comment sweep (14 files): DONE `e7df248fd`
- Review (opus, whole branch): DONE — 2 blockers + 8 findings
- Fix round: DONE `0a96c0344`, `da67f7150`, `bd3c70ceb`
- E — ViewOverlay rebuilt to V6 (opus): DONE `3d51dee47` (types + registry),
  `a89c058cf` (component + CSS + self-hosted Sora)

**All four tasks + review + fixes + the V6 rebuild are IN. `6fffcd57f` is pushed and
CI IS GREEN** (suite 13717/1370). Nothing is in flight. The only thing left before
merge is the user: the eye-check, the three rulings below, and the poses/copy.

Two post-rebuild changes from the user's live look (2026-09-21):

- `d4718c349` **the fly-in's last frame snapped away** — the boot home seeds Earth
  into `selection.focus` (`EARTH_HOME`), Earth moves with the sim clock, so
  `followApproach`@55 is active for the whole takeover and wins the frame clip@95
  ends on, easing toward Earth's framing. `tourBody` clears the slot for exactly
  this reason; `viewBody` now does too. Regression test asserts focus is null AT
  PLAY TIME (clearing later is too late); mutation-verified.
- `6fffcd57f` **Cosmic Web now enables the 2MRS Polyphorm volume** beside MCPM
  (user ask: MCPM is the SDSS wedge only, 2MRS is all-sky). Cubes are on disk;
  `volumes` is a captured cluster so the restore winds it back. OPEN: 2MRS is
  viridis, MCPM inferno, and the overlay's Key shows only the inferno ramp —
  recolour or extend the key if the two palettes fight on screen.

### Dispatch E's brief, in case it dies mid-task

Rebuild `ViewOverlay` + `viewRegistry` to reproduce V6 fully. Three corrections were
sent to it after the original brief; all three stand:

1. `ViewSection` becomes a discriminated union — one type per file in `src/@types/views/`:
   `ViewProseSection{kind:'prose',heading,text}` | `ViewKeySection{kind:'key',heading,
   ramp:readonly string[],ends:readonly string[],toggle?:ViewToggle}` |
   `ViewFactsSection{kind:'facts',facts:readonly ViewFact[]}` |
   `ViewSourcesSection{kind:'sources',heading,links:readonly ViewSource[]}`;
   plus `ViewFact{label,value}`, `ViewSource{role,title,citation,href}`.
   `View` gains `lede: string`.
2. **`ViewToggle` arms are `readonly UnknownAction[]`, NOT settings patches** (user:
   *"the toggle is just one ui element, it can do any call to the store"*).
   `ViewToggle{label,onWord,offWord,on,off}`. `cosmicWeb`'s arms are
   `[mergeSnapshot({galaxyCatalogs: galaxyCatalogsInitialState})]` /
   `[mergeSnapshot({galaxyCatalogs: GALAXIES_OFF})]`, words "shown" / "hidden in this view",
   default off. Needs NO saga change — `runTakeover`'s snapshot already restores it.
3. Sora Thin 100, **self-hosted**: `public/fonts/Sora-Thin.woff2` is already on disk
   (14,460 B, latin subset, SIL OFL 1.1, UNTRACKED — must be staged). `@font-face` in
   `global.css`; NO Google link in `index.html`; extend `index.html`'s Cormorant comment.

Two rulings inside the rebuild: the hairline rules render implicitly above every
`facts` and `sources` section (presentation, not content — no `rule` section kind);
the toggle's switch state is local React state in the container keyed by view id.

Gates: both tsconfigs clean + full `npx vitest run` green. Two commits
(types+registry, then component+CSS).

## Open — needs the user

Dev server for all of this: **http://localhost:5176** (Cmd+K → Highlights → Cosmic Web;
the other three views are placeholder copy).

0. **Three rulings from the V6 rebuild:**
   - `cosmicWeb.label` is `'Cosmic Web'`; the artboard's title is `'The Cosmic Web'`.
     `label` also drives the palette card and search row, so it reaches past this PR.
   - The exit pill imports `TourOverlay/StopIcon` (byte-identical glyph) rather than
     duplicating it — a cross-folder import of a folder-scoped sub-component. Could
     move to `src/components/common/`.
   - **The lede's italic is SYNTHESISED**, not a true italic: the artboard uses Google's
     Cormorant variable font with a real italic axis; the app self-hosts only
     `CormorantGaramond-SemiBold.woff2` (upright, 600). So it renders as an oblique of
     the 600 face, heavier than the artboard's 500. Fix if it reads wrong = a second
     self-hosted Cormorant italic file. **Most likely of the three to need action.**
   - Also user-owned: the `lede` for the other three views is a "Coming soon" placeholder.

1. **Two poses.** `solarSystem` and `observableUniverse` are placeholders. Tool is the
   debug panel's "copy view pose" button (3a), free orbit only.
2. **Eye-check**, mandatory per plan: Sora 100 over bright filaments. If thin, RAISE
   THE SIZE before the weight.
3. **Review finding #4, unruled — a view's bearing is frame-relative.** `viewBody`
   passes the viewer's live `selectOrientation` to `playClip`; `cosmicWeb`'s yaw/pitch
   were framed in the ecliptic default. Opening it from a galactic/supergalactic frame
   lands on the right target at the wrong bearing — the exact failure the `aimAt` arm
   was added to prevent. Fix would be `frame?: OrientationFrameId` on `View`. Not done:
   speculative until the user says they leave the default frame.
4. **Review finding #9** — superseded by the "reproduce the design fully" ruling; the
   union above is the answer. Nothing left to rule.

## Log

- 2026-09-21 — wt `search-tabs-pr3` removed (30 commits, all inside #781's squash);
  stale `search-tabs` wt + branch removed. Fresh wt off `c9ed78a29`, `public/data`
  symlinked, deps installed.
- **main moved under the PR**: #791 (Layer settings restructure) merged as `205a77200`,
  deleting every `src/layers/*/settings/*Slice.ts`. Agents' local typechecks were
  honestly clean against a main that no longer existed; CI caught it. Merged main,
  repointed 4 imports to each Layer's new `state/<slice>/initialState.ts` (`db43384bf`).
  Same class as 3a's `selectCameraBase` break. **`npm run typecheck` runs BOTH tsconfigs
  — `npx tsc -p tsconfig.json` alone misses the tools project.**
- **CI never fired for `db43384bf`** — `gh run list` shows only the pre-merge failure.
  Not red, absent. Re-check after the next push; if still nothing, the workflow trigger
  needs investigating.
- Review blocker 1: PR1 shipped THREE interlocking `view` placeholders; Task 6 removed
  only the container stub, so `openView` was unreachable — the PR's whole goal. Fixed
  and regression-tested (mutation-verified both ways).
- Review blocker 2: the new `openView` watcher test is the ONLY one that catches moving
  `call(() => settled)` out of the `if (running)` block; the existing tour-supersedes-tour
  test passes under that mutation.
- `take([startTour, openView])` widens `action` to `any` in typed-redux-saga, so the
  watcher's third branch is load-bearing for definite assignment — it throws now.

### Polish pass, 2026-09-21 — ten commits after the review, all user-driven

Each one came from the user looking at the running app; **verdict on the last round was
"no thats pretty nice"**, so the fly, the drift, the staggered copy and the balance are
all signed off by eye. Head `100df2744`.

```
100df2744  style(views): balance the view overlay's headings and lede
79cbd9917  feat(views): hold a view's copy back until the fly-in lands, then stagger it in
1622a1184  feat(views): drift the held view the way the fly-in was already turning
3940d7d93  fix(views): overlap the fly-in's pivot slide with the pull-back's tail
4b268401f  feat(views): let view copy carry inline links, and link the slime mould
16e957793  feat(views): drift the camera slowly while a view is held
d3fb78ef1  fix(views): fly to a view's pose in two legs, not one parallel block
2d1f2c1c0  feat(volume): default the 2MRS Polyphorm run to inferno, like MCPM
6fffcd57f  feat(views): show the 2MRS Polyphorm volume in the Cosmic Web view
d4718c349  fix(views): clear the focus slot before a view's fly-in
```

The three findings worth keeping, because the code only carries their conclusions:

- **The fly-in's last frame snapped** because the boot home seeds Earth into
  `selection.focus` (`EARTH_HOME`, `seedSelection: true`) and Earth is sim-clock
  propagated, so `followApproach`@55 stayed live under the clip and won the frame the
  clip ended on. `tourBody` already cleared focus for this reason; `viewBody` now does
  too. Eliminated first: commit-on-edge staleness, a leftover tween@60, autoRotate, and
  URL-pose echo.
- **The fly-in's pacing is governed by log-vs-linear, not by duration.** `distance`
  interpolates in log space, `target` can only move linearly (log is undefined for
  signed Vec3), so one parallel block slews the world absurdly early and barely at all
  late. Hence two legs — and hence the overlap between them is capped at the pull-back's
  last sixth: from the boot home (~1e-15 Mpc) to 251 Mpc the ramp spans ~17.6 decades
  and the camera is **still inside the Galaxy at 80% of it**. At `REFRAME_JOIN` (0.85)
  the pivot's opening degrees cost ~0.1 rad/s; at 0.75 they cost ~0.5 and it lurches.
  Any future "make the fly smoother" edit has to respect that ceiling.
- **`camera` is NOT in `runTakeover`'s scene snapshot** (it covers settings, orientation
  and focus). So `viewBody` restores `camera.autoRotate` itself, in a `finally` — which
  a generator also runs on cancellation, so a supersede winds the drift back as surely
  as an exit does. Both paths are tested; both mutations verified.

Timing now lives in two places that must agree, and the code makes them agree:
`flyToPoseClip` exports `FLY_TO_POSE_SEC` (its own legs summed), `ViewOverlayContainer`
subtracts `COPY_LEAD_SEC` and hands the overlay one `--view-enter-delay` that every
entrance in the stylesheet is offset from. A test pins the exported total against the
timeline, since nothing else would notice copy arriving early.

Two flakes seen once in a full local run (2 tests, 3 files) that a clean re-run did not
reproduce; names lost to a `tail` pipe. Not caused by this work, but they exist.

### Views + card thumbnails, 2026-09-21 — four more commits, head `fc550eef7`

```
fc550eef7  feat(palette): capture thumbnails for the four view cards
0b7cd05a5  feat(views): write the Cosmic Flows and Solar System views
b2c174aa9  refactor(views): one file per view, with the registry just assembling them
c8b5a65c1  feat(capture): shoot view cards, and split declutter into labels and scene
```

**User rulings this round** (asked, answered, do not re-ask):

- Cosmic Flows copy: **"draft the copy, you edit"** — the user-owned-copy standing rule is
  relaxed to "agent drafts, user rewrites". First draft was rejected: **"terrible copy, lots
  of llm tells"** (rhetorical openers, "what is left is", flourishes). Rewritten flat, then
  **"shorten"** again. The register that passes is the Cosmic Web copy's: plain declaratives,
  concrete numbers, no framing sentence, ≤3 sentences a section.
- View cards get thumbnails by **teaching the capture tool views**, not by hand-placed
  screenshots.
- Cosmic Flows **shows the Milky Way with its "you are here" label** (that label IS the
  marker — `MilkyWaySettings.labelEnabled`) and **must not show the cosmic web** (MCPM is
  default-on, so the view sets the volumes master gate off).
- `viewRegistry.ts` is **one file per view**, registry assembles only.
- Solar System view: **make it** — pose no longer blocked on the user's own capture. 42 AU,
  from above the ecliptic.

**Two capture bugs found past the subagent's report** — it declared its end-to-end shot
"correct" and it was not. Both are ordering/scope problems, both now have README sections:

1. A settings snapshot is a WHOLE-CLUSTER replacement, so a view's `galaxyCatalogs` carries
   the Layer's default `labelEnabled: true`. Dispatched after declutter it switched the labels
   back on — the first `cosmicFlows.webp` had "Andromeda Galaxy", "LMC", "SMC" burned in.
2. Fixing that order then stripped the Solar System card's orbit rings, because declutter
   turns trails off. Opposite needs from one list ⇒ split: `labelDeclutterActions` (every
   shot) and `sceneDeclutterActions` (focus shots only). Order is scene → settings → labels.

**Open, needs the user:**

- **Cosmic Flows card is dark.** Honest to the view at that pose. `flow.intensity` (0.18,
  `layers/flow/state/defaults.ts`) is the only knob, but it changes the VIEW's look, not just
  the thumbnail — not touched without a ruling.
- **`observableUniverse.webp` shipped on an unverified placeholder pose.** Looks plausible
  (SDSS wedges around a bright core). Recapture when the pose is framed.
- Solar System's pose is agent-derived, not user-captured: 42 AU, pitch −0.6 rad, yaw 0
  (arbitrary — the system is near enough symmetric about its pole).

**In flight at this mark:** full local suite (background task). CI for `fc550eef7` had not
yet appeared in `gh run list` — the documented lag; find it and watch before reading any
"no checks" as an absence. Do NOT merge #793 without the user's explicit word.

---

## Round 3 — pickable kinds, aspect-aware fit, Zone of Avoidance (2026-09-21)

Head `969330ea3`, CI green. Five commits on top of `e60823ceb`:

| sha | what |
| --- | --- |
| `05a6b4956` | `picking` settings cluster — per-view pickable selection kinds |
| `ccc54fd62` | aspect-aware sphere fit + raised distance/far ceilings |
| `181f63112` | fix: Solar System pitch sign was inverted |
| `6636dc12e` | fix: horizon radius pulled a GPU renderer into Node's import graph |
| `969330ea3` | Zone of Avoidance view + Milky Way card |

**User rulings this round (asked, answered, do not re-ask):**

- **Raise the ceilings** for the Observable Universe fit. `MAX_DISTANCE_MPC` 30 000 → 60 000,
  `FAR_CLIP_MPC` 50 000 → 80 000. The alternatives offered and declined were clamping (which
  leaves portrait cropped) and letting the view widen its own FOV (which would have broken
  `SettingsSnapshot`'s deliberate exclusion of the `camera` cluster).
- **Zone of Avoidance is the Milky Way tab's second card**, "explaining what it is".

**Design decisions, with the reasoning that forced them:**

- **Pickability is keyed on selection KIND, not source code or "layer".** Source-code
  granularity is unreachable: `SourceMasks` is a 32-bit mask and `Source` codes already reach
  32 (`MeshBody`), and `Source.Sun` is never stamped — the Sun's dot picks as `FamousStar`
  (21), so "the Sun but not Sirius" does not exist at pick level either. `SelectionKindRow` is
  closed at six kinds and already asserted total + disjoint by `assertSelectionRowsDisjoint`.
- **The gate lives in `composeSelectionRows.resolvePick` and NOWHERE else.** Click and hover
  deliberately share that seam so they cannot drift. `extractRow` / `resolveFocusId` /
  `focusIdOf` stay ungated: a deep link, a palette row or a restored URL selection must still
  resolve a kind that scene-clicking cannot reach.
- **Known softness:** the `kindsEnabled` parameter is optional, defaulting to all-true, so a
  future call site that forgets it silently gets everything pickable rather than failing to
  compile. Tested, but put to the user and not yet ruled.
- **A sphere fits with `R / sin(θ)`, not `R / tan(θ)`.** All three existing framing helpers
  (`structureFocusDistance`, `bodyFocusDistance`, `bodyPhasePose`) use `tan` — the flat-disc
  approximation, which under-distances materially at R/d ≈ 0.5. Left alone; the new
  `sphereFitDistance` says why in its header.
- **The limiting half-angle is horizontal in portrait:** `atan(tan(fovY/2) · min(1, aspect))`.
  A static `pose.distance` is wrong regardless of aspect anyway, because FOV is a live user
  slider — hence resolve-at-fly-time via `View.fitRadiusMpc`.

**LANDMINE — the Zone of Avoidance band has a SCALE WINDOW, and it is narrow.**
`zoneOfAvoidanceLayerOpacity` composes an approach band with
`SCALE_FADE_BANDS.zoneOfAvoidanceRecede` (full at 2 Mpc, **gone by 6**). The guide is scoped
to the Milky-Way-context shot on purpose. The first two poses tried (700 Mpc, then 200 Mpc)
drew NO BAND AT ALL — the captures looked like a plain dense galaxy field, which is easy to
misread as "the band is too faint" rather than "the band is switched off". The view is at
**1.2 Mpc**. Aim toward the galactic CENTRE, where the wedge is 10° wide, not the anticentre
where it narrows to 3°.

**LANDMINE — pitch is POSITIVE above a plane.** `orbitAnglesLookingAlong` solves
`pitch = asin(-forward.y)` and `-forward` runs from target toward the EYE. The Solar System
view shipped at −0.6 with a comment arguing the inverse, i.e. viewed from below the ecliptic.
A card eye-check cannot catch this — the system is near enough symmetric about its plane that
above and below differ only in which way the planets go round. Derive poses through that
helper (never a hand-rolled inverse) and sanity-check the sign against a known case.

**LANDMINE — `data/` must not import from `services/gpu/renderers/`.** A renderer module drags
its `.wesl` imports along, and tsx cannot load `.wesl`, so any such edge breaks
`npm run capture-featured` outright — it dies before drawing a frame. Constants belong in
`data/`, with the renderer as the consumer.

**Also worth knowing:** `ViewProseSection`'s header claimed `<i>` was the only markup parsed;
`inlineSegments` has handled `<a href>` since the Cosmic Web copy shipped a link. Corrected.

**Open, needs the user:**

- **View copy for Zone of Avoidance is an agent draft**, per the standing "agent drafts, user
  rewrites" ruling. Facts verified live (Wikipedia ZoA; Kraan-Korteweg & Lahav 2000,
  `arXiv:astro-ph/0005501`). Deliberately NOT cited: the shell's 3–380 Mpc extent and its
  10°/3° half-widths, which `zoneOfAvoidanceShell.ts` labels "visual-pass placeholders" —
  render tuning, not physics.
- **`solarSystem` and `observableUniverse` card blurbs still say "Coming soon".**
- The two carried-over items below (dark Cosmic Flows card; `observableUniverse` pose) —
  note the latter is now moot for FRAMING, since `fitRadiusMpc` computes the distance, but
  its `target`/`yaw`/`pitch` are still the placeholder's.
- Still unruled: the optional-parameter softness in `composeSelectionRows` above.

**Do NOT merge #793 without the user's explicit word.**

---

## Round 4 — 3c landed on the SAME branch (2026-09-21)

The user said "finish the feature". 3c was planned as its own PR *after* 3b merges, but
merging #793 needs their explicit word, which has not been given — so tasks 7, 9 and 11
ride `worktree-search-tabs-pr3b` too. **#793 now carries 3b AND 3c.**

**CI GREEN at `09bb079d8`.** Full suite 13764 / 1371 files.

### Housekeeping the user asked for mid-flight

- `a0b83e330` — dropped the self-referencing `// src/path/to/file.ts` line from 91 module
  headers. The five `.generated.ts` banners KEEP theirs: `tools/bodies/buildPlanetFacts.ts`
  and its four siblings re-emit the line on every build, so hand-removing it is churn.
- `a8ed51198` — `galaxiesOff.ts` / `volumesOff.ts` → `src/data/views/utils/`.
- `cb476b6e2` — `viewBody.ts` → `viewBodySaga.ts`, symbol renamed too. `flyToPoseClip` and
  `runTakeover` are the same shape and still unsuffixed; left alone, user informed.
- `adcb9d42b` — `flyToPoseClip.ts` → `src/data/animation/clips/makers/`. It is a pure
  `(pose) => ClipData` with no store involvement, same shape as `makeEarthLoop`, so
  `src/state/scene/` was wrong. Its siblings `flyToClip` / `flyAndFocusOnClip` are equally
  pure and still in `src/state/tour/` — pre-existing, left alone.
- `8b81f5025` — `src/data/source.ts`'s MilkyWay docblock said "not pickable". It IS:
  `milkyWayPickRenderer.ts:177` stamps the code and `milkyWaySelectionRow` resolves it.

### Pickability audit (user asked "is that all the pickable layers?")

Verified both directions, not asserted:

- `rg 'SelectionKindRow<'` returns exactly SIX row constructions. `PickingSettings.kinds` is
  `Record<SelectionKind, boolean>` keyed on `SelectionRef['type']`, so the set cannot drift.
- Enumerated all 32 `Source` codes against what the rows claim. Every UNCLAIMED code
  (Filaments 9, the five volumes, Flow 17, Constellations 25) has no `drawPick` — registry
  keys for toggles, never stamped. Nothing is missing.
- **Labels need no kind of their own**: `labelsPass.drawPick` stamps the SUBJECT's packed id,
  so a label is gated by its subject's kind.
- **Granularity caveat, unchanged:** `body` swallows planets, Earth, the Sun, Sgr A\*, the
  S-stars, the curated famous stars AND the mesh bodies. Solar System's
  `body: true, star: false` therefore leaves Sirius and the whale pickable — `star` is only
  the Gaia survey bin. Splitting needs new source codes (33..62 are free), not new kinds.

### Tasks 7 + 9 — `1e6eea109`, `deff0cce4` (Sonnet dispatch)

Tours tab (`grandTour`, `webShowcase`), `tour` member on `PaletteAction`, `view`/`tour`
search rows. `actionForRow` un-braided: the `FOCUS_ID` table + hard-coded `{kind:'focus'}`
became one `ACTION_FOR_ROW` table returning each kind's own action; test went 2 → 7 kinds.
There was NO hidden-tab condition to remove — PR1 never shipped one, `'tours'` simply was
not in `PaletteTabId`.

### Task 11 — `09bb079d8` — THE PLAN WAS WRONG HERE

Plan: "a tour's first beat is a focus, so those shoot the ordinary way with a `focusId`."
**`BeatData` is `caption` / `dwellClip` / `enterClip`** — a beat's focus lives inside a clip
cue and is not reachable from the card. A tour card has nothing to fly to AND no registry
pose to inherit. So:

- third `CaptureTarget` kind `'pose'`, framed by `capture.pose` alone;
- `PaletteCardCapture.settings?` so a tour thumbnail can mirror its tour's scene strip;
- a tour card with no pose THROWS, matching `shotPose`'s refusal of a poseless shot.

The capture-tool half of Task 11 (`focusId` optional) was already done in an earlier round.

**Open, needs the user:**

- **The two tour framings are a first pass and should be re-framed.** Grand Tour is a
  blown-out core at 1500 Mpc (volumes off); Named Cosmic Web is a bright knot at 220 Mpc.
  Neither shows structure rings or names — at ~200px labels never read, so the tour's
  signature is not capturable that way. Add both to Task 12's pose list beside
  `solarSystem` and `observableUniverse`.
- **`demo` gets a palette search row.** `tourRegistry` includes it and nothing on `Tour`
  marks a tour user-facing. Cheap fix: exclude at the one `rankPaletteMatches` call site.
  Honest fix: a field on `Tour`. UNRULED.
- Two tour blurbs say `'Coming soon'`.
- Zone of Avoidance copy is still an agent draft.
- `observableUniverse` lede/body are now WRITTEN (`2aad70ea5`); its `target`/`yaw`/`pitch`
  are still the placeholder's.
- `composeSelectionRows`' optional `kindsEnabled` — still unruled.
- DoD's manual smoke pass — not run. Dev server is on :5176.

**Do NOT merge #793 without the user's explicit word.** `/feature-done` gates all twelve
tasks and will come back NOT READY until the smoke pass and the copy land.

### Round 4b — three rulings closed (2026-09-21), CI green at `e627573f2`

- **Blurbs: "you can write the blurbs".** Both tour cards written (`5265ee7d0`). Every
  card blurb and every view's copy is now authored — no "Coming soon" left anywhere.
- **Poses: "its ok for now".** The two tour framings stand as captured. Do NOT re-frame
  without a new ask.
- **`demo` tour: "lets give tours a dev property to distinguish"** → `15a25dc3d`.
  `Tour.dev?: boolean`, absent = user-facing, so a new tour is public unless it says so.
  ONLY `rankPaletteMatches` filters on it — a dev tour stays launchable from the debug
  panel and by id. Test mutation-verified (dropping the filter fails it).
- **`kindsEnabled` made REQUIRED** → `e627573f2`, after the user asked for a plain-language
  explanation and then a call-site count. **My count was wrong**: I said 6 files because I
  assumed the two `tests/support/` helpers covered the saga tests. They do not —
  `watchFocusTweenSaga.test.ts` and `watchTierSaga.test.ts` call `composeSelectionRows`
  directly. Real edit was 7 files. `ALL_KINDS_ENABLED` now lives in
  `tests/support/allKindsEnabled.ts`, NOT exported from production; the
  `omitting kindsEnabled defaults every kind to enabled` test was deleted with the default.

**ALL implementable work is done.** Suite 13764 / 1371 files.

**The only thing left is Task 12's manual smoke pass** (dev server :5176), which the agent
cannot do. Load-bearing items: a view card flies + shows the overlay; orbiting does NOT end
a view but Esc and Exit do, and both restore the previous scene; a tour still runs normally;
typing a view or tour name gives a launching row. Then `/feature-done` over all twelve tasks.

**Do NOT merge #793 without the user's explicit word.**

### Round 5 — View renamed to EXHIBIT (2026-09-21), `7c3c2ca03`, CI green

The user: *"view ... is such a generic name"*. Grounding for the change, not taste:
`view` appears **1407 times** in `src/services/gpu` + `src/services/engine/frame` +
`src/utils/camera` (`viewportPx` 328, `viewProj` 180, `ViewSlot` 11, `FrameView` 1). The
domain type sat on the renderer's most-used word. `exhibit` had ZERO prior hits.

Supporting evidence for the museum register: `BeatData`'s docblock already calls a tour
beat's caption "the beat's **placard**" — the metaphor was native before this.

**Renamed:** `src/@types/views/` → `@types/exhibits/` (10 types, `View`→`Exhibit`,
`ViewSection`→`ExhibitSection`, …); `src/data/views/` → `data/exhibits/`
(`viewRegistry`→`exhibitRegistry`); `src/state/views/` → `state/exhibits/`
(`openView`→`openExhibit`, `viewBodySaga`→`exhibitBodySaga`); `ViewOverlay/` →
`ExhibitOverlay/` + container. Discriminant `kind: 'view'` → `'exhibit'` and `viewId` →
`exhibitId` in `PaletteAction`, `ScoredRow`, `TakeoverSource`, `CaptureTarget`.

**METHOD IS THE POINT — never text-replace the bare word `view`.** `npm run move-files`
for the 26 moves, ts-morph `npm run refactor -- rename` for symbols. Verified after:
renderer counts byte-identical, straggler grep empty, suite 13764/1371 unchanged.

**TOOLING GAP FOUND:** the refactor CLI's `resolveSymbol` indexes by EXPORTED name, so a
component written `function X() {} … export default X` is exported as `default` and its
identifier is unreachable — four components had to be hand-renamed (declaration, default
export, imports, JSX call sites). Remember this for any future component rename.

Deliberately left alone: `ROW_VIEW`/`RowView`/`EMPTY_ROW_VIEW` (the row-rendering sense),
authored exhibit copy containing the word "view", and all renderer vocabulary.

**FOR THE USER, unruled:** the agent also changed ON-SCREEN COPY unprompted — the
overlay kicker `View` → `Exhibit` and the pill `Exit view` → `Exit exhibit`
(`ExhibitOverlay.tsx:47` and `:77`). Defensible, but visible copy is the user's under the
standing rule and a visible label is a different decision from a type name. Flagged.

**`docs/` STILL SAYS "view" ON PURPOSE** — plan + spec + the design canvas. The plan's DoD
deliverable inventory names `src/data/views/viewRegistry.ts`, so `/feature-done`'s
modified-files-vs-plan check WILL report a mismatch. That is a known, deliberate gap; the
user was offered a docs sweep and has not ruled.

### Round 5b — copy revert (2026-09-21), `b0b5859ca`

User: *"Exit exhibit on the pill - revert that"*. Done — `ExhibitOverlay.tsx:77` reads
**`Exit view`** again. The rename changed visible copy that was not its to change; the
TYPE is an Exhibit, the PILL keeps the user's wording.

**OPEN, named to the user and unruled:** the kicker at `ExhibitOverlay.tsx:47` still says
**`Exhibit`**, so the two on-screen strings now disagree with each other. The user named
only the pill. Worth one glance during the smoke pass.

### IN FLIGHT at this point

- Background shell `bdd86bypr` watching CI for `b0b5859ca` (in_progress at time of
  writing). **Handling: green → nothing to do; red → read the failed job log and
  diagnose.** Every prior commit on this branch has been green; this one is a
  one-string copy change with typecheck + `tests/components` (252) already green locally.
- Dev server on **:5176**, background shell `b06lwgdgy`. **DO NOT KILL** — the smoke pass
  and any recapture need it.

### THE QUEUE, verbatim

1. **User's manual smoke pass on :5176** — the only thing left. Load-bearing items:
   an exhibit card flies + shows the overlay and the scene's settings change; orbiting
   does NOT end an exhibit but Esc and the Exit pill both do, and both restore the
   pre-exhibit scene; a tour still runs normally (beats, captions, rail, prev/next/pause);
   typing an exhibit or tour name in the palette gives a row that launches it, and the
   Tours tab shows its two cards; the Sora-100 body text is legible over bright filaments.
2. **Then `/feature-done`** over all twelve tasks. EXPECT ONE KNOWN FINDING: the plan's
   DoD deliverable inventory names `src/data/views/viewRegistry.ts`, which no longer
   exists — `docs/` deliberately still says "view". The user was offered a docs sweep
   (plan + spec) and has NOT ruled; the design canvas artboards are theirs to edit.
3. **Merge #793 ONLY on the user's explicit word.** Not given.

### Round 5c — CI green, kicker/pill ruled

- CI for `b0b5859ca` settled **green** (typecheck · test · format).
- **RULED:** the kicker at `ExhibitOverlay.tsx:47` reads `Exhibit` while the exit pill
  at `:77` reads `Exit view`. User: "thats fine". Not a finding, not to be changed.
- Queue unchanged: smoke on :5176 → `/feature-done` → merge only on the user's word.
