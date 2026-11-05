---
stage: 0
id: the-long-way-out
title: The Long Way Out
narration: >
  From home to the edge of the observable universe, and back. Night falls,
  and the band of the Milky Way comes out overhead.
focus: sky:soendermarken
distance_mpc: 5.5e-23 # eye height, 1.7 m above the park
motion: held, then tilt up to the zenith
travel_s: 0
dwell_s: 30
effects: [clock noon → night]
requires: [sky-frame, clock-to, caption]
status: draft
---

## Intent

The cold open, at the viewer's own scale. A person stands in Søndermarken, a
park in Copenhagen (55.670° N, 12.525° E), at local noon on the tour's date,
2026-10-10. The title fades up over the park. Then the view tilts up while the
clock runs to night, and the Milky Way appears overhead through Cassiopeia and
Cygnus. The whole ladder starts from the viewer's feet.

## Camera

No travel: the tour begins here. The enter clip is all snaps: it strips the
scene, sets the galactic pole, snaps the clock to noon (`TOUR_NOON_SIM_DAYS`)
and stands the camera on the `{ sky: SONDERMARKEN_SPOT }` frame (yaw = azimuth,
pitch = altitude) looking due north up the open lawn, then the cold-load gate
waits for the park mesh and terrain before the caption shows. North because it
is the scan's one corridor with sky down to the horizon, front-lit at noon;
south and south-east are backlit canopy. The dwell holds the title for 4 s,
then tilts the pitch to 80° while `clockTo` runs the clock to 20:00 UTC
(`TOUR_NIGHT_SIM_DAYS`) over 22 s, and holds the night for 4 s. Authored
tweens, not `dwellDrift`: a frame-tagged base writer may not overlap a
composite window on the same channel.

## On screen

`The Long Way Out` + the subtitle line over the park at noon; the second line
as the sky darkens. The scene strip (layers hidden, focused-only labels) moved
here from the retired Milky Way cold open. The date is a new Moon, so the night
is moonless and the band reads clean.

## Caption

```ts
caption: {
  title: 'The Long Way Out',
  lines: [
    'From home to the edge of the observable universe, and back.',
    'Night falls, and the band of the Milky Way comes out overhead.',
  ],
},
```

## Tweaks

- Earth's noon sky renders dark navy at ground level (backlog
  `2026-11-04-earth-noon-sky-dark-at-ground.md`); until that is fixed, noon →
  night reads as dusk → night.
- A sky pose ignores drag and wheel, so the viewer can't look around here.
- Dwell length is the clock run plus the title read; tune both by eye.
- No fade to black on the cold load: the `fade` cue moves only layer
  `clipOpacity`, which has no address for the planet, park mesh or sky, and it
  resets when the enter clip ends, before the gate's wait. The gate alone holds
  the caption; the park may show its tiles arriving.
