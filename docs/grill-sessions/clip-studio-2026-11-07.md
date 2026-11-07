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

_Open after Q7, pending the UI/UX investigation:_ how the camera follows the playhead vs. flies free
for "use current view", the timeline layout, and how the studio's RTK state plugs into the app store.
