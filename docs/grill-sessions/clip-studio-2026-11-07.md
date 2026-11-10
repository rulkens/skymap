# Grill Session: Clip studio — a scrubbable, editable clip timeline — 2026-11-07

Source: owner request in chat (cloud session), plus a parallel UI/UX investigation with mockups in
the real UI (`npm run mock`).

The animation system makes the camera pose a pure function `evaluateClip(data, t)`. The owner wants a
UI in which anyone can design their own science animations. It starts with a scrubbable timeline of
one clip that shows the clip's structure as nested blocks (`seq`/`all`/`fork` around actions), where
blocks and actions can be selected and their parameters edited. It is a new package (TS, React, Vite,
RTK) that runs as an overlay mode in the app and previews on the real renderer.

---

## Q1: What does scrubbing to time t show?

**The question:** The camera is pure in t, but scene cues are not. `clipPlayer.tick`
(`src/services/engine/subsystems/clipPlayer.ts`) fires each cue edge-triggered when the wall-clock
epoch crosses `atSec`. `show`/`hide` dispatch Redux `setVisibility`, and `fade` calls
`clipOpacity.fadeTo(…, nowMs)`. Nothing can pause or seek. If you drag the playhead backwards over a
`hide`, the camera goes back and the layers stay where they were.

**Considerations:**

- **Option A (replay to t):** studio-enter captures the scene. On each seek the studio restores that
  capture and re-fires every cue with `atSec ≤ t` at once, with fades stamped on the clip clock.
  Medium engine work, but the edge-triggered player stays as it is, beside a seek path.
- **Option B (camera only):** only the camera scrubs, and cues fire only on play-from-start. Cheapest,
  but the scrubbed frame shows the wrong layers.
- **Option C (scene as pure tracks):** compile the cues into per-address tracks that are evaluated
  every frame, the way camera channels are. Scene state becomes a function of t. It is the cleanest
  model and the only one where "deterministic" holds for the whole frame. It is also a large engine
  change, because `show`/`hide`/`scene` are Redux intent writes today.

**Decision:** C, scene as pure tracks. The owner chose the model in which the whole frame, scene as
well as camera, is a function of t. That is the claim the system already makes. Per "finish what you
start", the tracks replace edge-triggered cue firing for every clip (tours, recorder, studio), so no
second cue path is left standing beside them. This is ground preparation that comes before the
studio UI.

## Q2: What happens to a clip's scene when it ends?

**The question:** Today a standalone clip "leaves the scene alone" (`clipBodySaga` header): its
`show`/`hide` intent writes persist after it ends, and only `fade` resets to 1
(`clipPlayer.resetState` → `clipOpacity.reset()`). Tours and exhibits wrap themselves in
`captureScene`/`restoreScene` instead. Pure tracks need a rule for the scene once t passes the end.

**Considerations:**

- **Option A (bake, fade drops):** `show`/`hide`/`scene`/`focus`/`frameTo` bake their final values
  into intent, the way the camera bakes its final pose, and `fade` stays transient. This keeps
  today's standalone behaviour.
- **Option B (always revert):** a clip's scene exists only while it plays. At the end everything
  returns to the pre-clip intent. It is the simplest model, but it changes today's clips: for example,
  `cosmicFlows` turns flow on, and that no longer persists.
- **Option C (per-clip flag):** the clip declares bake or revert. Flexible, but it is a speculative
  knob, which `leanness.md` calls a review finding.

**Decision:** B, always revert. The scene tracks are an overlay on user intent that exists only
while a clip is live, so a clip never writes intent. With nothing to bake, `show`/`hide` and `fade`
become keyframes on the same per-address track. The behaviour change to standalone clips such as
`cosmicFlows` (flow switches off again at the end) is accepted and must be called out in the spec.

## Q3: Who is v1 for, and does it ship?

**The question:** The answer decides where clips are saved and whether the package enters the public
build.

**Considerations:**

- **Option A (shipped, hidden):** a lazy chunk behind an unlinked `#studio` hash param. Testers use
  the deployed app, but saving must work without a dev server.
- **Option B (dev-only first):** mounted under `import.meta.env.DEV` like `?mock=`
  (`src/main.tsx:134`). It can save straight into repo files through the dev server, and nobody
  outside the repo can use it yet.
- **Option C (public from v1):** a visible entry from day one. Onboarding, phone layout and robust
  saving all land in v1, which roughly doubles it.

**Decision:** B, dev-only first. The studio is an authoring tool for the repo's own clips before it
is a product surface. A public path is a later step, built on what v1 proves.

## Q4: In what form is an edited clip saved?

**The question:** Today's clips are hand-written TS factories (`clipFactories: Record<ClipId,
ClipFactory>`, each `(simDays) => Clip`), often computed by makers (`makeEarthLoop`) and constants.
The editor can always produce a `ClipData` tree, but it cannot safely write one back into
hand-written TS.

**Considerations:**

- **Option A (JSON clip files):** `<id>.clip.json` written through a dev-server endpoint and picked
  up into the registry. Exact round trip, no codegen, but clips stop being TS.
- **Option B (generate TS source):** write `effectHelpers` calls (`seq`, `all`, `dollyTo`, …) as a
  `.ts` file. It reads like a hand-authored clip and diffs well in review. Reopening it needs a
  separate answer (Q5).
- **Option C (browser only):** localStorage plus `.json` export and import. Nothing reaches the repo
  without a manual step.

**Decision:** B, generate TS source. Clips stay in the one form the codebase already uses and
reviews, and a studio-made clip reads like a hand-written one in a PR.

## Q5: How does the studio reopen a generated clip, and what about hand-written ones?

**The question:** Generated TS is one-way unless reopening is designed in.

**Considerations:**

- **Option A (evaluate + regenerate):** studio files carry an `@generated` header and live in their
  own folder. Reopening imports the module and edits the `ClipData` it evaluates to. Saving rewrites
  the whole file. Hand-written clips open, but save only as a new generated clip.
- **Option B (parse with ts-morph):** read the helper calls back out of the source, so hand edits to
  generated files survive. It breaks as soon as a file uses a constant, a maker or a loop.
- **Option C (edit TS clips in place):** overwrite hand-written clips too, flattening makers and
  constants into literals. This destroys authored structure, such as `earthFlyout`'s
  simDays-dependent start.

**Decision:** A, evaluate + regenerate. Evaluation is the round trip, and no parser is involved. A
generated file is owned by the studio, which the header states. A hand-written clip is a starting
point for "save as new", never a save target.

## Q6: What can a person edit in v1?

**The question:** The answer sets the size of the first plan. Every camera parameter is a number
today (Mpc, radians), while the person is looking at the real renderer.

**Considerations:**

- **Option A (params + structure + view):** the inspector edits every parameter. A person can add
  from a palette, delete, reorder, wrap in `seq`/`all`, and drag a block edge to change `over`.
  "Use current view" on camera blocks fills `target`/`distance`/`yaw`/`pitch` from the live camera.
- **Option B (params + structure):** the same without the view input, so camera moves are authored
  as numbers.
- **Option C (params only):** open, scrub and change parameters, with no structure edits.

**Decision:** A. "Use current view" is what lets someone author a camera move without knowing Mpc
and radians, and that is the point of "anyone can design".

## Q7: What start pose does scrubbing use?

**The question:** Most clips start from `'live'`, and `resolveClipFoci` bakes `lookAtId`/`strafeId`/
`spinToId` bearings from the live pose. In a studio where you also fly the camera to capture views, a
`'live'` start makes the scrubbed result depend on where you last parked.

**Considerations:**

- **Option A (pinned preview start):** the studio captures a preview start pose when a clip opens. A
  person can re-capture it with "use current view" on the Start block. Scrub and play use it, and a
  clip saved as `'live'` stays `'live'`.
- **Option B (always a concrete start):** studio clips always save a fixed `CameraPose`. Fully
  reproducible, but such clips no longer chain from wherever the viewer is, the way tour beats do.
- **Option C (live on each play):** re-resolve `'live'` on every play or scrub. Scrubbing becomes
  non-deterministic.

**Decision:** A. Extended without a separate question: the studio also pins the sim instant and the
orientation frame basis when a clip opens. `clipBodySaga` already freezes the clock for exactly this
reason ("nothing drifts under a scripted move").

---

## Amendments (owner, 2026-11-09)

- **Q3 revised: lazy-loaded from day 1.** The owner asked to re-ask Q3 and ruled that the studio is
  a lazy-loaded chunk from the first version, not a dev-only mount (scope confirmed in Q8).
- **Q5 widened: hand-written TS clips are edited in place too** (Q5 option C, on top of A). Saving
  over a hand-written clip regenerates its whole file, flattening its makers and constants into
  literals. The owner accepts that loss in exchange for one home per clip. The spec must state what
  happens to factory clips whose start depends on `simDays` (`earthFlyout`).

## Q8: What does "lazy-loaded from day 1" mean?

**The question:** Does v1 ship in the public build as a code-split chunk, or stay a dev-only lazy
import?

**Considerations:**

- **Option A (shipped lazy chunk):** a code-split chunk behind an unlinked `#studio` hash param, in
  the public build. Writing TS files needs the dev server, so saving is dev-only.
- **Option B (dev-only, still lazy):** a lazy import under `import.meta.env.DEV`, like `?mock=`.

**Decision:** A, a shipped lazy chunk behind `#studio`. Saving stays dev-only.

## Q9: Which timeline layout?

**The question:** The UI/UX investigation shot three layouts in the real UI
(`data/shots/mock-studio-{a,b,c}.jpg`, Cosmic Flows at 4 s).

**Considerations:**

- **Option A (nested boxes):** NLE-style blocks inside their `seq`/`all` boxes, with a floating
  inspector. Compact and direct to drag, but cramped past two or three levels, and short cues lose
  their labels.
- **Option B (outline + tracks):** a named row per step, indented by nesting, with bars on a time
  grid and an inspector on the right. Readable at depth 4+, works from the keyboard, and every cue
  has a named row.
- **Option C (one row per channel):** camera channels and scene tracks as rows, with the structure
  as brackets above. Clashes are obvious, but the step structure being edited is secondary.

**Decision:** B, outline + tracks.

## Q10: How does the camera relate to the playhead?

**The question:** "Use current view" needs a free camera, and scrubbing needs one that follows the
clip. Mock B's pill offered "drag the sky to look around".

**Considerations:**

- **Option A (drag detaches):** follow until the sky is dragged, then fly free. A scrub, play or
  "Use current view" re-attaches. No extra control, but the mode changes implicitly.
- **Option B (explicit toggle):** a Follow / Free switch in the toolbar (key F). Nothing changes mode
  by accident, at the cost of one control. Dragging in Follow does nothing.
- **Option C (free when paused):** paused means free and play means follow. Scrubbing while paused
  becomes ambiguous.

**Decision:** B, an explicit Follow / Free toggle. The state is always on screen (the ui-ux.md
"state is on screen" rule), and no gesture changes it.

## Owner design preferences (2026-11-09, during the review loop)

The owner set these during the review loop. Every review round scores against them:

- **Crossfades:** better crossfade UI. A seq overlap blend, a matched join (no stop) and a plain rest
  must each look different, and layer fades must read at a glance.
- **Labels:** compact text, never whole sentences. One fixed naming scheme per effect type: a Name |
  Value | Duration row, a closed verb list, and an operator slot (`→` set to, `+`/`−` add, `±` swing),
  e.g. `Distance | → 300 Mpc | 4 s`, `Fade | flow → 0 % | 3 s`.
- **Scrubber:** a well-designed scrubber. A grab head that shows the time, a haloed playhead line, a
  sticky adaptive ruler with notches at step edges and cues, and a clear End marker with an
  after-end zone.
- **Encoding:** better use of colour, icons and UI elements for nesting, crossfades, effect types and
  channels. Five channel hues: distance, look-at point, turn and tilt, layers, settings and focus.

## Q11–Q17: The round-1 reviewer's asks

The first review round scored the mock 4/10 and raised these asks. Each records the reviewer's
recommendation and the owner's ruling.

- **Q11 Save over a hand-written clip:** options were a top-bar label only, an inline note once per
  clip, or a modal. **Decision:** an inline note once per clip, `Makers → literals · Save / Save as
  new`. It is also where the note on `earthFlyout`'s simDays-dependent start goes.
- **Q12 Dock height:** options were fixed, fixed plus a collapse key, or drag to resize.
  **Decision:** a draggable top edge, remembered per viewer, that always keeps at least 35% of the
  height for the 3D view.
- **Q13 Phone width (400 px):** options were a "wider screen" state, read-only scrubbing, or fully
  responsive. **Decision:** a "needs a wider screen" state with Play and Close only.
- **Q14 Crossfade treatment:** the options are T1 (tapered bars plus Stop / No stop / Blend join
  marks), T2 (a lens on the group row) and T3 (a value curve on the group row). **Open:** the owner
  asked to see images of all three before choosing.
- **Q15 Duration placement:** options were its own column or inline. **Decision:** its own dim,
  right-aligned column.
- **Q16 Loop scope:** options were the selection or the whole clip, the whole clip only, or a free
  band on the ruler. **Decision:** loop the selected step or group, or the whole clip when nothing is
  selected.
- **Q17 Snap:** options were on by default or off by default. **Decision:** on by default, with ⌥ to
  scrub freely and ⇧ for fine control.

## Q18–Q20: Fly-path asks (from the famousFlythrough mock)

- **Q18 Dragging a waypoint along the timeline:** options were to pin that leg and let the other
  legs re-split, to pin both neighbouring legs, or no drag. **Decision:** pin the dragged leg's
  `over`, and let the other unpinned legs re-share the remaining time by arc length. The knots that
  shift show as ghosts while dragging.
- **Q19 A composite's lane:** options were the evaluated speed curve with knots, or a flat bar with
  knots. **Decision:** the speed curve with knots: ramp, the slow-downs at waypoints, and the
  settle. The same lane serves `geodesic`.
- **Q20 Where waypoints appear:** options were child rows folded past about 8, always child rows, or
  knots on the lane only. **Decision:** selectable child rows, folded by default past about 8
  waypoints. The labelled knots stay on the lane when the rows are folded.

## Q21: An edit view and a camera view (supersedes Q10)

**The question:** The owner asked for "an edit view and a camera view". The camera view is what the
clip's camera sees at the playhead. The edit view is a free 3D view from outside, showing the path,
the look-at line and the camera frustum (the clip-path debug overlay). Should they be one viewport
with a toggle, or both visible at once?

**Considerations:**

- **Option A (toggle, renamed):** one viewport that switches between Camera view and Edit view. It
  replaces Follow / Free with clearer names and needs no engine change.
- **Option B (both at once, picture-in-picture):** the edit view is the main viewport and the camera
  view sits in a swappable inset. The framing and the result are visible together. The renderer
  must draw the scene twice per frame, which is a big engine change at roughly double the GPU cost.
- **Option C (side-by-side split):** the same engine cost as B, with each view at half width.

**Decision:** B, both views at once as picture-in-picture, swappable. This supersedes Q10's Follow /
Free toggle: the edit camera is always free and the camera view always follows the playhead. A
second view of the scene is ground preparation for the spec, but not an engine rewrite. Dome mode
already renders several views through the view-rig seam (`src/data/rendering/viewRigs.ts`: `dome` is
five cube-face `ViewSpec`s, each rendering into its own `output` texture, composited by
`domeResamplePass`). PiP is a third rig: the canvas view from the edit camera, plus one inset view into
its own texture, plus a composite pass. The groundwork is the inset's independent camera. A
`ViewSpec` is today "the same pose, turned and offset", and the inset needs a second pose that may be
metres from Earth while the edit camera is Mpc away. It also needs per-view evaluation of whatever
reads the one main camera: scale-band fades, LOD planning, data demand and body slabs. Labels start
off in the inset, as they are in dome views.

## Q22–Q23: Steps bound to a named subject (from the approachM31 mock)

- **Q22 Value of a bound step:** options were the subject only, the subject plus the resolved
  numbers, or the numbers only. **Decision:** the subject only (`→ ◎M31`). The resolved numbers
  show in the inspector's Resolved line.
- **Q23 "Use current view" on a bound step:** options were to switch it to Fixed or to disable the
  button. **Decision:** capture the live value and flip Bind from Subject to Fixed. The change shows
  in the Bind toggle and can be undone.

## Q24–Q25: Detaching a view into its own window

- **Q24 Which view can detach:** options were the camera view only, or either view. **Decision:**
  either view. Each view, the edit view and the camera view, has a detach control. A detached view
  leaves the picture-in-picture layout, and the other view takes the main viewport.
- **Q25 How a detached window gets its picture:** options were a second app instance synced on
  `(clip, t)` over BroadcastChannel (works across machines, but a second data load and GPU
  context), or the same engine rendering into a canvas in a popup window as one more view (one data
  load, frame-exact sync, same machine only). **Decision:** the same engine with a second canvas: a
  view whose `output` is the popup canvas's swap chain, on the same GPU device, built on the
  view-rig seam from Q21. **Spec risk to prove first:** configuring a WebGPU canvas context that
  lives in another same-origin window with the main device, and rAF and throttling when the main
  window is hidden behind the popup.

## Q26: When does real code start? (owner override)

**The question:** The mocks are throwaway React: hand-typed rows per clip, props and a little local
state, no RTK. The owner wants reuse and composition now ("better to rewrite code now than to have
to do a lot of cleanup passes"), and RTK.

**Considerations:**

- **Option A (prototype on real data, still a mock):** rewrite the mock into a production-shaped
  tree with an RTK slice, rows derived from real `ClipData`, and it moves into the package after
  the spec.
- **Option B (start `packages/studio` now):** the same rewrite, straight into the package,
  committed, with tests. This skips the spec/plan step the conventions require while the design is
  still moving.
- **Option C (mocks stay throwaway):** the package is written fresh from the spec.

**Decision:** B, start `packages/studio` now. This is an explicit owner override of the spec-first
convention for this feature. The package is production code from its first commit: an RTK studio
slice, a timeline model derived from real `ClipData` (no hand-typed rows), per-kind marks and
inspectors from one registry, and shared primitives (glyph, tooltip, inspector grid). It follows
every CLAUDE.md convention, with tests. Engine groundwork (scene as pure tracks, seek, the
picture-in-picture view rig, a second-window canvas, saving TS) lands as its own slices. The mocks
keep serving as the design reference.

## Q27–Q28: Architecture asks from the slice-1 plan

- **Q27 Is the studio a takeover?** Options were a takeover kind (`#studio=<clipId>`) beside
  exhibit, tour and clip, which reuses the takeover arm, the hash row, mutual exclusion, scene
  capture and the frozen clock; or a separate overlay mode with its own URL, clock and exclusion
  rules. The owner had no preference. **Decision:** the architect's recommendation, a takeover.
  Escape with nothing selected closes the studio, and a tour or exhibit link replaces it.
- **Q28 Unsaved work before saving lands (S8):** options were memory only, a localStorage draft, or
  moving saving earlier. **Decision:** memory only. Edits survive Close and reopen, but not a
  reload.

The plan is `docs/superpowers/plans/2026-11-10-clip-studio-package.md`.

## Q29–Q31: Top bar (from the top-bar design pass)

- **Q29 Layout:** options were A (centred transport, like a media player), B (the bar's three groups
  aligned with the dock's columns: identity over the outline, transport from 0 s over the timeline,
  zoom over the ruler's end, undo/Save/close over the inspector), and C (minimal, with a ⋯ menu).
  **Decision:** B. Each control sits over what it acts on.
- **Q30 Hidden shortcuts vs ui-ux.md Interaction 6:** options were to amend the rule (tooltips plus a
  `?` overlay), to keep a footer key strip, or to show keys while a modifier is held. **Decision:**
  amend the rule. Keys live in the control's tooltip and in the `?` overlay. The footer strip and the
  outline's "+ Add A" hint fold into `?`. ui-ux.md Interaction 6 is rewritten to match.
- **Q31 Save as new:** options were the ▾ half of a split Save button, its own text button, or a ⋯
  menu only. **Decision:** the split button.

## Q32–Q37: Round-2 asks (2026-11-10)

- **Q14 / Q32 Crossfade treatment:** compared as crops (`round-2-xfade-t{1,2,3}-crop.jpg`). **Decision:** T1,
  tapered bars plus Stop / No stop / Blend join chips, with the T3 value curve in the inspector only. Per the
  round-2 review, the taper runs linearly across exactly the overlap window, and the chip fits inside it.
- **Q33 Saving values that depend on the sim date:** options were body-frame literals, world literals at the
  pinned date, or blocking Save. **Decision:** body-frame literals. The Start is saved as its `b,<body>,…` pose
  and aim/roll in the body's frame, so the file stays `(simDays) => Clip` and is correct on any date.
  `aimAlong` needs a `frame` (spec work).
- **Q34 Clip-level loop flag:** options were an End row in every clip, an inspector clip setting, or a top-bar
  toggle. **Decision:** an End row in every clip, mirroring Start. It carries stop / loop and the seam check
  pose(End) = pose(0).
- **Q35 3D frame box in the Edit view:** options were real size plus a fixed playhead dot, a minimum of about
  40 px, or real size only. **Decision:** real size plus a fixed-size playhead dot on the route.
- **Q36 Path recompute:** options were on commit for drags and live otherwise, always live, or only on commit.
  **Decision:** on commit for drags, live for every other edit.
- **Q37 Edit-view labels:** options were dimmed scene labels with the path leading, all labels as in the app,
  or path knots and subjects only. **Decision:** all labels as in the app, against the reviewer's
  recommendation. The Edit view follows the app's existing label settings; the inset keeps labels off (Q21).

## Q38: Inspector sliders follow the app (owner, 2026-11-10)

"The sliders on the edit panel (right) don't follow the design of the main app. I understand they can be more
compact, but they should look similar." **Decision:** ranged numeric fields reuse the app's `Slider`
(`src/components/common/Slider`: one pill, label left, value right, fill behind both) through a compact
variant added to that component, never a studio look-alike. Unbounded values (a Vec3, a typed time) stay text
fields styled to sit with the pills. The studio's `NumberField` becomes a thin wrapper over this.

_Settled in the plan:_ the studio's RTK slice is injected into the app store through
`combineSlices().inject` (ADR 0016). Q14 is ruled (Q32).
