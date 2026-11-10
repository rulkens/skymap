# Clip studio: UI/UX review brief (one round)

You are an independent senior UI/UX reviewer. Review the clip studio design mock and score it.
You do NOT edit any files except your own report. Do not start or stop servers.

## What it is
Skymap (repo /home/user/skymap) is a WebGPU universe explorer. The clip studio is a timeline
editor docked at the bottom of the app over the real 3D view. A person (teacher, science
communicator, curious user, and the repo owner authoring tour clips) opens a camera+scene animation
clip, sees its nested structure (seq = "In order", all = "Together", fork = "background"), scrubs
it, selects steps, and edits their parameters in an inspector, previewing on the real renderer.

Owner rulings (do not re-open; review the design against them):
`docs/grill-sessions/clip-studio-2026-11-07.md` (read it). Key: layout = outline + tracks (named
row per step, indented by nesting, bars on a time grid, inspector right); explicit Follow / Free
camera toggle (key F); hand-written clips are edited in place (saving rewrites the TS file); v1 edit
scope = params + structure (add, delete, reorder, wrap in seq/all, edge-drag durations) + "Use
current view" on camera blocks; scene state is a pure function of t (scrub shows the true frame);
a clip's scene reverts when it ends; channel colour encodes what a step writes.

Clip model reference: `docs/animation/clip-primitives.md` (seq overlap = crossfade / matched join,
fork, cues take zero time, fade `over`).

## Standard
`docs/superpowers/conventions/ui-ux.md` is THE standard: read all of it. Apply its Interaction,
layout/type/colour tokens, copy rules and before-you-commit self-check. Tokens live in
`src/styles/tokens.css`.

## What to review
The CURRENT shots listed in the round prompt (Read each image; they are 2x, 3456x2000) and the mock
source in `src/dev/mocks/studio/StudioD.tsx`, `StudioD.module.css`, `stepsD.ts`, plus any other
`src/dev/mocks/studio-d*.tsx` state entries. Judge what a person SEES and can DO, not code style.

Score each dimension 1–10, then an overall score (not an average: weigh what blocks the job most):
1. Clarity of intent: can a newcomer tell what the clip does, step by step, and what each control does?
2. Hierarchy and focus: what draws the eye first; is the selected step and the playhead obvious?
3. Nesting legibility: seq / all / fork, depth 3+, collapsed vs open, the time-side group extents.
4. Encoding: channel colour, type icons, mark shapes, crossfades / blends, cue fades; colour never alone.
5. Spacing, alignment, density: token grid, column alignment, row rhythm, breathing room, truncation.
6. Typography and copy: sizes, weights, legibility at 10px, wording per ui-ux.md copy rules.
7. Interaction affordances: what looks draggable/clickable, handles, hit-target sizes, hover/focus,
   keyboard, undo, the Follow/Free toggle, save state, error and warning paths.
8. States coverage: ideal, empty, error/invalid, playing, free camera, cue selected, long names,
   many steps (scroll). Missing states count against this.
9. Fit with the app: does it feel like Skymap (same tokens, panels, type), and does it keep enough
   of the 3D view visible?

## Report
Write your report to the path named in the round prompt, ≤ 200 lines:
- Overall score /10 and the per-dimension scores, one line each with the main reason.
- Findings, most severe first. Each: severity (blocking / major / minor / cosmetic), what is wrong
  (point at a region of the shot), and a concrete fix (tokens, sizes, wording, layout).
- ASKS: design decisions that only the owner can make, or things that are unclear about intent.
  Each ask: the question, 2–3 options with one-line trade-offs, your recommendation. Don't ask what
  the rulings already decide. Don't pad: zero asks is fine.
- "What to keep": up to 5 things that work and must survive the next round.
Return to the caller: the overall score, per-dimension scores, the top 8 findings (one line each),
and the asks in full.

## Owner preferences given during the loop (weigh heavily)
- "Better cross fading UI": seq overlap blends, matched joins (overlap 0, no stop) vs plain rests,
  and layer fades must each read at a glance; give crossfades their own findings section.
- "Text should be more compact, no whole sentences, clear visual structure and naming conventions
  for different types of effects": terse token-style labels everywhere (rows, inspector, warnings);
  one fixed naming scheme per effect type (e.g. `Distance → 300 Mpc`, `Turn speed → 1.4°/s`,
  `Fade flow → 0 % · 3 s`, `Wait 2 s`); label / value / duration columns aligned so a type reads at
  a glance. Check the naming table in the latest report is applied consistently.
- "Also good design of the scrubber": ruler (ticks, labels, zoom), playhead head and line (grab
  handle, time readout on the head, contrast over bars and bands), scrub feel (click-to-seek, drag,
  snapping to step edges and cues, fine drag), End marker and after-end zone, and how the transport
  readout relates; give the scrubber its own findings section.
- "Test with different clips; it doesn't make sense to optimize for only one clip": the
  `round-N-clip-<id>` shots (flyPath composite, looping orbit, body-frame flyout with frameTo, a
  FocusId-bound tour beat, a 60 s+ clip and a < 5 s clip) count as much as the Cosmic Flows states.
  Score how the design generalises; a fix that special-cases one clip is a finding.
- Fly-path rulings (Q18–Q20 in the grill transcript): dragging a knot pins that leg and the other
  unpinned legs re-split (shifted knots ghosted); composites (flyPath, geodesic) show a double-height
  speed-curve lane with labelled knots; waypoints are child rows, folded by default past ~8.
- "The fly-path debug view should be integrated into the editor; it already shows the current
  camera framing and position": the clip-path inspector's 3D overlay (speed-coloured route, look-at
  path, frustum gizmo at the playhead) belongs in the studio, in sync with the playhead; its tuning
  knobs map onto the Fly inspector. Review the `-path3d` shots for this.
- Q21 (supersedes the Follow / Free toggle): an EDIT VIEW and a CAMERA VIEW both on screen at once,
  picture-in-picture, swappable. Edit view = main viewport, free camera, the path overlay (route,
  look-at line, frustum at the playhead); camera view = an inset showing exactly what the clip's
  camera sees at the playhead. Review the PiP: inset size/placement, labels, swap, what it covers.
- Q22–Q23: a subject-bound step's Value shows the subject only (`→ ◎M31`), resolved numbers in the
  inspector; "Use current view" on a bound step flips Bind to Fixed (visible, undoable).
- Q24–Q25: either view (Edit or Camera) can be detached into its own browser window (same engine,
  a second canvas); a detached view leaves the PiP and the other takes the main viewport. Review
  the detach control, the detached state in the main window, and how to bring the view back.
- "The clip action editor on the right side can be more terse and better laid out. There is too
  much fluff now. Find a way to communicate what things mean in a subtle, non-intrusive way":
  the inspector is a dense property grid (label | control | unit, aligned columns, compact section
  headers), no helper sentences on screen; meaning comes through subtle means: a dotted-underline
  label with a hover/focus tip (the app's InfoTip / CompactInfoTip), dim `default` vs bright authored
  values with a ↺ reset, glyphs from the legend, units as suffixes. Score inspector fluff harshly.
- "The top bar is very messy and busy": shortcuts hidden by default (in tooltips and a `?` overlay),
  icon-only buttons where the icon is unambiguous, clear left / centre / right grouping, one primary
  action; controls that belong elsewhere (zoom by the ruler, view controls on the views) move out.
- "Having well-designed tooltips does a lot": one shared, designed tooltip across the studio (name,
  one-line meaning, kbd shortcut, optional state line; fast and consistent open, focus opens it,
  never covers its control). Review the `round-2-tooltips` contact sheet and tip consistency.
- Q32–Q37 (2026-11-10): crossfade = T1 tapered bars (linear over exactly the overlap) + Stop / No
  stop / Blend join chips, T3 curve in the inspector only; date-dependent values save as body-frame
  literals; an End row in every clip carries stop / loop + seam check; Edit-view frame box at real
  size + a fixed playhead dot; path recomputes on commit for drags, live otherwise; the Edit view
  shows ALL scene labels as in the app (owner overrode the reviewer); the inset keeps labels off.
- Q38: inspector sliders are the app's own Slider (pill, label left, value right, fill behind) in a
  compact variant, not a studio look-alike; unbounded values stay text fields that sit with them.
