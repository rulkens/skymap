---
stage:        9
id:           the-edge
title:        The edge
narration:    >
  This is the observable universe, everything light has had time to reach us
  from. 93 billion light-years, side to side.
focus:        point:0,0,0
distance_mpc: 6000
motion:       log-dolly to max
travel_s:     9
dwell_s:      8
effects:      []
requires:     [log-dolly, arbitrary-point-focus, dwell-drift, caption, auto-reveal]
status:       draft
---

## Intent

The climax. Pull back until the analytic horizon shell fades in and the whole
observable universe sits in frame. Slow, final, the widest the tour goes.

## Camera

Log-dolly to maximum (~2,000 → ~6,000+ Mpc), easing to a near-stop. The
horizon shell auto-fades in past ~40% of its radius — reach it simply by
pulling far enough out. Long, quiet dwell.

## On screen

`The edge` + narration. The horizon shell is the visual; the text names it.

## Tweaks

- Final framing distance is set by where the horizon shell reads strongest —
  tune `distance_mpc` against the shell's fade band, not a fixed number.
- This is the turnaround point; stage 10 returns inward from here.
