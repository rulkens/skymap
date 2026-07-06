---
stage: 3
id: local-group
title: The Local Group
narration: >
  The Milky Way and Andromeda travel together — a small family of galaxies,
  dozens of dwarfs in tow, bound as the Local Group.
focus: structure:group-local-group
distance_mpc: 2.5
motion: pull-back + full orbit
travel_s: 9
dwell_s: 24
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

The dwell is one full slow revolution around the family — the only beat
that orbits its subject completely, because it's the one structure we are
inside. The net yaw is sized to land facing the M81 Group, the
flythrough's first knot. In the dwell's second half, 2MRS fades in while a
dolly pulls out to ~4.5 Mpc: the local neighbourhood populates, and the
next beat dives straight into it.

## On screen

`The Local Group` + narration on dwell start. Group rings + the Local
Group's label (focusedOnly). Dwarf galaxies show as famous-galaxy sprites
(LMC/SMC, M32, M110, NGC 147/185…) strung between the two spirals.

## Tweaks

- `NEIGHBOURHOOD_MPC` (the pull-out landing) and the 24 s dwell length are
  eye-tuned — the orbit should feel unhurried at the close framing and the
  pull-out should finish ~4 s before the cut.
- Re-derive `EXIT_YAW_RAD` if the enter ever gains an aim cue.
