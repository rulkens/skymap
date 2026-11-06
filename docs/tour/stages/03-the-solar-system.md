---
stage: 3
id: the-solar-system
title: The Solar System
narration: >
  Sunlight reaches Earth in eight minutes. It takes four hours to reach
  Neptune, the farthest planet.
focus: none # the Sun is named by its caption, not by focus
distance_mpc: 2.5e-10 # 52 au, Neptune's orbit across two thirds of the frame
motion: turn + log-dolly + lean
travel_s: 10
dwell_s: 8
effects: [orbit trails on]
requires: [log-dolly, lateral-focus, clock-to, dwell-drift, caption]
status: draft
---

## Intent

The third rung. Earth and Moon shrink to a point and the focus leans to the
Sun until the planets' orbits fill the frame. Light time keeps the scale: a
second to the Moon was the last rung, minutes and hours are this one.

## Camera

The enter snaps the clock to `TOUR_NIGHT_SIM_DAYS` (`overSec: 0`), so the
planets sit where they were on 2026-10-10. Log-dolly out from the Earth–Moon
framing while the focus leans from Earth to the Sun; arrive with Neptune's
orbit inside the frame, tilted enough that the orbits read as rings, not lines.
A slow orbit on the dwell.

As built: the beat states the ecliptic pole, the date and level roll on entry,
and restates beat 02's target and range so a skip or Prev pulls out from the
gap. Beat 02 looks away from the Sun, so a straight pull-back would dolly the
eye past it: the view first turns about the gap (5 s, while the range is still
small) to face ecliptic longitude 125° from 35° above the ecliptic, then the
target leans to the Sun as the log dolly passes 1 au. The eye stands on
Pluto's side, which drops Pluto and its caption below the frame. Perspective
swells the orbits' near side, so the aim sits 10 au below the Sun on its
ecliptic axis, which centres Neptune's orbit and keeps the dwell's yaw circling
the Sun.

## On screen

`The Solar System` + narration on dwell start. Orbit trails make the planets
findable at this scale; the Sun's and Neptune's names are the two the caption
needs. The planets have been named since beat 02; the Sun's caption is the star
layer's, so the beat shows `label:starCatalog:sun` alone and the other star
names stay hidden.

## Caption

```ts
caption: {
  title: 'The Solar System',
  lines: [
    'Sunlight reaches Earth in eight minutes.',
    'It takes four hours to reach Neptune, the farthest planet.',
  ],
},
```

## Sources

- Sunlight to Earth about 8 min 20 s: NASA Space Place, "All About the Sun",
  https://spaceplace.nasa.gov/all-about-the-sun/en/
- Sunlight to Neptune 4 hours, Neptune 30 au from the Sun: NASA Science,
  "Neptune Facts", https://science.nasa.gov/neptune/neptune-facts/
