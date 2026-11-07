---
stage: 1
id: you-are-here
title: You are here
narration: >
  Earth, our home planet, nearly 13,000 kilometres across. All eight billion
  of us live on it.
focus: body:earth
distance_mpc: 1e-15 # ~30,000 km, the whole Earth in frame
motion: rise (sky → body → world legs)
travel_s: 23
dwell_s: 7
effects: []
requires: [frame-handover, clock-to, dwell-drift, caption]
status: draft
---

## Intent

Place the viewer on their planet. The camera rises out of the park, over
Copenhagen and the Øresund coast, until the whole Earth hangs in frame. The
first rung of the ladder: the ground under the viewer's feet is one world.

## Camera

The enter snaps the clock to the tour night (`TOUR_NIGHT_SIM_DAYS`,
`overSec: 0`) so a skip or Prev lands on the same sky. Then one continuous
rise handed over in legs: `{ sky }` (still standing in the park) →
`{ body: 'earth' }` (Copenhagen below, then Denmark, then the curve of the
planet) → world, ending on the whole Earth. The dwell drifts slowly around it.
No jump at either leg handover: that is the eye check carried from #1032.

## On screen

`You are here` + narration once the whole Earth is in frame. Night over
Copenhagen: the city lights sit on the dark side of the terminator.

## Caption

```ts
caption: {
  title: 'You are here',
  lines: [
    'Earth, our home planet, nearly 13,000 kilometres across.',
    'All eight billion of us live on it.',
  ],
},
```

## Sources

- Earth's mean diameter 12,742 km (mean radius 6,371 km): NASA NSSDCA Earth
  Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
- World population passed 8 billion on 15 November 2022: UN DESA, "Day of
  Eight Billion", https://www.un.org/en/dayof8billion

## Tweaks

- If the caption ends up riding the rise instead of the dwell, a lead line
  naming Copenhagen fits while the city is in view.
- The pole the Earth beats run under is decided in Task 5's
  `frameLadder.test.ts`.
