---
stage: 5
id: meeting-the-neighbours
title: Meeting the neighbours
narration: >
  Bode's Galaxy, the Pinwheel, the Whirlpool, the Sombrero, Centaurus A —
  the bright landmarks of our corner of the universe.
focus: famous:c77
distance_mpc: 4
motion: lateral-flythrough
travel_s: 0
dwell_s: 32
effects: []
requires: [pass-through-spline, dwell-drift, caption, auto-reveal]
status: built
---

## Intent

The one genuinely lateral, grand-tour moment. Sweep _past_ the iconic
neighbours on one continuous spline — the caption names the landmarks the
ride visits, so the copy and the flight are the same list.

## Camera

The flythrough IS the dwell (no enter clip): the caption reveals at beat
entry and rides the whole sweep. The spline swoops beside each famous
galaxy in turn — Bode's (M81), the Pinwheel (M101), the Whirlpool (M51),
the Sombrero (M104, the equator crossing), the Southern Pinwheel (M83) —
settling on Centaurus A with a short drift. First knot is Bode's because
the previous beats' shared orbit lands facing the M81 Group: the launch
continues straight along the aim the viewer already holds.

## On screen

`Meeting the neighbours` + narration riding the sweep. focusedOnly stays
OFF (set two beats back), so every passed galaxy's name labels as it
swells past the apparent-size gate; group rings + labels stay lit.

## Tweaks

- Waypoint order minimises turns; the one sharp (~100°) equator crossing
  lands at the Sombrero where the banked pass-by reads as intentional.
- `lingerSec` per galaxy is wall-clock slow-glide, never a freeze.
