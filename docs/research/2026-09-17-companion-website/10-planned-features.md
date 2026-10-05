# 10 — Planned and in-flight features

Subagent sweep, 2026-10-05, of BACKLOG, plans, specs, open PRs and worktrees. Statuses are a snapshot; verify before publishing.

Swept against `main` at `3808c7a74` (#850), from the `companion-website-research` worktree at `cfdf70ff2`.

## How to read this file

**Status key.** Six statuses, assigned by rule so they can be re-derived:

| Status | Rule used here |
| --- | --- |
| in review | an open pull request carries the work (draft or not) and it was touched in the last 30 days |
| in progress | commits, a prototype or a written-but-unmerged spec on a live branch, or an active brainstorm with its own worktree; no reviewable PR for the feature itself |
| designed, not started | a spec or plan exists, or the backlog line is tagged `ready` |
| idea | backlog tag `needs-design`, `needs-debug`, `needs-repro`, `needs-verification` or `awaiting-decision`; or a research note only |
| parked | backlog tag `deferred` or `blocked`, or explicitly set aside by an owner ruling |
| stalled | an open PR or branch untouched for more than 30 days, or work left half-done |

**Dates.** For a backlog item the date is the filing date in its detail file's name; index-only lines carry no date and show `n/d`. For PRs it is GitHub's `updatedAt`. For branches it is the tip commit date.

**Evidence that is not in the repository.** A few rows rest on the owner's Claude session notes (`~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/*.md`). Those are marked "(session notes)". They are the least reliable evidence here and several were found to be out of date during this sweep (see "Corrections" at the end).

**What is not listed.** Shipped work. In particular these were checked and are on `main`, so they are not planned: Uranus moons (#838, #850), Neptune moons (#848), accurate planet and moon positions (#835, #846), `npm run shot` (#845), deep-link arrival (#831), the dome fisheye rig (#800), Mars terrain (#743), terrain ray pick (#753), the Local Bubble shell (#755), the Søndermarken mesh on Earth (#827), the Sgr A* lensed close-up (#645), the polyphorm look port (#651), and all 14 beats of the grand tour (`src/data/animation/tours/grandTour/`).

**TODO/FIXME comments.** `grep -rnE 'TODO|FIXME' src tools` over `.ts`, `.tsx` and `.wesl` returns zero hits. Missing capabilities live in `docs/BACKLOG.md`, not in code comments.

## Summary

| Theme | in review | in progress | designed, not started | idea | parked | stalled | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Solar system and moons | 0 | 1 | 1 | 8 | 1 | 0 | 11 |
| Missions and spacecraft | 0 | 0 | 2 | 2 | 1 | 0 | 5 |
| Earth and planetary surfaces | 1 | 0 | 3 | 6 | 2 | 0 | 12 |
| Stars and the Milky Way | 1 | 0 | 0 | 7 | 4 | 0 | 12 |
| Galaxies and the cosmic web | 0 | 0 | 3 | 7 | 0 | 0 | 10 |
| Physics and effects | 0 | 0 | 1 | 1 | 1 | 1 | 4 |
| Camera and navigation | 1 | 0 | 1 | 1 | 1 | 1 | 5 |
| Tours and storytelling | 0 | 0 | 2 | 3 | 1 | 1 | 7 |
| Dome, VR and display rigs | 0 | 0 | 1 | 2 | 0 | 1 | 4 |
| Desktop and offline app | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| Performance and devices | 0 | 0 | 0 | 6 | 2 | 1 | 9 |
| Data and catalogues | 0 | 0 | 0 | 5 | 2 | 0 | 7 |
| Interface, search and sharing | 0 | 0 | 0 | 4 | 1 | 0 | 5 |
| Website and docs | 0 | 1 | 0 | 3 | 0 | 0 | 4 |
| Developer tooling | 0 | 0 | 5 | 1 | 0 | 1 | 7 |
| **Total** | **3** | **2** | **20** | **56** | **16** | **6** | **103** |

These are user-facing rows only (developer tooling counts developers as its users). Small visible fixes are listed separately in "Queued fixes a visitor might notice" and are not counted. Internal refactors are in the appendix and are not counted.

`docs/BACKLOG.md` holds 219 index lines: Engine & State 53, Rendering 121, UI & UX 22, Docs & process 15, External 4, Outreach 4. Most of the first two groups are internal.

## Open pull requests

| PR | Title | Draft | Last update | Age at sweep | Note |
| --- | --- | --- | --- | --- | --- |
| #847 | Heliospheric current sheet render spike + WSO data tools | yes | 2026-10-05 | 0 d | Docs and tools only, no `src/` change. The `typecheck · test · format` check concluded FAILURE on the last run. |
| #844 | Milky Way structures, PR 1: ground preparation | yes | 2026-10-05 | 0 d | Behaviour-neutral. Branch ledger records CI green on `dc024e4d4` and a passed smoke check; no checks were reported on the latest merge commit at sweep time. |
| #837 | OpenSpace camera mode, PR 2: the openspace control scheme | yes | 2026-10-04 | 1 d | Checks pass. Branch has commits dated 2026-10-05. |
| #839 | dependabot: brace-expansion | no | 2026-10-04 | 1 d | Dependency bump, not a feature. |
| #832 | dependabot: undici and wrangler | no | 2026-10-05 | 0 d | Dependency bump, not a feature. |
| #752 | Albedo bench for Mars de-shading | yes | 2026-09-18 | 17 d | Checks pass. Waiting on the owner's smoke check. |
| #748 | Companion website context sweep | yes | 2026-09-17 | 18 d | This worktree. Local branch is ahead of the PR (main merged in, files 06 to 10 uncommitted). |
| #625 | Quest 3 WebXR stereo behind `?vr` [THROWAWAY] | yes | 2026-08-23 | 43 d | Marked do-not-merge in its own body. |
| #531 | Perceptually uniform focus moves | no | 2026-07-31 | 66 d | Not a draft. |
| #365 | Gravitational lensing: SIS + NFW thin-lens | no | 2026-06-25 | 102 d | Not a draft. Visual confirmation never recorded. |

## Worktrees

| Worktree | Branch | Commits ahead of `origin/main` | What is being built |
| --- | --- | --- | --- |
| `openspace-camera-mode` | `worktree-openspace-camera-mode-pr2` | many, newest 2026-10-05 | OpenSpace control scheme (PR #837) |
| `milky-way-structures` | `worktree-milky-way-structures` | many, newest 2026-10-05 | Prep for in-Galaxy structure categories (PR #844) |
| `heliospheric-current-sheet` | `worktree-heliospheric-current-sheet` | 5, newest 2026-10-05 | Current-sheet spike and WSO data tools (PR #847) |
| `worktree-light-time-rings-fork-1` | same | 1 (`58318b08a`, "spike: light-time spheres prototype (throwaway)") | Light-time spheres prototype; branch is not on the remote |
| `light-time-rings` | `worktree-light-time-rings` | 0 | Empty; the prototype lives in the fork above |
| `heliosphere-shell` | `worktree-heliosphere-shell` | 0 | Empty; heliosphere shell is queued |
| `voyager-mission-trails` | `worktree-voyager-mission-trails` | 0 | Holds an uncommitted spec, `docs/superpowers/specs/2026-10-05-voyager-mission-trails-design.md` |
| `albedo-bench` | `worktree-albedo-bench` | many, newest 2026-09-18 | Mars de-shading tool (PR #752) |
| `companion-website-research` | `worktree-companion-website-research` | this sweep | Website research (PR #748) |

## Solar system and moons

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Light-time spheres | Faint spheres marking how far light travels in a second, a minute, an hour, a day, a year and beyond, so distances between the planets and the stars read in familiar units. | in progress | branch `worktree-light-time-rings-fork-1` @ `58318b08a` (throwaway spike, not pushed); ordering ruling in `docs/backlog/2026-10-05-heliospheric-current-sheet-layer.md` on branch `worktree-heliospheric-current-sheet` | 2026-10-05 | Design not signed off; the prototype is declared throwaway, so a spec and a real build still follow. Off by default per the owner's rulings (session notes). |
| Heliosphere shell | A comet-shaped surface showing where the Sun's wind ends (termination shock and heliopause), anchored to where the Voyagers crossed it. | idea | worktree `heliosphere-shell` (no commits); same backlog file as above ("the heliosphere shell and light-time rings are built first"); `docs/powers-of-ten/data.js` rung 10¹³ "buildable" | 2026-10-05 | No spec. Queued behind the light-time spheres. Draped interstellar field lines are wanted but undesigned (session notes). |
| Heliospheric current sheet ("ballerina skirt") | The Sun's warped magnetic sheet, changing through the 11-year cycle as the time bar is scrubbed. | idea | draft PR #847 (spike and data tools only); `docs/backlog/2026-10-05-heliospheric-current-sheet-layer.md` on that branch | 2026-10-05 | **External:** Wilcox Solar Observatory has a research data-use policy, not a licence; permission must be asked before derived data ships. Meshing cost, time model, fade and format all open. PR check failing. |
| Pluto's wobble around the Pluto–Charon barycentre | Pluto and Charon orbiting their shared centre of mass instead of Charon circling a fixed Pluto. | idea | `docs/backlog/2026-08-16-barycentric-orbit-pairs.md` | 2026-08-16 | Needs an invisible focus-graph node for the minor moons. |
| Pluto's minor moons (Styx, Nix, Kerberos, Hydra) | Four more moons in the Pluto system. | parked | `docs/BACKLOG.md` line "Pluto's minor moons", tag `blocked`; same detail file | 2026-08-16 | Blocked on barycentric pairs above. |
| Real relief on moons | Craters and ridges that change a moon's outline and terminator, not only its shading (Mimas, Tethys, Dione, Enceladus, Charon, Pluto). | idea | `docs/backlog/2026-10-03-body-relief-displacement.md` | 2026-10-03 | Camera altitude and picking assume a sphere; pole pinching; irregular bodies may need the mesh path. |
| Live phase and apparent magnitude on the info card | The focused body's current phase angle and brightness as seen from Earth. | idea | `docs/backlog/2026-07-21-infocard-phase-apparent-mag-rows.md` | 2026-07-21 | Needs design. |
| Saturn ring brightness | Rings that match the brightness of the planet's disc. | designed, not started | `docs/BACKLOG.md` line "Saturn ring brightness", tag `ready` | n/d | A retune; needs an eye-check. |
| Titan's seasonal north/south contrast | Titan's hemispheres changing with its 29.5-year season. | idea | `docs/backlog/2026-08-18-titan-seasonal-albedo-asymmetry.md` | 2026-08-18 | No static texture can carry it. |
| Colour-calibrated body textures and measured albedos | Mars and other bodies in colours closer to what an eye would see. | idea | `docs/backlog/2026-07-24-mars-texture-colour-calibration.md`, `docs/backlog/2026-08-18-body-seed-albedos-vs-measured.md` | 2026-08-18 | No target appearance is recorded; one albedo field currently serves two physical quantities. |
| Eclipse disc sizes | A solar eclipse where the Sun's glow does not swell past the Moon's disc. | idea | `docs/backlog/2026-08-21-sun-bloom-inflates-eclipse-disc.md` | 2026-08-21 | Geometry is correct; the fix is in how bloom treats the Sun. |

## Missions and spacecraft

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Voyager mission trails and a Voyager exhibit | Voyager 1 and 2 at their true positions from launch to 2100, a trail that grows with the clock, and a timeline that jumps to launch, each flyby and the heliopause crossings. | designed, not started | `docs/superpowers/specs/2026-10-05-voyager-mission-trails-design.md` (uncommitted, worktree `voyager-mission-trails`); prerequisites shipped in #835 and #846 | 2026-10-05 | Spec awaits owner review; no plan yet. One prep PR then the feature PR. |
| More spacecraft on sampled trajectories | Other missions flown along their real paths. | idea | same spec, "Out of scope: other spacecraft (each would be one more fetch row, track and body; no per-craft code)" | 2026-10-05 | Depends on the Voyager work. Each craft needs a usable public-domain mesh. |
| James Webb Space Telescope | JWST as a model you can fly to. | parked | `docs/backlog/2026-09-19-jwst-mesh-body.md`, tag `blocked` | 2026-09-19 | Blocked on a position driver for Sun–Earth L2. Mesh chosen. The same driver would carry Gaia and SOHO. |
| Sun shadows on spacecraft and rovers | A rover's mast casting a shadow on its own deck. | idea | `docs/backlog/2026-09-12-mesh-body-shadows.md` | 2026-09-12 | Needs design. |
| Rover-site eye stays above the ground | The camera at a rover site never sinks into sloped terrain. | designed, not started | `docs/backlog/2026-09-17-site-arm-eye-terrain-floor.md`, tag `ready` | 2026-09-17 | Design ruled. |

## Earth and planetary surfaces

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Mars without baked-in shadows | A Mars surface whose imagery no longer carries the sunlight direction of the original mosaic, so the app's own lighting reads correctly. | in review | draft PR #752; `docs/superpowers/specs/2026-09-17-albedo-bench-design.md` and plan on branch `worktree-albedo-bench` | 2026-09-18 | Feature-complete with passing checks; waiting 17 days on a smoke check. A re-bake and R2 sync follow the merge. |
| Deeper global Mars relief | Finer terrain everywhere on Mars, not only at the rover sites. | designed, not started | `docs/BACKLOG.md` line "Mars global height z8–z9 from MOLA", tag `ready` | n/d | A re-bake. |
| Finer terrain mesh | Terrain geometry that uses the full resolution of the height tiles. | designed, not started | `docs/BACKLOG.md` line "Terrain mesh resolution 128", tag `needs-perf` | n/d | Gated on a before/after performance measurement. |
| Mars terrain follow-ups | Fewer popping and missing-patch artefacts on Mars. | idea | `docs/backlog/2026-09-17-mars-terrain-followups.md` | 2026-09-17 | Three separate causes. |
| Clouds at altitude | Earth's cloud deck sitting above the terrain instead of on it. | idea | `docs/backlog/2026-09-17-terrain-f3b-remaining-routing.md`; `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §8.3 | 2026-09-17 | The last unbuilt part of the terrain spec. |
| Smooth imagery when zooming out | Earth tiles that blend instead of popping when the camera pulls back. | idea | `docs/backlog/2026-08-20-earth-tile-zoom-out-crossfade.md` | 2026-08-20 | Shape agreed, not built. |
| Better deep imagery over Søndermarken | Leaf-on 2019 aerial imagery in place of the hazy spring 2025 flight. | idea | `docs/backlog/2026-09-14-soendermarken-tiles-from-2019-frames.md` | 2026-09-14 | Needs design. |
| Correct air density at rover sites | Mars haze of the right thickness where the ground is far from the reference radius. | idea | `docs/backlog/2026-09-21-atmosphere-density-altitude-zero.md` | 2026-09-21 | About 17 % too thin at rover sites today. |
| Physically lit clouds and live cloud cover | Clouds with thickness, and optionally today's real cloud pattern. | parked | `docs/backlog/2026-07-19-cloud-deck-pbr.md`, tag `deferred` | 2026-07-19 | Live coverage is a separate data effort. |
| Per-pixel haze over distant terrain | Mountains fading into the atmosphere correctly when seen from the ground. | parked | owner ruling "wait until the surface mesh work lands" (session notes, `project_bruneton_tables.md`); no spec or branch content in the repo | 2026-09-15 | Two design questions unanswered. Terrain has since shipped, so the stated wait condition is met. |
| Scale bar measured from the ground | A scale bar that is right over Mars sites and high terrain. | designed, not started | `docs/BACKLOG.md` line "Scale bar measures from the datum, not the ground", tag `ready` | n/d | None recorded. |
| Human scale: a person, a face, an eye | The zoom continuing below street level to a scanned person lying in a Copenhagen park, then a face and an eye. | idea | `docs/research/2026-08-20-powers-of-ten-to-the-eye.md`; `docs/powers-of-ten/data.js` rungs 10¹ to 10⁻² "buildable"; README "Direction" | 2026-09-14 | Rungs 3 to 6 are marked "must shoot": the photogrammetry does not exist yet. Drone rules near the site are unresolved. |

## Stars and the Milky Way

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Named objects inside the Milky Way | About 70 open clusters, globular clusters, nebulae and Galactic Centre places as labelled, searchable, flyable markers (the Pleiades, the Orion Nebula, Omega Centauri, the Arches cluster). | in review | draft PR #844 (prep only); `docs/superpowers/specs/2026-10-05-milky-way-structures-design.md` and prep plan on branch `worktree-milky-way-structures` | 2026-10-05 | PR 1 is behaviour-neutral and awaits the owner's merge word. The visible feature is PR 2, which has a spec but no plan and no code. `docs/BACKLOG.md` on `main` still lists "Galactic Center place labels"; the spec folds it in. |
| A Milky Way drawn from a physical model | The Galaxy rendered from an analytic light-and-dust field instead of a bag of sprites. | idea | `docs/backlog/2026-09-25-milky-way-v2-field-in-layer.md`; `docs/research/engine/decisions.md`; `docs/research/milky-way/` | 2026-09-25 | Mostly ruled; three prep refactors named. Acceptance is a fresh in-app calibration by eye. |
| Dust around the Sun | The measured 3D dust within 1.25 kpc dimming and reddening the stars behind it. | parked | `docs/superpowers/specs/2026-08-20-edenhofer-dust-volume.md`; `docs/grill-sessions/edenhofer-dust-volume-2026-08-19.md`; raw-data README merged in #701 | 2026-09-14 | Data pipeline done; the renderer is gated on the analytic Milky Way above (session notes record the gate). |
| Dark lanes in the sky from Earth | The Milky Way's dust lanes as a sharp all-sky pattern when standing on Earth. | idea | `docs/backlog/2026-08-19-earth-sky-extinction-panorama.md` | 2026-08-19 | Needs design. |
| A night sky that matches the real one | Star brightnesses from Earth calibrated to what the eye sees. | idea | `docs/backlog/2026-07-22-star-apparent-magnitude-realism.md` | 2026-07-22 | Interacts with bloom and the brightness slider. |
| Celestial-sphere morph | A toggle that flattens the stars from true 3D onto the sky dome and back, showing why constellations are a matter of viewpoint. | idea | `docs/backlog/2026-07-22-celestial-sphere-morph.md` | 2026-07-22 | Touches the star shader's hot path. |
| Interactive constellations | Search for a constellation, fly to it, highlight its lines. | parked | `docs/backlog/2026-07-22-constellation-interactivity.md`, tag `deferred` | 2026-07-22 | None recorded. |
| Antique-atlas constellation figures | Engraved Flamsteed or Bode figures pinned to the sky. | parked | `docs/backlog/2026-09-14-antique-atlas-constellation-figures.md`, tag `deferred` | 2026-09-14 | Figures need hand clean-up. |
| Greek letters in star names | "δ Velorum" instead of "Delta Velorum". | idea | `docs/backlog/2026-07-22-greek-letters-in-star-labels.md` | 2026-07-22 | The font atlas lacks the glyphs. |
| Missing naked-eye stars | About 24 real stars of magnitude 3.9 to 5.1 that constellation figures need. | idea | `docs/backlog/2026-07-22-naked-eye-stars-missing-from-bins.md` | 2026-07-22 | Figures use override positions meanwhile. |
| Close double stars | Both members of a resolved binary shown as spheres, not only the nearer one. | parked | `docs/backlog/2026-07-21-multi-star-sphere-presence.md`, tag `deferred` | 2026-07-21 | None recorded. |
| "You are here" label that hands off | The label following you down toward the Sun and Earth instead of fading out below 2 kpc. | idea | `docs/backlog/2026-07-22-you-are-here-label-continuity.md` | 2026-07-22 | A decision, then a small build. |

## Galaxies and the cosmic web

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Distant galaxies fade by apparent brightness | Fewer, clearer galaxies by default; faint ones appear as you approach or raise a "sky depth" slider. | designed, not started | `docs/superpowers/specs/2026-07-10-distant-galaxy-fading-design.md` (approved; addendum 2026-08-18) | 2026-08-18 | The spec's own addendum says it predates the surface-brightness model (#502) and must be reconciled before any plan. The archived spike patch no longer applies. |
| A plausible shape for every catalogue galaxy | Each surveyed galaxy given a stable, varied procedural body derived from its measured colour, size and type. | idea | `docs/superpowers/specs/2026-08-01-survey-to-params-map-design.md` (status DRAFT) | 2026-08-01 | Several literature values are marked SECONDARY or GAP. First step is to stop dropping 2MRS morphological types in the parser. |
| Generated galaxy impostors | Mid-distance galaxies drawn from a baked image of their generated model, replacing the auto-fetched photo thumbnails. | idea | `docs/backlog/2026-07-08-galaxy-impostor-lod.md` ("Ready to promote into a spec") | 2026-07-08 | Retires the SDSS/DSS thumbnail band, which is a visible change. |
| Fly through any galaxy | Every catalogue galaxy generated in real time on close approach. | idea | `docs/research/engine/decisions.md` ("fly-by target"); owner statement of 2026-08-11 (session notes) | 2026-08-17 | A stated destination with no spec. Depends on the two rows above and on the analytic Milky Way. |
| Honest galaxy brightness and colour gradients | Galaxy surface brightness and core-to-rim colour derived from each catalogue's own photometry. | idea | `docs/backlog/2026-07-24-galaxy-surface-brightness-model.md`, `docs/backlog/2026-07-24-per-source-colour-gradient-spread.md` | 2026-07-24 | Needs design. |
| Quasars and AGN with their own colours | Active nuclei no longer mistaken for blue star-forming galaxies. | idea | `docs/backlog/2026-06-29-milliquas-agn-colormap.md` | 2026-06-29 | Needs design. |
| Walls and sheets keep their shape in focus | Focusing a supercluster or wall highlights a fitted shape, not a sphere. | idea | `docs/backlog/2026-06-29-supercluster-shape-focus.md` | 2026-06-29 | Ellipsoid fit or density-field membership. |
| Better in-scene galaxy photos | Thumbnails sized, masked and brightness-matched per galaxy. | idea | `docs/backlog/2026-06-29-thumbnail-quality-sdss-dss.md` | 2026-06-29 | May be overtaken by the impostor row. |
| Filaments and flows fade with zoom | The filament and flow layers fade in and out by scale like the galaxy surveys do. | designed, not started | `docs/backlog/2026-07-24-filaments-flow-scale-bands.md`, tag `ready` | 2026-07-24 | None recorded. |
| Circinus Galaxy in the famous set | One more named galaxy with a curated photo and card. | designed, not started | prepared seed entry and distance-override rationale (session notes, `project_circinus_famous_pending.md`); not in `docs/BACKLOG.md` | 2026-07-24 | Needs a manual curation step in the curator tool, then a data rebuild and R2 sync. |

## Physics and effects

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Gravitational lensing by galaxy clusters | Background galaxies bent into arcs and counter-images by foreground clusters, with a strength slider. | stalled | PR #365, branch `feat/gravitational-lensing` | 2026-06-25 | Open 102 days. Its body lists visual confirmation as the unmet gate. Written against a renderer that has since moved (Layers, shader folders), so a rebase is substantial. |
| S-stars lensed by Sgr A* | The stars orbiting the Galactic Centre black hole shown with their lensed images. | parked | `docs/backlog/2026-09-03-s-star-analytic-lensing.md`; branch `origin/worktree-s-star-analytic-lensing` | 2026-09-03 | Parked on look; needs adaptive exposure. |
| One brightness scale and HDR output | Stars, galaxies, planets and volumes on a shared brightness scale with scene-adaptive exposure, and output for HDR displays. | idea | `docs/backlog/2026-07-23-hdr-brightness-rebalance.md` | 2026-07-23 | Six brightness conventions to reconcile. An owner note records "exposure is the only dial" for the daytime sky (session notes), which constrains the design. |
| Cleaner black-hole lens edges | No doubled points or cube-face seams around the Sgr A* lens. | designed, not started | `docs/backlog/2026-09-02-lens-crossfade-duplicate-points.md`, `docs/backlog/2026-09-03-sky-cubemap-face-seams-star-aggregates.md`, both `ready` | 2026-09-03 | Seam seen on the deployed build 2026-09-14. |

## Camera and navigation

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| OpenSpace-style controls | A second, optional control scheme with orbit, look, zoom and roll on mouse buttons and optional coasting, familiar to planetarium operators; `shift+c` toggles it. | in review | draft PR #837; `docs/superpowers/specs/2026-09-29-openspace-camera-mode-design.md`; plan on branch `worktree-openspace-camera-mode-pr2`; prep shipped in #830 | 2026-10-05 | Code-complete, in the owner's visual check. A deletion audit and `/feature-done` come before merge. |
| Evenly paced focus flights | Fly-to moves that follow one zoom-and-pan curve with a duration set by distance, instead of a fixed 600 ms. | stalled | PR #531, branch `worktree-focus-move-interpolation` | 2026-07-31 | Open 66 days. The PR body shows tasks 6 to 10 unchecked while session notes call it complete; state is **unknown** without reading the branch. The camera has been rebuilt since (#647, #788, #830). |
| Smooth wheel zoom and flick coast | A wheel notch that animates and a drag that coasts briefly on release. | idea | `docs/backlog/2026-09-09-camera-smooth-zoom-and-flick-coast.md`, tag `awaiting-decision` | 2026-09-09 | Needs the owner to revise ruling Q8 in `docs/grill-sessions/globe-camera-pivot-2026-08-24.md` for the default scheme. |
| Camera stays above sharp peaks | The camera cannot pass through a narrow summit. | designed, not started | `docs/backlog/2026-09-17-camera-floor-clips-sharp-peaks.md`, tag `ready` | 2026-09-17 | None recorded. |
| No tilt jump when leaving a body | Leaving a planet's surface view without the camera snapping by up to 37°. | parked | `docs/backlog/2026-09-11-camera-arm-entry-adopts-arriving-tilt.md`, tag `deferred` | 2026-09-11 | None recorded. |

## Tours and storytelling

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Grand tour starts at Earth | The guided tour opening on Earth and climbing through the solar system, nearby stars and the Milky Way before the existing galaxy beats. | idea | `docs/backlog/2026-07-22-grand-tour-earth-start.md` | 2026-07-22 | Rung list, captions, clock behaviour and pacing all open. Whether the tour is publicly reachable today is itself unclear (see Questions). |
| Visit-a-structure tour step | A reusable tour step so new tours can visit any cluster or void without hand-written choreography. | idea | `docs/backlog/2026-06-29-structure-visit-tour-clip.md` | 2026-06-29 | Needs design. |
| Spotlight cue | Tours can brighten one structure at a time while the rest stay dim. | designed, not started | `docs/backlog/2026-07-07-emphasize-clip-cue.md`, tag `ready` | 2026-07-07 | None recorded. |
| The cosmic-flows clip plays its last beat | The final fade of the cosmic-flows clip actually runs. | designed, not started | `docs/backlog/2026-08-20-cosmicflows-beat-d-unreachable.md`, tag `ready` | 2026-08-20 | A bug with a known cause. |
| "Down to Curiosity" clip | A clip that frames Mars, turns to Curiosity's site and lands there. | parked | brief at `.superpowers/parked/2026-09-15-curiosity-landing-clip-brief.md` in the main checkout (not tracked in git) | 2026-09-15 | Parked with the site-camera work; the brief refers to a worktree that no longer exists. |
| Cosmic-zoom walkthrough plan | A 60-document "Powers of Ten" walkthrough that opens and closes on Earth. | stalled | `docs/BACKLOG.md` line "Cosmic-zoom plan review", tag `process`; branch `origin/worktree-cosmic-zoom-plan` | 2026-05-09 | Awaiting owner review for five months. Likely superseded in part by `docs/powers-of-ten/` and the Earth-start item above. |
| More clips | Saturn's ring-plane crossing, Jupiter and its moons, star-scale and descent shots. | idea | `docs/research/2026-07-19-feature-ideation-clips-to-social.md` §1 ("an idea-mine, not a plan") | 2026-07-19 | Nothing committed. Moon and planet positions are now accurate (#846), which removes the blocker the note names. |

## Dome, VR and display rigs

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Labels and stable stars in the dome | Labels in the fisheye image, and stars, rings and lines sized in dome pixels so they stop flickering. | idea | `docs/backlog/2026-09-23-dome-output-space-overlays.md` | 2026-09-23 | Labels are simply off in the dome today. |
| Constellation lines across dome seams | No broken constellation lines where two dome faces meet. | designed, not started | `docs/backlog/2026-09-23-constellation-segment-near-plane-clip.md`, tag `ready` | 2026-09-23 | None recorded. |
| VR on Quest 3 | Standing inside the scene in a headset. | stalled | draft PR #625 (throwaway spike); multi-view ground shipped in #769 | 2026-08-23 | **External:** depends on a WebXR-WebGPU binding that is behind a browser flag on Quest. The app's interface cannot be shown in a session. No spec. |
| Museum kiosk mode | An unattended attract loop with touch-to-explore and an idle reset. | idea | `docs/backlog/2026-08-31-museum-kiosk-mode.md` | 2026-08-31 | The file opens with a caveat: no museum or planetarium has asked for this. Builds on the desktop app. |

## Desktop and offline app

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Desktop app that runs offline | A Mac and Windows app that downloads all data once and then runs with no network, for museum and kiosk machines. | designed, not started | `docs/superpowers/specs/2026-09-19-desktop-offline-app-design.md`; `docs/superpowers/plans/2026-09-19-desktop-offline-app.md` (0 of 36 steps ticked); no `packages/` folder exists; font prerequisite shipped in #768 | 2026-09-20 | Set aside by the owner on 2026-09-20 (session notes). Plan Task 1 must first show that the Cloudflare build does not have to install Electron. Unsigned builds only; no Linux, no auto-update. |

## Performance and devices

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Past the few-million-point ceiling | Many more galaxies on screen through spatial chunking. | idea | README "Direction" ("Spatial chunking to get past the few-million-point ceiling"); `docs/research/2026-06-05-desi-dr1-as-a-data-source.md` | 2026-06-05 | No spec or backlog detail file. Several data items wait on it. |
| Faster first load | Only the data visible at the starting view is downloaded first. | idea | `docs/backlog/2026-07-24-scale-gated-asset-demand.md`, `docs/backlog/2026-07-24-font-atlas-blocks-initgpu.md` | 2026-07-24 | About 68 MB of about 102 MB fetched at boot draws nothing at the Earth view. |
| Lower memory use | Less GPU and system memory, and memory freed when a layer is switched off. | idea | `docs/backlog/2026-07-22-asset-loading-audit.md`, `docs/backlog/2026-09-13-volume-field-vram-release.md`; PR #817 closed unmerged 2026-09-23; measuring shipped in #813 | 2026-09-23 | The first attempt was rejected; a different design is proposed but not ruled (session notes). |
| Higher frame rates | The large data tier and the solar system view back at 60 fps. | idea | `docs/backlog/2026-07-21-perf-harness-findings.md`, `docs/backlog/2026-07-21-bloom-mip-count-perf.md`, `docs/backlog/2026-07-21-fold-star-upsample-into-tonemap.md` | 2026-07-21 | Three bloom changes were measured and did not help; the cost needs locating first. |
| Faster volume rendering | Cheaper cosmic-web volume passes. | parked | branch `origin/worktree-volume-raymarch-acceleration` ("archive the execution ledger … with the parked branch") | 2026-08-19 | Built, then parked: neutral to negative at shipped defaults (session notes). |
| Phones: star budget and an iOS pass | A lower star budget on small devices, verified on a real iPhone. | parked | `docs/BACKLOG.md` line "Star drawBudget small-tier mobile cap + iOS device pass", tag `deferred` | n/d | Needs a physical device. |
| Status bar on narrow screens | A status bar that reflows on a phone. | stalled | local branch `wip/statusbar-mobile-reflow`; `docs/BACKLOG.md` line "StatusBar mobile reflow", tag `ready` | 2026-09-21 | Half-done work salvaged to a local branch; needs a rebase. |
| Accurate touch picking | Tapping a galaxy on a phone selects the one you tapped. | idea | `docs/backlog/2026-07-29-touch-pick-accuracy.md` | 2026-07-29 | Needs design. |
| Pinch zoom on Windows touchscreens | Pinch zoom working on Windows touch devices. | idea | `docs/backlog/2026-08-16-windows-touchscreen-pinch-zoom.md`, tag `needs-repro` | 2026-08-16 | Needs an on-device event log. |

## Data and catalogues

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| DESI DR1 as a full survey | Roughly ten times more galaxies, about 90 % of them new. | parked | `docs/BACKLOG.md` "External / blocked"; `docs/research/2026-06-05-desi-dr1-as-a-data-source.md` | 2026-06-05 | Blocked on the point ceiling: about 9.75M points against a ceiling the backlog wants lifted to about 25M first. A 2.5° deep cone already shipped. |
| A second DESI deep cone | Another narrow, very deep wedge of galaxies. | idea | `docs/backlog/2026-07-09-second-desi-deep-cone.md`, tag `awaiting-decision` | 2026-07-09 | **External:** Coma needs DESI DR2. Stripe 82 is available now. |
| Real shapes for DESI galaxies | DESI galaxies with measured sizes and orientations. | idea | `docs/backlog/2026-07-09-desi-bgs-real-shapes.md`, tag `needs-verification` | 2026-07-09 | The catalogues used carry no shape columns; a source must be confirmed. |
| Full HyperLEDA orientation cache | Measured position angles for more galaxies. | parked | `docs/BACKLOG.md` "HyperLEDA cache backfill", tag `blocked`; `docs/superpowers/plans/2026-05-05-outreach-and-promotion/TODO.md` Task 2 | 2026-05-07 | Deliberately partial (52k of about 1.5M); promote only on a concrete need. |
| Published catalogues of clusters in the Galaxy | Thousands of open and globular clusters from Hunt & Reffert and Harris, beyond the hand-written seed. | idea | Milky Way structures spec, ruling R2 ("a later feature") | 2026-10-05 | Follows the Milky Way structures feature. |
| Filaments built from all surveys | Cosmic-web filaments traced from SDSS and GLADE as well as 2MRS. | idea | `docs/backlog/2026-08-10-buildfilaments-glade-skip.md`, tag `awaiting-decision` | 2026-08-10 | The shipped filament file is 2MRS-only because the build silently skips missing inputs. This is also a correctness point for the Data page. |
| Sharper 2MRS density field | A better-tuned reconstruction of the nearby cosmic web. | idea | rerun recipe (session notes, `project_polyphorm_2mrs_field.md`); `docs/research/mcpm-trace-mass-offset.md` | 2026-08-19 | The current field is hidden by default and its R2 sync is recorded as pending in session notes; **unknown** whether that sync has since run. |

## Interface, search and sharing

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Settings panel redesign | A tidier settings panel with ordered sections and icons. | idea | `docs/backlog/2026-07-22-settings-panel-polish.md` | 2026-07-22 | Needs design. |
| Label declutter setting | A setting for label decluttering, and labels that stop flickering as the camera moves. | idea | `docs/backlog/2026-06-29-label-declutter-toggle.md` | 2026-06-29 | Replaces a `?nodeclutter` URL stopgap. |
| Links to a point on Earth | A link such as `#site=12.53,55.67` that opens over that place. | idea | `docs/backlog/2026-09-15-earth-point-url-hash.md` | 2026-09-15 | Open points listed in the file. |
| Readable object links with previews | Links such as `/open-cluster/pleiades` that unfurl with the object's name and image when shared. | idea | `docs/backlog/2026-10-05-path-based-object-links.md` on branch `worktree-milky-way-structures`; spec ruling R9 | 2026-10-05 | Needs a Worker step for per-object tags. Existing `#focus=` links must keep working. The desktop app cannot use paths. |
| Chosen order for settings rows | Settings rows in a designed order. | parked | `docs/BACKLOG.md` line "Settings row order is source-code order", tag `deferred` | n/d | No display-order mechanism exists. |

## Website and docs

| Item | What it would add for a user | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Companion website | A homepage, pages for educators and for commissioning work, and full documentation. | in progress | draft PR #748; `docs/research/2026-09-17-companion-website/` (01 to 10, a `prototype/` folder, 06 onward uncommitted) | 2026-10-05 | No spec yet. The committed README still says "nothing is designed or agreed"; later owner rulings exist only in session notes. A target date is recorded there too (see Questions). |
| Attribution clean-up | Every dataset and image credited in one verifiable place. | idea | `docs/research/2026-09-17-companion-website/02-data.md` (attribution gaps); owner ruling that it is its own PR before the Data and Credits pages (session notes) | 2026-10-05 | Must land before a public credits page. |
| A purpose-made hero flight | A recorded flight made for the homepage. | idea | `docs/research/2026-09-17-companion-website/README.md` ("a 20–30 s flythrough clip (never recorded)"); outreach `TODO.md` Task 4 lists the same clip | 2026-10-05 | An August recording stands in for now (session notes). |
| Publish the powers-of-ten ladder | The existing 46-rung scale ladder as a page on the site. | idea | `docs/powers-of-ten/` (self-contained static page); companion README ("publishes as-is") | 2026-09-14 | The ladder is centred on a named friend of the owner and marks 25 rungs as not built; both need a decision before it is public. |

## Developer tooling

| Item | What it would add for a developer | Status | Evidence | Last activity | Blockers or open decisions |
| --- | --- | --- | --- | --- | --- |
| Faster `npm run shot` | Screenshots of any link in well under 5 s. | designed, not started | `docs/backlog/2026-10-05-shot-speed.md`, tag `ready` | 2026-10-05 | Four options measured. |
| Scene workbench: camera-pose overlay | Photo camera positions drawn over a reconstruction. | idea | "NEXT 3b pose overlay" (session notes, `project_scene_workbench.md`); plan 3a shipped in #689 | 2026-09-13 | No plan file in the repo. |
| MCPM workbench fixes | Fifteen small fixes to the cosmic-web simulation tool. | designed, not started | `docs/BACKLOG.md` lines prefixed "mcpm-workbench:" (13 `ready`, 1 `awaiting-decision`, 1 `needs-verification`) | n/d | Per-layer exposure needs a look decision. |
| Debug views for sky capture and terrain detail | A mirror sphere showing the sky cubemap, and an overlay that tells texture detail from relief detail. | designed, not started | `docs/backlog/2026-09-22-debug-reflective-sphere-sky-capture.md`, `docs/backlog/2026-09-15-terrain-relief-coarsens-under-tilt.md`, both `ready` | 2026-09-22 | None recorded. |
| Recorder tidy-up | A smaller recorder script and three follow-ups. | designed, not started | `docs/BACKLOG.md` "Break up `tools/record/record.ts`"; `docs/backlog/2026-07-08-tour-recorder-follow-ups.md` | 2026-07-08 | An intermittent virtual-clock stall is separate and undiagnosed (`docs/backlog/2026-07-31-earthflyout-virtual-time-stall.md`). |
| Refactor tools catch more references | `move-files` rewriting `?worker` imports and mock paths. | designed, not started | `docs/backlog/2026-07-14-move-files-untracked-references.md` (`ready`); `docs/backlog/2026-07-21-refactor-cli-followups.md` (`deferred`) | 2026-07-21 | None recorded. |
| Lattice QCD workbench | A tool for visualising quark and gluon fields, for the smallest rungs of the scale ladder. | stalled | branch `origin/claude/gluon-quark-simulation-viz-qqns5z` | 2026-09-08 | A cloud-session spike with no PR, spec or backlog line. |

## Queued fixes a visitor might notice

Not counted in the summary. All are in `docs/BACKLOG.md`.

| Fix | Tag | Evidence | Filed |
| --- | --- | --- | --- |
| Fades pop instead of ramping after the app has been idle | `ready` | `docs/backlog/2026-08-20-fade-pop-after-idle.md` | 2026-08-20 |
| Flow field does not reseed when the particle count changes | `needs-verification` | `docs/backlog/2026-09-15-flow-field-no-reseed-on-count-change.md` | 2026-09-15 |
| Grey holes in terrain at sea level with high tilt | `needs-debug` | `docs/backlog/2026-09-15-terrain-grey-holes-high-tilt.md` | 2026-09-15 |
| Terrain relief too coarse close to the ground | `needs-debug` | `docs/backlog/2026-09-15-terrain-relief-coarsens-under-tilt.md` | 2026-09-15 |
| Earth tiles appear as an "island in stars" during descent | `needs-debug` | `docs/backlog/2026-08-21-earth-tile-descent-island.md` | 2026-08-21 |
| Star field shows a fade band on fast rotation | `needs-design` | `docs/backlog/2026-09-20-star-cut-frustum-newcomer-seeding.md` | 2026-09-20 |
| A hidden label takes the click over a planet's disc; Earth's label out-picks a transiting Moon | `ready` | `docs/backlog/2026-09-11-caption-pick-hidden-subject-takes-click.md`, `docs/backlog/2026-07-29-earth-caption-stamp-outpicks-occluders.md` | 2026-09-11 |
| Picking fills the screen from inside a body | `needs-design` | `docs/backlog/2026-07-29-analytic-pick-inside-body.md` | 2026-07-29 |
| Labels stay full-bright over a hazy daytime sky | `needs-design` | `docs/backlog/2026-09-22-weight-0-captions-skip-sky-washout.md` | 2026-09-22 |
| Orbit trails look dashed when seen edge-on | `deferred` | `docs/backlog/2026-07-18-orbit-trail-residual-speckle.md` | 2026-07-18 |
| A 20-notch wheel burst can roll the view 115° in one frame | `awaiting-decision` | `docs/backlog/2026-09-11-camera-absolute-arm-wheel-burst-unclamped.md` | 2026-09-11 |
| Occasional jitter with autorotate and mouse movement | `needs-repro` | `docs/backlog/2026-08-20-autorotate-mousemove-jitter.md` | 2026-08-20 |
| M90 and similar infalling galaxies sit at the wrong distance | `needs-design` | `docs/backlog/2026-07-24-famous-seed-redshift-distance-fallback.md` | 2026-07-24 |
| Over-bright star clump near 5.9 kpc | `deferred` | `docs/backlog/2026-07-17-star-clump-brightness-5-9kpc.md` | 2026-07-17 |
| Thumbnail host check must not retire SDSS on a 404 | `manual` | `docs/backlog/2026-09-21-dead-host-set-browser-check.md` | 2026-09-21 |
| Stars out-pick galaxy labels across depth layers | parked | follow-up design to #639 (session notes, `project_pickable_labels.md`); not in `docs/BACKLOG.md` | 2026-08-31 |

## What is closest to shipping

These are the items a public roadmap could honestly call "now" or "next", in order of how little stands between them and `main`.

1. **OpenSpace-style controls** (PR #837). Code-complete with passing checks; the only steps left are the owner's visual check, a deletion audit and the merge. It is fully user-visible.
2. **Milky Way structures, ground preparation** (PR #844). Complete and smoke-checked; it waits on a merge word. Note for the roadmap: this PR changes nothing a visitor sees. The visible feature (PR 2) has a spec and rulings but no plan or code, so call the feature "next", not "now".
3. **Mars without baked-in shadows** (PR #752). Feature-complete with passing checks, waiting on one smoke check since 2026-09-18. After merge it still needs a re-bake and an R2 sync before a visitor sees a difference.
4. **Voyager mission trails and exhibit.** The spec is written and both prerequisites shipped on 2026-10-05. It needs owner review, a plan, a prep PR and the feature PR.
5. **Light-time spheres.** A working prototype exists and the owner is iterating on it, but it is explicitly throwaway and the design is not signed off.
6. **Companion website.** Research is done, a prototype was accepted in session, and the stack is ruled; there is no spec and no site code in the repository yet.

Close behind: the heliosphere shell (rulings made, queued directly after the light-time spheres) and four small `ready` items that are each a short change: Saturn ring brightness, filament and flow scale fades, the spotlight tour cue, and the cosmic-flows clip's last beat.

## What should NOT be promised publicly

| Item | Why not | Source of the decision or blocker |
| --- | --- | --- |
| Gravitational lensing by clusters | Open and untouched for 102 days; never visually confirmed; the renderer underneath has been restructured. | PR #365 body, "Outstanding before merge" |
| Evenly paced focus flights | Open and untouched for 66 days; completion state unclear; the camera was rebuilt afterwards. | PR #531; later camera PRs #647, #788, #830 |
| VR | A throwaway spike that depends on a browser feature behind a flag on the headset. The earlier website sweep already ruled "the site must not advertise VR". | PR #625 body; `docs/research/2026-09-17-companion-website/README.md` |
| Heliospheric current sheet | Derived data cannot ship without permission from the data provider. | `docs/backlog/2026-10-05-heliospheric-current-sheet-layer.md`, "Blocker before shipping data" |
| Full DESI DR1, and anything "billions of objects" | Blocked on a point ceiling with no design to lift it. README "Direction" mentions SDSS's billion-object photometric catalogue as context; do not let that read as a plan. | `docs/BACKLOG.md` "External / blocked"; README lines 153 to 156 |
| A second DESI cone on Coma | Needs a data release that is not out. | `docs/backlog/2026-07-09-second-desi-deep-cone.md` |
| JWST, Gaia, SOHO | Blocked on a position driver that does not exist. | `docs/backlog/2026-09-19-jwst-mesh-body.md` |
| New Horizons | No textured public-domain model exists. | Voyager spec, "Out of scope" |
| Pluto's minor moons | Blocked on barycentric pairs. | `docs/BACKLOG.md`, tag `blocked` |
| Zoom to the retina, cells, DNA, atoms and quarks | The ladder page marks 5 rungs "research" and 8 "aspirational". The retina data needs an archive password that was requested by email, and another dataset's licence is recorded as unverified. | `docs/powers-of-ten/data.js`; session notes `project_powers_of_ten_ladder.md` |
| The person-in-the-park scan | The captures have not been made, and it involves a named private individual. | `docs/research/2026-08-20-powers-of-ten-to-the-eye.md`, rungs "must shoot" |
| Desktop app and kiosk mode | The app is designed but set aside, with an unresolved build risk. The kiosk backlog file states that no institution has asked for it. Offer them as commissioned work, not as a scheduled release. | plan Task 1, Verification A; `docs/backlog/2026-08-31-museum-kiosk-mode.md`, "Validation caveat" |
| Fly through every galaxy | A stated destination with no spec, depending on three unbuilt pieces. | `docs/research/engine/decisions.md` |
| Distant-galaxy fading as specified | The approved spec was overtaken by a later rendering change and must be redone. | spec status addendum of 2026-08-18 |
| Flick-coast in the default controls | Contradicts a standing ruling against inertia; revised only for the OpenSpace scheme. | `docs/grill-sessions/globe-camera-pivot-2026-08-24.md` Q8; OpenSpace spec R3 |
| Screen-space anti-aliasing | Tried and closed as imperceptible at the usual pixel density. | PR #815, closed 2026-09-23 |
| CosmicFlows-4 dark-matter volume | Deleted from the app. | #810; `docs/superpowers/plans/archive/2026-05-07-cf4-dm-volume-*.md` |
| SpaceMouse support | Removed. | #337 (branch tip `origin/claude/skymap-work-time-graph-ke0mcl`) |
| Gravitational-wave overlay | Mentioned once as a condition for an outreach email; no plan exists. | outreach `TODO.md`, Task 5, Email 5 |
| Multi-projector domes | Research note only. The shipped dome path is a single fisheye master. | branch `origin/claude/wisdome-openspace-comparison-6xg147` |
| Social features, "Rewind to the Big Bang", relativistic flight, the CMB wall | The source calls itself "an idea-mine, not a plan: nothing here is committed work". | `docs/research/2026-07-19-feature-ideation-clips-to-social.md` |
| Volumetric nebulae (Pillars of Creation) | A spike branch from July with no follow-up; the ladder marks the Orion Nebula rung "aspirational". | branch `origin/claude/pillars-creation-volumetric-9egx8g`; `docs/powers-of-ten/data.js` |
| Live cloud cover, physically lit clouds | Tagged `deferred`. | `docs/backlog/2026-07-19-cloud-deck-pbr.md` |
| Any date | No repository source states a release date for any feature. | whole sweep |

## Implications for the docs site

`09-feature-inventory.md` did not exist when this file was written, so the page names below are proposals. Align them with 09 once it lands.

The aim is a structure where each planned area has an obvious future home, without a stub page or a "coming soon" label.

| Planned area | Docs page it would extend or create | How to leave room without advertising |
| --- | --- | --- |
| Light-time spheres, heliosphere shell, current sheet | **Explore / Solar system**, new section "Beyond the planets" | Organise the page by distance from the Sun so a section between "Outer planets" and "Nearest stars" can be added later. Do not create the section yet. |
| More moons, relief on moons, barycentric pairs | **Explore / Solar system**, the moons table | Generate the moons table from the body registry, so new rows appear when they ship. |
| Voyager trails, more spacecraft, JWST | **Explore / Spacecraft and landing sites** | One entry per craft from the registry. A future "Mission timelines" section sits under the Voyager entry. |
| Mars de-shading, deeper relief, clouds at altitude, terrain fixes | **Explore / Earth and Mars surfaces**; **Reference / Known simplifications** | List today's limits (flat shading baked into Mars imagery, relief depth, known terrain artefacts) on Known simplifications; remove each line when it ships. |
| Human-scale rungs | **Explore / Earth and Mars surfaces**, "How far down it goes" | State the current floor (the Søndermarken scan) as a fact. The scale ladder page can show built rungs only. |
| Milky Way structures, catalogues of clusters | **Explore / The Milky Way**, new section "Clusters and nebulae"; **Reference / Data sources and credits** | Write The Milky Way with sub-headings by kind of object so a section can be added. Credits are generated, so a new seed or catalogue appears automatically. |
| Analytic Milky Way, local dust, dark lanes | **Explore / The Milky Way**; **Science / Rendering techniques**, "How the Milky Way is drawn" | Describe the current sprite model plainly and name it as a stand-in on Known simplifications. The techniques page gets rewritten, not extended, when the model changes. |
| Night-sky realism, celestial-sphere morph, constellations | **Explore / Stars and constellations** | Keep constellations as their own section so interaction and figures can attach to it. |
| Distant-galaxy fading, generated galaxies, impostors, AGN colours | **Explore / Galaxies**; **Science / Rendering techniques**, "Galaxy level of detail" | Document the level-of-detail ladder as a table of bands; a new band is a new row. |
| Cluster lensing, S-star lensing, brightness and HDR | **Explore / Black holes and lensing**; **Science / Rendering techniques**, "Brightness and exposure" | Title the page for both topics now, since the Sgr A* lens already ships. Cover only what exists. |
| OpenSpace controls, smooth zoom, focus flights | **Guide / Controls and camera** | Structure the page as "control schemes" with one scheme documented today. The second scheme becomes a second sub-section on merge. |
| Earth-point links, path links, share previews | **Guide / Sharing links** | Document link parameters as a table generated from `src/state/url/hashParamSources.ts`; new parameters appear on their own. |
| Tour Earth start, new clips, tour cues | **Guide / Tours and clips**; **For educators** | List tours and clips from their registries. Authoring vocabulary belongs on a developer page. |
| Dome overlays, kiosk mode | **Display / Dome and recording**; **Display / Offline and kiosk** | Create "Dome and recording" now (it ships). Do not create "Offline and kiosk" until the desktop app exists; mention kiosk use on "Work with me" as something that can be commissioned. |
| Desktop app | **Display / Offline and kiosk** (new, later) | No page yet. Keep the "Display" group in the navigation model so it can hold a second page. |
| VR | none | No page, no mention. |
| Performance, memory, phones, touch | **Reference / Devices and performance** | State supported browsers, measured memory by tier and known touch limits as facts. Improvements change numbers, not structure. |
| DESI, HyperLEDA, filament inputs, 2MRS field | **Reference / Data sources and credits**; **Reference / Known simplifications** | Generate the source table from `tools/utils/io/rawDataRegistry.ts`. Record on Known simplifications that filaments are traced from 2MRS only and that HyperLEDA orientations cover a subset. |
| Settings redesign, label declutter | **Guide / Settings** | Describe settings by group, not by screen position, so a redesign does not invalidate the page. |
| Workbenches, recorder, `npm run shot` | **Developers / Tools and workbenches** | One section per tool, lifted from the tool READMEs. |
| Roadmap | **Roadmap** (new) | Three groups, no dates, with a line stating that the live queue is `docs/BACKLOG.md`. |

Two structural points follow from the table:

- **A "Known simplifications" page is the right holding place** for most planned accuracy work. It tells the truth about today and shrinks as things ship, which a roadmap of promises does not.
- **Generate from registries wherever one exists** (bodies, spacecraft, tours, clips, exhibits, URL parameters, data sources). Then new features extend the docs without a docs change, and nothing unbuilt can appear by accident.

## Roadmap page draft

**Now**

- We are finishing a second control scheme that works like OpenSpace, for people who already fly planetarium software.
- We are adding named objects inside the Milky Way: open clusters, globular clusters, nebulae and the neighbourhood of the Galactic Centre.
- We are removing the baked-in sunlight from our Mars imagery so the planet is lit only by the app's own Sun.
- We are building this website and its documentation.

**Next**

- We plan to show the full Voyager 1 and 2 missions, with trails that grow as the clock runs and a timeline of each flyby.
- We plan to mark light-travel distances around Earth, from one light-second out to light-years.
- We plan to draw the edge of the Sun's influence, the heliosphere, anchored to where the Voyagers crossed it.
- We plan to open the guided tour at Earth and climb out through the solar system and nearby stars.
- We plan to put labels back into the dome view and steady the stars there.

**Later**

- We would like to replace the stand-in Milky Way with one drawn from a physical model, and add the measured dust around the Sun.
- We would like every catalogue galaxy to have a plausible shape up close, not only the famous ones.
- We would like to show many more galaxies, which first needs a new way of loading them in pieces.
- We would like an offline desktop build for museums and exhibitions.
- We would like to carry the zoom below street level, towards human scale.
- We would like a night sky from Earth that matches what the eye sees.

The live list of what is queued is in the repository's `docs/BACKLOG.md`.

## Questions for the owner

1. **Is the grand tour public today?** `docs/BACKLOG.md` calls `?tour` "a debug gate", while #831 shipped tour links. The roadmap and the Tours page depend on whether visitors can start it.
2. **Lensing (#365) and focus flights (#531): revive or close?** Both are open, non-draft and months old. Closing them would make the open-PR list an honest "in review" list.
3. **Should the Quest VR spike (#625) be closed?** It is marked throwaway and its landmines are already filed for the renderer docs.
4. **Is the desktop app a roadmap item or a commissioned service?** The spec is ready but the work was set aside, and the kiosk file says nobody has asked for it.
5. **May the roadmap name the human-scale zoom?** It involves a named friend and captures that do not exist yet.
6. **Has permission been asked from Wilcox Solar Observatory?** Until it has, the current sheet stays off every public page.
7. **Is the 28 October 2026 target for the website (session notes only) something to plan against, and should any feature be visibly live by then?**
8. **Should the powers-of-ten ladder page be published as it is**, with its unbuilt rungs, or filtered to built rungs?
9. **Is the Bruneton aerial-perspective work unparked now that terrain has shipped?** Its stated wait condition is met, but nothing in the repository records it.
10. **Has the cosmic-zoom plan (branch from May) been superseded?** If so its backlog line can go.

## Appendix: internal refactors and clean-ups

Not user-facing; listed so nobody mistakes them for features. Counts are approximate groupings of `docs/BACKLOG.md` lines.

| Area | About how many | Representative items | Evidence |
| --- | ---: | --- | --- |
| Engine composition and registries | 12 | Derive `SettingsSnapshot` from the Layer registry; focusable-kind registry; source-registry factory; scene anchors as places; seeded stars out of the body tables; `URL_GATES` table | `docs/BACKLOG.md` "Engine & State"; `docs/backlog/2026-09-21-derive-settings-snapshot.md`, `2026-08-17-focusable-kind-registry.md` |
| Layer composition, remaining Layers | 2 | `structure` and `body` Layers still to form | `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §3; `docs/backlog/2026-09-22-stars-still-in-the-body-tables.md` |
| Declarative frame program | 1 | Layers declare where their passes go; needs an ADR superseding 0011 | `docs/grill-sessions/declarative-frame-program-2026-09-23.md` (three cases unruled) |
| Subsystem bundles spec | 1 | Reference only, "not executable" | `docs/superpowers/specs/2026-08-17-subsystem-bundles-design.md` status banner |
| Fade tables | 5 | Layer-owned scale fade bands; six hand-kept tables per fade row; move `scaleFadeBands` to `src/data` | `docs/backlog/2026-09-19-layer-owned-scale-fade-bands.md`, `2026-08-31-scale-fade-bands-to-data.md` |
| Asset loading internals | 5 | Direct loads bypass the queue; fold the hi-res famous LRU into the shared one; `uiSlice` boot reads | `docs/backlog/2026-07-24-direct-loads-bypass-asset-queue.md`, `2026-08-20-hires-famous-lru-substrate.md` |
| Camera internals | 9 | `DragMode` exhaustive switch; takeover camera-cluster merge; framing import cycle; radar residuals; retire `FrameView`'s impostor camera; `Mat3` narrowing | `docs/backlog/2026-09-29-*.md`, `2026-09-11-*.md` |
| Renderer hygiene | 20 | Duplicated instance buffers and fullscreen triangles; instance-record layout conventions; TS constants into WESL; body-texture store consolidation; mesh format consolidation; `foreground:0` alpha doing three jobs | `docs/backlog/2026-08-20-renderer-hygiene-basket.md`, `2026-08-01-instance-record-layout-conventions.md`, `2026-07-24-body-texture-store-consolidation.md` |
| View rigs and captures | 5 | Captures as views; off-axis field-of-view reconstruction; field uniforms per view; camera-prefix surplus | `docs/backlog/2026-09-22-*.md`, `2026-09-23-camera-uniform-surplus.md` |
| Earth tiles and terrain internals | 6 | Flat-LRU atlas eviction; `tilePx` single value; imagery source identity twice; polar refinement clamp; dead uv-conversion helpers | `docs/BACKLOG.md` "Rendering"; `docs/backlog/2026-07-30-earth-tile-*.md` |
| Milky Way and galaxy tool internals | 7 | `MilkyWayTuning` flat bag; ridge-share residual; young-star normalisation on the GPU; bloom pyramid mirrored in the tool | `docs/backlog/2026-07-31-milkyway-tuning-is-one-flat-bag.md`, `2026-08-12-*.md` |
| Labels internals | 4 | Label fade opt-out ADR; label-entanglement residuals; `CaptionKind` registry; ZoA label em-height | `docs/backlog/2026-08-22-label-entanglement-residuals.md` |
| Settings internals | 2 | Schema-driven slider rows; stale palette-persistence comment | `docs/backlog/2026-07-29-schema-driven-slider-rows.md` |
| Tests and conventions | 8 | Convention sweeps inflate the test count; component file-purity ratchet; liveness guards; catalog draw-entry coverage; curator suite runtime | `docs/backlog/2026-09-21-convention-sweeps-inflate-test-count.md`, `2026-09-21-component-file-purity-ratchet.md` |
| Docs and process | 8 | CLAUDE.md compaction; comment prune; "Task N" comment convention; plan `Needs:` lines; renderer landmine docs from the VR spike | `docs/BACKLOG.md` "Docs & process" |
| Formatting | 1 | 651 files are not prettier-clean, so `format:check` is off in CI | `docs/BACKLOG.md` "Repo is not prettier-clean" |
| Repository layout | 1 | Split into workspace packages after the desktop app | `docs/backlog/2026-09-19-packages-split.md` |
| Rename left half-done | 1 | `famousMeta` rename survives in 28 files | session notes index (`MEMORY.md`, "Stalled"); `docs/BACKLOG.md` "Rename the 'famous' star sidecar" |
| Dependency updates | 2 | Dependabot PRs #839 and #832 | open PR list |

## Appendix: outreach tasks

Not product features. Source: `docs/superpowers/plans/2026-05-05-outreach-and-promotion/TODO.md` (re-scoped 2026-06-18).

| Task | State |
| --- | --- |
| Release, DOI, repository polish, HyperLEDA cache | done (May 2026) |
| JOSS paper | not started; a full draft sits in `task-3-joss-paper.md` but no `paper/` folder exists |
| Product Hunt launch | not started; needs a capture video and an account decision |
| Ed-tech blog outreach | not started |
| Academic emails (SDSS, GLADE, AAS WWT, CDS) | drafted, unsent; gated on the JOSS submission |
| Further Reddit posts | opportunistic; needs the same capture video |
| RNAAS note | dropped 2026-06-18 |
| Courtesy email about the Uranus moon maps | drafted, unsent (session notes) |

The capture video is shared by Product Hunt, Reddit and the website's hero, so one recording unblocks three things.

## Corrections found during the sweep

Places where the owner's session-notes index disagreed with the repository on 2026-10-05. The repository is right in each case.

- Neptune moons: index says "draft #848, awaiting eye-check"; #848 is merged (`779fdd274`).
- `npm run shot`: index says "tool draft #845"; #845 is merged (`15933df74`).
- Polyphorm look port: index lists it under "Stalled"; it shipped in #651 (`aa62736d7`).
- Voyager mission trails: index says "NEXT … spec"; the spec is written, uncommitted, in the worktree.
- Mars terrain and terrain ray pick: listed as loose ends; both merged (#743, #753). Only their eye-check attestations are open.
- `docs/BACKLOG.md` on `main` still carries "Galactic Center place labels", which the Milky Way structures branch deletes.
