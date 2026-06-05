---
stage:        2
id:           nearest-neighbour
title:        Nearest neighbour
narration:    >
  Andromeda, the nearest large galaxy to ours. Its light has been
  travelling toward us for 2.5 million years.
focus:        famous:m31
distance_mpc: 0.8
motion:       log-dolly+lean
travel_s:     7
dwell_s:      7
effects:      []
requires:     [log-dolly, lateral-focus, dwell-drift, caption, auto-reveal]
status:       draft
---

## Intent

First rung of the ladder. Pull back from the Milky Way and lean toward
Andromeda — the first "there is something else out there" beat.

## Camera

Log-dolly out (~0.05 → ~0.8 Mpc) while the focus leans from the MW toward
M31, so we arrive framing Andromeda rather than dollying straight back. The
"You are here" marker fades as we cross ~2 Mpc.

## On screen

`Nearest neighbour` + narration. M31's name auto-labels (famous-galaxy
labels on).

## Tweaks

- The lean is the first `lateral-focus` move — keep it readable, not a swing.
