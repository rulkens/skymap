---
stage:        6
id:           cosmic-flows
title:        Everything is flowing
narration:    >
  The web isn't still. Galaxies stream along the threads into the densest
  places, ours included, pulled toward the Great Attractor.
focus:        point:0,0,0
distance_mpc: 80
motion:       lateral reframe + orbit-reveal
travel_s:     5
dwell_s:      9
effects:      [flow field fade-in]
requires:     [lateral-focus, dwell-drift, animated-effect, caption, flow-field]
status:       draft
---

## Intent

The dynamic heart of the cosmic-web section — and the **bridge** between its
two halves. Stage 05 showed fullness, stage 07 will show emptiness; this beat
shows the *mechanism* that links them: matter flows **out of the voids, along
the filaments, into the dense clumps.** The CF4++ flow field makes that
motion visible. It's also the only beat that adds *time* to the tour — the
streamlines animate while the camera holds.

## Camera

A short lateral reframe at held scale (~90 → ~80 Mpc, swinging toward the
local flow basin), then a long, near-still orbit-reveal — the camera gets out
of the way so the animated flow carries the beat. The long dwell (9 s) is to
*watch the motion*, not read.

## On screen

`Everything is flowing` + narration naming the Great Attractor — the real,
evocative anchor for "our whole neighbourhood is drifting somewhere."

## Effects

- **Flow field fades in** over the travel leg (animated streamlines /
  velocity field from the CF4++ layer). The MCPM volume + filaments from
  stage 05 stay on underneath, so the flow reads as motion *through* the
  density field, not a separate overlay.

## Tweaks

- Exact framing should centre the local flow basin (Laniakea / Great
  Attractor, roughly Norma–Centaurus direction) once the flow layer's natural
  focal region is settled — `focus` is a placeholder origin point for now.
- Tune the dwell to the streamline animation's natural period so the flow
  reads as a continuous current, not a loop seam.

## Dependency

Relies on the **CF4++ flow field landing as a first-class engine layer**
(`project_flow_field_integration`) — confirmed to ship before the grand tour
is built. The `flow-field` requires-tag marks that dependency; the tour only
toggles the layer, it doesn't build it.
