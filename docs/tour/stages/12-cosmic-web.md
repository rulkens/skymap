---
stage: 8
id: cosmic-web
title: The cosmic web
narration: >
  Far enough out, galaxies trace a web: bright threads and clumps where
  superclusters gather, ringed by dark voids.
focus: structure:supercluster-coma-sc
distance_mpc: 90
motion: log-dolly+orbit-reveal
travel_s: 9
dwell_s: 9
effects: [mcpm volume fade-in, filaments fade-in]
requires: [log-dolly, dwell-drift, animated-effect, caption, auto-reveal]
status: draft
---

## Intent

The showcase beat — and the first half of the web's central idea: **fullness
and emptiness belong together.** This stage is the _fullness_ — the dense
side. Galaxies resolve into a web; the **MCPM density volume** makes that web
visible as continuous structure, and the bright clumps are where
superclusters sit. Stage 10 (the voids) is the _emptiness_ half; the two read
as one idea in two beats.

## Camera

Turn from Laniakea's wide shot and close in on Coma, then a wide, slow
orbit-reveal so the web turns in 3D and reads as volume, not a flat scatter.
We arrive on Coma — itself a supercluster, sitting in one of the bright
nodes — and the dwell's pull-back reopens to the full web.

## On screen

`The cosmic web` + narration. Coma supercluster name auto-labels — the label
puts a name on the clump, reinforcing "superclusters live in the dense knots."

## Effects (animated)

- **MCPM density volume fades in** over the travel leg — _the hero of this
  beat._ The raymarched field shows the web as continuous density: bright
  filaments and nodes, dark voids. It carries the whole fullness/emptiness
  dichotomy in one layer.
- **Filaments fade in** alongside, tracing the threads through the volume
  (the DisPerSE skeleton over the density field).

## Tweaks

- Tune both ramps to complete as the camera settles, so the reveal peaks on
  the dwell.
- These effects stay on through the cosmic-web section (flows 09, voids 10) —
  the flow + void beats need the MCPM field still lit so they read as the
  _same web_. The tour-end restore reverts them to the user's pre-tour state.
- Consider framing so a node (supercluster clump) and an adjacent dark void
  are both in shot — it pre-stages the flows (09) and the void (10).
