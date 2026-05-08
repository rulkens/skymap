# 0010 — Open and close the tour on Earth, not on the Sun

**Status:** Proposed (2026-05-09 — after user pushback on the original cold open)
**Date:** 2026-05-09
**Deciders:** @rulkens (proposed); awaiting review
**Supersedes (in part):** the cold-open beats of `vision/01-narrative-script.md` (T+0:00 to T+0:14) and the closing beat (T+1:36 to T+1:43)

## Context

The original narrative script opens the tour by dollying the camera into the Sun's photosphere: 5 seconds of "wide skymap view," then a punch-in to a yellow-orange disc filling the screen. The first overlay is **"THE SUN — 1.4 million km across · 8 light-minutes from Earth..."**

This was chosen for two reasons, neither of them good in retrospect:

1. **Anchored on Eames canon.** The 1977 "Powers of Ten" film opens at a Chicago picnic and zooms out from a person's hand. The film's specific scene doesn't translate to skymap, but the *zoom-out from familiar* logic does. The original plan picked the Sun as "the closest thing to home that skymap renders" — but that's not what the user has a relationship to.
2. **Minimum new infrastructure.** The dolly-to-Sun beat starts from skymap's existing default view, which costs nothing new. An Earth-surface opening costs new code (atmosphere shader, ground plane, Earth-as-disc renderer). The original plan unconsciously optimized for cheapness.

During review, the user proposed: open on Earth at sunset, the night sky becoming visible, then zoom out. This decision adopts that.

## Decision

**The tour opens at ground level on Earth at sunset and closes there at sunrise.**

Specifically:

- `T+0:00` Camera at ground level. Atmospheric gradient sky, sun setting. Featureless black ground silhouette. Brightest stars (Venus, Sirius, Vega) appear as the sky darkens. Milky Way band fades up across overhead.
- `T+0:08` Camera tilts up; sky is fully dark, full Gaia DR3 starfield visible.
- `T+0:11` Camera lifts off, ground curves into a horizon.
- `T+0:18` Earth as a small disc with continents/terminator. Sun visible to the side.
- `T+0:22` We are now in Shell 1 (Solar System) as previously specified.

The tour close mirrors:

- `T+1:30` Camera traverses back through shells 8 → 7 → ... → 4 quickly (a fast, smooth pull-in)
- `T+1:38` We pass through the Solar System; Earth grows to fill the frame
- `T+1:42` Camera lands on Earth at sunrise (orange dawn, stars fading west, Sun rising in the east)
- `T+1:45` **TOUR COMPLETE** overlay over the sunrise; "Replay" button

This adds approximately 8 s to the open and 7 s to the close (15 s total). The 90-second budget is preserved by trimming shell 5 (Local Sheet) from 8 s → 6 s, shell 8 (Cosmic Web) from 8 s → 6 s, and tightening internal dwell times by ~1 s each across shells 3, 6, 7. Total revised runtime: ~1:48, slightly over the 90 s headline but inside the 2:00 absolute ceiling.

## Alternatives considered

### (a) Sun-photosphere cold open (original)
Rejected. Abstract for a first-time viewer. The Sun's surface is something most users have never seen and have no emotional connection to. "We are 8 light-minutes away" requires the viewer to do unit-conversion in their head before they can feel anything. Loses the audience in the first 10 seconds.

### (b) Earth at sunset → night sky → zoom out (chosen)
The earth opening is the canonical "scale of the universe" framing — Sagan's "Cosmos," Pale Blue Dot, every planetarium's "look up at the sky" preamble. It works because every viewer has stood outside at dusk and watched stars emerge. The lived experience IS the scale-legibility hook. We don't need to teach it; we trigger memory.

The closing on sunrise is symmetric and emotionally satisfying — the tour becomes a journey that returns home, which is a much stronger story shape than "we ended up at the edge of the universe and then jump-cut back."

### (c) Powers-of-Ten exact remake (Chicago picnic style — start at human hand or face)
Rejected. Wrong canon for a galaxy viewer. Skymap is not a documentary; we're not pretending to be the Eames film. Borrowing the *zoom-out logic* is correct; borrowing the *picnic blanket* would be cargo-culting.

### (d) Constellation-pattern intro (zoom out from a familiar pattern: Big Dipper, Orion)
Considered. Clever — viewers who recognize the constellation get an instant identification beat. Rejected because: (1) Northern-hemisphere-biased; users in the Southern hemisphere or unfamiliar with constellation names get nothing; (2) requires drawing the constellation lines, which is *teaching* asterism conventions, which the rest of the tour doesn't do; (3) duplicates Stellarium's territory.

### (e) ISS-view cold open (zoom out from looking down at Earth from low Earth orbit)
Considered. Visually striking — astronaut's view is iconic. Rejected because: (1) it skips the "look up at the sky" beat which is the strongest emotional moment available; (2) requires high-quality Earth surface imagery (city lights, weather, etc.) which is much heavier than a sunset gradient; (3) feels more "space agency promo" than "explorer's notebook."

## Consequences

### Positive

- The single strongest emotional beat in the tour now lands at T+0:00 instead of being absent. First-time visitors are hooked before they have time to bounce.
- Closes the narrative loop. "We left home, traveled to the edge of the observable universe, came back home." That's a complete sentence; the original tour was a fragment.
- Highest-impact share clip. A 5-second loop of "sky darkens, stars emerge, camera lifts off Earth" is the single best 5 seconds for r/space, r/astronomy, BlueSky, etc. Better than any galaxy point-cloud screenshot.
- Mobile-friendly. A sunset is recognizable at any screen size. The Sun-photosphere beat reads weakly on a phone.
- Establishes "we" voice naturally. From the surface looking out, "our sky" / "our solar system" / "our supercluster" all flow naturally. The Sun-photosphere open made "our" feel forced.

### Negative

- **~2-3 weeks of new infrastructure.** Atmosphere shader (~1 week of WGSL), Earth-as-disc renderer with Blue Marble texture (~3-5 days), camera path through atmosphere boundary (~3 days). Spec'd in [`shells/00a-earth-opening.md`](../shells/00a-earth-opening.md) and [`rendering/08-atmosphere.md`](../rendering/08-atmosphere.md).
- **Tightens 90 s budget.** Need to trim ~10 s elsewhere. Shells 5 and 8 become 6 s instead of 8 s. Acceptable; those shells are conceptual ("everything cluster onto a sheet" and "everything is a web") rather than visual hero moments.
- **Tonal shift management.** The open is photoreal; the rest of the tour is data-driven observatory readout. Risk of "the open is amazing, then it gets clinical." Mitigation: the atmospheric shader's color palette (orange → red → indigo → black) seeds the rest of the tour's accent palette, so the visual continuity holds.
- **One more thing that can crash on mobile.** Atmosphere shader is a single full-screen pass; should be cheap. But it's another GPU pipeline to validate on Android Chrome / iOS Safari. See [`ux/05-mobile.md`](../ux/05-mobile.md) for the fallback (a static sunset photo with crossfade — uglier but bulletproof).
- **Time complexity.** A sunset is a temporal scene (sun moves, stars fade in). The rest of the tour is a snapshot through space. We're mixing space and time. We accept the inconsistency: the user's experience of stars emerging at dusk *is* a temporal experience, and pretending otherwise loses the hook. The time component is contained to the first 8 seconds and the last 7 seconds.

### Open questions surfaced by this decision

1. **What latitude / time / orientation is the surface camera?** Author-chosen for visual impact, not user-locale-aware. Recommended: equatorial, looking south, just past sunset, with the Milky Way band rising into the visible sky over the 8-second open. This puts the most visually impressive sky overhead by T+0:08.
2. **Sunrise vs sunset for the close?** Sunrise. The tour ends in optimism; sunrise reads as "the next day," sunset reads as "ending."
3. **Does the user see Earth's continents during the lift-off?** Briefly — for ~3 seconds at T+0:15-0:18. Recommended: yes, low alpha overlay, no hard label. The point is "this is Earth," not "this is Africa."
4. **Do we render the Moon?** It's the most visible celestial object in the night sky. Recommended: yes if the chosen orientation has it visible; render as a small textured disc. Treat as a free bonus, not a required element.

## References

- [`vision/01-narrative-script.md`](../vision/01-narrative-script.md) — primary doc to amend (cold open + close)
- [`shells/00a-earth-opening.md`](../shells/00a-earth-opening.md) — full shell spec for the new opening beat
- [`data/11-earth-textures.md`](../data/11-earth-textures.md) — Blue Marble + atmosphere data acquisition
- [`rendering/08-atmosphere.md`](../rendering/08-atmosphere.md) — sky shader spec
- [`decisions/0006-information-pacing.md`](0006-information-pacing.md) — needs revised timing table
- [`ux/05-mobile.md`](../ux/05-mobile.md) — atmosphere shader mobile fallback
- Carl Sagan, "Cosmos: A Personal Voyage" (1980), opening sequence — the canonical "look up at the sky" preamble we are deliberately echoing
- Jim Bell, "The Earth Book" (NASA imagery) — Blue Marble photography reference
