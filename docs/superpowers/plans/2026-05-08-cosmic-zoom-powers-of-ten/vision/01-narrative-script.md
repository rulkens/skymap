# Narrative Script — The Powers-of-Ten Tour

This document is the **shooting script** for the tour. It is the source of truth for: shell ordering, transition timing, camera path, overlay text, and the sequence of visual reveals.

It is intentionally written like a film treatment, not a spec. The downstream specs (shells, rendering, ux) elaborate the *how*; this document is the *what happens, in what order, with what words on screen*.

> **AMENDMENT 2026-05-09 — Earth opening and closing.** The cold open and close beats below have been superseded by an Earth-surface opening (sunset → night sky → lift-off) and a mirror Earth-surface closing (sunrise). See [`decisions/0010-earth-opening.md`](../decisions/0010-earth-opening.md), [`shells/00a-earth-opening.md`](../shells/00a-earth-opening.md), and the **REVISED OPEN** / **REVISED CLOSE** sections inserted below. The original Sun-photosphere cold open is preserved in the "ACT I — The Familiar" section because the Solar System and onward shells are unchanged.

## REVISED OPEN — Earth at sunset (T+0:00 → T+0:22)

`T+0:00` Camera at ground level on Earth. Featureless black ground silhouette across bottom 25% of frame. Orange sunset sky gradient. Sun visible as a soft disc just above the western horizon. Lower-third overlay: **TOUR BEGINS · 90 SECONDS** (fades in over 1 s).

`T+0:01` Venus emerges low in the west — the first star visible.

`T+0:03` Sky transitions: orange → red → indigo. Sirius rises in the east. Vega visible high in the sky.

`T+0:05` Sky is now mostly dark blue. Maybe 50 brightest stars visible.

`T+0:07` Milky Way band fades up across the overhead sky as a soft luminous river. ~500 stars now visible. Optional sub-overlay (centered, single line): *"Look up."* — fades in 0.5 s, holds 2 s, fades out 0.5 s.

`T+0:08` Camera tilts up. Frame is ~80% sky, 20% ground. Full Gaia DR3 starfield (~7,500 stars within 50 pc).

`T+0:11` Camera lifts off. Black ground silhouette curves into a horizon arc. Atmospheric blue rim becomes visible at the horizon.

`T+0:14` Earth begins to be a disc rather than a surface. Continents resolve briefly (Blue Marble texture); day/night terminator visible.

`T+0:18` Earth is now a small disc. Sun visible to the side. Other planets fade up on their orbits.

`T+0:22` Earth becomes one of the planets. Camera is now at Solar System scale; **Shell 1 takes over** at the dolly-out timing point that previously corresponded to T+0:08 in the original script. Shell 1's beat now runs T+0:22 → T+0:28 (slightly compressed from the original 6 s to fit the budget).

## REVISED CLOSE — Earth at sunrise (T+1:38 → T+1:48)

`T+1:38` Camera approaches Earth (reverse of T+0:18). Earth grows from a small disc.

`T+1:40` Camera enters the atmosphere. Atmospheric blue rim grows. Continents resolve.

`T+1:42` Camera lands at ground level. Looking east this time (mirroring the west-facing open). Pre-dawn sky: deep indigo with a hint of color at the horizon. Stars still visible, but only the brightest.

`T+1:44` Sun rises. Sky transitions: indigo → red → orange. Stars fade west.

`T+1:46` Full sunrise. Lower-third overlay: **TOUR COMPLETE · Click "Replay" to watch again, or fly anywhere — drag to orbit, scroll to zoom.**

`T+1:48` "Replay" button visible. Cursor reappears. Cinematic ends.

## Revised total runtime

To accommodate the +15 seconds of Earth open + close, the following internal trims are made:

| Shell | Original | Revised |
|-------|----------|---------|
| Shell 1 — Solar System | 6 s | 5 s |
| Shell 5 — Local Sheet | 8 s | 6 s |
| Shell 6 — Virgo SC | 10 s | 9 s |
| Shell 8 — Cosmic Web | 8 s | 6 s |

Net delta: -7 s from the existing shells, +15 s from the Earth open/close = **+8 s overall**, putting the tour at **~1:48**. Inside the 2:00 ceiling. The trimmed shells lose conceptual padding, not visual hero moments.

The original timing table at the bottom of this doc is the **legacy** plan; the revised pacing replaces it for v1 implementation.

---

The remainder of this document — Acts I-III, the original cold open description, the original closing — is preserved below as the **legacy script**. Everything from "ACT I — The Familiar" onward through Shell 9 is unchanged in content; the only changes are the open and the close.

## Conventions

- **CAMERA** — the on-screen view's POV.
- **SCENE** — what fills the frame.
- **OVERLAY** — text that appears as a soft-fade pixel-clamped label, top-left of the canvas (or center, see `ux/01-information-overlays.md`).
- **WAYPOINT** — a named camera state (position, look-at, FoV) the engine snaps/eases to.
- **SHELL N — TITLE** — the named shell. The shell number maps to the file in `shells/0N-*.md`.
- Timing is in seconds from tour start (`T+`), not absolute. Total tour budget is 90 seconds.

---

## ACT I — The Familiar

We open close, in places the user already has intuition for. The first 20 seconds are pure recognition: "I know that thing." The user is comfortable. They are leaning in.

### `T+0:00` — TOUR BEGINS

**SCENE:** The default skymap view (Sun at origin, wide angle, all loaded galaxies visible as points).

**OVERLAY:** *fades in over 1 s, lower-third*
> **TOUR BEGINS · 90 SECONDS**
> *Press `space` to pause · `esc` to exit*

The UI panel auto-collapses (slides off-screen right). The corner widgets fade to 50% opacity. The cursor disappears after 2 s of inactivity.

### `T+0:01` — Camera dolly-in to Sun

**CAMERA** rapidly approaches the origin (Sun position). The current galaxy point cloud fades down as the camera moves inside the volume defined by Solar System orbits. By T+0:04 the camera is ~10 AU from the Sun, looking inward.

**SCENE:** The Sun appears as a small disc (sub-pixel until ~T+0:03, then a few pixels, then dominating the frame). At ~T+0:05 the camera's near plane reaches the Sun's photosphere; we see a textured yellow-orange disc with subtle granulation, tasteful corona ring.

**OVERLAY:** *fades in T+0:05*
> **THE SUN**
> 1.4 million km across · 8 light-minutes from Earth · about 4.6 billion years old.

---

### SHELL 1 — SOLAR SYSTEM

`T+0:08` — `T+0:14` (6 s)

**CAMERA** pulls back along the ecliptic plane. The Sun shrinks. Mercury, Venus, Earth, Mars appear as bright dots on faint elliptical orbits. By T+0:12 we see the inner planets clearly; by T+0:14 the outer planets appear, with Pluto's orbit framing the edge of the view.

**SCENE:** The Solar System diagram, viewed from above the ecliptic at a slight tilt (~30°). Orbits are drawn as thin elliptical lines (low alpha, scientifically correct eccentricities and inclinations from data — see `data/01-solar-system-ephemeris.md`). Planets are billboards with subtle textures — Earth visibly blue, Mars red, Jupiter banded — at slightly exaggerated apparent size so they're visible at this scale (true-scale planets would be invisible). Sun is a glowing yellow point.

**OVERLAY:** *fades T+0:09 → T+0:13*
> **OUR SOLAR SYSTEM**
> Eight planets around one star. The nearest other star is 4 light-years away — 1,800 times further than Pluto.

**TRANSITION OUT:** `T+0:14` — the camera pulls back further. The orbit ellipses fade (alpha → 0 over 1 s). The Sun + planets collapse into a single bright point. The starfield (Shell 2) fades up underneath.

---

### SHELL 2 — STELLAR NEIGHBORHOOD

`T+0:15` — `T+0:24` (9 s)

**CAMERA** continues to pull back, now in light-year units. The Sun is a bright dot at frame center. Around it: stars from Gaia DR3 — real positions, real colors, real apparent magnitudes scaled for legibility. Camera tilts slightly to give a 3D sense; gentle slow rotation around the Sun-axis to show parallax.

**SCENE:** Several thousand stars within ~50 ly. We can see the named bright ones — Sirius (white-blue, prominent), Procyon, Altair, Vega — labelled if they cross within ~5° of the screen center. Most stars are dim points of varied color (Gaia BP-RP color → display color). At ~T+0:20 the camera reaches a vantage where the Milky Way's first hint of structure appears as a faint diffuse glow at the back of the scene — we are starting to see the disk we're embedded in.

**OVERLAY:** *fades T+0:16 → T+0:22*
> **OUR STELLAR NEIGHBORHOOD**
> About 7,500 stars within 50 light-years. The closest, Proxima Centauri, would take 73,000 years to reach with Voyager.

*(Optional second beat at T+0:21 if narrative timing allows: "Each color tells you the star's temperature. Blue stars are hotter than the Sun; red stars are cooler.")*

**TRANSITION OUT:** `T+0:24` — camera accelerates outward. The named star labels fade. The diffuse Milky Way glow brightens to dominant. By T+0:25 we are clearly outside the Solar neighborhood and looking at galactic structure.

---

### SHELL 3 — MILKY WAY

`T+0:25` — `T+0:36` (11 s)

**CAMERA** pulls back to ~30 kly out and slightly above the galactic plane. The Milky Way disk fills the view. At T+0:28 the camera tilts up to give a near-edge-on view, then arcs over to a top-down view, showing the spiral arm structure.

**SCENE:** The Milky Way disk rendered with the impostor shader from the planned `2026-05-04-milky-way-impostor.md` spec (or fallback: composite of 2MASS K-band + IRAS + Sgr A* marker). Spiral arms visible. Sun position marked with a small pulse. By T+0:33 the disk has shrunk; we see the galactic halo, faint globular cluster positions sprinkled around it; the Magellanic Clouds appear at the edge as small fuzzy patches.

**OVERLAY:** *fades T+0:26 → T+0:34*
> **THE MILKY WAY**
> A barred spiral galaxy. About 100 billion stars. Our Sun orbits the center every 230 million years.

*(If the impostor's quality permits, consider a sub-beat at T+0:31: "We are about halfway out, in the Orion Arm.")*

**TRANSITION OUT:** `T+0:36` — the Milky Way shrinks to a small bright disk. Camera continues outward; the Magellanic Clouds become more distinct; M31 swims into frame at upper-left.

---

### SHELL 4 — LOCAL GROUP

`T+0:37` — `T+0:46` (9 s)

**CAMERA** at ~3 Mly from origin, framed so the Milky Way is right-of-center and M31 is left-of-center, both visible as recognisable disks at low angular size. Slow orbital motion to give parallax between MW and M31.

**SCENE:** The Local Group in real positions. MW at origin (small disk impostor). M31 at its real position (~770 kpc away, rendered as a tilted disk impostor). M33 below M31. The Magellanic Clouds near MW. The dwarf galaxies of the Local Group (Sagittarius dSph, Sculptor, Fornax, Leo I/II, Draco, Ursa Minor, etc.) appear as small fuzzy dots in their real positions. At ~T+0:42, faint arrows or lines indicate the gravitational binding — MW and M31 are approaching at ~110 km/s.

**OVERLAY:** *fades T+0:38 → T+0:44*
> **THE LOCAL GROUP**
> Two big spirals — us and Andromeda — and about 80 small companions. We'll collide with Andromeda in 4.5 billion years.

**TRANSITION OUT:** `T+0:46` — camera pulls back further; the Local Group fades into a small clump; many more galaxy dots appear in surrounding space.

---

## ACT II — The Unfamiliar (the wow)

We are now past the user's intuitive scale. Each shell shows them something they may have *heard of* but probably haven't *seen.* This is where the tour earns its watch time.

---

### SHELL 5 — LOCAL SHEET

`T+0:47` — `T+0:55` (8 s)

**CAMERA** at ~30 Mly, oriented so we are looking down on the supergalactic plane (X, Y axes; SGZ vertical). Orbital motion is slow and parallel to the plane to emphasize its flatness.

**SCENE:** A flattened distribution of bright galaxies. The Local Group sits near the center as a small cluster. Outward: the M81 group, the Centaurus A group, the Sculptor group, the M101 group, all rendered as small clusters of galaxy points (or, for the brightest in each, as faint disk impostors). The flatness is the visual point — the user should clearly see "this is a sheet, not a sphere." A subtle translucent plane (the supergalactic plane itself) can be drawn at very low alpha if it helps legibility.

**OVERLAY:** *fades T+0:48 → T+0:54*
> **THE LOCAL SHEET**
> Within 30 million light-years, galaxies cluster into a thin pancake. Why? We're not entirely sure.

*(The "we're not entirely sure" beat is intentional — Principle 5 from the product vision. Acknowledged ignorance is a feature.)*

**TRANSITION OUT:** `T+0:55` — camera pulls back; the Local Sheet shrinks; we see the next tier of structure: the rich Virgo cluster appears as a bright concentration near center.

---

### SHELL 6 — VIRGO SUPERCLUSTER

`T+0:56` — `T+1:06` (10 s)

**CAMERA** at ~100 Mly, oriented so Virgo cluster is center-frame. Slow approach, then pull-back to show the surrounding supercluster.

**SCENE:** The galaxy point cloud thickens visibly toward Virgo. Virgo cluster's ~720 galaxies (the count we computed in the user's prior question) form a clear concentration, with M87 marked as a bright pulse at the cluster center. **A soft red-tinted volumetric glow surrounds the cluster** — this is real ROSAT X-ray data, sized to Virgo's known X-ray emission extent. By ~T+1:02 the camera has pulled back to show the surrounding Local Supercluster: the Fornax cluster below, the Centaurus group, several smaller concentrations, all connected by faint filamentary structure.

**OVERLAY:** *fades T+0:58 → T+1:04*
> **THE VIRGO SUPERCLUSTER**
> The Virgo cluster — that red glow is hot intracluster gas, 30 million degrees, holding the cluster together. We're falling toward it at 250 km/s.

**TRANSITION OUT:** `T+1:06` — camera pulls further out; the X-ray glow shrinks to a small red dot; many more clusters appear, with arrows showing bulk velocity flow.

---

### SHELL 7 — LANIAKEA

`T+1:07` — `T+1:18` (11 s)

**CAMERA** at ~250 Mly, oriented so the Great Attractor direction is roughly to the right of frame, and the Local Supercluster (with Virgo highlighted) is left-of-center. Slow orbital motion with a slight push toward the Great Attractor.

**SCENE:** This is the biggest reveal in the tour. **The dark-matter density field from Cosmicflows-4** is rendered as a translucent volume — purple/blue in low-density voids, brighter through filaments, peaking white-hot at cluster nodes. Galaxy points are still visible but become dots embedded in this volume. **Velocity flow lines** trace the bulk-motion field: short colored arrows at every grid cell showing where the local matter is being drawn. The user sees clearly that all the flow lines in our local volume converge toward a single point — the Shapley Supercluster, the gravitational basin of attraction we now call **Laniakea** ("immeasurable heaven").

**OVERLAY:** *fades T+1:08 → T+1:16*
> **LANIAKEA — OUR HOME SUPERCLUSTER**
> 100,000 galaxies all falling toward the same point. Defined in 2014 by mapping where matter flows.

**TRANSITION OUT:** `T+1:18` — the volumetric field fades; the camera pulls back rapidly; we transition to the cosmic-web shell.

---

### SHELL 8 — COSMIC WEB

`T+1:19` — `T+1:27` (8 s)

**CAMERA** at ~2 Gly, oriented to show the broadest possible view of large-scale structure. Gentle rotation to show the 3D structure (filaments going *into* and *out of* the screen, not just lying on the plane).

**SCENE:** The full point-cloud (all loaded galaxies) plus the filament rendering from the existing DisPerSE pipeline. The user sees the famous "cosmic web" — rich filaments connecting cluster nodes, vast empty voids between. The Sloan Great Wall (if visible from the camera angle) is highlighted. Coma cluster gets a small pulse. The CMB sphere from Shell 9 begins to fade in faintly at the back of the scene.

**OVERLAY:** *fades T+1:20 → T+1:26*
> **THE COSMIC WEB**
> Galaxies aren't randomly placed. They lie on filaments billions of light-years long, surrounding empty voids.

**TRANSITION OUT:** `T+1:27` — camera continues outward; the galaxy points become a haze; the CMB sphere comes forward.

---

### SHELL 9 — OBSERVABLE UNIVERSE

`T+1:28` — `T+1:35` (7 s)

**CAMERA** at the origin (or just outside the cosmic-web volume), oriented to show the inside of a sphere — the camera is *inside* the CMB shell, looking outward at all directions.

**SCENE:** The CMB sphere from Planck data, full sky, with classic blue/red anisotropy color mapping. The galaxy point cloud + filaments are still faintly visible *inside* the sphere as a thin shell of structure near the center. The CMB occupies the entire sky. Maybe a subtle galactic-plane mask shows where the Milky Way's dust obscured Planck's view.

**OVERLAY:** *fades T+1:29 → T+1:34*
> **THE OBSERVABLE UNIVERSE**
> The Cosmic Microwave Background — light from 13.8 billion years ago. Beyond it, we cannot see. The universe is bigger; we just can't reach it.

**TRANSITION OUT:** `T+1:35` — the CMB fades down to ~30%. The camera rapidly returns to the default wide-angle view of the cosmic web.

---

## ACT III — The Return

`T+1:36` — `T+1:30` (4 s)

**CAMERA** lands at the default wide-angle view (the same view the tour started from). Galaxy points are at full opacity again. The UI panel slides back in. The corner widgets return to full opacity.

**OVERLAY:** *fades T+1:36 → T+1:38, holds, fades T+1:42 → T+1:43*
> **TOUR COMPLETE**
> *Click "Replay" to watch again, or fly anywhere — drag to orbit, scroll to zoom.*

The "Take the tour" button has changed to "**Replay tour ▶**".

The cursor reappears.

---

## Total runtime

| | Start | End | Duration |
|---|---|---|---|
| Open + dolly to Sun | 0:00 | 0:08 | 8 s |
| Shell 1 — Solar System | 0:08 | 0:14 | 6 s |
| Shell 2 — Stellar Neighborhood | 0:15 | 0:24 | 9 s |
| Shell 3 — Milky Way | 0:25 | 0:36 | 11 s |
| Shell 4 — Local Group | 0:37 | 0:46 | 9 s |
| Shell 5 — Local Sheet | 0:47 | 0:55 | 8 s |
| Shell 6 — Virgo Supercluster | 0:56 | 1:06 | 10 s |
| Shell 7 — Laniakea | 1:07 | 1:18 | 11 s |
| Shell 8 — Cosmic Web | 1:19 | 1:27 | 8 s |
| Shell 9 — Observable Universe | 1:28 | 1:35 | 7 s |
| Return to default view | 1:36 | 1:43 | 7 s |
| **Total** | | | **1:43** |

103 seconds — slightly over the "90 second" headline. Trim 10-13 seconds in editing if testing shows attention drops past 90 s; otherwise the buffer is for breathing room.

## Pacing notes

- **Shells 3, 6, 7** are the longest (11 s each). They are the moments with the most visual novelty (Milky Way disk reveal, X-ray cluster glow, Laniakea dark-matter flow). Don't trim these.
- **Shells 5 and 9** are the shortest (8 s and 7 s). The Local Sheet is conceptually subtle and short copy works; the CMB is iconic and benefits from a short, punchy beat.
- **The first 20 seconds** are the user's commitment window. If they're going to bail, they bail in the first 20 s. The Solar System + Stellar Neighborhood beats are deliberately recognizable to maximize the chance the user sticks.
- **The last 30 seconds** are the user's reward. By the time they get to Laniakea + Cosmic Web + CMB, they have invested an emotional minute. Don't rush these.

## Open questions for review

1. **Should we have a "skip to next shell" affordance?** Currently no. Pause/play only. Adding skip lets impatient users speed through; arguably cheapens the cinematic. **RECOMMENDATION:** no skip in v1.
2. **Should the tour autoplay on first visit?** Currently no — explicit click. **RECOMMENDATION:** no autoplay; a `?tour=auto` URL flag for kiosk use, but the default experience requires consent.
3. **Camera orientation during transitions.** Currently underspecified (each shell has its own camera waypoint, the engine eases between). See [`decisions/0004-camera-rotation-during-tour.md`](../decisions/0004-camera-rotation-during-tour.md).
4. **The Sun beat at T+0:05** — do we render the Sun's surface, or skip directly to "you're outside the heliosphere looking back"? Surface rendering is harder but more striking. **RECOMMENDATION:** surface rendering, falls back to a flat textured disc if the ray-traced version is too expensive.
5. **Should overlay copy be voice-narrated?** No (per product vision non-goals). But we should consider whether the copy is short enough that a future narration pass would only require ≤90s of voiceover total. Current copy is ~25 sentences, ~200 words — probably 60s of speech, fits comfortably.

See `decisions/` for the resolved trade-offs on each.
