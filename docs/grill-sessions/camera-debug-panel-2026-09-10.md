# Grill Session: Camera debug panel — 2026-09-10

Source: camera-pivot branch (PR #647). Trigger was F1, a heading-reset defect
(north-up decay per frame instead of per unit zoom) that the DebugPanel's
Camera section did not make visible while it was live — the user's framing:
"the debug panel feedback is quite confusing." Files in scope:
`src/components/DebugPanel/CameraStateSection.tsx`,
`src/components/DebugPanel/OrientationTuning.tsx`, and the snapshot builder
`src/utils/camera/cameraDebugSnapshotOf.ts`.

Panel today: five 4 Hz text groups (regime 4 rows, altitude 7 rows,
orientation 8 rows including five roll numbers, input 5 rows, epoch 3 rows),
full-JS-precision radians throughout, followed by a tuning block (engage/
disengage sliders, tilt-blend full/zero sliders, log/lin blend-space toggle,
north-up toggle, remembered-tilt readout, hysteresis readout). Goal: redesign
what the panel answers and how, so the next per-frame-vs-per-step defect is
visible without reading source.

---

## Q1: What should the panel answer first?

**The question:** Five parallel text groups read as a system dump, not an
answer. What's the top-level question the panel should be organized to answer,
and what falls out as secondary?

**Considerations:**

- **Option a (authorship first):** lead with who's driving the pose — arm,
  driver, gesture. Useful for "is the right thing in control", but doesn't
  show whether that thing is doing the right rotation.
- **Option b (per-DOF state first):** lead with heading/tilt/roll, each as
  current / target / residual / pull. This is the shape that would have
  caught F1 directly — a residual that never reaches zero, or a pull that
  fires every frame instead of every zoom step, is visible as a row, not as
  an inference from seven altitude numbers and eight orientation numbers read
  together.
- **Option c (band position first):** lead with where the camera sits in the
  regime band and what the tuning knobs are doing to it. Relevant context,
  but it's the stage the DOFs act on, not the DOFs themselves.

**Decision:** **(b) as the spine, (a) as a one-line header, (c) as one band
ruler.** Authorship answers "who", DOF rows answer "is it right", the band
answers "where" — in that priority order, with (b) getting the panel's
primary visual weight.

## Q2: The "pull" column — last-frame delta or next-notch prediction?

**The question:** F1's failure mode is a decay rate keyed to the wrong clock
(per-frame vs per-unit-zoom). Making that class of bug visible needs a column
that shows *how much moved, and when* — not just where the DOF sits now.

**Considerations:**

- **Option A (last-frame delta):** ground truth — literally what changed
  between the last two snapshots. Free to compute, reads exactly 0 at rest,
  and a one-frame jump shows up as a single nonzero row with nothing else to
  explain it. Downside: at 4 Hz it only shows the delta since the last poll,
  not the peak within that window.
- **Option B (next-notch prediction):** shows where the DOF is heading before
  it gets there — useful when the camera is at rest and delta reads 0. But it
  requires guessing which cursor pick / gesture / driver wins next frame,
  which can be wrong, and it's meaningfully more code for a value that's an
  inference, not a measurement.

**Decision:** **Last-frame delta, plus a per-DOF peak-hold** (largest single-
frame delta since the last clear, with a clear button). No prediction. The
peak-hold recovers what a next-notch prediction was trying to give (visibility
during periods that look at-rest at 4 Hz) without inferring anything — it's
still a measured value, just held across the polling gap.

## Q3: Where is the per-frame delta computed?

**The question:** Q2's delta needs to be exact — averaging it away defeats
the point. Where does the subtraction live?

**Considerations:**

- **Option A (engine-side, in `runFrame` beside `cameraDebugSnapshotOf`):**
  exact — a few subtractions per frame, computed at the same rate the camera
  actually moves. Always on; no gating knob to remember to flip. Peak-hold
  reset becomes a small debug action the panel calls, not new engine state
  the panel owns.
- **Option B (panel-side, diffing the 4 Hz polls):** zero new engine surface
  — the panel already polls a snapshot — but it averages roughly 15 frames of
  motion into one delta. That's exactly the defeat Q2 was trying to avoid:
  F1's per-frame decay would show up as a smaller, smoother number instead of
  the spike that reveals it.

**Decision:** **Engine-side, always on.** The delta and peak-hold are computed
in `runFrame` next to `cameraDebugSnapshotOf`, at frame rate; peak reset is a
debug action the panel calls, not a value the panel computes itself.

## Q4: The five roll rows — keep or drop?

**The question:** Today's orientation group carries five separate roll
numbers (roll vs scene up, roll vs spin axis, plus their residuals and one
more). Under the Q1 per-DOF spine, does roll need its own five-row block, or
does one row suffice?

**Considerations:**

- **Option i (keep the endpoint rolls):** vs-scene-up and vs-spin-axis rolls
  plus residuals are the two reference frames roll has actually been defined
  against across the pivot's roll work (see `globe-camera-pivot-2026-08-24.md`
  Q4/Q5) — keeping both endpoints keeps that history visible.
- **Option ii (one roll row against the band target):** collapse to current /
  target / residual / Δ / peak, matching the other two DOFs exactly. The
  question "where does the target sit between the two endpoints" moves onto
  the Q5 band ruler as the `w` blend value, rather than living as five
  separate roll numbers.

**Decision:** **Drop — (ii).** One roll row, same shape as heading and tilt.
`w` on the band ruler shows where the target sits between the endpoints; the
five-number block is gone.

## Q5: Band ruler — drawn bar or text rows?

**The question:** The regime/altitude groups today are eleven text rows
(4 + 7) reporting numbers whose actual content is "where in the band am I,
and how far from the edges." Is that a reading task or a looking task?

**Considerations:**

- **Option A (drawn horizontal log-scale bar):** four ticks (tilt-full,
  engage, tilt-zero, disengage), a marker at the current `h/R` labelled with
  altitude in metres, `w` and the tilt ceiling as two small numbers under the
  marker. Band sliders move directly under the bar, so dragging an edge moves
  its tick live — the control and the readout share one visual object instead
  of a slider block and a text block that the reader has to cross-reference.
  Distance-in-Mpc drops from this group; it's not a band-position fact.
- **Option B (keep as text rows):** no new rendering work, but keeps the
  cross-referencing burden this Q exists to remove.

**Decision:** **Drawn bar (A).** Sliders move under the bar; distance-Mpc
dropped from the group.

## Q6: Input + epoch groups — fold into the header, or keep as rows?

**The question:** Input (5 rows) and epoch (3 rows) are mostly identity and
diagnostic facts — which body, which driver, which gesture, anchor
coordinates, cursor hit, eye-to-anchor distance, sim days. Under the Q1
"authorship is a one-line header" call, how much of this stays visible by
default?

**Considerations:**

- **Fold into the header line:** `body:earth · surfaceStep · gesture: tilt`
  as one line, with a red badge appearing only on an arm mismatch or an epoch
  mismatch — the two states that are actually actionable, versus the
  steady-state identity facts that are just confirmation.
- **Raw rows behind a collapsed toggle:** anchor coordinates, cursor hit,
  eye-to-anchor distance, sim days move behind a "raw" disclosure, off by
  default. Copy-all still dumps everything regardless of what's expanded.

**Decision:** **Yes — fold the header, collapse the raw rows.** Header line
plus mismatch badge; raw group collapsed by default; copy-all unaffected.

## Q7: Units and precision — degrees on screen, or full-precision radians?

**The question:** Every number in the panel today is full-JS-precision
radians. That's exactly what you'd want to paste into a bug report, but it's
a bad reading surface for "is this row moving."

**Considerations:**

- **Option A (radians everywhere):** paste = exactly what you saw, no
  transcription loss between the screen and a bug report.
- **Option B (degrees, one decimal, on screen; `h/R` to three decimals; full-
  precision radians in the copy-all dump):** the visible rows become fast to
  scan at a glance — a heading that should hold steady reads as a stable
  one-decimal number instead of a radian value whose sixth significant digit
  is drifting. The copy-all dump keeps Option A's exactness for anyone who
  needs to paste a bug report.

**Decision:** **(B).** Degrees at one decimal on screen (`h/R` at three
decimals), full-precision radians in the copy-all dump.

## Q8: Heading/roll targets when north-up is unchecked

**The question:** With north-up off, the field's heading/roll target is not
being tracked — does the row show "—", or does it keep showing the field's
target with a marker?

**Considerations:**

- **Option A (show "—"):** honest about what's not currently engaged — the
  row isn't lying about being tracked. Loses the field readout entirely while
  north-up is off.
- **Option B (keep showing the target and residual, with an `(off)`
  marker):** the target is a property of the field itself, not of whether
  north-up is currently applying it — it exists and moves regardless of the
  toggle. Seeing it move while the pose holds steady is exactly how a
  reference-frame flip (the F1 family of bug) gets caught: if the target is
  doing something unexpected even while nothing is consuming it, that's a
  field-computation bug, not an application bug. Δ and peak stay wired to
  actual pose movement regardless of the marker, so they don't falsely imply
  something is being pulled.

**Decision:** **(B) — keep showing, with the `(off)` marker.** The target is
a field property; watching it while disengaged is a diagnostic, not noise.

## Q9: Where does this land?

**The question:** camera-pivot (#647) is already a large PR. Does the debug
panel redesign ride it, or ship separately?

**Considerations:**

- **Option i (on camera-pivot directly):** zero branch overhead, but grows an
  already-large PR further.
- **Option ii (own branch off camera-pivot, `--base camera-pivot`, merged
  before T22):** keeps the panel change reviewable on its own, lands ahead of
  the parent PR's remaining work. Recommended.
- **Option iii (own PR off main, after #647 merges):** cleanest separation
  from the pivot's own diff, but the panel change is the direct response to a
  bug the pivot work surfaced, and would sit unlanded the longest.

**Decision:** **This PR (i) — user overruled the recommendation.** The panel
redesign lands inside #647, not as a follow-on branch.

---

## Outcome

**Visible panel**, after this redesign:

- Header line: arm · winning driver · gesture, with a mismatch badge (arm
  mismatch or epoch mismatch only).
- Three DOF rows — heading / tilt / roll — each: current, target, residual,
  Δ last frame, peak (with clear); `(off)` marker on heading/roll when
  north-up is unchecked.
- Band bar: drawn horizontal log-scale ruler, four ticks, current-position
  marker labelled in metres, `w` and tilt ceiling underneath; band sliders
  live directly under the bar.
- The two toggles (log/lin blend-space, north-up) and the remembered-tilt
  readout.
- Collapsed "raw" section: anchor coordinates, cursor hit, eye-to-anchor
  distance, sim days.
- Copy-all dumps everything, full precision, radians.

**Engine-side:** a per-frame orientation-delta record with peak hold, computed
in `runFrame` beside `cameraDebugSnapshotOf` (Q3); reset is a debug action the
panel calls.

**Deletion:** the two endpoint roll rows and their residuals (Q4); the
distance-Mpc row from the band group (Q5).

**Next:** implement against `CameraStateSection.tsx`, `OrientationTuning.tsx`,
and `cameraDebugSnapshotOf.ts`, inside #647 per Q9.
