# Clip studio review: round 1

Shot: `data/shots/studio-rounds/round-0-overview.jpg`. Source: `src/dev/mocks/studio/StudioD.tsx`, `.module.css`, `stepsD.ts`.
Compared against `mock-studio-b*.jpg`. Regions use the 2000-wide view (×1.73 for the original). Three owner
notes are folded in: crossfade UI, compact text with naming conventions, and scrubber design.

## Scores

**Overall: 4/10.** The layout follows the rulings. Against the owner's notes, the text is sentences, the
crossfade and the scrubber are weak, only one state exists, and the edit affordances are mostly hidden.

1. Clarity: **5**. Sentence labels, no type scheme; "Home"/"Space" read as labels; dots, ⚠, joins unexplained.
2. Hierarchy: **5**. Selected row and inspector clear; playhead has no head and looks like End.
3. Nesting: **6**. Indentation works at depth 2; seq vs all is 1 px faint; no collapsed or depth 3+ shown.
4. Encoding: **5**. Blend drawn 4 ways; crossfade, matched join, rest alike; hide = instant fade mark.
5. Spacing: **6**. Columns align; rows 21 px, letters 9 px, ✕ overprints the selected bar's text.
6. Typography and copy: **3**. Sentence labels, a hint paragraph, a sentence warning, a file name in the bar.
7. Affordances: **4**. One handle, no row grip, targets < 24 px, no zoom/Redo/Delete/Wrap, no scrub grab.
8. States: **2**. One state out of the 15+ the job needs.
9. Fit: **7**. On token with `Button`/`Slider`; translucent dock, raw-hex channel hues.

## Findings, most severe first

1. **Blocking: only one state exists.** The next round must add:
   playing; free camera; a fade cue (cut-off warning), a group, a join and Start selected; invalid (mock B's
   two-writers state, in tokens); empty (mock B's base); collapsed + depth 4; long names; many steps with a
   sticky ruler; saving / saved / failed / unavailable; Close with unsaved changes; an edge drag with a live
   readout; scrubbing with snap; a loop set; a focus ring; 400 px (ASK 3).
2. **Blocking (owner note): labels are sentences with no type scheme.** Fix: the naming convention below.
   Strip every sentence, including the inspector hint, the blend title, the warnings and the origin note.
3. **Major (owner notes): the crossfade and the scrubber.** See their sections.
4. **Major: the warning on the last step is silent.** The final fade starts at End, so under always-revert
   it is never seen; only a bare ⚠ says so. Fix: duration "3 s ⚠" and the tail hatched past End.
   Inspector: `⚠ Cut off at End · 3 s unseen` with the button "Add hold 3 s" (`role="alert"`).
5. **Major: transport keys read as labels.** "⏮ Home" collides with the app's Home button, "▶ Space" has no
   verb, and the ⌘S on primary Save is light on light. Fix: "▶ Play" / "⏸ Pause" and "⏮ Start", each with
   a dim `kbd`, measured at 4.5:1 on primary buttons.
6. **Major: edit gestures have no affordances or keys.** Fix:
   - 24 px rows; hover/focus edge handles on every bar; 24 × 24 hit boxes on marks; a row grip on hover
   - Redo, plus Delete ⌫, Duplicate ⌘D and Wrap ⌘G (In order / Together) in the inspector and the key bar
7. **Major: seq vs all is too faint.** Rails sit at `--color-fg-faint`/`ghost`, under 3:1. Fix: rails at
   `--color-fg-tertiary`, the kind printed in each time-side bracket, and distinct icon silhouettes.
8. **Major: the renderer bleeds through the dock.** A bright glow shows behind rows 2–5 at 6–9 s. Fix: an
   opaque `--surface-card-strong` dock, or a ≥ 92% scrim with blur.
9. **Minor: the channel dot matrix.** Letters are 9 px, "V" means Layers, and the 6 px dots are mostly
   grey. Fix: only the letters a step writes, in colour, at 10 px.
10. **Minor: marks drawn wrong.** The bob is forked after `wait(2)` in the real clip but drawn from 0 s. The
    zero-time "Together" shows a fake 3 s dashed bracket; draw a diamond at 4 s with "0 s".
11. **Minor: marks repeat shapes.** Hide and the instant fade are both diamonds; rate and fade ramps differ
    only by colour. Fix: a hollow diamond for hide/show, an arrow edge for rate, and a shapes legend row.
12. **Minor: inspector context.** Eyebrow `7.0–11.0 s · In order 2/2`; "Use distance" on distance-only steps.
13. **Cosmetic.** Undo/Close look like links; Undo should name its action ("Undo blend"); pad the F kbd.

## Scrubber (owner note)

**What is wrong now.**
- **Playhead**: a 2 px line with no head or time, the same accent and weight as End (x≈905 vs x≈1457).
  The accent matches the Distance blue and the selection band, so it vanishes over the selected row.
- **Ruler**: labels every 2 s, no unit, no zoom (a 60 s clip would crush the ticks), no step boundaries.
- **Feel**: no sign of click-to-seek, snap or nudge; ←→ is "fold", so there is no keyboard scrub.
- **End**: looks draggable but the structure sets it; the hatched after-end zone has no stated job.
- **Transport**: "07.40 / 20.00 s" is far from the playhead, zero-padded; no loop (mock B had Loop L).

**Treatment.**
- **Ruler**: a sticky 24 px strip.
  - Major labels at the first of 1/2/5/10/30 s that keeps ≥ 64 px apart; minor ticks at a fifth. The first
    label carries the unit ("0 s"); mm:ss from 60 s.
  - Each step start and cue is a 4 px notch in its channel colour, so the snap targets are visible.
  - Zoom: − Fit + in the bar, ⌘-scroll or pinch anchored at the pointer. Fit is the default.
- **Playhead**:
  - **Head**: a 24 × 18 px tab in the ruler showing the current time ("7.4 s", tenths, `tabular-nums`).
  - **Line**: 1 px `--color-fg` with a 1 px `--surface-card-strong` halo, so it reads over every channel
    colour, the selection band and the bands. It stays above the marks; bar text gets a backing.
  - **Free camera**: the head and line go hollow and dashed, so the screen says the camera is not
    following the playhead.
- **Feel**:
  - Click the ruler or empty track to seek; drag the head or the ruler to scrub. Clicking a mark selects
    it and does not seek. Double-clicking a row seeks to the step's start.
  - Drag snaps within 6 px to step edges, cues, join edges and End. The target notch lights while
    snapped. ⌥ turns snap off; ⇧ is fine control (1/10 speed).
  - Keys: `,` and `.` nudge 0.1 s (⇧ 1 s); ⌥← and ⌥→ jump to the previous or next boundary; Home and End.
    Print them in the key bar.
- **End**: a 1 px dashed `--color-fg-dim` line labelled "End 20 s", with a default cursor (not
  draggable; the structure sets it).
  - The after-end zone gets a job: scrubbing into it shows the frame after the clip, with the scene
    reverted and the camera at the end pose. That makes the revert ruling visible, and it is where
    cut-off tails show hatched. Label it "after end".
- **Loop**: L loops the selected step or group's range, drawn as a band in the ruler with drag ends; with
  no selection it loops the whole clip (ASK 6).
- **Transport**: "▶ Play Space", then an editable readout "7.40 / 20.00 s" (no leading zero; click to
  type a time, Enter seeks). Play from the playhead; at End it stops on the after-end frame. Clicking
  while playing seeks and keeps playing. When zoomed in, the view pages along with the playhead.

## Naming convention (owner note)

**Columns**: rails + twisty | icon | **Name** | **Value** | **Duration** | channels.
- **Name** comes from a closed vocabulary (the table), at most 11 characters, `--color-fg-base`; groups at
  weight 500. Only the rails, icon and Name indent.
- **Value** sits at a fixed x at every depth, so values align down the whole list. The operator gets its
  own slot (`→` sets to, `+`/`−` adds, `±` swings).
- **Duration** is right-aligned, 5 characters, `--color-fg-dim`, `tabular-nums`. "0 s" for a cue, "end" for
  something that runs to the end, "∞" for a loop. A duration never repeats inside the Value.
- **Formats**: a space before units (`300 Mpc`, `63°`, `1.4°/s`, `0 %`). One decimal only below 10. A true
  minus sign. Lists show two names then `+N`. Qualifiers follow ` · `.

| Effect | Name | Value | Duration |
| --- | --- | --- | --- |
| clip `start` (pose / `'live'`) | Start | saved view / live view | – |
| `dollyTo`, `tween('distance')` | Distance | → 300 Mpc | 4 s |
| `tween('yaw')` / `tween('pitch')` | Turn / Tilt | → 63° / → −20° | 2 s |
| `moveTarget` | Look-at | → 12, −3, 0 Mpc | 3 s |
| `aimAt` / `aimAlong` | Aim | → 63°, −20° / → along 0.6, 0.8, 0 | 2 s |
| `spin` (yaw / pitch) | Turn / Tilt | +63° (`· loops`) | 6 s / ∞ |
| `rate` | Turn speed / Tilt speed | → 1.4°/s | 11 s |
| `oscillate` | Bob turn / Bob tilt | ±5.2° /16 s (`· fade 2 s`) | end |
| `geodesic` | Zoom-pan | → 950 Mpc / → Virgo | 6 s |
| `flyPath` | Fly | via Virgo, Coma +3 | 24 s |
| `moveTargetId` / `dollyToId` | Look-at / Distance | → Virgo | 3 s |
| `lookAtId` / `spinToId` | Aim / Turn | → Virgo (`· +1 turn`) | 2 s |
| `strafeId` | Strafe | Virgo +30° | 3 s |
| `show` / `hide` | Show / Hide | flow, labels +1 | 1 s / 0 s |
| `fade` | Fade | flow → 0 % | 3 s |
| `scene` (`setFlowEnabled` …) | Set | flow on · galaxies off · labels focused | 0 s |
| `focus` / `frameTo` | Focus / Frame | Virgo, none / → galactic | 0 s / 2 s |
| `hold` / `wait` | Hold / Wait | – | 2 s |
| `seq` / `all` | In order / Together | child Names: Distance ×2 · blend 1 s | 7 s |
| `fork` | Background | Bob tilt | end |

- **Group Value** lists the child Names plus the join state. That separates the two "Together" rows
  ("Fade ×2" vs "In order, Turn speed").
- A `fork` of one action is that action's own row, with a `Background` tag. A fork of a group is a
  `Background` group row. `hold` and `wait` stay distinct because saving must round-trip the source.
- **Inspector and warnings use the same tokens**, with no paragraph anywhere: eyebrow `Distance · In order
  2/2`; fields `Distance`, `Duration`, `Ease`; warning `⚠ Distance · 2 writers · 4–8 s` with "Run after" and
  "Undo"; top bar `Hand-written · save rewrites source` and `● Unsaved`.

## Crossfades and joins (owner note)

**What is wrong now.**
- The blend is drawn four ways at once: the outline badge, the ⤫ chip, the ✕ across the rows, and the
  inspector box. None shows *what* mixes. The ✕ overprints "950 Mpc" and reads as "delete".
- The linear fade masks on the bars look like a glitch, not a weight going 1 → 0.
- The model is per channel (`clip-primitives.md`, "Blending a seq"): same-channel overlap crossfades,
  abutting windows in an overlapped seq make a velocity-matched join, and a gap rests. The mock puts ✕
  on every overlap and draws matched join and rest identically.
- Layer fade wedges always draw 100 → 0 or 0 → 100, whatever the real start. The flow/galaxies dissolve
  shows as two unrelated rows. The inspector diagram repeats the timeline.

**Treatments.** Each replaces all four current marks.
- **T1: Tapered bars, height = weight.** The outgoing bar tapers to a point and the incoming one grows
  from one, aligned. Layer fades use the same grammar (envelope height = opacity, from the evaluated
  value). Text stays readable; the pair stays split across two rows.
- **T2: A lens on the group row.** Both bars end to end, with the overlap drawn as crossing weight curves
  shaded from A's tint to B's, and ≥ 24 px drag handles at the lens ends. The clearest single join, but
  it takes over the group row.
- **T3: A value curve.** The evaluated value across the group row: an S for a crossfade, no plateau for a
  matched join, a flat step for a rest. The most truthful; one curve per channel; needs live evaluation.

**Joins as objects.** Each same-channel join gets a ≥ 24 px mark on the group row in one of three shapes
with words: **Stop** (a gap tick), **No stop** (a fused connector), **Blend 1 s** (T1/T2). Selecting it
gives a "Stop / No stop / Blend" segmented control, the Blend slider, and a mini T3 curve. Spec note: a
per-join Stop inside a seq with `overlap` needs a hold, because the array has no rest entry.

**Recommendation: T1 on the rows, plus join objects, with T3 in the inspector only** (ASK 4).

## ASKS

**ASK 1: How loud is the first save over a hand-written clip?** It flattens makers (Q5); git can undo it.
A. The top-bar note only. B. An inline `Makers → literals · Save / Save as new` once per clip (one click;
a home for `earthFlyout`'s simDays). C. A modal (breaks the no-modal rule). Recommendation: **B**.

**ASK 2: How tall is the dock?** About 52% of the viewport now. A. Fixed. B. A draggable top edge,
remembered per viewer, 3D view at least 35%. C. A collapse-to-transport key (one more mode).
Recommendation: **B**.

**ASK 3: What happens at 400 px?** `#studio` ships publicly (Q8). A. A "wider screen needed" state with
Play and Close (smallest). B. Read-only scrub (a second layout). C. Fully responsive (about double the
work). Recommendation: **A** for v1.

**ASK 4: Which crossfade treatment?** T1. Tapered bars (readable, one grammar with fades). T2. A lens on
the group row (the clearest join, takes the row). T3. A value curve (truthful, busy). Recommendation:
**T1 + join objects, with T3 in the inspector.**

**ASK 5: Duration inline or in its own column?** The owner's example is inline (`Fade flow → 0 % · 3 s`).
A. Its own column (scans by type). B. Inline (durations don't line up). Recommendation: **A**.

**ASK 6: What does Loop loop?** A. The selection's range, or the whole clip with nothing selected (tight
iteration on one blend). B. The whole clip only (simplest). C. A free band dragged on the ruler (one more
object). Recommendation: **A**.

**ASK 7: Is snap on by default?** A. On, ⌥ turns it off (lands exactly on cues and joins). B. Off, ⇧
snaps (smoother free scrubbing). Recommendation: **A**.

## What to keep

1. Outline + tracks, indentation rails, a right-aligned duration column.
2. The "Follow playhead / Free camera" toggle with F, always on screen.
3. The top-bar status, with `● Unsaved` as `role="status"`.
4. Channel-tinted icons, cue diamonds, the oscillation wave, dashed waits, the hatched after-End zone.
5. The inspector's Blend slider, kept with a real curve in place of the diagram.
