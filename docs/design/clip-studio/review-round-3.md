# Clip studio review: round 3

Shots: `data/shots/studio-rounds/round-3-<state>.jpg`, 35 files (23 Cosmic Flows states + 12 `clip-*`), all
read; crops checked at full resolution. Source: `src/dev/mocks/studio/**`, `studio-d-*.tsx`. Regions use the
2000-wide view. Known and not scored twice: raw-hex channel hues, no fixed playhead dot on the real path3d
overlay, the stale Edit thumbnail in `swapped`, approximate clip insets, the old pose in `path3d-waypoint`.

## Scores

**Overall: 8/10** (round 2: 7). All six round-2 majors are fixed in the shots, not just claimed, and 9 of
10 minors are too. What keeps it below 9: one state contradicts itself (`deep`, Read-only with live editing
controls), and the inspector overflows its column in the fly-path and subject clips.

1. Clarity: **8**. Rows read alike in every clip. Left: `± 5.2° /16 s`, `Offset 4 r`, `loop ↺ 0 s`, Read-only.
2. Hierarchy: **8**. Playhead head, selected row and inspector title lead. Two filled buttons in `start-selected` and `swapped`.
3. Nesting: **8**. Depth 5 in `deep`, collapsed summary bars, scroll thumb, eyebrow truncates from the left.
4. Encoding: **8**. T1 now right, join chips, envelopes, subject pill in every clip, decade ticks in the log bar.
5. Spacing: **7**. Inspector overflow, eyebrow collisions, a jagged Dur column, units in two places.
6. Typography and copy: **8**. One closed vocabulary; `Use current view` everywhere. A few cryptic tokens and half-sentence tips.
7. Affordances: **8**. Keys hidden (Q30), one tooltip, Close not modal, focus ring, loop handles, grabber. Read-only state and a stale inspector during drag.
8. States: **9**. Focus ring, after-end, PiP in every clip and grabber use are all shot now. Open: what Read-only allows.
9. Fit: **8**. The app's Slider (Q38), StudioTip, app tokens. Hues and about 15 studio glyph paths remain (Q39 half done).

## Round-2 majors, checked in the shots

| # | Round 2 | Round 3 | Shot |
|---|---|---|---|
| 1 | Keys printed (Q30) | **Fixed**: footer strip gone, no inline kbd; keys only in tips and the `?` sheet | overview, topbar-keys |
| 2 | Two tooltip systems | **Fixed**: inspector `Starts` tip is StudioTip, opens left over the track | overview, tooltips |
| 3 | PiP only in Cosmic Flows | **Fixed**: same `Camera · t ↗` inset and `Edit · free ↗` label in all 12 clips | clip-* |
| 4 | Time format per clip | **Fixed**: `m:ss.t` from 60 s on head, readout, ruler, inset | clip-long, clip-flowOrbit-loop |
| 5 | Close modal | **Fixed**: Close tip says `3 unsaved edits kept until reload` | unsaved-close |
| 6 | T1 taper | **Fixed**: linear across exactly 7–8 s, hairlines at both ends, chip inside the window | xfade-t1, overview |

Minors 7–15 fixed (names, Q20 fold, Q22 pill, units, t = 0 inset, chip backing under the playhead, title
fit, clash label, live parent bracket, one `∞ cut` rule). 16: hues known; the active-row tint now reads;
the empty dock is still mostly void.

## Findings, most severe first

1. **Major: Read-only says one thing, the controls say another** (`deep`). Status `Read-only` (tip: `Dev server
   only`), but `+ Add` (190,681), sliders, `Use current view` (1745,797) and Duplicate / Wrap / Delete
   (1670–1880,1011) are all live; Save is grey with no reason on screen. A person can't tell whether edits
   are allowed or kept. Fix: see ASK 1, then make the controls match the status.
2. **Minor: the inspector overflows its column.** `Side · Outside Above Scre…` clipped at 1885–1920
   (clip-famousFlythrough, -path3d); `Use current view` inline on `Aim` runs to 1990, past the 1980 edge
   (-waypoint); `Resolves 31.7°, 21.5° · from …` (tourBeat 1756–1950); `Saves as Start · Aim · Roll ·…`
   (sondermarken-start). Fix: segments wrap to a full-width row under their label when wider than the control
   column; actions go on their own row; Out text wraps to two lines before truncating.
3. **Minor: units sit in two places.** Slider pills carry the unit inside (`4.0 s`); text fields put it
   ~170 px away in a far column (`Starts 7.0 ⋯ s`, overview 1756/1933; `Leg 2.7 ⌖ ⋯ s`, waypoint;
   `Look-at 0, −0.01, 0 Mpc`, start-selected). Q38 says text fields "sit with" the pills. Fix: unbounded
   fields use the pill's box (same height, radius, label left inside, value + unit right inside), no fill.
4. **Minor: `Use current view` moves and changes weight.** Under VALUE (overview), after `AT 0:35.0`
   (sondermarken 1745,1042), inline on `Aim` (waypoint), under POSE (start). Filled in `start-selected` and
   `swapped` (`primary={free}`), so two filled buttons sit beside Save, and the fill is the only cue.
   Fix: always the last row of the section it writes into, always secondary. If "edit view moved" matters,
   say it in the button's tip state line.
5. **Minor: the playhead head still covers labels.** `after-end`: head `21.6 s` over `End 20.0 s` (reads
   `End 2│21.6 s`, 1470–1555,565), line through `after End`. `clip-long-zoom`: head over the `0:40` tick
   label (975,566). `scrub-snap`: `Blend end` over `10`. Fix: ruler labels within the head's width ±4 px fade
   out; the End label moves left of its line while the head is past End.
6. **Minor: the eyebrow position counts the wrong thing.** `Top level · 12/18` (group-selected) and `18/18`
   (cue-selected) count all rows; Top level has 11 steps. `In order · 2/2` counts siblings. Fix: siblings
   everywhere (`Top level · 9/11`).
7. **Minor: the eyebrow range touches the position.** `1/2 17.0–21.0 s` (deep 1855–1980,686),
   `1/3 0:03.0–0:17.0` (long), `2/2 0:36.0–0:48.0` (long-zoom). Fix: `--space-8` minimum gap; drop the range
   first when narrow (TIMING already shows it).
8. **Minor: one concept, two controls.** Group: `Runs · Awaited | Background` (group-selected 1757–1980,653).
   Step: `RUN · Background on | off` (clip-flowOrbit 1757–1920,1032). Fix: `Runs · Awaited | Background`
   on both.
9. **Minor: the inspector lags the drag** (`edge-drag`). Readout `Duration 5.0 s +1.0` and row `5 s`, but the
   inspector shows `4.0 s` and `7.0–11.0 s`. Fix: the inspector follows live (Q36 is about the path recompute only).
10. **Minor: copy leftovers.** `± 5.2° /16 s` → `± 5.2° · 16 s period`; `Offset 4 r` → `4 radii`;
    `loop ↺ 0 s · seam ✓` → `loop · seam ✓`; tips `Accel/decel each end; 0 = ease` → `Speed-up and slow-down
    at each end`, `Both moves run; weight passes across` → `Both moves run, weight shifts`, `Set by In order,
    after the blend` → `Set by In order · after Blend`; `0:24.1 · drag to pin leg` → `0:24.1` (the hint
    moves into the knot's tip). No semicolons in tips.
11. **Minor: Q39 half applied.** About 15 glyphs (wait, hold, dist, look, aim, rate, osc, fade, focus, seq, all,
    fork, three joins) and the Ease curve are still paths in `glyphPaths.tsx` / `StudioDInspector.tsx`.
    They look consistent, but the ruling says they become `src/components/icons/*`. Fix in the package, not the mock.
12. **Minor: the route legend has two homes.** Cosmic Flows puts `path ━ slow → fast` on the Edit label
    (20–315,475). -path3d puts `route slow → fast · look-at · frame` in the dock legend (1040–1335,1145).
    Fix: on the Edit label in every clip. The dock legend stays timeline-only.
13. **Cosmetic: the selected taper reads as an arrowhead.** The white selection stroke traces the taper (overview
    915–955,998 `◁`; swapped 915–955,969 `▷`). Fix: stroke the full-height body only; the taper keeps its
    fill and a 1 px channel edge.
14. **Cosmetic: the warning glyph breaks the Dur column.** `3 s◷` (overview 470–500,1085), `4 s◷` (invalid),
    `6 s◷` (short). Fix: a fixed 12 px slot after Dur on every row.
15. **Cosmetic: truncated lists.** `void rings, supercluster r…` (short), `Look-at, Distance → Coma S…`
    (deep). Fix: the `+N` form used elsewhere (`void rings +1`).
16. **Cosmetic.** Detach is `Bring back` in the main window and `Dock back` in the popup: use `Dock back`.
    Empty: the ruler runs 0–22 s for a 0 s clip and Play is live (use 0–10 s dim, disable transport).
    The path overlay draws over the app's search bar when the frame box is large (cue-selected 600–1110,30):
    put the overlay under the HUD. `Stop` chip abuts `In order` (deep 1060–1180,1075).

## Crossfades and joins (owner note)

- **Fixed:** T1 now matches Q32. 300 Mpc holds full height to 7.0 s and tapers linearly to a point at 8.0 s,
  950 Mpc mirrors it, there are hairlines at 7.0 and 8.0 through both rows, and the `✕ 1 s` chip sits inside the window with the playhead
  passing under it. No stop (`join-selected`): abutting bars plus a `⌒ No stop` chip, group Value `no stop`,
  In order 8 s. Stop chip in `deep`. Layer fades keep the envelope grammar.
- **Left:** the selected-taper stroke (finding 13). In the join inspector, the two dotted window lines on the
  T3 curve have no labels: add `7 s` / `8 s` under them to replace the `4 s … 12 s` ends.

## Scrubber (owner note)

- **Fixed:** one time format, a chip backing under the line, visible loop-band ends (`scrub-snap` 915/1083),
  an overview strip with a thumb (`long-zoom` 880–1130,553), off-window ranges at the row edge, and the after-End state
  shot (`after End · reverted` on the head, the Camera inset and the Edit dot). That shows the revert ruling.
- **Left:** head and label collisions (finding 5).

## Inspector (owner note)

Dense and quiet: app Slider pills, compact caps sections, `↺` resets, dotted-underline tips, no helper
sentences. `Speed: matched` and `Total` are gone, and `Saves as` replaces the doubled Save line. The End/seam table
(loop) and the Fly grid stay the models. Left: findings 2–4, 8 and 9.

## Top bar and tooltips (owner note)

Layout B holds in every clip. Long titles fit (`Perseverance to Søndermarken`), alerts replace the status in place,
and the `?` sheet is anchored under its button. One StudioTip across the bar, inspector labels and marks. The tip
copy needs the trims in finding 10. No shot shows a tip on the Edit / Camera labels: add one to the contact sheet.

## ASKS

**ASK 1: What can a person do with a clip in Read-only (no dev server, so no save)?** `deep` shows the
status but every editing control is live.
- A. Lock it: editing controls disabled, status `Read-only · needs dev server`; scrub and preview only. Honest,
  but no way to try a change.
- B. Preview edits: editing works and is kept in memory (as Q28); Save and Save as new disabled, with the reason
  in their tips; status `Preview · can't save here`. You can experiment, and nothing pretends to save.
- C. B plus `Copy as TS` in the Save ▾ menu, so edits can leave by the clipboard. Most useful, but it adds an
  export path to maintain.
Recommendation: **B**.

## What to keep

1. The `Name | op value | Dur | channels` row grammar and closed vocabulary, now the same in every clip.
2. T1 tapered bars with join chips and the three-curve join inspector; envelopes for layer fades.
3. The scrubber: head with time, snap label, loop band with ends, zoom strip, after-End revert tags.
4. One `Views` shell (Edit label bottom-left, Camera inset top-right, detach, swap) in every clip.
5. The inspector as app Slider pills plus terse rows, with StudioTip carrying the meaning.
