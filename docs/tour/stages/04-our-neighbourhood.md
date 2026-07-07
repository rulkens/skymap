---
stage: 4
id: our-neighbourhood
title: Our neighbourhood
narration: >
  The Local Group is one small family among many. Our galactic neighbourhood
  stretches tens of millions of light-years.
focus: structure:group-local-group
distance_mpc: 4.5
motion: pull-back + drift
travel_s: 0
dwell_s: 12
effects: []
requires: [log-dolly, dwell-drift, caption, auto-reveal]
status: built
---

## Intent

The reveal between the family close-up and the flythrough: the Local Group
is not alone. Pull back until the surrounding groups and the 2MRS field
make it one small clump among many.

## Camera

The pull-back IS the beat (no enter clip) — the caption is about the
widening view, so it rides the motion. A beat of stillness, then a dolly
out to ~4.5 Mpc while the drift continues the revolution the Local-Group
dwell began; the two dwells share one full backward orbit that lands
facing the M81 Group, the flythrough's first knot. This beat owns its
gentle share of the turn (exported from `neighbourhoodReveal.ts`); the
Local-Group dwell takes the remainder, so re-tuning here rebalances there
automatically.

## On screen

`Our neighbourhood` + narration riding the pull. The scene arrived with the
Local-Group beat (2MRS, group rings, focusedOnly-off); this beat's one cue
is `focus(null)` as the pull starts. Holding the Local-Group focus would
keep every sibling ring receded and the field outside the family dimmed by
the member-isolation fade; releasing it lets the neighbourhood brighten as
the camera recedes.

## Tweaks

- `NEIGHBOURHOOD_MPC = 4.5` (the landing) is eye-tuned; the drift outlasts
  the 9 s dolly so the wide shot breathes before the flythrough.
- Group spheres can be sparse at small/medium tier (subsample thinning) —
  reads best at large tier until per-group seeding lands.
