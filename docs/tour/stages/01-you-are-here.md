---
stage:        1
id:           you-are-here
title:        You are here
narration:    >
  The Milky Way, our home galaxy. A hundred billion stars, and the Sun is
  one of them.
focus:        milkyWay
distance_mpc: 0.05
motion:       local-orbit
travel_s:     3
dwell_s:      7
effects:      []
requires:     [dwell-drift, caption, auto-reveal]
status:       draft
---

## Intent

Place the viewer. The title clears and the "You are here" marker reveals —
this is home, this is the scale we start from.

## Camera

A short, slow orbit around the disk (a few degrees of approach angle) — no
real scale change yet, just enough parallax to give the disk depth.

## On screen

`You are here` + narration. The engine's "You are here" marker + connector
auto-render (camera is well inside ~2 Mpc).

## Tweaks

- Keep the orbit gentle; this stage is about orientation, not spectacle.
