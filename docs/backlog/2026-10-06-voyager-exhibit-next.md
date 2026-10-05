# Voyager exhibit: Next tier

From `docs/superpowers/specs/2026-10-05-voyager-mission-ux-design.md` §3. Core (C1-C5) shipped with the exhibit.

- **N1 Clock sweep on jump.** A row click animates the clock from its old to its new instant over 1.2 s (ease-out), so trails visibly rewind or grow. Reduced motion jumps. New input cancels it. Cost S.
- **N2 Look closer / Whole mission. Needs the user's ruling (deviation).** The spec rules that ticks and rows never move the camera, and that still holds. N2 adds a separately labelled `Look closer` button on the expanded flyby row (focuses `targetId` with a framing that includes the craft) and a `Whole mission` chip in the header. Reason: at the whole-mission framing a flyby's bend is sub-pixel, so the timeline says when but not how. Cost M: a focus fly inside an exhibit takeover, so `exhibitBodySaga` must stop its 1 deg/s drift when the user takes the camera (its only abort today is `exitTakeover`). Not built; ruled out provisionally.
- **N3 Live readouts per lane.** `171.9 AU · 23 h 52 m light` under each lane tag, from the trajectory registry and Earth's snapshot state, throttled to 4 Hz. Cost S-M.
- **N4 Exhibit entry clock.** Optional `clock?: { rate, paused }` on the exhibit, applied on entry and restored on exit by the takeover capture. Provisional ruling: leave the visitor's rate alone. Cost S.
- **N5 Body card cross-link.** A `Mission timeline` row on the Voyager 1 and 2 `BodyDetailCard` that opens the exhibit. Cost S.
- **N6 Copy link to this moment.** A `link` chip on the expanded row copying `#exhibit=voyager&t=<iso>`. Cost S.
- Also unbuilt from Core: the greyed "Neither craft has flown yet." caption before launch; the palette card has no thumbnail (run `npm run capture-featured`); the lane tag collapsing to a swatch on phones.
