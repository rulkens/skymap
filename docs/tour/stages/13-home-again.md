---
stage:        13
id:           home-again
title:        Home again
narration:    Back to where we began. Everything you just saw is out there to explore.
focus:        milkyWay
distance_mpc: 0.05
motion:       inward log-dolly to start
travel_s:     8
dwell_s:      5
effects:      []
requires:     [log-dolly, dwell-drift, caption]
status:       draft
---

## Intent

The return. One swift inward dolly from the horizon straight back to the
Milky Way — the outbound journey was the story; the return is "you're home,
go explore." Lands the viewer exactly where the tour began, oriented.

## Camera

A single continuous inward log-dolly across the whole ladder (~6,000 →
~0.05 Mpc), faster than the outbound legs — we've seen everything on the way
out, so don't linger. Ease to rest on the opening framing.

## On screen

`Home again` + narration. The narration is the only invitation to explore —
the one place a call-to-action is allowed (see writing-style).

## End of tour

- On the settle, the tour ends: UI chrome returns, pre-tour settings restore
  (filaments / volume toggled during the tour revert), camera left on the
  home framing so the viewer can pick up and explore.

## Tweaks

- The return crosses 5 decades in 8 s — fast, but uniform in log-scale so it
  reads as a smooth rush home, not a blur.
