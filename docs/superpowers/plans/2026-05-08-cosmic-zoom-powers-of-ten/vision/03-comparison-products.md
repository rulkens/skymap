# Comparison Products

This document is a field survey of every "scale of the universe" demo, simulator, and educational artifact we are aware of. For each, we cover what it does, what it does well, what it doesn't, and what skymap takes from it or differs on.

The point of writing this down is twofold. First, so we can answer "why are we building this when X exists?" with specifics rather than vibes. Second, so we don't reinvent decisions that other products have already worked through — when WorldWide Telescope went one way and Stellarium went another, the trade-off is informative.

The survey ends with a positioning summary: where skymap fits in the existing landscape, and the specific combination of properties that makes it distinctive.

## 1. The Eames "Powers of Ten" (1977 film + 1982 book)

Charles and Ray Eames' nine-minute film, narrated by Philip Morrison, zooms out from a picnic in Chicago to the cosmic horizon, then back in to the proton inside a carbon atom in the picnicker's hand. The companion book, *Powers of Ten: A Flipbook* and the longer *Powers of Ten: About the Relative Size of Things in the Universe*, presents the same journey as static spreads.

**What it does well:** establishes log-scale visualization as a genre. Pioneered the constant-on-screen-velocity technique that creates the sensation of accelerating exponentially. Demonstrates that a journey through scale, told well, is more compelling than any single image at any single scale. Has remained the canonical reference for forty-nine years.

**What it doesn't do:** uses painted illustrations rather than measured data, at a time when neither was available; offers no interactivity; runs on a single linear timeline; has voice narration that doesn't survive translation or social-clip extraction.

**What skymap takes:** the structure (linear log-scale tour), the pacing principle (constant perceived velocity), the use of overlay scale annotations.

**Where skymap differs:** real survey data at every shell instead of illustrations; interactive (pause and free-fly at any scale); silent overlay text instead of voice narration; browser-native rather than film. The cosmic zoom is in dialogue with the Eames film — we are not replacing it (the Eames film is canonical), we are doing a contemporary remix that uses thirty years of survey data the Eameses didn't have.

## 2. Scale of the Universe 2 (Cary & Michael Huang, 2012)

A Flash-then-HTML5 web demo by then-teenage twins Cary and Michael Huang. The user drags a slider across forty-five orders of magnitude, from Planck length to observable universe, and at each scale a labelled illustration of an object at that size appears (a coffee bean, a whale, the Sun, the Milky Way). It went viral on its release and remains the most-shared "scale of the universe" web artifact.

**What it does well:** compactness — the entire experience fits on one page. Comparison density — at each scale you see *multiple* objects of that size, which gives the scale meaning ("ah, the Sun is bigger than X but smaller than Y"). Light, fast, accessible.

**What it doesn't do:** uses cartoon illustrations rather than data; presents no spatial relationships (objects float on a flat 2D scale axis with no 3D positioning); no narrative, no path through the scales; no real astronomy content beyond labels.

**What skymap takes:** the comparison-density principle. At each shell we should anchor the user's intuition with at least one familiar comparison ("the Solar System is 1,800 Plutos wide"). The Huangs do this implicitly with side-by-side illustrations; we do it explicitly with copy.

**Where skymap differs:** 3D rather than 1D, real positions rather than illustrations, narrative rather than free-scrolling slider. We are the same genre, two evolutionary steps later.

## 3. NASA Eyes on the Solar System / Eyes on Exoplanets

NASA JPL's interactive 3D visualizations. *Eyes on the Solar System* is a downloadable (Eyes is now web-only) 3D model of the Solar System with real spacecraft positions, orbital prediction, and time controls. *Eyes on Exoplanets* extends the same engine to known exoplanetary systems with model orbits.

**What they do well:** trustworthy data (NASA's name on it), spacecraft-realism aesthetic, time controls that let you fast-forward through orbital evolution. The Voyager-position display is genuinely moving.

**What they don't do:** scope is bounded at the Solar System / nearby exoplanets. There is no equivalent NASA Eyes for the Milky Way, the Local Group, or large-scale structure. The UI is dense (control panels, time sliders, mission lists) and presupposes an interested user willing to explore.

**What skymap takes:** the credibility lesson. NASA Eyes is trusted because the data is rigorously sourced. Skymap inherits credibility by being explicit about its provenance (SDSS, 2MRS, GLADE, Cosmicflows-4 — all named in the UI).

**Where skymap differs:** scope (cosmic, not Solar System) and posture (cinematic tour first, exploration second; NASA Eyes is exploration first, no tour). NASA Eyes does not compete in the cosmic-zoom space; we are not competing for the Solar System exploration use-case.

## 4. WorldWide Telescope

Originally a Microsoft Research project (2008), now an open-source product hosted by the American Astronomical Society. The most ambitious cosmic-scale web product to date. It can fly from Earth's surface to the CMB, overlay real survey data (DSS, SDSS, Spitzer, IRAS), and supports user-authored "guided tours" with voiceover and annotations.

**What it does well:** data breadth (more catalogs than anyone), tour authoring (a real authoring tool exists), the fundamental capability to fly across cosmic scale. Genuinely powerful.

**What it doesn't do:** the chrome is dated (Windows Vista–era panels), the camera motion is jerky, typography is the system default with no real type design, and the learning curve is steep. The product feels research-y rather than consumer-ready. Most users who land on it bounce.

**What skymap takes:** the tour-as-first-class-experience idea. WorldWide Telescope's authored tours are exactly the genre our cosmic zoom occupies. They proved the genre is viable.

**Where skymap differs:** modern visual register (see [`02-aesthetic-references.md`](02-aesthetic-references.md)), 60-fps WebGPU rendering instead of WorldWide Telescope's older pipeline, single curated tour instead of an open authoring system, no voiceover, browser-native with no install. We are aiming for a much smaller surface that does one thing extremely well, where WorldWide Telescope is a kitchen sink.

## 5. Stellarium Web (and the Stellarium desktop app)

A sky-charting product. Pick a location, a time, and a direction, and Stellarium shows you what's in the sky. The web version is JavaScript; the desktop version (Stellarium Mobile and Stellarium 0.x) is Qt/C++.

**What it does well:** astronomical accuracy (proper motion, time evolution, ephemerides), restrained typography, clean UI, reliable. The astronomy community trusts it.

**What it doesn't do:** cosmic-scale travel. Stellarium is firmly Earth-bound — you are looking *up* from a point on Earth's surface. It has a "deep sky" mode but it is still fundamentally a sky chart, not a 3D universe.

**What skymap takes:** the discipline of "do one thing well." Stellarium Web doesn't pretend to be a cosmic-zoom product, and skymap doesn't pretend to be a sky-charting product. Different problem spaces.

**Where skymap differs:** complete scope mismatch. We are not competing. A user might use Stellarium to identify what's overhead tonight and skymap to understand the structure of the universe; both are legitimate.

## 6. Galaxy Map (galaxymap.org)

Kevin Jardine's static infographic project. Beautiful, carefully-researched, hand-drawn (well, hand-laid-out) maps of the Milky Way's spiral structure based on the latest spectroscopic surveys. Updated periodically as Gaia and other surveys refine the picture.

**What it does well:** authoritative visual communication. The maps are widely used in textbooks, Wikipedia articles, and astronomy lectures. Kevin Jardine has done the unglamorous work of synthesizing primary sources into a single coherent picture.

**What it doesn't do:** interactive. It's a series of static PNGs and explanatory prose. You cannot fly through the Milky Way at galaxymap.org; you can read about its structure.

**What skymap takes:** the synthesis-of-sources discipline. Each of our shells is a synthesis decision. Picking which catalog, which projection, which cluster catalog, is the same kind of editorial work Jardine does — just rendered into a 3D interactive instead of a 2D static.

**Where skymap differs:** medium. We are interactive 3D; he is static 2D. Both have value; they don't substitute for each other.

## 7. Brent Tully's Cosmography

A series of academic papers (Tully, Courtois, Hoffman, Pomarède 2014 "Laniakea"; subsequent Cosmicflows-4 papers) accompanied by remarkable video supplements rendered by Daniel Pomarède. The Pomarède videos visualize the velocity field of the local universe, defining Laniakea, and showing the dark-matter density distribution mapped from peculiar velocities.

**What it does well:** the visual language for cosmic-flow rendering is essentially defined by these papers. The Cosmicflows-4 videos are hauntingly beautiful — translucent volumetric density, flow vectors, identified superclusters. They are the gold standard for visualizing large-scale structure.

**What it doesn't do:** interactive. The videos are pre-rendered. They are linear. A user cannot pause Pomarède's Laniakea video at the moment of greatest interest and orbit around. They also presuppose academic context — the papers explain what you're seeing; the videos in isolation do not.

**What skymap takes:** the visual technique. Shell 7 (Laniakea) of the cosmic zoom is directly inspired by Pomarède's renderings. We render the same Cosmicflows-4 dataset, with similar volumetric and flow-line treatment, but in real-time WebGPU rather than pre-rendered, and with explanatory copy that doesn't presuppose a PhD.

**Where skymap differs:** real-time interactive instead of pre-rendered video, browser-native instead of MP4 download, narrative copy instead of academic paper context.

## 8. Celestia

The grandparent of consumer 3D space simulators. Open-source, C++, originally released 2001. Lets the user fly anywhere in the known universe, follow any object, set any time, browse a hierarchical catalog. Has a substantial extension ecosystem ("addons") with custom textures, additional catalogs, and authored tours.

**What it does well:** the fundamental capability is enormous. You can fly from Earth's surface to the cosmic horizon. The community has built incredible addons. The trajectory engine is precise. For two decades it was *the* space sim.

**What it doesn't do:** the UX shows its age — context menus, hierarchical browsers, command-line-driven scripting (the "cel://" URL scheme). Frame rates are uneven on modern hardware because the renderer is OpenGL 1.x-era. Installation is a barrier (no browser version). The visual register is from a different decade.

**What skymap takes:** validation that the capability is desired. Celestia has had millions of downloads over twenty-five years. People want to fly through space. We are doing the same fundamental thing with twenty-five years of better tooling.

**Where skymap differs:** browser-native (no install), modern WebGPU rendering, curated narrative tour as the entry point, focused on cosmic scale rather than every scale equally. Celestia is open-ended exploration; skymap is curated tour with optional exploration.

## 9. SpaceEngine

A commercial procedural space simulator (Cosmographic Software, 2010–present). Generates a full universe procedurally — every star you fly to has a procedurally-invented planetary system. Stunning visuals, comprehensive scope, paid product on Steam.

**What it does well:** visual quality bar. SpaceEngine's planet rendering, atmosphere rendering, and star rendering are state of the art. The user can fly from a planet's surface to the cosmic horizon with smooth transitions. It is genuinely impressive.

**What it doesn't do:** the data is mostly procedurally invented. Every planet you visit is a fiction. The known catalogs are present but most of what you see is generated. This is fine for entertainment but it is not a model of *the* universe.

**What skymap takes:** the visual quality bar as a north star. If SpaceEngine can render this in 2024, we should not be embarrassed by what we render in WebGPU in 2026.

**Where skymap differs critically:** real data, not procedural. Every galaxy in skymap is a real galaxy at a measured position. This is the central distinction. SpaceEngine is *a* universe; skymap is *the* universe. Also: skymap is free, browser-native, and tour-focused.

## 10. Universe Sandbox

A commercial physics simulator (Giant Army, 2008–present). Lets the user create and modify celestial systems, then watch them evolve under gravitational and tidal physics. Can simulate collisions, orbital decay, climate effects.

**What it does well:** physics-driven simulation. Watching the Andromeda-Milky Way collision play out in Universe Sandbox is genuinely instructive. The "sandbox" framing — modify and observe — is a powerful learning mode.

**What it doesn't do:** scale travel. Universe Sandbox is about local-system physics, not cosmic zoom-out. There is no "fly to the Cosmic Web" mode.

**What skymap takes:** nothing structural — different problem space.

**Where skymap differs:** different product entirely. A user might use Universe Sandbox to understand orbital mechanics and skymap to understand cosmic structure.

## 11. Curiosity Stream / scientific YouTube cosmic-zoom videos

A genre rather than a single product. Channels like Kurzgesagt, melodysheep ("Timelapse of the Future," "Timelapse of the Entire Universe"), Crash Course Astronomy, and PBS Space Time produce cosmic-zoom videos with high production value. melodysheep's "Timelapse" videos in particular have hundreds of millions of views.

**What they do well:** production value, narration quality, music, viral reach. melodysheep's videos are the most-watched cosmic-zoom content of the last decade by a wide margin.

**What they don't do:** interactive. They are linear video. You cannot pause "Timelapse of the Entire Universe" and orbit around the moment you found most interesting. You cannot click into a specific cluster and read its catalog entry.

**What skymap takes:** the lesson that this content is wildly popular when produced well. There is enormous latent audience demand for cosmic-zoom storytelling. Our tour is, fundamentally, the same genre — packaged as an interactive instead of a video.

**Where skymap differs:** interactivity. The 90-second tour is the *cinematic version* of skymap, but the user can pause at any moment to free-fly. melodysheep cannot offer that.

This is also the most likely *distribution* surface for skymap: a 30-second clip of the cosmic zoom, posted to r/space or YouTube, that drives users to the interactive product. The cinematic tour is the marketing material *and* the product, simultaneously.

## Where skymap fits

After this survey, the unique combination of properties that defines skymap is this:

- **Interactive** (unlike Eames, melodysheep, Pomarède, Galaxy Map).
- **Real survey data** (unlike SpaceEngine, Scale of the Universe 2, the Eames film).
- **Cosmic scale** (unlike Stellarium Web, NASA Eyes, Solar System Scope, Universe Sandbox).
- **Curated narrative tour** (unlike Celestia, WorldWide Telescope, SpaceEngine — all of which are open-ended).
- **Free** (unlike SpaceEngine, Universe Sandbox).
- **Browser-native, no install** (unlike Celestia, SpaceEngine, Universe Sandbox, Stellarium desktop).
- **Modern visual register** (unlike WorldWide Telescope, Celestia).

No existing product hits all seven simultaneously. Every comparison product hits some subset. WorldWide Telescope is closest — it has the cosmic scale, the real data, and the interactive tours, but it is dated and unfocused. Scale of the Universe 2 is the most-shared, but it has no real data and no 3D. The Pomarède Laniakea video has the visual quality but no interactivity. melodysheep has the reach but no interactivity.

The thesis of the cosmic zoom plan is that this combination of properties is what an interested but non-expert user actually wants in 2026, and that no one is currently providing it. The Eames film is forty-nine years old. Scale of the Universe 2 is fourteen years old. WorldWide Telescope's UI is fifteen years old. The category is overdue for a contemporary entry.

## What this means for the plan

Several practical consequences for downstream specs:

- **We do not need to compete with NASA Eyes for the Solar System.** Shell 1 is a *transitional beat* in the tour; it is not the product. We render the Solar System with enough fidelity to be readable in 6 seconds, no more.
- **We do not need to compete with Stellarium Web for sky charting.** That use-case is well served. We are a different product.
- **We must hit a visual quality bar comparable to SpaceEngine and the Pomarède Laniakea videos** for the shells where we are the only interactive product (Laniakea, Cosmic Web, CMB). These shells are the differentiators; they cannot look worse than the static state of the art.
- **We must be more visually polished and less chrome-heavy than WorldWide Telescope** for the entire experience. Modern register is a competitive necessity, not a nice-to-have.
- **We should treat melodysheep videos as the marketing-channel competition.** The 30-second clip of the cosmic zoom must be at least as visually striking as a melodysheep frame, otherwise it will not propagate on social channels — and propagation on social is the primary acquisition channel.

## Cross-references

- Product vision: [`00-product-vision.md`](00-product-vision.md)
- Narrative script: [`01-narrative-script.md`](01-narrative-script.md)
- Aesthetic references: [`02-aesthetic-references.md`](02-aesthetic-references.md)
- Plan summary: [`../SUMMARY.md`](../SUMMARY.md)
