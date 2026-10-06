# 09 — Feature inventory (current)

Subagent code sweep of `33ad41a72`, 2026-10-05. Every row cites source; spot-check before publishing.

Provenance notes:

- The SHA is what the worktree's `HEAD` pointed at when this file was written (branch `site/01-foundation`). The sweep was briefed against `cfdf70ff2`; the branch moved underneath it. Nothing under `src/`, `tools/` or `data/` was seen to change during the sweep, but that was not checked file by file.
- All paths are relative to the repo root. `path:line` points at the line that proves the row, read on that SHA.
- `public/data/` does not exist in this worktree, so every number that lives only in a built data file (galaxies per catalogue, stars per tier, bulk structure count, constellation segments, which surface tiles are deployed) is marked **unverified**. Counts taken from seed files and TypeScript tables are exact, and the counting method is given.
- Status words: **shipped** = reachable by a normal visitor on the main page; **flagged** = needs a URL flag; **dev-only** = developer surface (still reachable in production unless stated); **partial** = some of it exists, the row says which part; **not present** = searched for and absent.

## Summary

| Area | Features found | Proposed docs page |
|---|---|---|
| What you can see | 30 | Guide: "What's in the scene" (+ Reference: Object catalogue) |
| Getting around | 25 | Guide: "Moving around" (+ Reference: Controls) |
| Search and the palette | 17 | Guide: "Finding things" |
| Time | 10 | Guide: "Time travel" |
| Tours, clips and exhibits | 16 | Guide: "Tours and exhibits" |
| Sharing and links | 13 | Guide: "Sharing a view" (+ Reference: URL parameters) |
| Settings | 14 rows covering 73 controls | Guide: "Settings" (+ Reference: Settings) |
| Cards and information | 12 | Guide: "Reading the info cards" |
| Display rigs and quality | 8 | Guide: "Quality, screens and domes" |
| Loading, splash and browser support | 10 | Guide: "Getting started and troubleshooting" |
| Tool pages | 6 | Tools: one page per workbench |
| Command-line tools | 12 | Developers: "Command-line tools" |
| Developer panels | 21 | Developers: "Debug panel and flags" |
| **Total** | **194 rows** | |

Counted as table rows in the area sections below (row ids A1…M21). The settings area is counted both ways because one row there stands for a whole section of controls; the 73 controls are listed one by one in reference table (c).

---

## What you can see

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| A1 | Galaxy point cloud | Every catalogued galaxy is a coloured dot at its measured place in space; colour follows the galaxy's measured colour (blue to red). | Always on. Eight catalogues, each with its own switch in Settings → Galaxies. | `src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts:22-31`; `src/compositions/app.ts:24` | shipped |
| A2 | Galaxy close-up ladder | As you approach a galaxy it grows from a dot into a generated disc, then a real photograph, then a sharper photograph. | Automatic by on-screen size: disc from 8–14 px, photo from 24–40 px, hi-res from 120–160 px. | `src/data/galaxyLodBands.ts:7-12` | shipped |
| A3 | Famous galaxies | 81 well-known galaxies (Messier, Caldwell and a few others) carry a name label, a curated photo and a written description. | Always on; "Famous" switch in Settings → Galaxies, label switch in Labels & Guides. | `data/seeds/famous_galaxies.seed.json` (81 entries, `JSON.parse().length`); `src/layers/galaxyCatalog/sources/famous-galaxy.ts:8` | shipped |
| A4 | Quasars | Very distant, very bright galaxy cores from the Milliquas catalogue, seen far beyond the ordinary galaxies. | On by default; "Milliquas" switch. | `src/layers/galaxyCatalog/sources/milliquas.ts:8,47` | shipped |
| A5 | DESI deep patches | Three extra deep slices of sky from the DESI survey: a narrow cone, a thin fan and the Sloan Great Wall. | Off by default; three switches in Settings → Galaxies. | `src/layers/galaxyCatalog/sources/desiDeep.ts:8`, `desiWedge.ts:8`, `desiSgw.ts:8`; defaults `src/layers/galaxyCatalog/state/galaxyCatalogs/initialState.ts:29-31` | shipped (opt-in) |
| A6 | Named large structures | Rings with name labels mark galaxy clusters, superclusters, voids and groups. 42 are hand-curated; more clusters and superclusters come from two survey catalogues. | On by default; Settings → Structures (rings) and Labels & Guides (names). | `data/seeds/structure_anchors.seed.json` (42 entries); `src/data/structure/buildStaticAnchorStructures.ts:90,127-129`; bulk catalogue `tools/structures/buildStructures.ts:59-88` | shipped (bulk count unverified) |
| A7 | Cosmic web glow | A glowing 3D fog shows where matter is densest between the galaxies. Three versions exist; one is on by default. | Settings → Cosmic web density. | `src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows.ts:15-19`; defaults `src/layers/cosmicWebDensity/state/cosmicWebDensity/initialState.ts:15-30` | shipped |
| A8 | Cosmic web filaments | Thin lines trace the skeleton of the cosmic web. | Off by default; Settings → Cosmic web filaments. | `src/layers/cosmicWebFilaments/layer.ts:18-28`; `src/layers/cosmicWebFilaments/state/cosmicWebFilaments/initialState.ts:10` | shipped (opt-in) |
| A9 | Galaxy flows | Moving ribbons show which way galaxies are drifting once the expansion of the universe is subtracted; colour shows speed (up to 1200 km/s). | Off by default; Settings → Flow, or the Cosmic Flows exhibit. | `src/layers/flow/layer.ts:1-35`; `src/layers/flow/state/defaults.ts:24-34`; `src/data/exhibits/cosmicFlows.ts:26-29` | shipped (opt-in) |
| A10 | Zone of Avoidance | A hazy band shows the strip of sky our own galaxy's dust hides from galaxy surveys, with lettering along it. | On by default; Labels & Guides → Zone of Avoidance. Only drawn from roughly 0.15 to 6 Mpc out. | `src/layers/zoneOfAvoidance/layer.ts:24-64`; `src/data/exhibits/zoneOfAvoidance.ts:54-61` | shipped |
| A11 | Edge of the observable universe | A faint glowing sphere marks how far light has had time to reach us (14.3 Gpc). | Automatic; fades in only when zoomed far out. | `src/services/engine/frame/passes/horizonShellPass.ts:1-22`; `src/data/rendering/horizonRadiusMpc.ts:11` | shipped |
| A12 | Milky Way | Our own galaxy drawn as a generated spiral of stars and dust lanes, with a "you are here" label. | On by default; label switch in Labels & Guides. No on/off switch for the galaxy itself in Settings. | `src/layers/milkyWay/layer.ts:28-58`; `src/data/milkyWay/milkyWayGalaxyParams.ts:36-101` | shipped |
| A13 | Central black hole | Sagittarius A*, the black hole at the centre of the Milky Way, with a glowing disc and light bent around it. | Fly to "Sgr A*" from search; label "Galactic Centre". | `src/layers/blackHoles/data/blackHoles.ts:11-23`; `src/layers/blackHoles/layer.ts:34-38` | shipped |
| A14 | Stars orbiting the black hole | 40 real stars ("S-stars") circle the black hole on their measured orbits, with orbit paths drawn. | On by default; "S-Star" switch in Settings → Stars. | `src/data/bodies/sStarElements.ts` (40 rows, `grep -c "    id: '"`); `src/layers/starCatalog/layer.ts:53` | shipped |
| A15 | Star field | Millions of real stars from the Gaia space telescope, each at its measured distance and colour. | On by default; "Gaia Stars" switch. | `src/layers/starCatalog/sources/gaia-stars.ts:15-44` | shipped (count per tier unverified) |
| A16 | Named stars | 118 famous stars carry name labels; get close enough and a star becomes a true-size glowing ball. | On by default; "Famous Stars" switch and label switch. | `data/seeds/famous_stars.seed.json` (118 entries); `src/layers/starCatalog/layer.ts:45` (`starSpheresPass`) | shipped |
| A17 | The Sun | The Sun as a glowing ball at the centre of the solar system. | Always present; fly to "Sun". | `data/seeds/sun.seed.json:3`; `src/layers/starCatalog/sources/sun.ts:19-37` | shipped |
| A18 | Constellations | Stick figures for all 88 constellations with their names. The lines join the real stars in 3D, so the shapes fall apart as you fly away from Earth. | Off by default; Labels & Guides → Constellations. Not clickable. No boundaries or artwork. | `src/layers/constellations/layer.ts:2,28-38`; `src/layers/constellations/state/constellations/initialState.ts:10` | shipped (opt-in) |
| A19 | Local Bubble | A faint shell around the Sun showing the cavity of thin gas the solar system sits in. | Off by default; Labels & Guides → Local Bubble. | `src/layers/localBubble/layer.ts:1-29`; `src/layers/localBubble/state/localBubble/initialState.ts:10` | shipped (opt-in) |
| A20 | Planets and Pluto | The eight planets and Pluto, textured, lit by the Sun, at their real positions for the chosen date. | Always on; fly to them from search or the Solar System tab. | `src/data/bodies/sceneEarth.ts:18-24`; `src/data/bodies/scenePlanets.ts:20-65,113-118` | shipped |
| A21 | Moons | 24 moons around Earth, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto. Six small ones are plain grey balls with no surface picture. | Always on. | `src/data/bodies/scenePlanets.ts:66-181` (24 `satelliteBody(` calls, `grep -c`) | shipped |
| A22 | Saturn's rings | Saturn's ring system, the only rings drawn. | Always on. | `src/data/bodies/sceneRings.ts:32-39` | shipped |
| A23 | Atmospheres | Nine worlds have a glowing air layer: Earth, Venus, Mars, Jupiter, Saturn, Titan, Uranus, Neptune and Pluto. | Automatic. Earth's brightness has a slider (Settings → Display → Earth). | `src/data/bodies/atmosphereParams.ts:37,69,111,153,182,224,286,327,376` | shipped |
| A24 | Earth in detail | Earth has city lights on the night side, moving-looking cloud cover with shadows, shiny oceans and raised mountains. | Automatic near Earth. | `src/data/bodies/bodyTextureRegistry.ts:37-48`; `src/data/bodies/cloudShellParams.ts:101-111` | shipped |
| A25 | Earth close-up imagery | Zoom towards the ground and sharper satellite pictures stream in: the whole globe, then 19 named regions, then part of Denmark at aerial-photo sharpness. | Automatic as you descend. | `src/data/bodies/surfaceTileRegistry.ts:13-27`; `tools/textures/surfaceBodies/earthSurfaceBake.ts:138-168`; `tools/fetch/eoxRegions.ts:32-54` | shipped in code; which bands are deployed is unverified |
| A26 | Mars terrain | Mars has real height relief and, at the four rover sites, very sharp orbital imagery. | Automatic near Mars. | `src/data/bodies/surfaceTileRegistry.ts:13-27`; `tools/textures/surfaceBodies/marsSurfaceBake.ts:113-145,160-230` | shipped in code; deployed bands unverified |
| A27 | Spacecraft and models | Ten 3D models: Voyager 1 and 2, Hubble, four Mars rovers, a scanned Copenhagen park, and two jokes in Earth orbit (a whale and a bowl of petunias). | Always on; fly to them from search or the Missions tab. | `src/data/bodies/sceneMeshBodies.ts:13-40`; `src/data/bodies/meshAssets.generated.ts:32-153` | shipped |
| A28 | Orbit paths | Lines show the path each planet and moon follows. | On by default; Labels & Guides → Orbit trails. | `src/state/settings/core/orbitTrails/initialState.ts:13` | shipped |
| A29 | Name labels | Names float beside galaxies, structures, stars, planets, the Sun and the Milky Way, thinning out so they do not pile up. Clicking a label selects the thing it names. | On by default; one switch per kind in Labels & Guides. | `src/data/structure/labelCategories.ts:3-29`; `src/utils/labels/isPickableLabel.ts:13-15` | shipped |
| A30 | Scale bar | A small ruler in the corner says how big things on screen are, switching units as you zoom: metres, km, AU, light-years/parsecs, up to billions of light-years. | Always shown (bottom right). | `src/components/ScaleBar/ScaleBar.tsx:2`; `src/utils/format/formatDistance.ts:44-68` | shipped |

## Getting around

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| B1 | Orbit | Drag to swing the view around whatever you are looking at. | Left-drag; one-finger drag. | `src/services/camera/orbitControls.ts:57-60`; `src/services/camera/applyInputToCamera.ts:69-74` | shipped |
| B2 | Pan | Slide the view sideways without turning. | Right-drag or middle-drag (mouse only). | `src/services/camera/orbitControls.ts:60`; `src/services/camera/applyInputToCamera.ts:45-66` | shipped |
| B3 | Zoom | Move closer or further away. In open space you zoom toward the centre of view. | Mouse wheel. | `src/services/camera/orbitControls.ts:128-142`; `src/utils/camera/zoomedDistance.ts:17-36` | shipped |
| B4 | Trackpad pinch | Pinch on a trackpad to zoom, eight times faster than a wheel notch. | Trackpad pinch (arrives as Ctrl+wheel). | `src/services/camera/orbitControls.ts:137`; `src/data/camera/pinchWheelGain.ts:1-5` | shipped |
| B5 | Touch pinch | Spread or pinch two fingers to zoom. | Two-finger pinch. No two-finger rotate or pan. | `src/services/camera/orbitControls.ts:69-73,112-117` | shipped |
| B6 | Select | Click or tap anything to pin its information card. Clicking empty sky unpins. The view does not move. | Click / tap (less than 4 px of movement). | `src/services/camera/orbitControls.ts:38-41,86-94`; `src/services/engine/phases/wireInput.ts:200-211` | shipped |
| B7 | Hover preview | Rest the mouse on something to see a small preview card. | Mouse move (not on touch). | `src/services/engine/interaction/inputBindings.ts:101-112` | shipped |
| B8 | Fly to (double-click) | Double-click a thing to fly to it. | Double-click / double-tap. | `src/services/camera/orbitControls.ts:158-163`; `src/services/engine/phases/wireInput.ts:212-217` | shipped |
| B9 | Fly to (key) | Fly to whatever is selected. | `F`. | `src/state/input/keyboardShortcuts.ts:52-58` | shipped |
| B10 | Fly to (button) | A "Focus" button on the pinned card flies to it. | Info card → Focus. | `src/components/InfoCard/CardHeader/CardHeader.tsx:25-34` | shipped |
| B11 | Home | Fly back to Earth, sunlit side. | `H` or `E`, or the Home button (top bar). | `src/state/input/keyboardShortcuts.ts:59`; `src/components/containers/TopBarContainer.tsx:43,49` | shipped |
| B12 | Clear | Unpin the card and stop any tour, exhibit or clip. | `Esc`, or the × on the card. | `src/state/input/keyboardShortcuts.ts:51`; `src/components/InfoCard/CardHeader/CardHeader.tsx:35-45` | shipped |
| B13 | Flight | A flight to a galaxy, structure or star takes 0.6 seconds and keeps your viewing angle. | Any fly-to. | `src/services/engine/camera/focusTweenDuration.ts:11`; `src/state/camera/focusTweenDescriptor.ts:23-27` | shipped |
| B14 | Following | When you fly to something that moves (a planet, moon or spacecraft) the view keeps travelling with it as time runs. | Automatic while it stays the focus. | `src/services/engine/camera/applyFocusedBodyPivot.ts:1-10,38-45` | shipped |
| B15 | Surface mode | Close to a planet the controls change by themselves: drag the ground to slide across it, drag the sky to look around, and the ground stays put while the planet spins. | Automatic below about half a planet-radius of altitude; releases above about 0.9. | `src/services/engine/camera/rungs/bodyRung.ts:134-179`; `src/utils/camera/latchSurfaceGesture.ts:30-57` | shipped |
| B16 | Tilt | Near a surface, tip the view up toward the horizon or swing the heading. | Right-drag or middle-drag near a surface. Mouse only; no touch equivalent. | `src/utils/camera/latchSurfaceGesture.ts:34-48`; `src/utils/camera/draggedSurfacePose.ts:83-117` | shipped |
| B17 | Zoom to the cursor | Near a surface the wheel zooms toward the spot under the mouse pointer. | Mouse wheel in surface mode. | `src/utils/camera/surfaceZoomStep.ts:45-77` | shipped |
| B18 | Site view | Near a rover or the scanned park, dragging circles around it like a turntable. | Automatic close to one of five ground sites. | `src/utils/camera/steppedSitePose.ts:25-50`; `src/data/bodies/surfaceFixedSites.ts:21-78` | shipped |
| B19 | Ground floor | You cannot fly through the ground: the view is held about 15 m above the terrain (on Earth). | Automatic. | `src/utils/camera/flooredBodyPose.ts:12-32`; `src/services/engine/camera/pivotRadiusMpc.ts:42-46` | shipped |
| B20 | Zoom limits | You can pull back as far as 60 billion parsecs and no further. | Automatic. | `src/utils/camera/clampDistance.ts:58` | shipped |
| B21 | Auto-rotate | Let the view turn slowly on its own (about one turn in two minutes). | Play/pause button in the top bar. Off by default. No key. | `src/components/AutoRotateToggle/AutoRotateToggle.tsx:20-33`; `src/state/camera/cameraSlice.ts:32-37` | shipped |
| B22 | Which way is up | Choose what counts as "level": the solar system, Earth's equator, the Milky Way, or the local superclusters. The view turns over one second. | Settings → Display → Orientation, or `#orientation=`. | `src/data/orientation/orientationFrames.ts:54-63`; `src/state/camera/watchOrientationChangeSaga.ts:16-37` | shipped |
| B23 | Field of view | Make the lens wider or narrower. | Settings → Display → Field of view (0.5–100°, default 60°). | `src/components/SettingsPanel/DisplaySection.tsx:201-209`; `src/data/defaults.ts:129` | shipped |
| B24 | Hide the interface | Hide every panel and button to see only the sky. | `Tab` (press again to bring it back). | `src/state/input/keyboardShortcuts.ts:60`; `src/components/App/App.tsx:145-151` | shipped |
| B25 | Controls cheatsheet | A small "Navigation" panel lists the basic controls, with a different list on phones. It shows 6 of the desktop controls only. | Bottom-left panel; closed by default on phones. | `src/components/NavigationPanel/NavigationPanel.tsx:53-72` | shipped (incomplete, see mismatches) |

Not present (searched): keyboard flying (WASD or arrow keys), modifier-key drags (Shift/Alt/Cmd), momentum after a drag, long-press, two-finger rotate, click-a-spot-on-a-planet-to-fly-there, a user-switchable camera mode. Source: `src/services/camera/orbitControls.ts:43-75,137`; `src/services/engine/camera/controlSchemes.ts:11-13`.

## Search and the palette

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| C1 | Open search | A search box opens over the scene. | `Cmd+K`, `Ctrl+K`, `/`, or the search button in the top bar. | `src/state/input/keyboardShortcuts.ts:43-48`; `src/components/containers/TopBarContainer.tsx:39,48` | shipped |
| C2 | Browse tabs | With nothing typed, seven tabs of picture cards appear: Highlights, Solar System, Missions, Milky Way, Galaxies, Deep Space, Tours. | Open search; click a tab. Opens on Highlights. | `src/data/palette/featuredTabs.ts:95-710`; `src/state/ui/buildInitialUiState.ts:58` | shipped |
| C3 | Picture cards | 75 cards across the tabs (61 different destinations; some appear on two tabs). Clicking one flies there, opens an exhibit or starts a tour. | Click a card. | `src/data/palette/featuredTabs.ts` (75 `action: {` lines; 61 unique, `grep … sort -u`) | shipped |
| C4 | Card tooltip | Hovering a card shows a one-line description and other names it goes by. | Hover a card. | `src/components/CommandPalette/FeaturedCardTip.tsx:19-31` | shipped |
| C5 | Keyboard browsing | Arrow keys move across the card grid; Enter opens the highlighted card. | Arrows, Enter (with the text box focused and empty). | `src/components/CommandPalette/usePaletteSearch.ts:138-148` | shipped |
| C6 | Switch tabs by key | Jump to the previous or next tab. | `Alt+←` / `Alt+→` (`⌥` on a Mac). | `src/components/CommandPalette/usePaletteSearch.ts:133-137` | shipped |
| C7 | Search famous galaxies | Type a name or catalogue number ("Andromeda", "M31") to find one of the 81 famous galaxies. | Type. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:79-84` | shipped |
| C8 | Search planets, moons and spacecraft | Type "Titan", "Hubble" or a nickname ("Percy", "HST"). | Type. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:99-105`; `src/data/bodies/bodySearchNames.ts:12-24` | shipped |
| C9 | Search stars | Type a star's name or its formal designation ("Alpha Canis Majoris" finds Sirius). | Type. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:107-123` | shipped |
| C10 | Search places on Earth | Type one of 18 places ("Paris", "Everest", "Giza") and the view drops to a few kilometres above it. | Type; the flight takes 1.5 s. | `src/data/palette/earthPlaces.ts:12-49`; `src/components/containers/CommandPaletteContainer.tsx:45-55`; `src/data/camera/flyToLonLatTweenMs.ts:3` | shipped |
| C11 | Search any catalogued galaxy | Type an NGC, IC, UGC or similar number to find tens of thousands of ordinary galaxies. At most 50 results are shown. | Type. Needs the catalogues to have loaded. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:43,189-199`; `data/pgc_aliases.json` (48,667 keys) | shipped |
| C12 | Search structures | Type a cluster, supercluster, void or group name, or an Abell number ("Coma", "A1656"). At most 50 shown. | Type. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:50,205-220` | shipped |
| C13 | Search exhibits and tours | Type "Cosmic Web" or "The Long Way Out" to open one. | Type. The demo tour is hidden from search. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:130-146` | shipped |
| C14 | Milky Way result | "Milky Way" always has its own result. | Type. | `src/components/CommandPalette/utils/rankPaletteMatches.ts:71-77` | shipped |
| C15 | Black hole result | "Sgr A*" or "Galactic Centre" finds the central black hole. | Type. | `src/layers/blackHoles/present/blackHoleSearch.ts:15-17`; `src/components/CommandPalette/utils/rankPaletteMatches.ts:160-172` | shipped |
| C16 | Results by keyboard | Up/Down move through results (wrapping round); Enter goes. | `↑` `↓` Enter. | `src/components/CommandPalette/usePaletteSearch.ts:152-166` | shipped |
| C17 | Close search | Close without choosing. | `Esc`, or click outside the box. | `src/components/CommandPalette/usePaletteSearch.ts:123-127`; `src/components/CommandPalette/CommandPalette.tsx:155` | shipped |

Result order: Milky Way first, then named things (famous galaxies, planets, moons, spacecraft, stars, places, exhibits, tours, the black hole) by match quality, then ordinary catalogue galaxies, then structures. Source: `src/components/CommandPalette/utils/rankPaletteMatches.ts:179-227`.

## Time

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| D1 | Live clock | The scene starts at the real current moment and runs at real speed, so planets are where they are right now. | Default. | `src/state/time/timeSlice.ts:43-54` | shipped |
| D2 | Clock readout | The date and time of the scene, in UTC, e.g. `2026-11-03 18:00 UTC`. | Bottom right; controls appear when you hover or use it. | `src/utils/time/formatSimClock.ts:22-30`; `src/components/TimeBar/TimeBar.tsx:10-22` | shipped |
| D3 | Jump to a date | Pick any date and time; the clock lands there, paused. | Click the readout → date box → Enter. A "now" button fills in the present. | `src/components/containers/TimeBarContainer.tsx:153-159`; `src/components/TimeBar/DateEntryPopover/DateEntryPopover.tsx:113-124` | shipped |
| D4 | Speed up or slow down | Step through 15 speeds from real time (1 second per second) to 10 years per second. Hold the button to keep stepping. | `‹` / `›` buttons, or `[` / `]`. | `src/data/time/rateLadder.ts:37-53`; `src/components/TimeBar/TimeBar.tsx:53-110`; `src/state/input/keyboardShortcuts.ts:63-64` | shipped |
| D5 | Pick a speed | Choose a speed straight from a list. | Click the speed label. | `src/components/containers/TimeBarContainer.tsx:142-148`; `src/components/TimeBar/RateSelectorPopover/RateSelectorPopover.tsx:57-68` | shipped |
| D6 | Pause and resume | Freeze the scene's clock, or start it again. | `▶` / `❚❚` button, or `\`. | `src/components/TimeBar/TimeBar.tsx:248-257`; `src/state/input/keyboardShortcuts.ts:65-71` | shipped |
| D7 | Back to now | Return to the real present at real speed. | "Now" button (only shown once you have changed the time), or `Shift+N`. | `src/components/TimeBar/TimeBar.tsx:203-215`; `src/state/input/keyboardShortcuts.ts:72` | shipped |
| D8 | Time in the link | Once you pause or set a date, the address bar carries that instant, so a shared link opens on the same moment, paused. | Automatic; `#t=<ISO time>`. | `src/state/url/hashParamSources.ts:194-208` | shipped |
| D9 | Time bar hides | The time bar disappears while search or the welcome screen is open. | Automatic. | `src/components/App/App.tsx:159` | shipped |
| D10 | Running time backwards | The clock can run in reverse internally, but nothing lets a visitor switch it on. | No control. | `src/state/time/timeSlice.ts:80-83` (`setDirection` has no caller outside the slice) | partial (state only, no UI) |

## Tours, clips and exhibits

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| E1 | "The Long Way Out" | A narrated flight in 14 captioned steps from the Milky Way out to the edge of the observable universe and home again. | Welcome screen → Tour; Search → Tours tab; `#tour=grandTour`. | `src/data/animation/tours/grandTour.ts:33-173` (14 beats, counted captions); `src/components/containers/SplashContainer.tsx:29-32` | shipped |
| E2 | "Named Cosmic Web" | A short 3-step tour: the Milky Way, the Virgo Cluster, then the galaxy M87. | Search → Tours tab; `#tour=webShowcase`. | `src/data/animation/tours/webShowcase.ts:63-86` | shipped |
| E3 | Demo tour | A 3-step test tour (Milky Way, Virgo, Laniakea). | Debug panel, or `#tour=demo`. Hidden from search. | `src/data/animation/tours/demoTour.ts:30-63` | dev-only |
| E4 | Tour captions | Each step shows a title and a sentence or two once the view has arrived. | Automatic during a tour. | `src/components/TourOverlay/TourOverlay.tsx:86-121` | shipped |
| E5 | Tour controls | Previous, pause/resume, next and exit buttons stay on screen. | Buttons, or `←` `→` `Space` `Esc`. | `src/components/TourOverlay/TourNav.tsx:69,99`; `src/state/input/keyboardShortcuts.ts:77-79` | shipped |
| E6 | Tour progress rail | A row of marks shows which step you are on. | Automatic during a tour. | `src/components/TourBeatRail/TourBeatRail.tsx:35` | shipped |
| E7 | Exhibit: Solar System | Looks down on the planets and their orbits from above. | Search (Highlights tab) or `#exhibit=solarSystem`. | `src/data/exhibits/solarSystem.ts:35-98` | shipped |
| E8 | Exhibit: Cosmic Flows | Hides the galaxies and shows only the flow ribbons around our neighbourhood. | Search or `#exhibit=cosmicFlows`. | `src/data/exhibits/cosmicFlows.ts:31-108` | shipped |
| E9 | Exhibit: Cosmic Web | Hides the galaxies and shows only the glowing web, with a second all-sky version switched on. | Search or `#exhibit=cosmicWeb`. | `src/data/exhibits/cosmicWeb.ts:30-109` | shipped |
| E10 | Exhibit: Zone of Avoidance | Frames the Milky Way from just outside so the hidden band cuts across the galaxy field. | Search (Milky Way tab) or `#exhibit=zoneOfAvoidance`. | `src/data/exhibits/zoneOfAvoidance.ts:63-113` | shipped |
| E11 | Exhibit: Observable Universe | Pulls back until the whole edge-of-the-universe sphere fits the screen, whatever its shape. | Search or `#exhibit=observableUniverse`. | `src/data/exhibits/observableUniverse.ts:13-59` | shipped |
| E12 | Exhibit notes | Each exhibit shows a headline, a paragraph, "what you're seeing" and "how it was made" notes, a small facts table and links to the sources. Two have a colour key with a "Galaxies shown/hidden" switch. | Automatic; "Exit view" button or `Esc` leaves. | `src/components/ExhibitOverlay/ExhibitOverlay.tsx:46-79`; `src/data/exhibits/cosmicWeb.ts:54-68` | shipped |
| E13 | Clips | 26 scripted camera moves: 10 stand-alone (for example "Earth to the Edge", "Fly to Horizon", "Perseverance to Søndermarken") and 16 that are the steps of the grand tour. | `#clip=<id>`, or the debug panel. Not in search, no card. | `src/data/animation/clips/clipRegistry.ts:63-91` (26 keys, counted) | shipped by link; otherwise dev-only |
| E14 | Takeover behaviour | While a tour or exhibit runs, the normal panels disappear and dragging is ignored; leaving puts your settings back as they were. A clip keeps the panels. | Automatic. | `src/components/App/App.tsx:85-89,145-151`; `src/services/engine/camera/replayInput.ts:118-125` | shipped |
| E15 | Start-up on a tour or exhibit link | A link to a tour, exhibit or clip opens straight into it, without the welcome screen. | `#tour=`, `#exhibit=`, `#clip=`. | `src/state/navigation/navigateSaga.ts:147-166` | shipped |
| E16 | Tour quick-start button | An extra top-bar button that starts the grand tour at once. | `?tour` in the address. | `src/components/containers/TopBarContainer.tsx:24-26,52`; `src/components/containers/TourDebugPillContainer.tsx:1-10` | flagged (marked temporary in code) |

## Sharing and links

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| F1 | Link to a thing | The address bar always names what you have flown to, so copying it shares that destination. | Automatic; `#focus=<id>`. Earth (home) leaves the address bare. | `src/state/url/hashParamSources.ts:116-168`; `src/services/url/urlHashFor.ts:25-52` | shipped |
| F2 | Link to a moment | See D8. | `#t=`. | `src/state/url/hashParamSources.ts:194-208` | shipped |
| F3 | Link to an "up" direction | A non-default orientation rides in the link. It does not by itself skip the welcome screen. | `#orientation=`. | `src/state/url/hashParamSources.ts:229-250` | shipped |
| F4 | Link to an exact camera | A link can carry the exact camera position and angle. The app reads it but never writes it into the address bar on its own. | `#pose=`; made with `L` or the debug panel. | `src/state/url/hashParamSources.ts:261-275`; `src/utils/url/decodeFramedPose.ts:20-70` | shipped (read); creating one is dev-only |
| F5 | Link to an exhibit | The address bar shows the running exhibit; reloading or sharing reopens it. | `#exhibit=<id>`. | `src/state/url/hashParamSources.ts:287-298,305` | shipped |
| F6 | Link to a tour | Same, for a tour. | `#tour=<id>`. | `src/state/url/hashParamSources.ts:306` | shipped |
| F7 | Link to a clip | Same, for a clip. | `#clip=<id>`. | `src/state/url/hashParamSources.ts:307` | shipped |
| F8 | Back and Forward | The browser's Back and Forward buttons step through the places you have been; the view flies between them. | Browser buttons, or editing the address by hand. | `src/state/url/watchHashReadSaga.ts:102-111`; `src/state/navigation/navigateSaga.ts:122-146` | shipped |
| F9 | Print a share link | Prints a full link (thing + exact time + exact camera) and a camera read-out to the browser console. | `L`. | `src/state/input/keyboardShortcuts.ts:61`; `src/state/url/shareUrlFor.ts:17-27` | dev-only |
| F10 | Copy a share link | The same link, copied to the clipboard. | Debug panel → Camera → "copy URL". | `src/components/DebugPanel/CameraStateSection.tsx:82` | dev-only |
| F11 | Arrival cover | A link opens behind a dark cover with a progress line, which lifts once the view sits on the linked thing, so you never see the wrong place first. | Any link with `focus`, `t`, `pose`, `exhibit`, `tour` or `clip` (or `?tour`). | `src/components/ArrivalVeil/ArrivalVeil.tsx:1-28`; `src/components/containers/ArrivalVeilContainer.tsx:20-25` | shipped |
| F12 | Links skip the welcome screen | A link to something specific goes straight there. | Same links as F11. | `src/utils/url/hasDeepLink.ts:49-73`; `src/state/ui/buildInitialUiState.ts:44-52` | shipped |
| F13 | Bad or slow links | A link to something that does not exist, or that takes more than 30 seconds, falls back to the home view. | Automatic. | `src/state/navigation/navigateSaga.ts:52-53,78-80`; `src/data/arrival/arrivalTimeoutMs.ts` (`ARRIVAL_TIMEOUT_MS = 30_000`) | shipped |

There is no share button and no copy-link button in the visitor interface; sharing is "copy the address bar". Source: no such control in `src/components/containers/TopBarContainer.tsx:46-54` or any info card.

## Settings

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| G1 | Settings panel | A panel of grouped switches and sliders, each group folding open and shut. Open by default on desktop, closed on phones. | Bottom-left "Settings" panel. | `src/components/SettingsPanel/SettingsPanel.tsx:40-55`; `src/components/containers/SettingsPanelContainer.tsx:17-18` | shipped |
| G2 | Data amount | Choose Small, Medium or Large: how many galaxies and stars are loaded. | "Tier" chip in the Settings header. | `src/components/SettingsPanel/TierChip.tsx:54-89` | shipped |
| G3 | Galaxies (16 controls) | Switch each of the eight galaxy catalogues on or off; under Advanced, change dot size, brightness, and how the surveys' blind spots are corrected. | Settings → Galaxies. | `src/layers/galaxyCatalog/ui/GalaxiesSection.tsx:111-258` | shipped |
| G4 | Stars (13 controls) | Switch the four star sets on or off; under Advanced, size, brightness, detail and exposure. | Settings → Stars. | `src/layers/starCatalog/ui/StarsSection.tsx:135-296` | shipped |
| G5 | Cosmic web density (4) | Switch the glowing web and each of its three versions on or off. | Settings → Cosmic web density. | `src/layers/cosmicWebDensity/ui/CosmicWebDensitySection.tsx:29-33` | shipped |
| G6 | Cosmic web filaments (2) | Switch the filament lines on, and set their brightness. | Settings → Cosmic web filaments. | `src/layers/cosmicWebFilaments/ui/CosmicWebFilamentsSection.tsx:30-48` | shipped |
| G7 | Flow (2) | Switch the flow ribbons on, and set their brightness. | Settings → Flow. | `src/layers/flow/ui/FlowSection.tsx:48-52`; `src/layers/flow/ui/FlowRow.tsx:45-66` | shipped |
| G8 | Structures (5) | Switch the rings for clusters, superclusters, voids and groups. | Settings → Structures. | `src/components/SettingsPanel/StructuresSection.tsx:65-111` | shipped |
| G9 | Labels & Guides (17) | Switch each kind of name label, plus orbit paths, the Zone of Avoidance, the Local Bubble and constellations. | Settings → Labels & Guides. | `src/components/containers/LabelsAndGuidesSectionContainer.tsx:142-172` | shipped |
| G10 | Display (4) | Choose which way is up, how bright highlights are squeezed, overall brightness, and the lens angle. | Settings → Display. | `src/components/SettingsPanel/DisplaySection.tsx:154-209` | shipped |
| G11 | Bloom (3) | Switch the soft glow around bright things, and set how strong it is and where it starts. | Settings → Display → Bloom. | `src/components/SettingsPanel/DisplaySection.tsx:212-240` | shipped |
| G12 | HDR (3) | On a screen that supports it, let highlights go brighter than normal white. The switch is greyed out, with a hint, on screens that do not. | Settings → Display → HDR. Off by default. | `src/components/SettingsPanel/DisplaySection.tsx:248-278`; `src/components/SettingsPanel/CollapsibleSection.tsx:154-167` | shipped |
| G13 | Earth (3) | Tune Earth's air glow, how dark its night side is, and how wide the Sun's glint on the sea is. | Settings → Display → Earth. | `src/components/SettingsPanel/EarthSection.tsx:63-93` | shipped |
| G14 | Settings are not remembered | Every setting returns to its default when the page is reloaded. Only "have I seen the welcome screen" is saved in the browser; the orientation alone travels in the link. | — | `src/state/persistedValues.ts:8-18`; `src/state/url/hashParamSources.ts:229-250` | shipped (by design or gap: see Gaps) |

All 73 controls with defaults and ranges are in reference table (c).

## Cards and information

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| H1 | Preview card | A small card names what is under the mouse. | Hover (desktop). | `src/components/InfoCard/InfoCard.tsx:88-99` | shipped |
| H2 | Pinned card | A full card stays open for the selected thing, marked "Pinned", with a Focus button and a close ×. Hovering something else shows its preview underneath. | Click a thing. | `src/components/InfoCard/CardHeader/CardHeader.tsx:20-48` | shipped |
| H3 | Galaxy card | Name and nicknames, a photo, a description (famous ones), how long ago its light left and what Earth was like then, distance and speed away, type, links to catalogues; under "More details": sky coordinates, brightness, colour, tilt, catalogue number. | Select a galaxy. | `src/components/InfoCard/GalaxyDetailCard/GalaxyDetailCard.tsx:54-218` | shipped |
| H4 | Star card | Constellation, distance and brightness; for famous stars also type, temperature, luminosity, size, mass, age and variability with a Wikipedia link; for ordinary Gaia stars brightness, colour and estimated temperature, luminosity and size. | Select a star. | `src/components/InfoCard/StarDetailCard/StarDetailCard.tsx:57-141,204-261` | shipped |
| H5 | Black-hole-orbit card | For a star circling the black hole: what it orbits, how long an orbit takes, how stretched it is, its closest approach and top speed. | Select an S-star. | `src/components/InfoCard/StarDetailCard/StarDetailCard.tsx:158-167` | shipped |
| H6 | Planet, moon and spacecraft card | A picture, radius, mass, gravity, day length, distance and orbit time, average temperature, number of moons, tilt, atmosphere, and a Wikipedia link. 43 objects have a fact sheet; the scanned park has none. | Select a body. | `src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx:83-187`; `data/seeds/planet_facts.seed.json` (43 entries) | shipped |
| H7 | Structure card | Kind (cluster, supercluster, void or group), distance, size, how many catalogued galaxies it contains, and its Abell number if it has one. | Select a ring or its label. | `src/components/InfoCard/StructureDetailCard/StructureDetailCard.tsx:56-77` | shipped |
| H8 | Milky Way card | Diameter, number of stars, mass, age of its oldest stars, how long one turn takes, and its black hole. | Select the Milky Way. | `src/layers/milkyWay/ui/MilkyWayDetailCard/MilkyWayDetailCard.tsx:67-104` | shipped |
| H9 | Black hole card | Name, mass in millions of Suns, size and distance, with a Wikipedia link. | Select Sgr A*. | `src/layers/blackHoles/ui/BlackHoleDetailCard/BlackHoleDetailCard.tsx:50-61` | shipped |
| H10 | Zone of Avoidance card | A short explanation with a Wikipedia link. It can be selected but not flown to. | Click the band. | `src/layers/zoneOfAvoidance/ui/ZoneOfAvoidanceDetailCard/ZoneOfAvoidanceDetailCard.tsx:41-44`; `src/services/engine/helpers/rowFocusable.ts:12-21` | shipped |
| H11 | Explain-this tooltips | Underlined terms on the cards ("Redshift z", "Light left", "Absolute mag") open a short plain explanation. | Hover or focus an underlined label. | `src/components/InfoCard/tooltips.tsx` (47 entries, `grep -c` of top-level keys) | shipped |
| H12 | Phone card | On a phone the card is a sheet that slides up from the bottom, with a short and a tall position; there is no hover preview. | Tap a thing on a narrow screen (768 px or less). | `src/components/InfoCard/InfoCard.tsx:69-78`; `src/components/InfoCard/MobileSheet/MobileSheet.tsx:1-12` | shipped |

Outbound links on galaxy cards go to SDSS Explorer or NASA/IPAC NED, plus Wikipedia for famous galaxies; the photo links to an external sky viewer. Source: `src/services/engine/helpers/buildGalaxyInfo.ts:113-132`; `src/components/InfoCard/GalaxyDetailCard/GalaxyDetailCard.tsx:71-76`.

## Display rigs and quality

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| I1 | Normal view | One ordinary flat view filling the window. | Default. | `src/data/rendering/viewRigs.ts:14-19` | shipped |
| I2 | Dome view | A circular fisheye picture for a planetarium dome: half the sky, tilted up 60°, in a square. Labels are not drawn and clicking things is switched off. | `?dome` in the address (needs a reload). | `src/services/engine/engine.ts:278`; `src/data/rendering/viewRigs.ts:20-27`; `src/data/rendering/domeParams.ts:6-11` | flagged |
| I3 | Three data sizes | Small, Medium and Large change how many galaxies and stars load. Example: the SDSS survey is absent on Small, 156,000 galaxies on Medium, 500,000 on Large. | Tier chip (G2). | `src/data/tierLadder.ts:4`; `src/layers/galaxyCatalog/sources/sdss.ts:28`, `glade.ts:27`, `milliquas.ts:47` | shipped |
| I4 | Automatic size choice | Narrow screens (under 768 px) start on Small, everything else on Medium. Large is never chosen for you. | On load. | `src/utils/initialTierFromViewport.ts:29-35`; `src/main.tsx:90-92` | shipped |
| I5 | HDR screens | See G12. Detected automatically; the switch stays off until you turn it on. | Settings. | `src/data/defaults.ts:25` | shipped |
| I6 | Film mode | The page shows only the picture and tour captions: no buttons, panels or welcome screen. Made for recording video. | `?cinema` in the address. | `src/components/App/App.tsx:122-136`; `src/state/ui/buildInitialUiState.ts:44-45` | flagged |
| I7 | Phone layout | On narrow screens the panels start closed, the cheatsheet lists touch gestures, and the card becomes a bottom sheet. | Automatic at 768 px. | `src/hooks/useIsMobile.ts:33-59`; `src/components/NavigationPanel/NavigationPanel.tsx:65-72` | shipped |
| I8 | VR / headset view | Not available. | — | No `navigator.xr`, `XRSession` or stereo code in `src/` (only comments about a hypothetical future view, e.g. `src/services/engine/frame/runFrame.ts:278`) | not present |

## Loading, splash and browser support

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| J1 | Welcome screen | A title ("Welcome to the universe"), two short paragraphs, and two buttons: Explore and Tour, over the live scene. Data credits and the author sit underneath. | First visit. | `src/components/Splash/Splash.tsx:127-224`; `src/components/Splash/Splash.constants.ts:27-56` | shipped |
| J2 | Shown once | After you dismiss it, the welcome screen does not come back on later visits (remembered in the browser under `skymap.splash.seenVersion`, version 1). | Automatic. | `src/state/persistedValues.ts:8-16`; `src/state/ui/splashStorage.ts:17` | shipped |
| J3 | Reopen "About" | An "i" button brings the welcome screen back. | Top bar → About. | `src/components/Splash/AboutPill.tsx:20`; `src/components/containers/TopBarContainer.tsx:44,51` | shipped |
| J4 | Wait for data | Explore and Tour stay greyed out, with a progress line, until the picture is ready. After 8 seconds a "Continue anyway" link appears. | Automatic. | `src/hooks/useSplash.ts:69-70,94-116`; `src/components/Splash/Splash.tsx:182-191,227` | shipped |
| J5 | Dismiss | Explore, `Esc`, or a click outside the text closes the welcome screen. | — | `src/components/Splash/Splash.tsx:82-87,111-113` | shipped |
| J6 | Start-up errors | Three plain messages with a Reload button: the graphics system failed to start, the data failed to download, or the app was updated and needs a reload. | Automatic. | `src/components/Splash/Splash.constants.ts:18-24`; `src/hooks/useSplash.ts:155-166` | shipped |
| J7 | Download progress strip | A thin glowing line at the very top of the window shows data downloading. | Automatic. | `src/components/LoadingBar/LoadingBar.tsx:1-20` | shipped |
| J8 | Error line | If the picture cannot run, a red "ERROR: …" line appears top-left. Nothing is shown when all is well. | Automatic. | `src/components/StatusBar/StatusBar.tsx:22-29` | shipped |
| J9 | Unsupported-browser page | A browser without WebGPU gets a simple page: "Skymap needs WebGPU", advice to use a recent Chrome or Edge, and a link to a live support table. | Automatic when `navigator.gpu` is missing. | `src/unsupportedPage.ts:32-74`; `src/main.tsx:80-83` | shipped |
| J10 | Visit counting | Page views are counted by a cookieless tracker hosted by the project itself, in the live build only (also on the unsupported-browser page). | Automatic in production. | `src/utils/analytics/injectAnalytics.ts:19-30`; `src/main.tsx:75-78` | shipped |

## Tool pages

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| K1 | Galaxy Explorer (`/galaxy/`) | Build one galaxy from sliders: pick a type on the Hubble sequence, shape the arms, dust and star-forming regions, and compare with photos of eight real galaxies. | `https://skymap.rulkens.com/galaxy/`; locally `npm run galaxy-renderer` (port 5400). | `tools/utils/io/toolPages.ts:8`; `tools/galaxy-renderer/vite.config.ts:31,34`; `tools/galaxy-renderer/src/ui/ControlsPanel/ControlsPanel.tsx:503-908` | shipped (separate page, not linked from the app) |
| K2 | MCPM Workbench (`/mcpm/`) | Run the "slime mould" simulation that grows a cosmic web between real galaxies, live, and export the result. | `/mcpm/`; locally `npm run mcpm-workbench` (port 5500). | `tools/utils/io/toolPages.ts:9`; `tools/mcpm-workbench/src/ui/ControlsPanel/ControlsPanel.tsx:140-483` | shipped (separate page) |
| K3 | Flow Workbench (`/flow/`) | Watch particles drift through the measured galaxy-flow field, as moving dots or as streamlines, with 13 named landmarks. | `/flow/`; locally `npm run flow-workbench` (port 5300). | `tools/utils/io/toolPages.ts:10`; `tools/flow-workbench/src/ui/ControlsPanel/ControlsPanel.tsx:42-122` | shipped (separate page) |
| K4 | Scene Workbench | View laser scans, "Gaussian splat" captures and textured 3D scans of real places, and draw crop outlines on them. | Local only: `npm run scene-workbench` (port 5600). | `tools/scene-workbench/vite.config.ts:19-33`; `package.json:77-78` | dev-only (not deployed) |
| K5 | Famous-galaxy curator | Fetch a photo of a famous galaxy, crop it, mark its disc, remove foreground stars and save it for the app. | Local only: `npm run curate-famous` (port 5200). | `tools/famous-curator/vite.config.ts:22-31`; `tools/famous-curator/ui/App.tsx:439-520` | dev-only (not deployed) |
| K6 | Structure audit page | A single report page about the code itself: which parts import which, cycles, convention and test gaps. | Local only: `npm run structure-audit`, then open the generated file. | `tools/structure-audit/structureAuditDefaults.ts:5` | dev-only |

The procedural galaxy on `/galaxy/` (generator "v2") is not what the main app draws. The main app's Milky Way uses the older "v1" star-sprite generator; the v2 renderer's only caller is the tool. Source: `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts:161`; `src/layers/milkyWay/create.ts` (v1 imports); `src/services/engine/galaxyGenerator/v2/README.md`.

## Command-line tools

All CLI. All of the browser-driving ones need Playwright's Chromium (`npx playwright install chromium`), source `tools/utils/browser/launchChromium.ts:11-25`.

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| L1 | Record a tour | Renders a tour to a video file, frame by frame, at 4K by default. | `npm run record-tour -- [tourId] [--beats a..b] [--fps 60] [--size 3840x2160] [--dpr 1] [--sim-time ISO] [--dome] [--serve] [--out file]`. Needs ffmpeg. | `tools/record/record.ts:184-351`; `package.json:117` | CLI |
| L2 | Record a clip | The same, for a single camera clip. | `npm run record-clip -- <clipId> …`. | `package.json:118`; `tools/record/record.ts:243,300-308` | CLI |
| L3 | Screenshot a link | Turns any skymap link into a picture file. | `npm run shot -- '<link>' [--size 1600x900] [--dpr 2] [--hide-ui] [--hide-labels] [--png] [--timeout 30] [--out file] [--url base] [--build]`. | `tools/shot/parseShotArgs.ts:27-73`; `tools/shot/shot.ts:20-83` | CLI |
| L4 | Measure speed | Times how long the graphics card spends on each part of the picture in 11 fixed scenes. | `npm run perf -- [--scenario name] [--dpr 2] [--frames 30] [--tier t] [--sweep] [--compare-tiers] [--json] [--url base]`. Needs a running dev server. | `tools/perf/measurePerf.ts:121-183`; `tools/perf/perfScenarios.ts:73-224` | CLI |
| L5 | Make the search-card pictures | Takes the small pictures used on the search cards. | `npm run capture-featured -- [--url base] [--force id…]`. Needs a running dev server. | `tools/capture/parseFeaturedArgs.ts:4-24`; `tools/capture/capture.ts:31-53` | CLI |
| L6 | Tour length | Prints how many seconds each step of a tour takes. | `npm run tour-length -- [tourId]`. | `tools/animation/tourLength.ts:24-50` | CLI |
| L7 | Download ready-made data | Downloads the same data files the live site uses, so a fresh copy of the code can run. | `npm run fetch-data [-- --dry-run]`. | `tools/fetch/fetchPrebuiltData.ts:1-4,63`; `package.json:94` | CLI |
| L8 | Rebuild data from raw surveys | About 40 scripts that download the raw catalogues and textures and build the app's data files (`fetch-*`, `build-*`). | e.g. `npm run build-all`, `build-stars`, `build-famous`, `build-structures`, `build-filaments`, `build-textures`, `build-surface-tiles`, `build-meshes`. Some need extra programs (DisPerSE, Blender, cargo). | `package.json:34-66,92-107`; `tools/catalog/buildAllBins.ts:3-13` | CLI |
| L9 | Code structure report | Writes the report in K6. | `npm run structure-audit`. | `tools/structure-audit/structureAudit.ts:29-83` | CLI |
| L10 | Tool-page self-checks | Opens a tool page without a window and reports graphics errors. | `npm run galaxy-renderer:probe`, `mcpm-workbench:probe`, `scene-workbench:probe` (`--url`, `--headed`). | `tools/galaxy-renderer/probeGpuErrors.ts:177-188`; `package.json:72,75,78` | CLI |
| L11 | Scan-processing bakes | Turn laser scans and aerial photos of a real place into the files the Scene Workbench shows. | `npm run bake-lidar`, `bake-splats`, `bake-mesh`, `crop-mesh`, `repack-atlas` (`--group <id>`). Need PDAL, COLMAP/OpenMVS, brush. | `package.json:79-83`; `tools/scene-recon/bakeLidar.ts:172-188` | CLI |
| L12 | Publish | Push the code and upload data files to storage. | `npm run deploy`, `sync-r2`, `sync-r2-secure`, `r2-cors`. | `package.json:86,116,122-123` | CLI (owner only) |

## Developer panels

All developer-facing. The debug panel has no build-time gate: pressing `D` opens it on the live site too (`src/state/input/keyboardShortcuts.ts:62`; `src/components/App/App.tsx:169-178`).

| # | Feature | What the user sees or does | How it is triggered | Source | Status |
|---|---|---|---|---|---|
| M1 | Asset loading | Every data file with its state, size and load time; reload or cancel buttons per file. | `D` → Asset Loading. | `src/components/DebugPanel/AssetLoadingSection.tsx:55-91`; `src/components/DebugPanel/SlotRow.tsx:56-85` | dev-only |
| M2 | Frame rate | Frames per second and processor time per frame. | `D`. | `src/components/DebugPanel/FrameStatsRow.tsx:27-42` | dev-only |
| M3 | GPU timings | Time spent per drawing step, with small graphs. Without the flag it only shows a note on how to turn it on. | `D` → GPU Timings, plus `?gpuTimings`. | `src/components/DebugPanel/GpuTimingsSection.tsx:120-190`; `src/services/engine/phases/initGpu.ts:65-69` | dev-only, flagged |
| M4 | Memory | Graphics memory by owner and script memory. | `D` → Memory. | `src/components/DebugPanel/MemorySection.tsx:46-76` | dev-only |
| M5 | Camera read-out | Live camera numbers; buttons "copy URL", "copy JSON", "clear peaks", "copy view pose". | `D` → Camera. | `src/components/DebugPanel/CameraStateSection.tsx:64-173` | dev-only |
| M6 | Camera hand-over tuning | Sliders for the altitudes at which surface mode and site view switch on and off. | `D` → Camera. | `src/components/DebugPanel/OrientationTuning.tsx:53-151`; `src/data/camera/cameraTuning.ts:11-36` | dev-only |
| M7 | Drawing-step switches | A checkbox per drawing step, to hide parts of the picture. | `D` → Renderer Toggles. | `src/components/DebugPanel/RenderTogglesSection.tsx:67-88` | dev-only |
| M8 | Cosmic web look | Per field: intensity, contrast, trim, density, exposure and colour palette. | `D` → Cosmic web density (tuning). | `src/layers/cosmicWebDensity/ui/DensityFieldTuningRow.tsx:14-97` | dev-only |
| M9 | Flow tuning | Particle count, trail length, speed, density bias, wander, edge fade. | `D` → Flow tuning. | `src/layers/flow/ui/FlowTuningSection.tsx:29-39`; `src/data/flow/flowFields.ts:45-98` | dev-only |
| M10 | Zone of Avoidance tuning | Intensity, falloff, edge sharpness, two colours. | `D` → Zone of Avoidance tuning. | `src/layers/zoneOfAvoidance/ui/ZoneOfAvoidanceTuningSection.tsx:32-72` | dev-only |
| M11 | Local Bubble tuning | Brightness. | `D` → Local Bubble tuning. | `src/layers/localBubble/ui/LocalBubbleTuningSectionContainer.tsx:22-29` | dev-only |
| M12 | Black hole tuning | Ten sliders, a resolution choice and a colour for the disc and the bent light. | `D` → Sgr A* lens tuning. | `src/layers/blackHoles/ui/BlackHoleLensingTuningSection.tsx:31-78` | dev-only |
| M13 | Milky Way tuning | Star size, exposure, star count and five more. | `D` → Milky Way tuning. | `src/layers/milkyWay/ui/MilkyWayTuningSection.tsx:32-43`; `src/data/milkyWay/milkyWaySliderFields.ts:27-131` | dev-only |
| M14 | Diagnostic overlays | Show the click-detection picture, an orbit-path test shape, and a surface-detail colour overlay. | `D` → Debug Overlays. | `src/components/DebugPanel/DebugOverlaysSection.tsx:13-24`; `src/data/debug/debugOverlayRows.ts:20-22` | dev-only |
| M15 | Surface tiles and fly-to | Type a longitude and latitude to fly there on any body; ten presets (six on Earth, four on Mars); tile-streaming read-outs. | `D` → Surface Tiles. | `src/components/DebugPanel/SurfaceTileAtlasSection.tsx:79-199`; `src/data/debug/flyToPresets.ts:11-94` | dev-only |
| M16 | Terrain pick marker | Drops a ball where the mouse meets the ground and reads its height. | `D` → Terrain pick marker. | `src/components/DebugPanel/TerrainPickMarkerTuningSection.tsx:59-71` | dev-only |
| M17 | Galaxy provenance | Shows which galaxies have a measured tilt and size and which were filled in, and can highlight or filter them. | `D` → Galaxy Provenance. | `src/components/DebugPanel/GalaxyProvenanceSection.tsx:53-149` | dev-only |
| M18 | Clips & Tours | A play button for each of the 26 clips and 3 tours, and Stop. | `D` → Clips & Tours. | `src/components/DebugPanel/ClipTriggersSection.tsx:54-55,73-107` | dev-only |
| M19 | Clip path inspector | Draws a clip's camera path, lets you scrub along it and adjust its easing, then play it. | `D` → Clip Path Inspector. | `src/components/DebugPanel/ClipPathInspectorSection.tsx:125-368` | dev-only |
| M20 | Measurement hook | Lets the speed-measuring script drive the page. | `?perf` in the address. | `src/state/perf/installPerfHook.ts:1-10,108`; `src/utils/url/isPerfSearch.ts:18-19` | dev-only, flagged |
| M21 | Recording hook | Lets the video recorder start tours and clips on the page. | `?cinema` in the address. | `src/state/recorder/installRecorderHook.ts:1-10,92` | dev-only, flagged |

---

## Complete reference tables

### (a) Every keyboard and mouse/touch binding

**Global keys** — the table in `src/state/input/keyboardShortcuts.ts:42-80`: 15 entries binding 17 keys (counted by reading the array). They do not fire while you are typing in a text box (`src/services/input/createKeyboardListener.ts:20-27`).

| Key | What it does | Line |
|---|---|---|
| `Cmd+K` / `Ctrl+K` | Open search | `:43` |
| `/` | Open search (if not already open) | `:44-48` |
| `Esc` | Clear the selection and leave any tour, exhibit or clip | `:51` |
| `F` | Fly to the selected thing | `:52-58` |
| `H` / `E` | Home: fly to Earth | `:59` |
| `Tab` | Hide or show the whole interface | `:60` |
| `L` | Print camera details and a share link to the console (developer) | `:61` |
| `D` | Open or close the debug panel (developer) | `:62` |
| `[` | Slower time | `:63` |
| `]` | Faster time | `:64` |
| `\` | Pause / resume time | `:65-71` |
| `Shift+N` | Back to now | `:72` |
| `→` | Tour: next step (only during a tour) | `:77` |
| `←` | Tour: previous step (only during a tour) | `:78` |
| `Space` | Tour: pause / resume (only during a tour) | `:79` |

**Keys inside a particular box**

| Where | Key | What it does | Source |
|---|---|---|---|
| Search, nothing typed | Arrows | Move across the card grid | `src/components/CommandPalette/usePaletteSearch.ts:138-143` |
| Search, nothing typed | `Alt+←` / `Alt+→` | Previous / next tab | `:133-137` |
| Search, nothing typed | Enter | Open the highlighted card | `:144-148` |
| Search, with text | `↑` / `↓` | Move through results (wraps) | `:152-161` |
| Search, with text | Enter | Go to the highlighted result | `:162-166` |
| Search | `Esc` | Close | `:123-127` |
| Welcome screen | `Esc` | Dismiss (same as Explore) | `src/components/Splash/Splash.tsx:83-86` |
| Welcome screen | `Tab` / `Shift+Tab` | Move between its buttons only | `src/components/Splash/Splash.tsx:88-100` |
| Date box | Enter / `Esc` | Set the date / cancel | `src/components/TimeBar/DateEntryPopover/DateEntryPopover.tsx:99-106` |
| Speed list | `Esc` | Close | `src/components/TimeBar/RateSelectorPopover/RateSelectorPopover.tsx:43-58` |
| Any slider | Arrows; PageUp/PageDown; Home/End | One step; ten steps; to either end | `src/components/common/Slider/Slider.tsx:113-143` |

**Mouse**

| Gesture | In open space | Close to a planet's surface | Source |
|---|---|---|---|
| Left-drag | Orbit around the target | On ground: slide the ground under the cursor. On sky: look around. At a shallow angle: slide sideways. | `src/services/camera/applyInputToCamera.ts:69-74`; `src/utils/camera/latchSurfaceGesture.ts:30-57` |
| Right-drag or middle-drag | Pan | Tilt and turn | `src/services/camera/applyInputToCamera.ts:45-66`; `src/utils/camera/draggedSurfacePose.ts:83-117` |
| Wheel | Zoom toward the centre of view | Zoom toward the point under the cursor | `src/utils/camera/zoomedDistance.ts:17-36`; `src/utils/camera/surfaceZoomStep.ts:62-77` |
| Trackpad pinch / `Ctrl`+wheel | Zoom, 8× faster | Same | `src/services/camera/orbitControls.ts:137` |
| Click | Select (pin the card) | Same | `src/services/engine/phases/wireInput.ts:200-211` |
| Click on empty sky | Unselect | Same | `src/services/engine/interaction/clickHandler.ts:14-15` |
| Click on a label | Select the thing the label names | Same | `src/utils/labels/isPickableLabel.ts:13-15` |
| Double-click | Fly to the selected thing | Same | `src/services/engine/phases/wireInput.ts:212-217` |
| Hover | Preview card | Same | `src/services/engine/interaction/inputBindings.ts:101-112` |
| Right-click menu | Suppressed on the picture | Same | `src/services/camera/orbitControls.ts:165-168` |
| Any drag near a rover/site | Turntable around the site (all buttons alike) | — | `src/utils/camera/steppedSitePose.ts:25-38` |

Rates: 0.005 radians per pixel of drag in open space (100 px ≈ 29°), slower near a body; a click is a press-and-release within 4 px. Source: `src/utils/camera/orbitRadPerPixel.ts:17-28`; `src/services/camera/orbitControls.ts:41`.

**Touch**

| Gesture | What it does | Source |
|---|---|---|
| One-finger drag | Same as left-drag | `src/services/camera/orbitControls.ts:57-60` |
| Two-finger pinch | Zoom | `src/services/camera/orbitControls.ts:112-117` |
| Tap | Select | `src/services/camera/orbitControls.ts:86-94` |
| Double-tap | Fly to the selected thing | `src/services/camera/orbitControls.ts:158-163` |
| Tap a panel title | Open / close that panel | `src/components/NavigationPanel/NavigationPanel.tsx:71` |
| Two-finger rotate, two-finger pan, long-press, three fingers | Nothing | `src/services/camera/orbitControls.ts:74,112-117` |

### (b) Every hash parameter and query flag

**Hash parameters** (after `#`, joined with `&`) — 7, the rows of `HASH_PARAM_SOURCES`, `src/state/url/hashParamSources.ts:299-307`. The app writes them in the order `focus`, `t`, `orientation`, `exhibit`, `tour`, `clip`; `pose` is read only.

| Parameter | Value grammar | Example | Skips welcome screen | Written by the app | Source |
|---|---|---|---|---|---|
| `focus` | One id. Planet, moon, spacecraft: `body-<id>`. Named star, Sun, S-star: `star-<id>`. Gaia star: `star-<number>`. Black hole: `blackhole-<id>`. Famous galaxy: its bare id. Other galaxies: `pgc-<number>`, `sdss-<19-digit number>`, or `pos@<ra>,<dec>` (4 decimals). Structure: `<category>-<id>`. Milky Way: `milkyWay`. | `#focus=body-titan`, `#focus=star-sirius`, `#focus=m31`, `#focus=cluster-virgo-m87`, `#focus=blackhole-sgr-a-star`, `#focus=milkyWay` | yes | yes (omitted for Earth) | `:116-168`; `src/services/url/urlHashFor.ts:25-52`; `src/services/url/encodeGalaxyId.ts:36-42` |
| `t` | An ISO 8601 date-time (anything `Date.parse` accepts). Lands the clock there, paused. Unreadable values are ignored. | `#t=2026-10-05T12:00:00.000Z` | yes | yes, only when the clock is not live | `:194-208` |
| `orientation` | `ecliptic` (default, never written), `equatorial`, `galactic`, `supergalactic`. Anything else is ignored. | `#orientation=galactic` | no | yes, when not the default | `:229-250`; `src/data/orientation/orientationFrames.ts:54-63` |
| `pose` | Comma list, first field a letter. `a,<tx>,<ty>,<tz>,<yaw>,<pitch>,<distance>,<roll>[,<lookYaw>,<lookPitch>]` (megaparsecs and radians). `b,<bodyId>,` + 15 numbers (metres, relative to a body). `s,<siteId>,<heading>,<elevation>,<range>` (radians, metres). | `#pose=a,0,0,0,-1.4208,-0.1783,0.14,0` (illustrative, built from the grammar) | yes | no | `:261-275`; `src/utils/url/encodeFramedPose.ts:13-29`; `src/utils/url/decodeFramedPose.ts:20-70` |
| `exhibit` | `solarSystem`, `cosmicFlows`, `cosmicWeb`, `zoneOfAvoidance`, `observableUniverse` | `#exhibit=cosmicWeb` | yes | yes, while one is open | `:287-298`; `src/data/exhibits/exhibitRegistry.ts:17-23` |
| `tour` | `grandTour`, `webShowcase`, `demo` | `#tour=grandTour` | yes | yes, while one runs | `src/data/animation/tours/tourRegistry.ts:17-21` |
| `clip` | One of 26 clip ids, e.g. `earthFlyout`, `flyout`, `sondermarkenFlyout`, `perseveranceToSondermarken`, `earthUniverseLoop`, `earthCosmicWebLoop`, `cosmicFlows`, `flowOrbit`, `flyPathDemo`, `famousFlythrough`, and 16 `tour…` ids | `#clip=earthFlyout` | yes | yes, while one plays | `src/data/animation/clips/clipRegistry.ts:63-91` |

Combining: `focus` + `pose` opens on that exact camera with the thing selected, with no flight (`src/utils/url/combineLinkViews.ts:14-16`). `t` and `orientation` are applied first, so the thing is framed at the linked moment (`src/state/navigation/navigateSaga.ts:1-8`).

**Query flags** (after `?`) — 5 on the main page. Presence is all that matters; `?dome` and `?dome=1` are the same (`src/utils/url/searchHasGate.ts:17-23`). All are read once at load.

| Flag | Effect | Example | Audience | Source |
|---|---|---|---|---|
| `?dome` | Fisheye dome picture (I2) | `/?dome#focus=body-saturn` | planetarium operators | `src/services/engine/engine.ts:278` |
| `?cinema` | Film mode: picture and tour captions only (I6); installs the recording hook | `/?cinema#tour=grandTour` | recording | `src/components/App/App.tsx:129`; `src/state/recorder/installRecorderHook.ts:92` |
| `?gpuTimings` | Turns on per-step graphics timing for the debug panel | `/?gpuTimings` | developers | `src/services/engine/phases/initGpu.ts:65-69` |
| `?perf` | Timing on, plus the measurement hook | `/?perf` | developers | `src/utils/url/isPerfSearch.ts:18-19`; `src/state/perf/installPerfHook.ts:108` |
| `?tour` | Adds a "start the grand tour" button to the top bar; also skips the welcome screen | `/?tour` | developers (temporary) | `src/components/containers/TopBarContainer.tsx:26`; `src/utils/url/hasDeepLink.ts:49` |

Tool-page flags: `/galaxy/?gpuTimings`, `/galaxy/?probeReadback`, `/mcpm/?probe`, scene-workbench `?probe`. Source: `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts:333`; `tools/galaxy-renderer/src/ui/Viewport/Viewport.tsx:83`; `tools/mcpm-workbench/src/state/defaultAppState.ts:30`; `tools/scene-workbench/src/state/registry/watchRegistrySaga.ts:24`.

No other query flag is read in `src/` (grep for `hasUrlGate(`, `isCinemaMode(`, `isPerfMode(`, `location.search`).

### (c) Every settings control, with default and range

73 controls: 43 switches (9 section headers + 34 rows), 26 sliders, 4 drop-downs. Counted as one per interactive input in the Settings panel, including the tier chip and the section-header switches. None is saved across reloads. Two sliders appear only under a condition (noted).

**Header**

| Control | Type | Default | Options | Source |
|---|---|---|---|---|
| Tier | drop-down chip | Small under 768 px wide, else Medium | Small, Medium, Large | `src/components/SettingsPanel/TierChip.tsx:54-89`; `src/utils/initialTierFromViewport.ts:29-35` |

**Galaxies** (`src/layers/galaxyCatalog/ui/GalaxiesSection.tsx`; defaults `src/layers/galaxyCatalog/state/galaxyCatalogs/initialState.ts`, `state/bias/initialState.ts`)

| Control | Type | Default | Range / options | Line |
|---|---|---|---|---|
| Galaxies (header) | all-on / all-off switch | mixed (5 of 8 on) | — | `:111-135` |
| Famous | switch | on | — | `initialState.ts:24` |
| 2MRS | switch | on | — | `initialState.ts:22` |
| SDSS | switch | on | — | `initialState.ts:21` |
| GLADE | switch | on | — | `initialState.ts:23` |
| Milliquas | switch | on | — | `initialState.ts:25` |
| DESI Deep Field | switch | off | — | `initialState.ts:29` |
| DESI Wedge | switch | off | — | `initialState.ts:30` |
| Sloan Great Wall | switch | off | — | `initialState.ts:31` |
| Point size | slider | 2.5 px | 1.0–8.0, step 0.1 | `:168-176` |
| Galaxy brightness | slider | 5.0× | 0.5–30, step 0.5 | `:182-190` |
| Bloom ceiling | slider | 30 | 1–100, step 1 | `:194-202` |
| Distance falloff | slider | 0.70 | 0–2, step 0.05 | `:206-214` |
| Depth fade | switch | on | — | `:219-226` |
| Density correction | drop-down | Angular re-weight (HEALPix) | None — raw catalogue; Volume-limited; 1/V_max; Schechter LF; Angular re-weight (HEALPix) | `:233-245` |
| M_lim (only when Density correction = Volume-limited) | slider | −19.0 | −24 to −15, step 0.1 | `:247-258` |

**Stars** (`src/layers/starCatalog/ui/StarsSection.tsx`; defaults `src/layers/starCatalog/state/starCatalogs/initialState.ts`)

| Control | Type | Default | Range | Line |
|---|---|---|---|---|
| Stars (header) | switch | on | — | `:135-144` |
| Famous Stars | switch | on | — | `initialState.ts:26` |
| Gaia Stars | switch | on | — | `initialState.ts:25` |
| Sun | switch | on | — | `initialState.ts:27` |
| S-Star | switch | on | — | `initialState.ts:28` |
| Star size | slider | 4.7 px | 1.0–8.0, step 0.1 | `:180-188` |
| Star brightness | slider | 1.0× | 0.01–4, step 0.05 | `:197-205` |
| Detail | slider | 0.16 | 0.01–0.30, step 0.01 | `:212-220` |
| Glow overlap | slider | 3.0× | 1.0–6.0, step 0.1 | `:227-235` |
| Exposure (near) | slider | 6.0× | 1–60, step 0.5 | `:242-250` |
| Exposure (mid) | slider | 23× | 5–150, step 1 | `:257-265` |
| Exposure (far) | slider | 28× | 5–300, step 1 | `:272-280` |
| Fog cap | slider | 0.06 | 0.01–0.5, step 0.01 | `:288-296` |

**Cosmic web density** (`src/layers/cosmicWebDensity/ui/CosmicWebDensitySection.tsx:29-33`; defaults `state/cosmicWebDensity/initialState.ts:15-30`)

| Control | Type | Default |
|---|---|---|
| Cosmic web density (header) | switch | on |
| MCPM Cosmic Web | switch | on |
| Polyphorm (2MRS) | switch | off |
| MCPM Workbench (promoted) | switch | off |

**Cosmic web filaments** (`src/layers/cosmicWebFilaments/ui/CosmicWebFilamentsSection.tsx:30-48`)

| Control | Type | Default | Range |
|---|---|---|---|
| Cosmic web filaments (header) | switch | off | — |
| Intensity (only while the header is on) | slider | 1.00 | 0–1, step 0.05 |

**Flow** (`src/layers/flow/ui/FlowSection.tsx:48-52`; `FlowRow.tsx:45-66`; defaults `src/layers/flow/state/defaults.ts:25-27`)

| Control | Type | Default | Range |
|---|---|---|---|
| Flow (header) | switch | off | — |
| Intensity (greyed out while Flow is off) | slider | 0.18 | 0–1, step 0.01 |

**Structures** (`src/components/SettingsPanel/StructuresSection.tsx:65-111`; defaults `src/layers/structure/state/structures/initialState.ts:13-17`)

| Control | Type | Default |
|---|---|---|
| Structures (header) | all-on / all-off switch | on |
| Clusters | switch | on |
| Superclusters | switch | on |
| Voids | switch | on |
| Groups | switch | on |

**Labels & Guides** (`src/components/containers/LabelsAndGuidesSectionContainer.tsx:142-172`)

| Control | Type | Default | Default from |
|---|---|---|---|
| Labels & Guides (header) | all-on / all-off switch | mixed (14 of 16 on) | derived |
| Famous Galaxies | switch | on | `src/layers/galaxyCatalog/state/galaxyCatalogs/initialState.ts:24` |
| Clusters | switch | on | `src/layers/structure/state/structures/initialState.ts:15` |
| Superclusters | switch | on | same file |
| Voids | switch | on | same file |
| Groups | switch | on | same file |
| Milky Way | switch | on | `src/layers/milkyWay/state/milkyWay/initialState.ts:14` |
| Famous Stars | switch | on | `src/layers/starCatalog/state/starCatalogs/initialState.ts:26` |
| Planets | switch | on | `src/layers/body/state/bodies/initialState.ts:13-19` |
| Earth | switch | on | same file |
| Sun | switch | on | `src/layers/starCatalog/state/starCatalogs/initialState.ts:27` |
| Galactic Centre | switch | on | `src/layers/blackHoles/state/blackHoles/initialState.ts:6` |
| Mesh bodies | switch | on | `src/layers/body/state/bodies/initialState.ts:13-19` |
| Orbit trails | switch | on | `src/state/settings/core/orbitTrails/initialState.ts:13` |
| Zone of Avoidance | switch | on | `src/layers/zoneOfAvoidance/state/zoneOfAvoidance/initialState.ts:12` |
| Local Bubble | switch | off | `src/layers/localBubble/state/localBubble/initialState.ts:10` |
| Constellations | switch | off | `src/layers/constellations/state/constellations/initialState.ts:10` |

**Display, Bloom, HDR, Earth** (`src/components/SettingsPanel/DisplaySection.tsx`, `EarthSection.tsx`; defaults `src/data/defaults.ts`)

| Control | Type | Default | Range / options | Line |
|---|---|---|---|---|
| Orientation | drop-down | Ecliptic (solar system) | Ecliptic (solar system); Equatorial (Polaris up); Galactic (Milky Way); Supergalactic (superclusters) | `DisplaySection.tsx:154-166`; `defaults.ts:143` |
| Tone curve | drop-down | Reinhard (natural) | Linear (baseline); Reinhard (natural); Asinh (filaments); Gamma 2.0; ACES (cinematic) | `:170-182`; `defaults.ts:32` |
| Exposure | slider | shown as +1.6 EV (stored 3.0) | −4 to +4 EV, step 0.25 | `:189-197`; `defaults.ts:42` |
| Field of view | slider | 60° | 0.5–100°, step 0.5 | `:201-209`; `defaults.ts:129` |
| Bloom (header) | switch | on | — | `:212-216`; `defaults.ts:82` |
| Strength | slider | 0.80 | 0–2, step 0.05 | `:218-226`; `defaults.ts:91` |
| Threshold | slider | 2.0 | 0–12, step 0.1 | `:232-240`; `defaults.ts:102` |
| HDR (header) | switch | off (greyed out without an HDR screen) | — | `:248-254`; `defaults.ts:25` |
| Knee | slider | 4.0 | 0–12, step 0.1 | `:259-267`; `defaults.ts:62` |
| Headroom | slider | 0.25 | 0–2, step 0.05 | `:270-278`; `defaults.ts:72` |
| Atmosphere exposure | slider | 2.35 | 0–4, step 0.05 | `EarthSection.tsx:63-71` |
| Ambient light | slider | 0.080 | 0–0.2, step 0.005 | `EarthSection.tsx:74-82` |
| Ocean roughness | slider | 0.30 | 0.02–0.6, step 0.01 | `EarthSection.tsx:85-93` |

Internal settings with no control (so they cannot go in user docs as features): flow mode (advect / streamline), constellation brightness, an overall galaxy brightness multiplier, a galaxy-photo on/off, "labels only for the focused thing" (tours use it), Milky Way on/off (tours and exhibits use it), per-kind click switches (exhibits use them), time direction. Sources: `src/layers/flow/state/defaults.ts:26`; `src/layers/constellations/state/constellations/slice.ts:15`; `src/layers/galaxyCatalog/state/thumbnails/slice.ts:15`; `src/state/settings/core/labelsSlice.ts:11`; `src/state/settings/core/pickingSlice.ts:11-28`; `src/state/time/timeSlice.ts:80-83`.

### (d) Every named object a user can fly to

**Solar system — 34 bodies** (Sun 1, planets 8, dwarf planet 1, moons 24). Link form `#focus=body-<id>`; the Sun is `#focus=star-sun`. Source: `src/data/bodies/scenePlanets.ts:20-181`, `src/data/bodies/sceneEarth.ts:18-24`, `src/data/bodies/sceneSun.ts:13`.

| Group | Count | Names (ids are the lower-case names) |
|---|---|---|
| Star | 1 | Sun |
| Planets | 8 | Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune |
| Dwarf planet | 1 | Pluto |
| Earth's moon | 1 | Moon |
| Mars | 2 | Phobos, Deimos |
| Jupiter | 4 | Io, Europa, Ganymede, Callisto |
| Saturn | 7 | Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus |
| Uranus | 6 | Miranda, Ariel, Umbriel, Titania, Oberon, Puck |
| Neptune | 3 | Triton, Proteus, Nereid |
| Pluto | 1 | Charon |

What each has: 27 of the 33 non-Sun bodies have a surface picture (`src/data/bodies/bodyTextureRegistry.ts:18-238`); Phobos, Deimos, Titan, Puck, Proteus and Nereid do not. Rings: Saturn only. Atmosphere: 9 (see A23). Night lights and clouds: Earth only. Height relief: Earth and Mars only. Positions: planets and Pluto from JPL's approximate orbit table (`src/data/bodies/orbitalElements.ts:66-270`); 26 bodies are then corrected against JPL Horizons (`src/data/bodies/ephemerisCorrections.generated.ts:8-1058`); the Moon, Phobos, Deimos, Pluto, Charon, Puck and Nereid are not corrected.

**Spacecraft and models — 10.** Link form `#focus=body-<id>`. Source: `src/data/bodies/sceneMeshBodies.ts:13-40`.

| id | Name | What | Where |
|---|---|---|---|
| `voyager1` | Voyager 1 | Space probe leaving the solar system | Path from JPL Horizons |
| `voyager2` | Voyager 2 | Space probe leaving the solar system | Path from JPL Horizons |
| `hubble` | Hubble | Space telescope | Low Earth orbit, from JPL Horizons |
| `curiosity` | Curiosity | Mars rover | Gale crater, 4.82° S 137.39° E |
| `perseverance` | Perseverance | Mars rover | Jezero crater, 18.44° N 77.23° E |
| `spirit` | Spirit | Mars rover | Gusev crater, 14.60° S 175.53° E |
| `opportunity` | Opportunity | Mars rover | Endeavour crater rim, 2.34° S 354.62° E |
| `soendermarken` | Søndermarken | 3D scan of a park in Copenhagen | Earth, 55.67° N 12.52° E |
| `whale` | Whale | A joke: a sperm whale in orbit | 400 km above Earth |
| `petunias` | Bowl of Petunias | The other half of the joke | 40 m behind the whale |

Site coordinates: `src/data/bodies/surfaceFixedSites.ts:21-78`. Not present: ISS, JWST, New Horizons, Cassini.

**Places on Earth — 18** (search only; no link form). Source: `src/data/palette/earthPlaces.ts:12-49`.

Copenhagen, Søndermarken, Amsterdam, Paris, Chicago, Sydney, Hong Kong, New York, Buenos Aires, Cape Town, Tokyo, Rio de Janeiro, Grand Canyon, Great Barrier Reef, Bora Bora, Sossusvlei, Everest, Giza.

**Named stars — 118**, plus the Sun and 40 S-stars. Link form `#focus=star-<id>`. Source: `data/seeds/famous_stars.seed.json` (`JSON.parse().length` = 118).

proxima-centauri, alpha-centauri, barnards-star, wolf-359, lalande-21185, sirius, luyten-726-8, ross-154, ross-248, epsilon-eridani, lacaille-9352, ross-128, ez-aquarii, 61-cygni, procyon, struve-2398, groombridge-34, epsilon-indi, tau-ceti, kapteyns-star, altair, vega, fomalhaut, pollux, canopus, arcturus, capella, rigel, achernar, betelgeuse, hadar, acrux, aldebaran, antares, spica, deneb, mimosa, regulus, adhara, castor, shaula, gacrux, bellatrix, elnath, miaplacidus, alnilam, alnair, alnitak, alioth, dubhe, mirfak, wezen, gamma-velorum, sargas, kaus-australis, avior, alkaid, menkalinan, atria, alhena, peacock, alsephina, mirzam, polaris, alphard, hamal, diphda, mizar, nunki, menkent, alpheratz, mirach, rasalhague, algieba, kochab, saiph, denebola, algol, tiaki, muhlifain, aspidiske, suhail, alphecca, mintaka, sadr, eltanin, schedar, naos, almach, caph, izar, alpha-lupi, epsilon-centauri, dschubba, larawag, eta-centauri, merak, ankaa, girtab, enif, scheat, sabik, phecda, aludra, alderamin, markeb, gamma-cassiopeiae, markab, aljanah, acrab, mira, albireo, delta-cephei, eta-carinae, 51-pegasi, vy-canis-majoris, uy-scuti, t-coronae-borealis.

**S-stars — 40.** Source: `src/data/bodies/sStarElements.ts:38-591`.

s1, s2, s4, s6, s8, s9, s12, s13, s14, s17, s18, s19, s21, s22, s23, s24, s29, s31, s33, s38, s39, s42, s54, s55, s60, s66, s67, s71, s83, s85, s87, s89, s91, s96, s97, s145, s175, r34, r44, s301.

**Black holes — 1.** `#focus=blackhole-sgr-a-star` (Sagittarius A*, labelled "Galactic Centre", 4.297 million solar masses). Source: `src/layers/blackHoles/data/blackHoles.ts:11-23`; `src/layers/blackHoles/sources/sgrAStar.ts:10-24`.

**The Milky Way — 1.** `#focus=milkyWay`. Source: `src/services/url/milkyWayFocusId.ts:9`.

**Famous galaxies — 81** (35 Caldwell, 40 Messier, 6 others). Link form: the bare id, e.g. `#focus=m31`. Source: `data/seeds/famous_galaxies.seed.json` (`JSON.parse().length` = 81).

- Caldwell (35): c3, c5, c7, c12, c17, c18, c21, c23, c24, c26, c29, c30, c32, c35, c36, c38, c40, c43, c44, c45, c48, c51, c52, c53, c57, c60, c61, c62, c65, c67, c70, c72, c77, c83, c101.
- Messier (40): m31, m32, m33, m49, m51, m58, m59, m60, m61, m63, m64, m65, m66, m74, m77, m81, m82, m83, m84, m85, m86, m87, m88, m89, m90, m91, m94, m95, m96, m98, m99, m100, m101, m102, m104, m105, m106, m108, m109, m110.
- Others (6): lmc (Large Magellanic Cloud), smc (Small Magellanic Cloud), leda1313424 (Bullseye Galaxy), ngc3166, ngc3169, ngc5394.

**Catalogue galaxies.** Any loaded galaxy can be selected and linked (`pgc-…`, `sdss-…`, `pos@…`). 48,667 have searchable names (`data/pgc_aliases.json`, key count). Totals per catalogue are unverified here.

**Structures — 42 curated** (15 clusters, 8 superclusters, 3 voids, 16 groups), plus an unverified number of further clusters and superclusters from survey catalogues. Link form `#focus=<category>-<id>`. Source: `data/seeds/structure_anchors.seed.json` (`JSON.parse().length` = 42, grouped by `category`).

- Clusters (15): virgo-m87, fornax-ngc-1399, hydra-i-a1060, centaurus-a3526, norma-great-attractor, perseus-a426, coma-a1656, a2199-ngc-6166, ophiuchus, hercules-a2151, shapley-a3558, leo-a1367, a2029, a3571, a2065.
- Superclusters (8): laniakea-sc, perseus-pisces-sc, coma-sc, hydra-wall, hercules-sc, shapley-sc, corona-borealis-sc, pisces-cetus-sc.
- Voids (3): sculptor-void, local-void, bootes-void.
- Groups (16): local-group, ic-342-group, m81-group, cen-a-group, m83-group, sculptor-group, cvn-i-cloud, maffei-group, ngc-6946-group, m101-group, ngc-4631-group, m51-group, ngc-1023-group, m96-leo-i-group, leo-triplet, ngc-5866-group.

**Exhibits — 5, tours — 3, clips — 26.** See E1–E13 and table (b).

**Search cards — 75 across 7 tabs** (Highlights 15, Solar System 15, Missions 7, Milky Way 12, Galaxies 15, Deep Space 9, Tours 2), counted from `src/data/palette/featuredTabs.ts:95-710`.

**Things you can see but not fly to:** constellations, filaments, cosmic-web glow, flow ribbons, Local Bubble, the horizon sphere (none are selectable); the Zone of Avoidance (selectable, card only).

---

## Doc/code mismatches

| # | Where | The doc says | The code does |
|---|---|---|---|
| 1 | `README.md:35`, `README.md:78` | "the CF-4 dark-matter volume [is] off by default in the Settings panel"; data table lists "CF-4 density … Dark-matter density volume; off by default". | That volume was deleted. The three density volumes are MCPM, Polyphorm (2MRS) and MCPM Workbench: `src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows.ts:15-19`; retirement noted at `src/data/source.ts:17`. |
| 2 | `README.md:31` | "All the planets plus Pluto and Charon, Saturn's rings, orbit trails, the Sun". | 24 moons and 10 spacecraft/models also ship, none mentioned anywhere in the README: `src/data/bodies/scenePlanets.ts:66-181`; `src/data/bodies/sceneMeshBodies.ts:13-40`. |
| 3 | `README.md:36` | "press `d` for per-pass GPU timings". | `D` opens the panel, but timings are off unless the address has `?gpuTimings` (or `?perf`): `src/services/engine/phases/initGpu.ts:65-69`; `src/components/DebugPanel/GpuTimingsSection.tsx:120-124`. |
| 4 | `public/llms.txt:3,5,7,9` | "SDSS, GLADE, and 2MRS"; "~3.5 million galaxies"; "three real catalogs — SDSS DR18…"; tiers "small (~300k) … medium (~600k) … large (~3.5M)". | Eight galaxy sources incl. Milliquas and three DESI sets (`galaxyCatalogSourceRows.ts:22-31`); SDSS is DR17 (`src/layers/galaxyCatalog/sources/sdss.ts:25`); README says "about 3 million" (`README.md:25`); the file says nothing about stars, planets, time, tours or search beyond galaxies. Tier totals are unverified but the caps in `sdss.ts:28`, `glade.ts:27`, `milliquas.ts:47` do not obviously sum to those figures. |
| 5 | `README.md:34` | Search "reaches the famous atlas, 48,000 PGC name aliases, and named structures". | Search also covers planets, moons, spacecraft, 118 named stars, 18 Earth places, exhibits, tours and the black hole: `src/components/CommandPalette/utils/rankPaletteMatches.ts:99-172`. |
| 6 | `src/utils/url/hasDeepLink.ts:13`, `src/state/ui/buildInitialUiState.ts:33` | "`?tour=<name>` — request the tour at a specific anchor". | `?tour` only shows a debug button (`src/components/containers/TopBarContainer.tsx:24-26`); the real tour link is `#tour=<id>` (`src/state/url/hashParamSources.ts:306`). Side effect: any `?tour` skips the welcome screen. |
| 7 | `src/components/NavigationPanel/NavigationPanel.tsx:53-63` (visitor-facing text) | Six desktop rows; "⌘K / Ctrl+K / / — search galaxies". | Omits right-drag pan/tilt, double-click, `E`, `Tab`, the four time keys and the tour keys (`src/state/input/keyboardShortcuts.ts:42-80`); search is not only galaxies. |
| 8 | `src/data/exhibits/exhibitRegistry.ts:2` | "the palette's four takeover exhibits". | Five: `exhibitRegistry.ts:17-23`. |
| 9 | `src/components/CommandPalette/CommandPalette.tsx:5`; `src/layers/galaxyCatalog/sources/famous-galaxy.ts:32,37` | "~75 hand-picked"; "~150 rows"; "80 seed rows". | 81 seed entries: `data/seeds/famous_galaxies.seed.json`. |
| 10 | `src/data/bodies/orbitalElements.ts:914`; `src/layers/starCatalog/sources/s-star.ts:5,20` | "39" S-stars. | 40 rows (39 + S301): `src/data/bodies/sStarElements.ts`. |
| 11 | `src/components/containers/TourDebugPillContainer.tsx:9` | "Delete once the tour ships and the splash button is the real entry point." | The splash Tour button already starts the tour: `src/components/containers/SplashContainer.tsx:29-32`. The `?tour` pill is leftover. |
| 12 | `tools/record/README.md:42,172` | Default encode "H.264 `-crf 16`"; "Six ids are standalone clips". | Flat takes use the Apple hardware encoder at a fixed 60 Mbit/s (`tools/utils/record/buildFfmpegArgs.ts:68-82`); there are ten stand-alone clips (`src/data/animation/clips/clipRegistry.ts:64-74`). |
| 13 | `tools/flow-workbench/README.md:15,25-42` | Launch with `npm run cosmic-flow`; reads `cf4pp_vfield.bin` made by `tools/cosmic-flow/…`. | Script is `npm run flow-workbench` (`package.json:68`); it loads `flowfield.scfd` (`tools/flow-workbench/src/createFlowHarness.ts:99`); `tools/cosmic-flow/` does not exist. |
| 14 | `tools/galaxy-renderer/README.md:1,11-13`; `tools/mcpm-workbench/README.md` intro | Titled "Galaxy Renderer"; "not part of the skymap runtime bundle", no word on deployment. | The page calls itself "Galaxy Explorer" (`tools/galaxy-renderer/index.html:6`) and all three workbenches are built into the live site (`package.json:33`). |
| 15 | `docs/DEPLOY.md:24` | "Dev servers (5400/5500) are untouched." | Three pages ship; the flow workbench's port is 5300 (`tools/utils/io/devPorts.ts:9`). |
| 16 | `docs/research/2026-09-17-companion-website/03-architecture-features.md:51,64` | "14 moons"; hash params "`#focus=`, `#t=`, `#orientation=`". | 24 moons; seven hash parameters (adds `pose`, `exhibit`, `tour`, `clip`). |
| 17 | `README.md:13` vs app text | Lists Chrome, Edge, Firefox 141+ and Safari 26+ as supported. | The unsupported-browser page and the start-up error both say only "a recent version of Chrome or Edge": `src/unsupportedPage.ts:61`; `src/components/Splash/Splash.constants.ts:20`. Not a contradiction, but the two will read as one to a Firefox or Safari visitor. |
| 18 | `src/data/defaults.ts:109-110,118-119`; `src/layers/flow/ui/FlowRow.tsx:25-30` | A per-field intensity slider in Settings; the colour palette "persisted"; a flow "mode switch" in the debug panel. | None of the three exists: only the splash flag is saved (`src/state/persistedValues.ts:18`); the flow debug section has six sliders and no mode switch (`src/layers/flow/ui/FlowTuningSection.tsx:29-39`). |
| 19 | `index.html:15,52`; `public/sitemap.xml` | Title "Interactive 3D Galaxy Catalog Explorer"; description "SDSS, GLADE, and 2MRS catalogs"; sitemap last-modified 2026-05-05. | The app now opens on Earth and spans the solar system to the cosmic web (`src/compositions/app.ts:35`; `README.md:3`). Positioning drift rather than a factual error. |
| 20 | `src/data/sources/mesh-body.ts:6-8` | Lists the mesh bodies without Hubble or Søndermarken. | Ten rows: `src/data/bodies/sceneMeshBodies.ts:13-40`. |
| 21 | `src/components/DebugPanel/ClipTriggersSection.tsx:26-28` | Tours hide the panels "via `setUiHidden(true)`". | Hiding is derived from the running tour, with no such write: `src/components/App/App.tsx:85-89`. |

---

## Proposed docs site map

Every row id above appears under exactly one page. "Lift from" names the existing repo text closest to a first draft.

```
Guide
├── Getting started and troubleshooting
├── What's in the scene
├── Moving around
├── Finding things
├── Time travel
├── Tours and exhibits
├── Sharing a view
├── Settings
├── Reading the info cards
└── Quality, screens and domes
Reference
├── Controls (table a)
├── URL parameters (table b)
├── Settings (table c)
└── Object catalogue (table d)
Tools
├── Galaxy Explorer
├── MCPM Workbench
├── Flow Workbench
└── Local-only workbenches
Developers
├── Command-line tools
└── Debug panel and flags
```

| Page | Source rows | Lift from | Link out to |
|---|---|---|---|
| Guide / Getting started and troubleshooting | J1–J10 | `README.md:13,90-107`; error copy in `src/components/Splash/Splash.constants.ts:18-24`; `src/unsupportedPage.ts:53-69` | WebGPU support table https://caniuse.com/webgpu ; MDN WebGPU https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API ; project source https://github.com/rulkens/skymap |
| Guide / What's in the scene | A1–A30 | `README.md:23-35,61-88`; `docs/science.md`; `ATTRIBUTIONS.md`; exhibit copy in `src/data/exhibits/*.ts` | SDSS https://www.sdss.org/ ; GLADE https://glade.elte.hu/ ; 2MRS [find URL]; Milliquas https://quasars.org/milliquas.htm ; DESI DR1 https://data.desi.lbl.gov/doc/releases/dr1/ ; Gaia DR3 https://www.cosmos.esa.int/web/gaia/dr3 ; JPL Solar System Dynamics https://ssd.jpl.nasa.gov/ ; JPL Horizons https://ssd.jpl.nasa.gov/horizons/ ; EOX Sentinel-2 cloudless https://cloudless.eox.at ; NASA Blue Marble https://visibleearth.nasa.gov/collection/1484/blue-marble ; Cosmicflows https://projets.ip2i.in2p3.fr/cosmicflows/ ; Polyphorm https://github.com/CreativeCodingLab/Polyphorm ; DisPerSE [find URL]; Local Bubble paper (O'Neill et al. 2024) [find URL]; mission pages for Voyager, Hubble, Curiosity, Perseverance, Spirit/Opportunity [find URL each]; Gillessen et al. 2017 S-star orbits [find URL] |
| Guide / Moving around | B1–B25 | `README.md:99`; cheatsheet in `src/components/NavigationPanel/NavigationPanel.tsx:53-72` | Reference / Controls |
| Guide / Finding things | C1–C17 | `README.md:34`; card blurbs in `src/data/palette/featuredTabs.ts` | Reference / Object catalogue |
| Guide / Time travel | D1–D10 | `README.md:33`; `src/data/time/rateLadder.ts:1-33` | ISO 8601 explainer [find URL] |
| Guide / Tours and exhibits | E1–E16 | `docs/tour/goal.md`, `docs/tour/script.md`; captions in `src/data/animation/tours/grandTour.ts:39-169`; exhibit copy and source links in `src/data/exhibits/*.ts` | Powers of Ten film https://www.youtube.com/watch?v=0fKBhvDjuy0 ; Laniakea paper https://arxiv.org/abs/1409.0880 ; MCPM paper https://arxiv.org/abs/2204.01256 ; Davis & Lineweaver 2004 https://arxiv.org/abs/astro-ph/0310808 ; Kraan-Korteweg & Lahav 2000 https://arxiv.org/abs/astro-ph/0005501 ; JPL approximate planet positions https://ssd.jpl.nasa.gov/planets/approx_pos.html |
| Guide / Sharing a view | F1–F13 | `README.md:33-37`; header of `src/state/url/hashParamSources.ts:1-70` | Reference / URL parameters |
| Guide / Settings | G1–G14 | none suitable (code comments only); `docs/science.md` for the density-correction and tone-curve choices | Reference / Settings |
| Guide / Reading the info cards | H1–H12 | Tooltip texts in `src/components/InfoCard/tooltips.tsx`; `docs/science.md` | NED https://ned.ipac.caltech.edu/ ; SDSS SkyServer [find URL]; Wikipedia |
| Guide / Quality, screens and domes | I1–I8 | `tools/record/README.md:140` (dome section); `src/utils/initialTierFromViewport.ts:1-25` | Fulldome / planetarium standards (e.g. IMERSA) [find URL] |
| Reference / Controls | table (a) | `src/state/input/keyboardShortcuts.ts` | — |
| Reference / URL parameters | table (b) | `src/state/url/hashParamSources.ts` | — |
| Reference / Settings | table (c) | — | — |
| Reference / Object catalogue | table (d) | `data/seeds/*.seed.json`; `ATTRIBUTIONS.md` | Messier and Caldwell catalogue pages [find URL]; MCXC https://heasarc.gsfc.nasa.gov/W3Browse/rosat/mcxc.html |
| Tools / Galaxy Explorer | K1 | `tools/galaxy-renderer/README.md`; `src/services/engine/galaxyGenerator/v2/README.md` | Hubble sequence explainer [find URL] |
| Tools / MCPM Workbench | K2 | `tools/mcpm-workbench/README.md` | MCPM paper https://arxiv.org/abs/2204.01256 ; SDSS MCPM value-added catalogue https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold |
| Tools / Flow Workbench | K3 | `tools/flow-workbench/README.md` (stale, see mismatch 13) | Cosmicflows-4 paper https://doi.org/10.3847/1538-4357/ac94d8 |
| Tools / Local-only workbenches | K4–K6 | `tools/scene-workbench/README.md`, `tools/famous-curator/README.md`, `tools/structure-audit/README.md` | PDAL, COLMAP, OpenMVS, StarNet [find URL each] |
| Developers / Command-line tools | L1–L12 | `tools/record/README.md`, `tools/shot/README.md`, `tools/perf/README.md`, `tools/capture/README.md`, `docs/DATA.md`, `docs/DEPLOY.md` | Playwright https://playwright.dev ; ffmpeg https://ffmpeg.org ; Blender https://www.blender.org |
| Developers / Debug panel and flags | M1–M21 | `docs/RENDERER.md`; `tools/perf/README.md:86,125` | WebGPU timestamp queries (MDN) [find URL] |

---

## Gaps

Questions the code could not answer:

1. **How many galaxies and stars does a visitor actually get on each tier?** The README says "about 3 million" galaxies and "16.8 million" stars; `llms.txt` says 3.5 million and gives per-tier totals. The real numbers live in the built data files, which this worktree does not have. Which figures should the docs print?
2. **Which close-up imagery is live?** The code can stream Earth's 19 EOX regions, the Denmark aerial band and four Mars rover sites, but whether each is uploaded to the live site was not checkable. Two regions (Sjælland, Malmö) have imagery but no search entry: intended?
3. **How many clusters and superclusters beyond the 42 curated ones?** Code comments say roughly 282 clusters and 91 superclusters before duplicates are removed; the palette comment says "~370". What is the shipped count?
4. **Are settings meant to reset on reload?** Nothing but the welcome-screen flag is saved. Docs need to say either "by design" or "known limitation".
5. **Is `#clip=` a public feature?** Clips are reachable by link and the README advertises `#clip=`, but they have no card, no search entry and only developer-style names ("Fly-path demo (groups flythrough)"). Should the docs list clip ids, list a chosen few, or stay silent?
6. **Is `#tour=demo` meant to be reachable on the live site?** It is marked `dev` and hidden from search but any visitor can open it by link.
7. **Should the docs mention the debug panel?** `D` and `L` work on the live site with no gate. The README already advertises `d`. Present as "for the curious", or keep out of the visitor guide?
8. **Is `?dome` supported for outside planetariums?** It works by flag, with fixed 60° tilt, no labels and no clicking. Are tilt and resolution meant to become options, and is there a recommended way to drive it (keyboard only, since clicking is off)?
9. **Is `?tour` still wanted?** Its own comment says to delete it. It also has the side effect of skipping the welcome screen.
10. **Browser support wording.** README lists Firefox 141+ and Safari 26+; the in-app messages name only Chrome and Edge. Which list is authoritative for the docs?
11. **Dome and clicking.** `viewRigs.ts` marks the dome rig "not pickable", but only the terrain-marker check was confirmed to read that flag. Does a click under `?dome` really do nothing?
12. **Are the three Exposure sliders and "Fog cap" under Stars meant for visitors?** Code comments call them live tuning knobs, yet they sit in the user Settings panel.
13. **"MCPM Workbench (promoted)"** is a visitor-facing switch whose default is described in code as "pending promotion decision". Keep, rename or hide before documenting?
14. **Tool pages are not linked from the app.** `/galaxy/`, `/mcpm/` and `/flow/` are live but reachable only by typing the address or from the README. Should the docs be their front door?
15. **Seed oddities noticed in passing** (not verified against sources): M90 is listed at 1.47 Mpc while its Virgo neighbours sit at 11–20 Mpc; the two Antennae galaxies (c60, c61) carry different distances (24.49 and 13.30 Mpc). Worth a check before an object catalogue page publishes distances.
16. **Not read in this sweep:** per-body rotation data (`src/data/bodies/rotationElements.ts`), the label de-clutter rules (`src/data/labels/*DirectorConfig.ts`), the structure-audit page's tab list, the exact subcommands of `npm run refactor`, and flags of a handful of data scripts (`fetch-desi`, `build-meshes`, `sync-r2`).
