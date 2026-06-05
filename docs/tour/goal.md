# Tour — goals

Design for the full guided-tour experience. North star for the script,
cinematography, and engine primitives.

## What it is

A narrated, titled powers-of-ten journey — Milky Way → cosmic web → edge of
the observable universe **and back**, **~2½ min**. Opens on a title, moves
through stages, shows on-screen text (stage title + 1–2 narration lines) at
every stage, then **returns to where it began** (the Milky Way), leaving the
viewer oriented to start exploring. Launched from the splash-screen **Tour
button**. While it runs: UI chrome hidden, cancellable on any input.

## Audience

General public — no astronomy background. Bar: a curious 12-year-old and
their grandparent both follow it. No jargon without a gloss.

## Success

- Viewer gets an intuitive feel for the scale ladder, never feels lost
  (text carries "where/what", camera carries "how big").
- Motion reads cinematic, not a UI camera snapping between bookmarks: soft
  departures/arrivals, flythrough where earned, nothing frozen.
- Scale climb feels uniform — never blink past five decades in a second,
  never crawl through emptiness (logarithmic motion; see `cinematography.md`).
- Text legible and well-timed: appears as the stage settles, holds long
  enough to read unhurried, clears before the next move.
- Plays/records deterministically.

## Hard constraints (these shape the primitives)

- **Scale is logarithmic.** Framing distances span ~0.05 → ~6,000 Mpc (5
  orders of magnitude). Interpolate `log(distance)`, never raw distance.
- **Only what's shipped (by build time).** Every target/effect already exists
  (MW impostor, famous galaxies, structure anchors, groups, filaments, MCPM
  volume, milliquas, horizon shell) — plus the **CF4++ cosmic-flow field**,
  which lands as a first-class engine layer before this tour is built. New
  *motion/sequencing/text* only — no new renderers.
- **Deterministic & cancellable.** Any pointer/key/wheel cancels cleanly and
  restores pre-tour settings.

## Non-goals

- Tour-authoring UI / preset library.
- Free-fly camera mode.
- New renderer or catalog just to feed the tour.
- Interactivity during playback.
