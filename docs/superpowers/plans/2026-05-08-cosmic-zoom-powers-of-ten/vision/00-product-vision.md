# Product Vision

## The headline experience

A first-time visitor opens skymap.rulkens.com on a desktop browser. They have no idea what they're looking at. Today, they see a dark canvas with a smear of points and a control panel. **A reasonable response is to close the tab.**

In the new world, after the WebGPU device is ready and the first tier of points has loaded, a small unobtrusive button appears in the lower-right corner: **"Take the tour ▶ (90 s)"**. They click it.

The camera dollies in until they see the Sun's surface — a yellow disc with visible granulation, occupying half the screen. Overlay text fades in: **"This is the Sun. You are about 8 light-minutes away."** The camera pulls back; the Sun shrinks; planets appear as orbiting dots on faint elliptical traces; Pluto's orbit takes the outer edge of the frame. New overlay: **"This is our Solar System. The nearest other star is 4 light-years away — 1,800 times further than Pluto."**

The Solar System collapses to a single luminous dot. The view fills with stars — Gaia data, real positions, real colors. They recognize Sirius blazing white-blue; Betelgeuse glowing red. Camera pulls back, Milky Way dust lanes flicker into a recognizable disk. **"This is the Milky Way. About 100 billion stars."** The Milky Way shrinks; M31 swims into frame; the Magellanic Clouds appear; a constellation of dwarf galaxies surrounds the local pair. **"This is the Local Group. We're the small one on the right."**

And on. Through the Local Sheet, where the user sees that nearby galaxies aren't randomly placed but lie roughly on a plane. Through the Virgo Supercluster, where Virgo's cluster halo glows with hot X-ray gas. Into Laniakea, where the camera follows the implied flow lines of the Cosmicflows-4 velocity field as the local supercluster falls toward the Great Attractor. Out further, where the entire scene becomes the cosmic web — filaments and voids on scales of hundreds of millions of light-years. Finally, a sphere of microwave background, mottled with the temperature anisotropies that seeded everything we just saw. **"This is the edge of the observable universe — 13.8 billion light-years in every direction. Everything we just flew through is inside this sphere."**

Total elapsed time: 90 seconds. The camera comes to rest at the wide-angle default view. The button at lower-right has changed to **"Replay tour"**. The user, who came expecting to bounce, has now spent 90 seconds genuinely *seeing* the universe at every scale, and is primed to start free-flying — which is what the rest of skymap was always for.

That is the product.

## Who is this for

Three audiences, in priority order:

### 1. The curious first-time visitor

They arrived from a HackerNews link, a r/Astronomy thread, or a friend's Twitter post. They have ~30 seconds of tolerance before deciding whether to invest more. The tour is the shortest path from "I don't know what this is" to "I want to keep exploring." It must work on first contact, with no instructions, on whatever their browser is.

This visitor:
- Cannot be assumed to know what RA/Dec is, what a redshift is, or what "Mpc" means.
- Probably has middling-to-good visual literacy — they've seen Hubble photos, they know what a galaxy looks like.
- Wants to be impressed and informed, not lectured.
- Will leave if anything is confusing, broken, or boring.

### 2. The science-literate enthusiast

Astronomy podcasters, amateur astronomers, science-Twitter regulars, ex-physics-grad-school types. They know more than the first audience but will still appreciate the synthesis. For them, the tour is a "you've never seen these things together at scale" experience. They notice details: "oh, the X-ray gas in Coma is real ROSAT data, not a halo overlay." They are the people who will share screenshots.

This audience:
- Knows the Local Group, knows what M31 is, recognizes the Milky Way disk.
- Will spot scientific inaccuracies if we make them. Don't.
- Will want a "more info" affordance to dig deeper at each shell. Provide one.
- Will compare us to the Eames film, to "Scale of the Universe 2," to Stellarium, to NASA Eyes. We need a reason to be in that conversation.

### 3. The educator / outreach use-case

A middle school science teacher pulling up skymap on the classroom projector. A planetarium operator demoing during a 5-minute pre-show. A museum kiosk. They want a turnkey "show the cosmos" demonstration that runs without their attention.

For this audience:
- The tour must autostart without UI interaction (URL flag: `?tour=auto`).
- It must loop forever without state corruption.
- It must work on a touchscreen kiosk (no mouse hover).
- Copy must be classroom-safe (no jokes that don't translate, no slang).

## What success looks like

**Engagement metric (primary):**  Average session duration on the landing page rises from today's ~45 seconds to >2 minutes for new visitors who click "Take the tour." Tour completion rate (how many users who start it watch all 90 s) is the binary metric to optimize.

**Quality metric (primary):**  Zero crash bugs on the top 5 desktop browser/GPU combinations during the tour. Zero scientifically-wrong claims in overlay copy (peer-reviewed by a science-literate human before launch).

**Outreach metric (secondary):**  The 30-second clip of the Powers-of-Ten tour generates ≥10× the engagement on r/Astronomy / r/space / r/WebGPU compared to today's static views (the tour-animation spec already noted video has +14-17pp lift over still-image posts).

**Negative metrics — things we do NOT optimize for:**
- Total dataset count. Adding more datasets is not the goal; using the right datasets at the right scales is.
- Frame rate above 60. We will not chase 120 or 144 fps; 60 with consistent frame pacing is the bar.
- Photorealistic rendering. The Sun does not need to be a Hubble-grade simulation; it needs to read as "the Sun" in 5 seconds.
- Comprehensive cluster coverage. We pick the *named* clusters that are visually most striking; we do not need to plot all 4000 Abell clusters.

## Design principles

These are the principles that resolve close calls during implementation. When two valid approaches exist, the one that better satisfies these principles wins.

### Principle 1 — *Real data first.*

Every shell should show real measurements from real surveys. When we must fall back to a model (Solar System orbits, Milky Way disk image), label it as a model. The cosmic zoom's competitive advantage over every existing "scale of the universe" demo is that we are not showing 3D art — we are showing the universe.

When forced to choose between "scientifically accurate but visually boring" and "embellished but striking," lean on the side of accurate, but find a third option through better rendering technique. (Example: real Gaia stars are *visually striking* if you render them with their real B-V colors and proper-motion-derived motion blur. We don't need to invent.)

### Principle 2 — *Zero text below the fold.*

Each shell's overlay text is at most three sentences, each at most 20 words, all readable in <8 seconds. The user is watching a movie, not reading a textbook. If a shell needs more context, the "more info" affordance opens a side panel — opt-in, never blocking.

### Principle 3 — *Continuity through the cuts.*

There are no hard cuts between shells. Every transition is a continuous camera motion at log-scale constant speed. The user must always be able to look at one feature in shell N, watch it shrink as the camera pulls back, and recognize it as a single point in shell N+1. This is what makes the *scale* legible; this is the entire point of the Eames film.

### Principle 4 — *Pause-friendly.*

At any moment during the tour, the user can press space to pause. The camera holds. The overlay text stays visible (or fades down if it had already faded). They can pan and orbit freely. Pressing space again resumes from the current position, picking up the camera path from there with a brief re-easing.

This is critical because some shells (especially Local Group, Virgo, and the Cosmic Web) reward exploration. The tour should invite exploration, not gate it.

### Principle 5 — *Honest about what we don't know.*

When the data is uncertain — distances to clusters with high peculiar velocities, the position of "the edge" of Laniakea, the actual shape of the Local Sheet — say so in the copy. "We don't know exactly where Laniakea ends" is more interesting than "Laniakea is 500 million light-years across" stated as fact. Embrace the uncertainty as part of the story.

## Non-goals

The following are explicitly out of scope for v1. They are listed here so future contributors know they were considered and deliberately excluded — not overlooked.

- **Branching tours.** "Click here to explore dark matter; click here to explore galaxy types." Adds enormous design complexity. Single linear tour for v1.
- **User-recorded tours.** "Save your fly-around as a tour to share." Cool, but a different product.
- **Alternative tour scripts** (e.g., a "spiral galaxies tour" that visits famous spirals at different distances). Worth doing, but not v1.
- **Interactive 3D Solar System.** Today's tour shows the Solar System as a fly-through beat, not as a draggable model. NASA Eyes does this well; we don't need to compete.
- **Time-domain.** No proper-motion animation, no orbital animation. The universe is presented as a snapshot. (We may add subtle motion in shells where it dramatically improves readability — e.g., gentle orbital arcs in the Solar System — but no full time-evolution.)
- **Multi-language copy.** English only for v1. Translation infrastructure is significant work and would gate launch.
- **VR.** Not in v1. Powers-of-Ten in VR is a separate, ambitious product.
- **Audio narration.** Mentioned in `SUMMARY.md`. Big lift; defer.
- **In-shell interactivity beyond pause + free-fly.** No mini-games, no clickable hotspots, no quizzes. Just the cinematic.

## Visual identity

The cosmic zoom should *feel* like an observatory readout from a near-future spacecraft, not like a 90s screensaver. Concretely:

- **Color:** Restrained palette. Whites, deep blacks, occasional muted blue/orange/red as data warrants (real galaxy colors, X-ray hotspots in red, CMB anisotropy in classic blue→yellow→red). No purple-pink-cyan gradients.
- **Typography:** Monospace for data readouts (we already have JetBrains Mono in the planned MSDF atlas). Sans-serif for prose overlay (system font stack — no web-font wait).
- **Motion:** Slow. The default camera speed is "you're piloting a research vessel," not "you're playing No Man's Sky." Easing is gentle ease-in-out cubic; no overshoot, no snap.
- **Sound:** None.
- **UI chrome:** Minimal. The tour should feel like the universe is the interface; chrome is the part that disappears when you press F.

See [`vision/02-aesthetic-references.md`](02-aesthetic-references.md) for visual references.

## How we'll know it's done

The cosmic zoom is shippable when:

1. **A first-time visitor on a fresh browser, on a typical 2024 laptop, can complete the full tour with zero errors and zero confusion.** Validated by usability testing (5 people, recorded sessions, none from the target audience).
2. **The 30-second tour clip looks impressive enough to post.** Self-validated by the team; if the team isn't proud to share it, it isn't done.
3. **All copy has been reviewed by someone with a relevant astronomy background** for accuracy. Acceptable level of compression: a college astronomy major would say "yes that's true." Stretch goal: a research astronomer would not wince.
4. **Mobile fallback works on a $300 Android device.** The tour may degrade visually on mobile, but it must complete without freezing or skipping shells.
5. **Lighthouse accessibility audit passes** for the tour overlay UI (contrast, semantic markup, keyboard-navigable controls).

When all five are true, ship.
