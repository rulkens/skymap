# 06 — Exemplar sites: what awe-inspiring websites do

Subagent web research, 2026-10-05. Page text and write-ups only, no pixels seen; unverified — open the cited source before relying on a claim.

## Exemplars

Evidence key: **[site]** = I fetched the page text (summarised by a fetch model, no pixels seen); **[write-up]** = claim comes from a case study or article; **[judgement]** = my inference. Every "don't copy" is my judgement unless marked.

### Tier 1: space, astronomy, science visualisation

| # | Exemplar | What it is | What creates the effect | Don't copy |
|---|---|---|---|---|
| 1 | **100,000 Stars** (Google Data Arts, 2012) https://stars.chromeexperiments.com · [making-of](https://web.dev/case-studies/100000stars) | WebGL map of 119,617 real stars | [write-up] Field of view widens as you pull out and narrows as you approach, so scale change is felt, not just seen. A commissioned score (Sam Hulick, "In a Strange Land"). 87 named stars as CSS3D labels locked to the 3D camera. An explicit honesty line: "this is the work of amateur research… an artist interpretation of space". | The Milky Way is a photo of a different galaxy (NGC 1232). The author calls the DOM label sync "a hack". Autoplaying music. |
| 2 | **Neal.fun**: [Deep Sea](https://neal.fun/deep-sea/), [Size of Space](https://neal.fun/size-of-space/), [Space Elevator](https://neal.fun/space-elevator/) | Single-gesture scale pieces | [write-up: [Webiano](https://webiano.digital/neal-fun-is-the-web-that-still-rewards-curiosity/), [Creative Bloq](https://www.creativebloq.com/news/deep-sea-visualisation), [Gigazine](https://gigazine.net/gsc_news/en/20230421-space-elevator)] The scroll is the quantity: "scrolling downward is not a metaphor for depth. It is depth." One persistent instrument (depth or altitude readout). Facts arrive when "the visitor has earned enough distance to care". No menus, overlays, chapter cards or voiceover. A named scientist is credited as reviewer. | Very long scroll with no skip or index. The cartoon register is wrong for an institutional audience. (neal.fun returned 403 to me, so all of this is from write-ups.) |
| 3 | **NASA Eyes** https://science.nasa.gov/eyes/ | Hub for NASA's real-time 3D web apps | [site] No pitch: a one-sentence subtitle, then "Click any of these eyes products to start exploring" over six app cards. "5 Cool Things" are deep links into specific moments (Perseverance landing, Cassini Grand Finale). The copy sells liveness: "right now", "real-time". | Card-grid portal with no hero moment; it relies on NASA's authority, which skymap lacks. |
| 4 | **OpenSpace** https://www.openspaceproject.com/ · [impact page](https://www.openspaceproject.com/about/impact.html) | Open-source astrovisualisation for domes | [site] Verb-stack headline: "Explore Research Present Share Teach a Universe of Data". Partner logos (Adler, AMNH, Denver Museum) come immediately after the hero. Three venue cards: domes, classrooms, museum exhibits. "Meet the 100+ organizations running OpenSpace" plus a usage map as proof. Funders are a separate logo row. "Free. Open source. Cross-platform." | No video on the homepage; a feature carousel hides the content. |
| 5 | **WorldWide Telescope** https://worldwidetelescope.org/home/ | Open-source sky and data tool (AAS) | [site] Plain declarative headline with the CTA "Launch the Web Client!". "See What's Possible" is six data stories that open as live demos (JWST comparison, Radcliffe Wave). "Something for Everyone" routes four audiences to their own pages. "A Team Effort" funder logos. | Four audience doors is one too many; the demo grid has no hierarchy. |
| 6 | **Gaia Sky** https://gaiasky.space/ | Open-source 3D universe (ZAH/Heidelberg) | [site] The headline is a hard number: "…with support for a billion objects". Version and release date sit next to the download button, which reads as alive and maintained. Institutional logos (ZAH, DLR) and ESA mission association. | An 18-item feature grid; engineer voice throughout. |
| 7 | **SpaceEngine** https://spaceengine.org/ | Commercial universe simulator | [site] Two-word headline, "Universe simulator". One sentence that is the whole pitch: "Seamless transition from the surface of a planet to the most distant galaxies". Dated news is visible on the homepage. | A long capabilities list and system-requirements table on the homepage. |
| 8 | **Universe Sandbox** https://universesandbox.com/ | Physics space simulator | [site] The tagline is a verb pair with scale: "create & destroy on an unimaginable scale". "What Can You Do?" is seven concrete scenarios, not features. A named 13-person team roster. | "Epic, mind-blowing" adjectives; repeated Buy buttons. |
| 9 | **AstroGrid / Velon Space** https://velonspace.com/ | Browser universe explorer | [site, thin] Leads with zero friction (no install, no account) and contemplative vocabulary ("drift", "quiet"). | "The most beautiful way to meet the universe" is a self-awarded superlative. The fetch saw very little page text, so treat this entry as weak. |

### Tier 2: award-winning immersive WebGL/WebGPU

| # | Exemplar | What it is | What creates the effect | Don't copy |
|---|---|---|---|---|
| 10 | **Igloo Inc** (abeto), Awwwards Site of the Year 2024 https://igloo.inc · [case study](https://www.awwwards.com/igloo-inc-case-study.html) | Three-section company page | [write-up] The intro is rendered in-engine, not as video, so it flows into the interactive scene without a cut. Only three sections, each carried by an interaction. One transition vocabulary reused everywhere (chromatic aberration, displacement, frost). Sound is tied to particle velocity. Designed in the browser, not from static mockups. | All UI text is drawn in WebGL (unselectable, invisible to screen readers and search). Text-scramble and glitch effects. |
| 11 | **Bruno Simon folio 2025**, Site of the Month Jan 2026 https://bruno-simon.com · [case study](https://www.awwwards.com/brunos-portfolio-case-study.html) | Drivable 3D world, Three.js WebGPU/TSL | [write-up] The site is the demo; there is no page about it. "Sound is one of the most powerful ways to convey emotion": a commissioned score plus spatialised ambience. Automatic quality reduction on mobile. Open source (MIT). "Performance [is] the real constraint on creativity." | The game metaphor hides information; the case study never mentions accessibility. |
| 12 | **Messenger** (abeto), Developer Site of the Year 2025 https://messenger.abeto.co · [case study](https://www.awwwards.com/messenger.html) | 15-minute WebGL game on a tiny planet | [write-up] Benchmarked on old phones. One 16×16 palette texture so the mood is globally consistent. The whole world model is 333 kB (per an HN commenter's network inspection). No invisible walls: walking straight loops the world. | It is a game; the lesson is asset discipline and palette unity, not format. |
| 13 | **Immersive Garden** (Agency of the Year 2025) https://immersive-g.com · [case study](https://www.awwwards.com/case-study-immersive-gardens-new-website.html) | Studio portfolio | [write-up] One sculptural idea (bas-relief 3D) carries the whole site. "More time spent removing unnecessary elements than adding new ones." GSAP plus Lenis smooth scroll. | Lenis-style scroll smoothing is the most criticised pattern in this genre (see D). |
| 14 | **Lando Norris** (OFF+BRAND), Site of the Year 2025 https://landonorris.com · [studio page](https://www.itsoffbrand.com/our-work/lando-norris) | Driver's official site | [write-up] One signature colour (lime) on dark. One hero object (a rotating 3D helmet). Built on Webflow + WebGL + Rive in under two months, so craft came from art direction, not a custom engine. | "Cinematic scrolling"; the studio page is marketing copy and I found no technical teardown. |
| 15 | **Lusion v3**, Site of the Year 2023 https://lusion.co · [Awwwards scores](https://www.awwwards.com/sites/lusion-v3) | Studio portfolio | [write-up, scores only] Animation scored 10.00 while usability (7.95) and accessibility (7.40) were its weakest. That score profile is the genre's trade-off in one line. | I could not retrieve a v3 breakdown (Codrops returned 403). Do not rely on this entry for technique. |

### Tier 3: restrained craft

| # | Exemplar | What it is | What creates the effect | Don't copy |
|---|---|---|---|---|
| 16 | **Apple product pages** (scroll sequences) · [CSS-Tricks](https://css-tricks.com/lets-make-one-of-those-fancy-scrolling-animations-used-on-apple-product-pages/), [critique](https://geyer.dev/blog/css-image-sequence-animations/) | Scroll-scrubbed product reveal | [write-up] A viewport-pinned canvas inside a tall (500vh) container; frame index = scroll fraction × frame count (148 frames), drawn in `requestAnimationFrame`. A short line of copy per beat. | One measured page shipped 65 PNG frames at 15.2 MB. Requires heavy preloading. |
| 17 | **Linear** https://linear.app · [The Linear effect](https://rectangle.substack.com/p/the-linear-effect) | Product landing page | [site] Real product UI as the only imagery (an actual issue ID, real diffs); no stock or illustration. Short noun-phrase section heads. A live changelog on the homepage. | The dark-gradient "Linear style" is now a template: four clones fail a squint test, and one newsletter titled its piece ["Linear Style is now illegal"](https://designthisweek.substack.com/p/twid-linear-style-is-now-illegal). |
| 18 | **Teenage Engineering** https://teenage.engineering | Hardware maker | [site] Product names are the headlines. No taglines, testimonials or hero narrative. One CTA label used everywhere. | Works because the objects are already iconic; a newcomer needs one sentence of explanation. |
| 19 | **Rauno Freiberg**, [Invisible Details of Interaction Design](https://rauno.me/craft/interaction-design) | Essay on interaction craft | [site] Animate by frequency: novel, rare moments get motion; frequent ones get none ("suddenly felt like I was moving much faster"). Motion should say where something came from. Gestures should be interruptible. | HN readers found the page's own looping demos distracting ([thread](https://news.ycombinator.com/item?id=36669249)). |

Institutional exemplars (20–25) are analysed in section C: Cosm/Digistar, RSA Cosmos, Sky-Skan, Local Projects, Stamen, NSC Creative.

**Dropped as unverifiable:**
- **Stellarium Web**: the fetch returned only the page title; it appears to open straight into the app.
- **Celestia**: blocked by a bot wall.
- **Google Earth**: the fetch got only a browser-compatibility gate.
- **NYT JWST scrollytelling**: no making-of found.
- **The Pudding space piece**: the URL I tried returned 404; Space Elevator is neal.fun's.
- **Active Theory**: only secondary summaries found.
- **Not researched**: Resn, Unseen, Locomotive, Framer, Figma Config, Stripe Press (the fetch gave only a text catalogue, nothing transferable).

## A. Recurring patterns, ranked by contribution to awe

1. **The gesture is the quantity.** One input mapped to one physical magnitude, with a persistent readout. (2, 1, 16.) For skymap this means scroll equals distance from Earth, with a live distance and light-travel-time counter. This is the largest gap between the exemplars and "full-bleed image + headline + three rows".
2. **The thing itself, moving, within the first second.** No sentence precedes the experience. (1, 2, 10, 11, 12, 17 with real UI.)
3. **Real, specific numbers as the copy.** "119,617 stars", "a billion objects", "100+ organizations", "333 kB". Named catalogs are skymap's version. (1, 6, 4, 12.)
4. **Information timed to arrival.** A fact appears when the viewer reaches the place it is about, one at a time. (2, 16, 3's "5 Cool Things".)
5. **Sound, opt-in.** Every immersive case study that discusses emotion names sound as the lever. (1, 10, 11.) None of the restrained Tier 3 pages use it.
6. **One idea, one colour, one transition vocabulary.** Reduction is stated as a method. (13, 14, 10, 12, 18.)
7. **Stated honesty about what is real.** A line saying what is data and what is interpretation, plus named reviewers. (1, 2, 4.) This is the cheapest credibility device and suits the non-hype voice.
8. **Liveness signals.** Version and date, changelog, "right now". (6, 7, 17, 3.)
9. **Deep links to moments, not features.** Scenarios you can enter in one click. (3, 5, 8.)
10. **Performance as a visible value.** Old-phone benchmarks, automatic degradation, tiny payloads. (11, 12, 13.) Polish, not awe, but its absence destroys awe.
11. **Animate only the rare moments.** (19, 18.) Pure polish.
12. **Plain declarative headline.** "Universe simulator", "…a tool for showcasing astronomical data". (7, 5, 6, 18.) Polish, and the voice the owner wants.

## B. When the product is the visual experience

- **Show, don't describe.** No strong exemplar leads with feature rows. The split is between sites that are the experience (1, 2, 11, 12) and sites that gate it behind a download and therefore fall back on lists (6, 7, 8). Skymap runs in the browser, so it belongs with the first group.
- **Three hero mechanisms, in rising cost:**
  - **Looped video**: cheapest, but passive, and the cut to the app is visible.
  - **Scroll-scrubbed sequence** (16): gives the visitor agency over scale. Costs megabytes of frames unless it is a seekable video or a low-quality live render.
  - **Live in-engine intro** (10, 11): no cut at all. Igloo chose it specifically to avoid pre-rendered video and to flow into the interactive scene. Costs load time and needs a fallback.
- **The handoff is the weak point everywhere.**
  - Best: 10 and 11 have none, because the intro is the app.
  - Next best: 3 and 5 deep-link into a specific state, so the app opens on a moment and not a blank default.
  - Worst: a "Launch" button that opens a loader and then a default view (5's generic "Launch the Web Client!").
  - [judgement] For skymap: the video's last frame should match a deep-linkable camera pose, and Launch should open the app at that pose.
- **Unsupported browsers.** Google Earth's fetched page was nothing but a compatibility gate ("Aw snap!"). A WebGPU site needs the landing page to work fully without WebGPU and to say so before the click.
- **Zero-friction claims are common and effective.** "No install, no account" (9), "Free. Open source. Cross-platform." (4).

## C. Institutional proof and contact path

What the vendor and studio pages show, in the order they show it:

- **Named installations with a photo, not a count alone.** Cosm/Digistar lists Arizona Science Center, Colgate, Prague Planetarium ([site](https://tech.cosm.com/digistar)). RSA Cosmos pairs counters (500+ installations, 50+ countries) with named recent domes ([site](https://www.rsacosmos.com/)).
- **Peer logos directly under the hero.** OpenSpace puts Adler, AMNH and Denver before any feature. Funders (NASA, Wallenberg) are a separate row: who uses it versus who paid for it.
- **Testimonials from named venues about support and reliability, not visuals.** Sky-Skan: "When minor issues have come to the fore the support has been outstanding" ([site](https://www.skyskan.com/)). Directors buy risk reduction.
- **A showreel as the hero for content studios.** NSC Creative's homepage is one embedded reel, a tagline, an email and a phone number ([site](https://nsccreative.com/)).
- **Case studies titled by institution.** Local Projects cards read project title plus client, linking to a full study, and cite press (Washington Post) instead of design awards ([site](https://localprojects.com/)).
- **Third-party quote as headline.** Stamen leads with a Fast Company quote ([site](https://stamen.com/)).
- **Contact path:** one verb-led CTA repeated at top and bottom, to a human. Examples: "Book Digistar Demo", "LET US DESIGN ONE FOR YOU", "Work With Us". RSA Cosmos and NSC show a phone number and email in plain text. Sky-Skan lists the conferences it will attend.
- **What a director expects** [judgement from the above]: where it has run (dome size, projector or LED system, named venue); formats delivered (fulldome 4K/8K, fisheye, frame rate); data sources and licence; who is behind it, with a name and face; a short reel; a direct email. Skymap has no install base, so the honest substitutes are the dome film already made, named data sources, open-source status, and a named author.

## D. Clichés that now read as templated or AI-generated (2025–2026)

- **Serif headline over a full-bleed hero.** Listed as a current vibe-coded tell alongside frosted glass, "the new purple gradient" ([Yuwen Lu](https://x.com/yuwen_lu_/article/2041187936738447565)). This is the pattern the rejected sketches used.
- **Purple-to-blue gradients, glow blobs, uncustomised shadcn components, identical spacing everywhere, one fade-up animation on every element** ([Differ](https://blog.getdiffer.com/design-tips-vibe-coded-project), [DEV](https://dev.to/jaainil/ai-purple-problem-make-your-ui-unmistakable-3ono)).
- **Emoji or icons in small tinted rounded squares above three feature cards** (same sources).
- **The "Linear look"**: near-black, gradient borders, blur streaks (17's sources).
- **Scroll smoothing and scroll hijacking.** Criticised for motion discomfort, lost position, and keyboard and screen-reader breakage ([Opus](https://opus.ing/p/stop-scrolljacking-your-website-users), [dontfuckwithscroll.com](https://dontfuckwithscroll.com/)).
- **Preloader with a percentage counter in front of heavy WebGL** ([get-started-int](https://www.get-started-int.com/en/post/scrolljacking-is-evil-ux-guide)).
- **Text scramble and glitch reveals, a custom cursor, WebGL-rendered body text.** [judgement: seen in 10 and across the genre.]
- **Self-awarded superlatives and "epic / mind-blowing / stunning"** (8, 9, RSA Cosmos's "Stunning Realism").
- **Bento grids and Inter as AI tells**: I searched and found no source naming them, so I am not asserting it.

**Coverage gaps:** Tier 2 technique detail is solid for abeto and Bruno Simon and thin for Lusion, Lando Norris and Immersive Garden. I found no verified NYT, Reuters or Pudding space scrollytelling write-up. Sound and visual claims are all second-hand.
