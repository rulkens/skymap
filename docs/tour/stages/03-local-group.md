---
stage: 3
id: local-group
title: The Local Group
narration: >
  The Milky Way and Andromeda travel together — a small family of galaxies,
  dozens of dwarfs in tow, bound as the Local Group.
focus: structure:group-local-group
distance_mpc: 2.5
motion: pull-back + orbit
travel_s: 9
dwell_s: 14
effects: [group rings + labels on]
requires: [log-dolly, dwell-drift, caption, auto-reveal]
status: built
---

## Intent

The step between "one neighbour" and "a neighbourhood of groups". Pull back
from Andromeda until home and its neighbour share the frame, and name the
family they belong to — the viewer learns that the two galaxies they've met
are not loose, they're _bound_.

## Camera

Wordless enter: the group ring lights and the Local Group is focused (its
name is the reveal under focusedOnly), then the target pans from M31 to the
group barycentre while the dolly pulls out to the ring's framing. The
barycentre sits on the MW–M31 sightline, so the pull-back reads as receding
from Andromeda until home slides into frame beside it. No aim change — the
bearing inherited from the Andromeda dwell is ~79° off the stacking axis,
which is what separates the two galaxies on screen.

The dwell orbits the family — the only subject we're inside. One full
backward revolution spans this dwell and the neighbourhood-reveal beat
after it, landing facing the M81 Group (the flythrough's first knot); the
reveal beat owns its gentle share of the turn, this dwell takes the
remainder, so re-tuning either keeps the landing.

## On screen

`The Local Group` + narration on dwell start. The group's ring circle is
in frame (the enter lands at 2.75× the standard framing — standard lands
inside the ring's close-approach fade). focusedOnly flips OFF, so the
family reads with names: Milky Way, Andromeda, Triangulum — the famous
producer's 6 px apparent-size gate self-culls every dwarf label at this
framing. Dwarfs still show as sprites (LMC/SMC, M32, M110, NGC 147/185…)
strung between the two spirals.

## Tweaks

- The 14 s dwell length is eye-tuned — the orbit should feel unhurried at
  the close framing.
- Re-derive `EXIT_YAW_RAD` if the enter ever gains an aim cue.
- Famous-name labels ride the focus recession (dim to 0.25 while the group
  is focused — same dimming the flythrough's labels ride). If they read
  too faint, clear focus after the naming or exempt the layer.
