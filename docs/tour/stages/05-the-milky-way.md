---
stage: 5
id: the-milky-way
title: The Milky Way
narration: >
  Hundreds of billions of stars, and the Sun is one of them. Light takes a
  hundred thousand years to cross our galaxy.
focus: milkyWay
distance_mpc: 0.05
motion: log-dolly + local-orbit
travel_s: 8
dwell_s: 7
effects: []
requires: [log-dolly, dwell-drift, caption, auto-reveal]
status: draft
---

## Intent

The last rung inside home. The stellar neighbourhood shrinks into one corner of
a disk, and the whole galaxy comes into view. The band the viewer saw overhead
from the park in stage 00 is this disk, seen from inside. Light time carries
over: four years to the nearest star, a hundred thousand to cross the galaxy.

## Camera

Log-dolly out from the neighbourhood (~30 light-years → ~0.05 Mpc, about four
decades), then a short, slow orbit around the disk on the dwell, a few degrees
of approach angle, just enough parallax to give the disk depth. This beat was
stage 01 before the Earth opening; its orbit is unchanged, the travel in is new.

As built: the travel in is still the old cold open, a cut from the stellar
neighbourhood to 100 Mpc out on the disc bearing and a log dolly in on the
Milky Way; the beat states the galactic pole and level roll on entry. It also
shows the names beat 00 hid that no earlier beat has claimed (small bodies,
missions, the black hole) and the mission trails, as a placeholder.

## On screen

`The Milky Way` + narration. The engine's "You are here" marker and connector
auto-render (the camera is well inside ~2 Mpc) and point at the Sun the
previous beats framed.

## Caption

```ts
caption: {
  title: 'The Milky Way',
  lines: [
    'Hundreds of billions of stars, and the Sun is one of them.',
    'Light takes a hundred thousand years to cross our galaxy.',
  ],
},
```

## Sources

- "Our galaxy probably contains 100 to 400 billion stars, and is about 100,000
  light-years across": NASA Science, "Our Milky Way Galaxy: How Big is Space?",
  https://science.nasa.gov/universe/exoplanets/our-milky-way-galaxy-how-big-is-space/

## Tweaks

- Keep the orbit gentle; this stage is about orientation, not spectacle.
