# Per-body zoom floor — the camera scrolls through a planet's surface

`needs-design` · UI & UX

## What happens

Scrolling in on Earth does not stop at the surface. The camera passes through it and
ends up inside the planet, at which point the body fills the view from within and
nothing reads as a surface any more.

## Why

`MIN_DISTANCE_MPC` in [`src/utils/camera/clampDistance.ts`](../../src/utils/camera/clampDistance.ts)
is a single global floor for `cam.distance`, and the orbit camera converges on its
focus **target**, which is the body's centre. There is no per-body clamp anywhere in
the chain — wheel zoom, pinch zoom, focus tweens and initial framing all route through
`clampDistance`, which knows nothing about what is being framed.

```
MIN_DISTANCE_MPC = 1e-17 Mpc
Earth radius     = 2.06e-17 Mpc   (6371 km)
floor            ≈ 0.49 body radii  — half a radius INSIDE the planet
```

The constant's own comment says it is "close enough that the orbit camera can sit just
off Earth's surface", which is the intent; the value is off by about a factor of two in
the direction that lets the camera through. It is also Earth-calibrated, so every
smaller body (Moon, Mars, any famous star at its own scale) has a proportionally worse
floor.

## Why it is worth fixing

Mostly it costs the ability to **dwell** at low altitude — park just above the surface
and turn. That is the gesture for judging any surface-detail work, so it bites hardest
on the Earth surface virtual texture's visual pass and on any future terrain or
atmosphere look work.

It is not currently blocking: the surface virtual texture plans tiles correctly from
~9000 km down to a few hundred km, and `planEarthTiles` deliberately returns an empty
plan once `camLen <= 1` rather than producing nonsense from a camera with no horizon.
So the failure mode is "the feature goes quiet", not "the feature breaks".

## Shape of a fix — undecided

Three candidates, in increasing ambition:

1. **Per-body floor from the focused body's radius.** `clampDistance` takes the focus
   target's radius and floors at some multiple of it. Smallest change; makes the floor
   correct for every body rather than approximately correct for one.
2. **A surface stop with a tunable standoff**, so the camera eases to a hover altitude
   rather than hitting a hard wall. Better feel, more design.
3. **Let the camera through deliberately**, and make the interior a real state (inside
   view, or an automatic cut back out). Most work, and only worth it if flying through
   a planet is something the app wants to offer.

Option 1 is the obvious first move and does not foreclose the others.

Open question either way: the floor interacts with the focus tween's own minimum end
distance (`MIN_FOCUS_DISTANCE_MPC`, 0.15 Mpc for galaxies), and `clampDistance`'s
docblock notes it was deliberately set below that so a focus tween is never ratcheted
outward. A per-body floor has to preserve that.

## Provenance

Noticed while running the Phase C Network-tab verification for the Earth surface
virtual texture (PR #517). Pre-existing — no camera file is touched on that branch.
