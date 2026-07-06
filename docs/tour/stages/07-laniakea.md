---
stage: 7
id: laniakea
title: Laniakea
narration: >
  Virgo is one cluster among dozens. Together they drift as a single vast
  structure: Laniakea, our home supercluster, half a billion light-years wide.
focus: structure:supercluster-laniakea-sc
distance_mpc: ~220
motion: two-stage log-dolly
travel_s: 17
dwell_s: 12
effects: [supercluster rings fade-in]
requires: [log-dolly, dwell-drift, caption, auto-reveal]
status: draft
---

## Intent

The rung between "a cluster" and "the web": clusters are not the top of the
hierarchy. Two ideas in one beat, in the order they unfold — Virgo is **one
of many** clusters, and the many belong to **one supercluster**, Laniakea.
Named and framed, it makes the cosmic-web beat's "bright clumps are where
superclusters gather" line land on something the viewer has already met.

## Camera

Two-stage pull-out. Stage 1: drop Virgo's focus and dolly straight out to
~60 Mpc so the neighbouring clusters (Fornax, Hydra, Centaurus, Coma) swell
into frame as named rings — wordless, like the flythrough's launch. Stage 2:
supercluster rings fade in, Laniakea takes the focus, and the camera flies
out until its 80 Mpc ring sits inside the ring-fade band with its label
(the Local-Group beat's framing trick, scale 2.75).

## On screen

`Laniakea` + narration. focusedOnly goes OFF for the many-clusters read —
sibling cluster names are stage 1's evidence — and stays off through the
dwell so the members remain named (dimmed under Laniakea's recession).
Cluster rings stay on; the cosmic-web beat hides them on entry.

## Tweaks

- `MANY_CLUSTERS_MPC` (60) — stage 1's landing. Wide enough for a handful of
  named cluster rings, close enough that Virgo still reads as the ring we
  just left.
- The Laniakea framing scale (2.75) — the ring should sit clear of the fade
  band with the two-line label legible.
- Stage-1 hold (2 s) — long enough to register "many", short enough that the
  beat doesn't stall before its subject arrives.
