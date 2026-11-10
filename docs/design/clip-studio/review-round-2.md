# Clip studio review: round 2

Shots, all shot locally against `localhost:5175` (2× JPEGs, 3456×2000; phone 800×1700), in
`data/shots/studio-rounds/`: `round-2-<state>.jpg` for the 25 Cosmic Flows states (`overview`, `playing`,
`pip`, `swapped`, `detached`, `detached-window`, `cue-selected`, `group-selected`, `join-selected`,
`start-selected`, `invalid`, `empty`, `deep`, `scrub-snap`, `edge-drag`, `unsaved-close`, `tooltips`,
`topbar-a/b/c`, `topbar-keys`, `topbar-tooltip`, `xfade-t1/t2/t3`, `phone`), the three crops
`round-2-xfade-t{1,2,3}-crop.jpg`, and the 12 `round-2-clip-*.jpg`. Source: `StudioD.tsx`, `TopBar.tsx`,
`StudioTip.tsx`, `StudioDInspector.tsx`, `InspectorGrid.tsx`, `marks/`. Regions use the 2000-wide view.
Shot note: `clip-long`, `clip-long-zoom` and `clip-sondermarken` were shot with a `focus=body-…` hash, which
pins the app's InfoCard (top right). That is the hash, not the design.

## Scores

**Overall: 7/10** (round 1: 4). The round fixed nearly all of round 1's blockers: there are now 40 states, the naming scheme
is applied, the scrubber is designed, joins are objects, the inspector is a property grid, and the top bar follows layout B. What keeps it
below 8 is that some rulings are only half applied and some features were built for one clip: Q30 keys are still printed
everywhere, the studio has two tooltip systems, the PiP views exist only in the Cosmic Flows states, and the
time format changes from clip to clip.

1. Clarity: **7**. Rows read as `Name | op value | dur` everywhere. A few tokens are cryptic (`Save freezes ◷ 3`, `leg auto`, `Slowest 39 %`).
2. Hierarchy: **7**. The playhead head, the selected row and the inspector title read first. The playhead overprints the join chips.
3. Nesting: **8**. Labelled `Together`/`In order` brackets, depth 5 rails, collapsed summary bars, a scroll thumb.
4. Encoding: **7**. Glyph plus hue per channel, a shapes legend, Stop / No stop / Blend marks. The T1 taper misreads, and the subject pill is used in one clip only.
5. Spacing: **7**. 24 px rows and aligned columns. Marks at t = 0 are clipped, units sit after qualifiers, and long titles truncate.
6. Typography and copy: **7**. Terse, no paragraphs. One action has four names, and the abbreviations (`Turn spd`, `Backgr.`, `Dur`) are inconsistent.
7. Affordances: **6**. Handles, drag readout, snap, a named Undo and a split Save are all there. But keys are printed against Q30, the inspector tips are a different design, and Close is modal.
8. States: **8**. Almost every state in the inventory is covered. Missing: a keyboard focus ring, the frame after End, and PiP in the clip states.
9. Fit: **7**. App tokens and type, Skymap panels, and the 3D view is kept. The PiP has two designs, and five raw-hex channel hues remain.

## Findings, most severe first

1. **Major: Q30 / Interaction 6 not applied.** The footer still prints the key strip (`↑↓ select … ⇧ fine`,
   bottom right of every shot), and keys are printed on `+ Add A`, `Use edit view V`, `Duplicate ⌘D`, `Wrap ⌘G`,
   `Delete ⌫`, `+ Camera move A` (empty), `Pick P` (tourBeat), `Waypoint W`, `Preview seam ±3 s ⇧L` (loop),
   `Backgr. … B` (flowOrbit), `[ ]` (waypoint nav), the inset's `⇄ F` (path3d) and the close popover's `↵` / `Esc`.
   Fix: delete the footer `keyList` (keep the legend, which is encoding), strip every inline `kbd`, and let StudioTip
   and the `?` sheet carry the keys. The `?` sheet already lists them.
2. **Major: two tooltip systems.** Bar controls use StudioTip (name, key chips, state line; consistent in
   `topbar-tooltip`). Inspector labels use `CompactInfoTip` (`InspectorGrid.tsx:73`): in `overview` it is a
   larger, boxed half-sentence ("Set by In order · after the blend") that covers the `TIMING` header and touches
   `Use edit view`. The `tooltips` contact sheet shows an inspector tip ("Ramp") in StudioTip style, which the real
   inspector doesn't use. Fix: `Row tip` → StudioTip (`name` = label, `meaning` ≤ 6 words, `state` = default),
   opening to the left over the track, never over its own section.
3. **Major (generalisation): the PiP is not part of the shell.** `Views` renders only when `!clip`, so 8 of 12
   clip states show an unlabelled main view with no Camera view (famousFlythrough, flowOrbit, long, short,
   tourBeat, sondermarken). The two `-path3d` states use a second inset design (`● CAMERA 52.0 s`, uppercase,
   bottom-left, swap button with `F`) against Cosmic Flows' `Camera · 7.4 s ↗` at top right. Fix: one
   `Views` (Edit label bottom-left, Camera inset top-right above the dock, same chrome) rendered for every clip.
4. **Major (generalisation): the time format changes per clip.** Cosmic Flows: readout `7.40 / 20.00 s`, head `7.4 s`.
   famousFlythrough: `52.0 s / 1:47.5`. Two 97 s clips: perseverance `41.3 s / 1:37` and sondermarken `0:35 / 1:37`.
   Loop: `2:12 / 2:28`. Fix: one formatter chosen by clip length. Under 60 s, use `7.4 s / 20.0 s`. From 60 s, use `m:ss.t` for
   every time in that clip (`0:35.0 / 1:37.0`). The head and the readout share the same precision.
5. **Major: Close with unsaved edits is a modal for a non-loss** (`unsaved-close`). Q28 says edits survive Close
   and reopen, so nothing is lost. Interaction 5 says no modal unless data would be lost. Fix: Close just closes. The status
   keeps `Unsaved · 3 edits` on reopen, and the only guard is `beforeunload` (a reload is the real loss).
6. **Major (owner note): the T1 taper misreads.** See Crossfades.
7. **Minor: one action has four names.** `Use edit view` (Cosmic Flows), `Use view` (waypoint), `Use current
   view` (sondermarken Start), `Use current distance` (sondermarken dolly). Q21 named the views, so use
   `Use edit view` everywhere and let the inspector context say what it captures. Abbreviations
   drift too: `Turn spd` vs `Turn speed`, `Dur` vs `Duration`, `Backgr.`. Fix: the full closed-vocabulary names.
   Widen the label column by one character before abbreviating.
8. **Minor: fly-path rows break Q20 and Q22.** famousFlythrough shows 12 waypoint rows unfolded (Q20: folded by
   default past about 8). Eleven rows read `Pass`, and the subject is plain text (`Sculptor Galaxy · C65`), while tourBeat
   uses the `◎M31` pill (Q22). Fix: fold by default, and use the pill in Value (`◎C65 Sculptor`) so the subject reads alike
   in every clip.
9. **Minor: units sit after qualifiers.** `Now 412 · 9.6 s  Mpc` (playing), `Resolves 31.7, 21.5 · from Start  °`
   (tourBeat), `Look N · −3°  tilt` (sondermarken Start). Fix: the unit stays with its number: `412 Mpc · 9.6 s`,
   `31.7°, 21.5° · from Start`, `N, −3°`.
10. **Minor: marks at t = 0 collide with the column edge.** In `start-selected` and `sondermarken-start` the head
    tab `0.0 s` overlaps the channel header glyphs. In `clip-short` the Focus ring sits on the `⇄` channel glyph,
    and the Show diamond is half clipped. Fix: a `--space-4` left inset on the track and ruler so 0 s sits inside.
11. **Minor: the playhead overprints chips and labels.** `Bl|end 1 s` (overview, scrub-snap, xfade crops) and
    `3 s |unseen` (cue-selected). Fix: chips and bar labels get a `--surface-card-strong` backing, the line
    passes under them, and the head stays on top.
12. **Minor: the title truncates in layout B.** `Søndermarken to th…` beside `Makers → literals · ◷ 3`.
    Fix: the tags give way first (collapse to `◷ 3`), and the title keeps the column. The full title goes in the Open clip tip.
13. **Minor: invalid shows its cause only in the inspector.** The timeline has dashed 4–10 s verticals and three
    bare `⚠`. Fix: a `⚠ Distance · 2 writers` label at the top of the clash zone (Interaction 11, beside the cause).
14. **Minor: the edge drag leaves a stale mark.** The In order arrow still ends at 11 s while the readout says 5.0 s and the
    bar ends at 12 s. Every parent bracket must follow the drag live.
15. **Minor: Cosmic Flows vs flowOrbit disagree.** The same forked perpetual `oscillate` shows `end` in Cosmic Flows and `∞`
    in flowOrbit, and only the flowOrbit clips have an End row. One rule for every clip (see the queued ask 3).
16. **Cosmetic.** Five channel hues and the route are still raw hex (`StudioD.module.css:4-8`). The Cosmic Flows route
    is solid Distance blue while its legend says `slow → fast`. In `swapped`, the Edit inset's path labels are
    unreadable at inset scale, so show knots only there. The `playing` active-row tint is barely visible. The empty
    dock is a 56 % void.

## Crossfades and joins (owner note)

`round-2-xfade-t{1,2,3}-crop.jpg`, and the `join-selected` state for No stop.

- **What works:** joins are objects. The group row carries one chip (`✕ Blend 1 s`, `⌒ No stop`, `⌃ Stop`), and selecting
  it opens a `Stop | No stop | Blend` segment, the Blend slider, and the three-curve `distance · log` diagram with
  the chosen curve bright. A matched join (abutting bars, `no stop` in the group Value) now reads differently from a
  blend (overlapping tapered bars) and from a stop (the deep clip's `Stop` chip). Layer fades use the same
  envelope grammar: flow grows and then holds as a dotted band, galaxies tapers out.
- **T1 (tapered bars), the treatment I recommend:** the shape is wrong. The 300 Mpc bar holds full height to about 7.1 s, pinches to a
  point at about 7.4 s, and then trails a hairline fishtail to 8.0 s. The 950 Mpc bar mirrors it. The eye reads the blend
  as ending at 7.4 s and the fishtail as an arrowhead. The chip (≈ 530–700 px) is wider than the 7–8 s overlap
  (578–653 px), so it doesn't mark the window. Fix: taper the height linearly (or along the true weight)
  across exactly 7.0–8.0 s, with no rounded cap. Draw two hairlines at 7.0 and 8.0 through both rows. Size the chip to the overlap,
  or anchor it at its centre.
- **T2 (a lens on the group row):** both bars end to end with crossing curves. It is clear when zoomed in, but the lens is about 37 css px at Fit
  and the handles crowd it. It doubles two row heights, which pushes the last Fade row behind the footer with no
  scroll, and turns the child Fade rows into bare dashed lines (the envelopes are lost).
- **T3 (a value curve):** the most truthful for distance, but `0.14` spills left of the track and the `300` label floats
  under a curve that doesn't plateau there. In the fade group, `flow 100 %` / `galaxies 0 %` spill past the
  row onto the playhead.
- **Queued ask 1, my recommendation:** T1 with the taper fixed, plus the join chips, with T3 only in the join inspector (as built).

## Scrubber (owner note)

- **Done:** a head tab with the time, haloed white 1 px line, notches in channel colour at step starts, adaptive
  ruler (`0 s`, 2, 4…; `1:00` from 60 s; 10 s steps for 97 s), `End 20 s` dashed with a hatched `after end` zone,
  loop band plus the `cycle 2` ghost, a `Loop 2:28` flag with the wrap row, a magnet head plus a `Blend end` label while snapped,
  zoom `− 4× +` with an overview strip and off-window `◂ 3–17 s` / `68–83 s ▸` markers (long-zoom). Strong.
- **Fix:** the time format (finding 4), the head and line collisions (findings 10–11), and the loop band, which has no visible drag
  ends (`scrub-snap`). The zoom overview strip is a 2 px line, so give it 6 px with the window as a filled thumb,
  draggable. No state shows scrubbing into the after-end zone (the reverted frame), and that is where the revert
  ruling becomes visible: shoot it.

## Naming

The round-1 table is applied to the rows, with one consistent change that I accept: the operator slot comes first and the
qualifier follows (`→ 0 % · flow` instead of `flow → 0 %`). That keeps operators aligned in one column. Remaining
drift: findings 7–9, `Hide rings · void, supercluster` (clip-short), whose `·` means "of" here but "and" elsewhere
(use `void rings, supercluster rings`), and the inspector eyebrow, which truncates mid-word at depth 3+
(`In order › Together › In orde…`). Truncate from the left (`… › Together › In order · 1/2`).

## Inspector fluff (owner note)

Much better: there are no helper sentences, just the label | control | unit grid, compact caps section heads, dim `default`
values with `↺`, a dotted underline on labels that have a tip, units as suffixes, and glyphs from the legend (`⊕ Earth`,
`◷`). The Fly inspector (Owns, Cruise, Pace, Curve, Pass-by) and the End/seam check (`19,140 → 19,140 km … ✓ 7/7`)
are the model. Fluff left: the CompactInfoTip half-sentences (finding 2), `Speed: matched` in No stop (the
segment already says so), `Total 107.5 s` repeating the readout, and `Save freezes ◷ 3` + `Moves Start · Aim · Roll
◷ 3`, which say the same thing twice. The inspector's lower half is empty in most states, so the actions could sit right under the
grid instead of being pinned to the bottom.

## Top bar (owner note)

Layout B (Q29) is clean. Identity, status and the Makers note sit over the outline. Transport, swap and zoom sit over the timeline.
Undo/redo, the split Save, keys and close sit over the inspector. There is one primary (Save, filled only when dirty), icon-only buttons
with good tips, and alerts that replace the status in place (`Won't compile · playing last valid`, `Save failed · file changed Retry`).
Left: title truncation (finding 12), the readout format (finding 4), and the `?` sheet, which opens as a panel over the right half of the
tracks and the inspector. That is acceptable for a transient sheet, but anchor it under the keys button so it reads as
coming from there.

## Tooltips (owner note)

StudioTip is well designed and consistent across the bar: a bold name, key chips, a dim state line (`Last edit Blend`,
`Main: Edit · inset: Camera`, `From 7.40 s`). It opens over the scene and never over its control. The gap is coverage:
inspector rows (finding 2), timeline marks and chips (`Blend 1 s` has no tip in any state shot) and the Edit/Camera
labels all need the same component.

## What changed since round 1

- **States:** from 1 to 25 Cosmic Flows states plus 12 clip states (flyPath, waypoint, path3d ×2, perpetual, loop,
  60 s+ with zoom, < 5 s, subject-bound beat, body-frame flyout ×2) and a 400 px phone sheet (Q13).
- **Naming:** a closed vocabulary, an operator slot, a right-aligned dim Dur column (Q15), `∞` for perpetual, and group
  Values listing the children plus the join.
- **Scrubber:** rebuilt (see above). The loop scope follows Q16 and snap follows Q17.
- **Crossfades:** joins are objects with three mark shapes. T1/T2/T3 are shot for Q14. Layer fades use envelopes.
- **Inspector:** a property grid with resets, defaults and units. Warnings became one-line chips with an action
  (`⚠ 3 s past End · unseen + Hold 3 s`, `⚠ 2 writers · 4–10 s Run after`).
- **Encoding:** a channel glyph column, distinct icons for In order and Together, hollow vs filled diamonds, a shapes legend.
- **Views:** the Edit view with the route, frustum and time at the playhead, a Camera inset, swap, detach with
  `Camera · in window 2 · Bring back`, and a detached window with `Dock back` (Q21, Q24).
- **Top bar:** layout B, icon-only buttons, the split Save (Q31), the `?` sheet, the inline `Makers → literals` note (Q11).
- **Still open from round 1:** keys printed (round 1 asked for them on the bar; Q30 now reverses that), the raw-hex hues,
  and the dock height, which is per entry rather than draggable (Q12 has no state with the grabber in use).

## Queued asks, my recommendations (not re-raised)

1. Crossfade: T1 with the taper fixed, plus join chips, with T3 in the inspector.
2. Sim-date values: keep the body-frame literals. The `⊕ Earth` / `◷` row glyphs already make them legible.
3. Loop flag: an End row that mirrors Start, as built in flowOrbit, shown in every clip (Cosmic Flows too).
4. Frame box: real size, plus a fixed-size playhead dot on the route. At path3d's scale the frustum is a few px.
5. Path recompute: on commit for drags, on every edit otherwise.

## ASKS

**ASK 1: What labels does the Edit view show?** The real path overlay sits under the app's full label set. In
`clip-famousFlythrough-path3d` the route is buried under overlapping group names ("You are here", "Sculptor Pinwheel…"),
which is hard to author against. Q21 turned labels off in the inset only.
- A. All of the scene's labels, as in the app. Most context, and it follows the existing label settings, but it is cluttered.
- B. Scene labels dimmed (about 40 %) and decluttered away from the route, with knot labels at full strength. Context stays and the path leads.
- C. Path knots and subjects only. The cleanest, but you lose your bearings off the route.
Recommendation: **B**.

## What to keep

1. The `Name | op value | Dur | channels` row grammar with its closed vocabulary.
2. Joins as objects (chip, segment, three-curve inspector) and the envelope grammar for layer fades.
3. The scrubber: head with time, notches, snap label, loop band and ghost cycle, zoom overview with off-window markers.
4. Layout B's column alignment, and alerts that replace the status in place.
5. StudioTip as the one tooltip, and the Fly and End/seam inspectors as the density model.
