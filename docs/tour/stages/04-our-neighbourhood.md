---
stage:        4
id:           our-neighbourhood
title:        Our neighbourhood
narration:    >
  Our galaxy runs with neighbours like M81 and Centaurus A, tens of millions
  of light-years out.
focus:        structure:group-sculptor-group
distance_mpc: 4
motion:       lateral-flythrough
travel_s:     9
dwell_s:      5
effects:      [groups labels + markers on]
requires:     [log-dolly, pass-through-spline, lateral-focus, dwell-drift, caption, auto-reveal]
status:       draft
---

## Intent

The one genuinely lateral, grand-tour moment. Sweep *through* the local
galaxy groups rather than hopping between them — show that home sits in a
neighbourhood, in 3D.

## Camera

The path **bends through** pass-through waypoints (`group-m81-group`,
`group-cen-a-group`) at constant speed, then **settles** on
`group-sculptor-group`. Modest log-dolly underneath (~0.8 → ~4 Mpc); the
character is lateral.

The pass-through points carry no text and no dwell — they only shape the
curve. Only the final settle shows narration.

## On screen

`Our neighbourhood` + narration on the settle. Group markers (soft green) +
names auto-label once the `group` category is toggled on.

## Effects

- Turn `group` markers + labels on as the stage begins (instant toggle).

## Tweaks

- Group spheres can be sparse at small/medium tier (subsample thinning) —
  the tour reads best at large tier until per-group seeding lands.
- Order the pass-through points so the curve doesn't double back on itself.
