---
stage: 0
id: the-long-way-out
title: The Long Way Out
narration: >
  From home to the edge of the observable universe, and back. Night falls,
  and the band of the Milky Way comes out overhead.
focus: sky:soendermarken
distance_mpc: 5.5e-23 # eye height, 1.7 m above the park
motion: held on the noon Sun, then pan west with it and tilt up to the zenith
travel_s: 0
dwell_s: 27.5
effects: [clock noon → sunset → night]
requires: [sky-frame, clock-to, caption]
status: draft
---

## Intent

The cold open, at the viewer's own scale. A person stands in Søndermarken, a
park in Copenhagen (55.670° N, 12.525° E), at local noon on the tour's date,
2026-09-05. The title fades up over the park with the Sun high in the south.
Then the clock runs to night: the view turns west with the Sun and watches it
set, then tilts up as the Milky Way comes out overhead through Cygnus and
Cassiopeia. The whole ladder starts from the viewer's feet.

## Camera

No travel: the tour begins here. The enter clip is all snaps: it strips the
scene, sets the galactic pole, snaps the clock to noon (`TOUR_NOON_SIM_DAYS`,
11:09 UTC, the Sun due south and 41° up) and stands the camera on the
`{ sky: SONDERMARKEN_SPOT }` frame (yaw = azimuth, pitch = altitude), then the
cold-load gate waits for the park mesh and terrain before the caption shows.
The spot is the north end of the scan's lawn, 108 m north of the scan's seat:
looking south, the lawn runs between its tree rows under the noon Sun, and to
the west the view opens to the horizon. Nearer the seat, canopy hides the Sun
from mid-afternoon on. The view starts 0.5 rad up, past the treetops.

The dwell holds the title for 4 s, then runs the clock to 20:45 UTC
(`TOUR_NIGHT_SIM_DAYS`) over 22 s and holds the night for 1.5 s. The clock runs
at full rate for 18 s, then an `easeOutQuad` `clockTo` slows it to rest over
the last 4 s: one linear cue would stop the wheeling sky dead. The yaw pans
west linearly in sim time, the clock's own profile, so the frame and the sky
stop together; it starts as far right of the noon Sun (~22°) as it ends left of
the setting one, and ends on `PARK_VIEW` near due north, where beat 01 takes
over. The pitch eases down to 0.35 rad by sunset (`TOUR_SUNSET_SIM_DAYS`,
17:47 UTC, about 14 s into the run), so the Sun sets in the lower part of the
frame with only a thin strip of ground, then eases up to 80° on the night sky.
Every Sun position comes from the ephemeris (`skyPoseOfBodyAt`) at the three
day-time constants, so a date change moves only those constants
(`tourDayTimes.test.ts` checks them). Authored tweens, not `dwellDrift`: a
frame-tagged base writer may not overlap a composite window on the same
channel.

## On screen

`The Long Way Out` + the subtitle line over the park at noon; the second line
as the Sun sets. The scene strip (layers hidden, focused-only labels) moved
here from the retired Milky Way cold open. The date is the day after last
quarter: the Moon rises at 21:04 UTC, after the night view, so the band reads
clean.

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

- From about 4° of solar altitude before sunset the terrain tiles draw blank
  grey-white (backlog `2026-11-06-earth-night-ground-haze.md`), so the sunset
  pitch keeps the ground to a thin strip.
- A floating blob in the scan (a tree crown with no trunk, ~70 m west of the
  spot) shows against the sky near the Sun for a few seconds of the pan; a
  mesh cleanup, not the beat.
- A sky pose ignores drag and wheel, so the viewer can't look around here.
- Dwell length is the clock run plus the title read; tune both by eye.
- No fade to black on the cold load: the `fade` cue moves only layer
  `clipOpacity`, which has no address for the planet, park mesh or sky, and it
  resets when the enter clip ends, before the gate's wait. The gate alone holds
  the caption; the park may show its tiles arriving.
