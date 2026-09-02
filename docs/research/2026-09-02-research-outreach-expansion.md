# Research outreach expansion — which groups to approach next

**Date:** 2026-09-02
**Scope:** after the MCPM collaboration (Polyphorm macOS port + web MCPM workbench now in use by the Burchett/Elek/Forbes group), map the other research groups where the same pattern could repeat: skymap as the public showcase, plus a live tool that feeds back into their science.
**Status:** research note / idea-mine. Nothing here is committed work; a picked-up item goes through brainstorm → refactor-ground → spec as usual.

---

## 1. What made MCPM work (the pattern to repeat)

Reverse-engineering the one collaboration that landed, five ingredients were present. Candidate groups are scored against them below.

1. **A published, derived 3D product** skymap could render as-is (the SDSS DR17 Cosmic Slime VAC). Rendering a group's own product in a continuous true-scale zoom is the outreach offer, and it costs them nothing.
2. **An open reference implementation** of the method (Polyphorm) that runs on a GPU and could be ported to a live tool. This is where the "feeds back" part comes from: the researchers got an interactive version of their own algorithm.
3. **Their existing visualisation was offline** (C++/CUDA desktop, video renders). A browser tool that anyone in the group opens with a link is a real capability gap, not a nicety.
4. **A parameter the group argues about** (agent sensing distance, deposit, decay, the trace-mass normalisation) that a live tool lets them explore in seconds instead of a batch job.
5. **A validation loop** ([`compareTraceCubes`](../../tools/mcpm-workbench/validate/compareTraceCubes.ts)) rigorous enough that the port surfaced something about the reference product itself ([trace-mass offset](mcpm-trace-mass-offset.md)). That is the moment outreach became research input.

Groups with all five are rare. Groups with 1 + 3 are common and still worth an email; 2 + 4 are what turn a data credit into a collaboration.

## 2. Candidates

Ordered by warmth: skymap already ingests their data, or already has the thread that leads to them. Each entry: who, the skymap hook that exists today, the workbench-shaped offer, the feedback-to-research angle, and how to get introduced.

### Tier 1 — skymap already renders their work

#### Cosmicflows (Lyon IP2I / Hawaii IfA / CEA Saclay)

- **Who:** Hélène Courtois (Lyon 1, CF4++ reconstruction), Brent Tully + Ehsan Kourkchi (Hawaii, CF4 distances, [EDD](http://edd.ifa.hawaii.edu/)), Daniel Pomarède (CEA, [SDvision](https://arxiv.org/abs/1702.01941) cosmography videos), Alexandra Dupuy ([watershed superclusters](https://arxiv.org/abs/2305.02339)).
- **Hook today:** CF4 density volume, CF4++ flow field, CF4 distances inside 30 Mpc are all in the runtime ([science.md](../science.md#where-things-are)). This is the deepest existing dependency after SDSS.
- **Workbench offer:** a live _basin-of-attraction_ explorer: integrate the CF4++ velocity field in the browser, watershed the streamlines, show Laniakea and the five other basins with a smoothing/threshold slider. Their own pipeline is SDvision + batch Python; someone outside the group has already rebuilt the watershed reproducibly on pygfx/WebGPU ([manlius/laniakea](https://github.com/manlius/laniakea), MIT, v1.0 March 2026), which shows the demand and gives a validation target.
- **Feedback angle:** skymap places galaxies beyond 30 Mpc in redshift space and does not correct fingers-of-god. Using the CF4++ velocity field to _de-project_ galaxy positions live (redshift-space ↔ real-space toggle) is something cosmographers want to look at and rarely can. Basin boundaries are sensitive to smoothing; a slider makes that argument visual.
- **Timing hook:** the March 2026 [Vela-Banzi](https://www.news.uct.ac.za/article/-2026-03-13-uct-and-global-partners-uncover-vast-hidden-supercluster-behind-the-milky-way) result (Hollinger, Lyon 1, with Kraan-Korteweg at UCT) used 65k CF4 distances + 8k new Zone-of-Avoidance redshifts to show a supercluster more massive than Laniakea hiding behind the Milky Way. Skymap already has a [zone-of-avoidance guide layer](../grill-sessions/zone-of-avoidance-guide-layer-2026-08-12.md) and a zoom that literally passes through the Milky Way. "The supercluster you cannot see because our galaxy is in the way" is the best outreach story on this list, and Lyon is the door.
- **Intro path:** cold email is fine; cite the CF4 credit in the live app. Courtois is a Dutch-adjacent regular at NOVA/Leiden talks.

#### MPA Galactic Cartography (Enßlin group, Garching)

- **Who:** Torsten Enßlin, Gordian Edenhofer (1.25 kpc dust map), Laurin Söding ([3D HI + CO](https://www.aanda.org/articles/aa/full_html/2025/01/aa51361-24/aa51361-24.html)), Lewis McCallum et al. ([Milky Way Atlas: velocity-resolved 3D HI within 1.25 kpc](https://arxiv.org/abs/2607.07451), July 2026), Lilly Kormann (local superclouds, 2026). Portal: [Galactic Cartography](https://wwwmpa.mpa-garching.mpg.de/~ensslin/research/research_GalacticCartography.html).
- **Hook today:** the Edenhofer dust volume is already extracted to `.scfd` and sits untracked waiting for renderer wiring ([DATA.md](../DATA.md), [grill session](../grill-sessions/edenhofer-dust-volume-2026-08-19.md), backlog item `createTieredScfdFetcher`). Shipping that layer _is_ the first email.
- **Workbench offer:** their method (Information Field Theory) is not GPU-portable the way MCPM was, but they publish **posterior samples**, and nobody gives them a browser viewer that scrubs across samples. An uncertainty-aware volume viewer (mean, per-sample, variance as opacity) over dust + HI + CO in the same frame is new to them.
- **Feedback angle:** skymap's Milky Way is a Freudenreich analytic model; theirs is measured local ISM. Putting the two in one frame, with Gaia stars, exposes where the analytic disk disagrees with the dust. The Milky Way Atlas adds radial velocity, which is a fourth dimension the time control could drive.
- **Timing hook:** Gaia DR4 lands **2 December 2026** ([release date](https://www.cosmos.esa.int/web/gaia/news)). Every 3D dust map gets rebuilt on it. Being their visualiser before that day means being in the DR4 press cycle.

#### Aquila consortium — BORG / Manticore (Stockholm / IAP / Imperial)

- **Who:** Jens Jasche (Stockholm), Guilhem Lavaux (IAP), Stuart McAlpine ([Manticore-Local](https://arxiv.org/abs/2510.16574), and [Manticore II, June 2026](https://arxiv.org/html/2606.10020): SDSS + BOSS volumes), Rosa Malandrino ([Bayesian catalog of 100 voids](https://arxiv.org/abs/2507.06866), A&A Jan 2026, [data on GitHub](https://github.com/RosaMalandrino/LocalVoids/)). [Consortium site](https://www.aquila-consortium.org/).
- **Hook today:** skymap's void markers come from VizieR catalogs; the Malandrino catalog is a direct upgrade with posterior distributions for centre and radius. Manticore-Local is a 50-realisation posterior of the matter field within ~200 Mpc, the same volume skymap's local-structure layers cover.
- **Workbench offer:** field-level inference groups struggle to _show_ a posterior. A viewer that scrubs 50 realisations, renders mean + variance, and overlays the real 2M++ galaxies is a paper figure they cannot make today. It is the same `.scfd` + tiering machinery as MCPM.
- **Feedback angle:** the strongest on this list. Manticore II covers the **same SDSS footprint as the MCPM VAC**. Two independent cosmic-web reconstructions, one from slime-mould agents and one from Bayesian forward modelling, side by side in one tool with the same galaxies, is a comparison neither group has published and both would want. The MCPM group is the introduction.
- **Intro path:** via Burchett/Elek (they know the field-level people), or cold, citing the Malandrino catalog integration.

#### DisPerSE and its users (IAP / Strasbourg)

- **Who:** Thierry Sousbie (IAP, author), Katarina Kraljic (Strasbourg, filaments and galaxy evolution, [2026 A&A](https://www.aanda.org/articles/aa/abs/2026/02/aa57368-25/aa57368-25.html)), plus the [multi-block DisPerSE](https://academic.oup.com/mnras/article/550/4/stag1323/8734300) authors (July 2026) who are pushing it to gigaparsec volumes.
- **Hook today:** skymap runs DisPerSE at build time ([buildFilaments.ts](../../tools/filaments/buildFilaments.ts)), and found empirically that SDSS's wedge footprint makes it lock onto survey edges ([DATA.md](../DATA.md#filaments-disperse)). That observation is itself worth sending.
- **Workbench offer:** a _persistence-cut explorer_. The 5σ / smoothing choice is exactly the knob every DisPerSE paper defends in a paragraph; scrubbing it live over a real catalog is a teaching and a research tool. The Delaunay + Morse-Smale core is CPU work, but the skeleton can be precomputed at several cuts and blended.
- **Feedback angle:** modest on its own; strong combined with the next tier (three filament finders on one catalog).

#### DESI (LBNL)

- **Who:** consortium, not a group; the outreach office ("High School of the Dark Universe", `desi3d`) is the contact. DR2 released **30 July 2026** ([releases](https://data.desi.lbl.gov/doc/releases/)).
- **Hook today:** DR1 cones/slices are already an opt-in layer; the [DR1 feasibility note](2026-06-05-desi-dr1-as-a-data-source.md) is deferred on rendering capacity, not on data.
- **Assessment:** best reach, least feedback. Treat as a distribution channel (their EPO would embed a skymap link), not a research collaboration.

### Tier 2 — open cosmic-web methods, MCPM-shaped, not yet in skymap

These have ingredients 2 and 4: an open algorithm, a contested parameter, and a group whose visualisation is static. Each is a candidate for a second "workbench" and for a **filament-finder comparison layer** (DisPerSE vs Bisous vs NEXUS+ vs MCPM on the same galaxies), which is a paper in itself.

- **NEXUS+ — Marius Cautun (Leiden) and Rien van de Weygaert (Kapteyn, Groningen).** Multiscale Hessian filter on the density field, classifies voids / walls / filaments / nodes ([NEXUS](https://arxiv.org/abs/1209.2043)). It is a stack of Gaussian smoothings and eigenvalue tests: trivially GPU-portable, a natural compute-shader workbench with a live scale-range slider. Van de Weygaert is the cosmic-web-topology authority (DTFE, Zeldovich Universe symposia, still publishing in 2026); both are a train ride away for a Dutch developer, and NOVA is the shared umbrella. **Highest-value new contact on this list.**
- **Bisous — Elmo Tempel (Tartu).** Marked-point-process filament finder; the [SDSS filament catalogue](https://ui.adsabs.harvard.edu/abs/2014yCat..74383465T/abstract) is on VizieR and drops into skymap's filament format as a second layer with no new tooling. The MCMC core is less workbench-friendly; the offer is the comparison layer.
- **Spine / H-Spine — Miguel Aragon-Calvo (UNAM).** Watershed hierarchy of voids, walls and filaments ([H-Spine, 2024](https://arxiv.org/abs/2308.16186)). He builds his own visualisations and would likely engage on method; the hierarchy (voids nested in voids) is a good zoom story.
- **CLUES / HESTIA — Noam Libeskind (AIP Potsdam), Jenny Sorce, Yehuda Hoffman.** Constrained simulations of the Local Group and local volume from Cosmicflows velocities ([HESTIA](https://academic.oup.com/mnras/article/498/2/2968/5897372)). Offer: a "simulated twin" toggle beside the real 2MRS/GLADE local volume. Overlaps the Cosmicflows contact (Hoffman is on both).

### Tier 3 — the stellar neighbourhood, rung by rung (parsecs to the Galactic centre)

Below supergalactic scale the map changes character: the objects are stars with full 6D phase space, the science is _kinematic_, and almost every group's headline result is a **time** story (traceback, flyby, tidal tail, stream, orbit). Skymap already has the two things those groups lack in a browser: a true-scale continuous zoom and a simulation clock. The backlog item [Grand tour: Earth start + scale rungs](../backlog/2026-07-22-grand-tour-earth-start.md) is the internal hook; each rung below wants one group.

**The one workbench that serves the whole tier:** a GPU orbit integrator in a fixed Galactic potential (a Milky Way model of the McMillan or galpy kind), driven by the existing clock, over Gaia 6D stars. Every group below runs that integration offline (galpy, Agama, N-body) and none has it live. Rewinding Sco-Cen 20 Myr to its birth sites, running Gliese 710 forward to its 1.3 Myr flyby, unwinding the Hyades tails, and tracing Gaia-Enceladus debris are all the same compute shader with a different selection. It is the MCPM-workbench move for this scale, and it is GPU-shaped in exactly the way MCPM was.

#### 0–20 pc: the Sun's immediate surroundings

- **Cluster of Local Interstellar Clouds — Jeffrey Linsky (JILA), Seth Redfield (Wesleyan).** Fifteen warm clouds within ~15 pc; the Sun sits at the edge of the Local Interstellar Cloud, and a 2025 paper on the [origin of the cluster](https://arxiv.org/abs/2504.00093) gives a 3D morphology. Nobody renders this; it is the first thing outside the heliosphere in the zoom and skymap currently shows nothing between Pluto and the nearest stars. Data is small (spherical-harmonic surfaces); a layer, not a workbench.
- **20 pc census — Davy Kirkpatrick (IPAC) and Backyard Worlds (Zooniverse, Aaron Meisner, Adam Schneider).** [~3,600 stars and brown dwarfs](https://arxiv.org/pdf/2312.03639) with distances, the most complete volume-limited sample anywhere. Citizen-science project, so the outreach fit is exact: their discoverers already want to "see" where their brown dwarf sits. Skymap's GCNS layer stops at what Gaia sees; the Y dwarfs are missing.
- **Habitable Worlds Observatory target stars — NASA ExEP.** [~160 nearby stars](https://science.nasa.gov/exoplanets/target-star-catalog/) chosen for the 2040s exo-Earth survey, each already with a per-star 3D page. A `#focus=` tour through them is trivial; the value is that NASA's outreach office is looking for exactly this kind of embed.
- **Close stellar encounters — Coryn Bailer-Jones (MPIA Heidelberg).** [Gaia DR3 flybys](https://iopscience.iop.org/article/10.3847/2041-8213/ac816a): Gliese 710 to 0.06 pc in 1.3 Myr, HD 7977 inside 0.05 pc 2.8 Myr ago, Oort-cloud perturbation as the consequence. Pure time-control demo: scrub ±6 Myr and watch stars come and go. The dataset is a table of ~60 stars; the integrator above is what makes it a workbench.

#### 100–500 pc: the Local Bubble and the star-forming neighbourhood

This is the richest rung and one institute is the hub: **the Vienna group of João Alves** (Radcliffe Wave PI; Stefan Meingast, tidal tails and extended stellar systems; Sebastian Ratzenböck, SigMA clustering; Núria Miret-Roig, traceback ages), tightly linked to **Goodman and Zucker** (CfA / STScI) and to **Leiden** (Eleonora Zari's [3D young-star density maps](https://arxiv.org/abs/1810.09819), Anthony Brown as co-author).

- **Local Bubble surface and Radcliffe Wave.** The [Local Chimney model](https://arxiv.org/abs/2403.04961) and the wave are published 3D surfaces; skymap's Edenhofer dust layer, once wired, shows the same structures as density. Rendering surface + dust + Gaia young stars in one frame is the beat; these people already export interactive figures and will engage on method.
- **Sco-Cen as 37 clusters — Ratzenböck et al.** [SigMA](https://www.aanda.org/articles/aa/full_html/2023/10/aa46901-23/aa46901-23.html) found 13,000 members in 37 coeval, comoving clusters with ages 3–21 Myr arranged in chains, with a [2026 velocity-dispersion follow-up](https://www.aanda.org/articles/aa/full_html/2026/05/aa55519-25/aa55519-25.html). Their narrative is sequential star formation propagating along chains; rewinding it live is the figure they draw as arrows today. SigMA itself is a density-based clustering that could be a second, smaller workbench with the density threshold as the contested knob.
- **Hyades tidal tails — Tereza Jerabkova (ESO), Meingast, and a [2026 paper](https://arxiv.org/html/2603.29360v1) using the tails to constrain bar and spiral pattern speeds.** 800 pc of stars trailing a cluster you can see with the naked eye. Skymap renders the Hyades already; the tails are a membership list.
- **Open-cluster census — Emily Hunt and Sabine Reffert (Heidelberg).** [7,167 clusters](https://www.aanda.org/articles/aa/full_html/2023/05/aa46285-23/aa46285-23.html), 1.3M member stars, with a [2026 selection-function paper](https://www.aanda.org/articles/aa/full_html/2026/02/aa57781-25/aa57781-25.html). Same shape as skymap's structure markers, one scale down: cluster rings + labels + membership colouring in the star field. Cheap layer, big visual payoff, and the "structure marker" machinery already exists.

#### 1–3 kpc: dust and the Local Arm

- **3D dust from Paris — Rosine Lallement and Jean-Luc Vergely (Observatoire de Paris).** The other dust-map lineage beside Edenhofer, and the one with an existing EU-funded web viewer: [G-Tomo-3D](https://github.com/explore-platform/g-tomo-3d) from the EXPLORE platform. Treat as a peer to compare notes with, and as a second dust volume for an A/B toggle (two independent reconstructions of the same clouds is the same argument as MCPM vs Manticore, one scale down).
- **Kevin Jardine** ([galaxymap.org](http://galaxymap.org/)) sits here too: his OB-star density isosurfaces out to 3 kpc are exactly a skymap layer, and he already works with Leiden and Heidelberg.

#### 3–10 kpc: the disc as a dynamical system

- **Spiral arms and warp — Eloisa Poggio and Ronald Drimmel (INAF Torino).** Gaia-mapped arm segments and the disc warp; skymap's Milky Way is the Freudenreich analytic model with the warp unmodelled ([science.md](../science.md#measured-derived-or-modelled)). Their maps are the measured replacement for the modelled disc, the same swap MPA offers for dust.
- **Phase spiral — Teresa Antoja (Barcelona), Jason Hunt (Toronto).** The 2018 discovery that the disc is still ringing from a perturbation. Not a spatial structure, so it needs a velocity-space view toggle; lower priority, but it is the single most famous Gaia result and the disc groups would notice a tool that shows it.

#### Halo and streams: Galactic archaeology (the 2026 hook)

- **Amina Helmi (Kapteyn, Groningen)** shared the **2026 Kavli Prize in Astrophysics** with Vasily Belokurov (Cambridge) and Rodrigo Ibata (Strasbourg) for the Gaia-Enceladus merger and the streams work ([Kavli](https://www.kavliprize.org/bio/amina-helmi)). Dutch, prize year, and a story with a Powers-of-Ten shape: the stars around the Sun include debris of a galaxy swallowed ten billion years ago. Colour Gaia stars by kinematic origin (disc, Gaia-Enceladus, Helmi streams) and the neighbourhood becomes an archaeology dig. Ibata's STREAMFINDER streams are the halo-scale arcs. The orbit integrator is again the workbench; their own visualisation is velocity-space scatter plots.

#### Galactic centre: S-stars (same-week email)

- **GRAVITY collaboration — Frank Eisenhauer, Stefan Gillessen (MPE Garching).** Skymap already renders 39 S-star orbits from Gillessen 2017 and, as of [#645](https://github.com/rulkens/skymap/pull/645), a lensed close-up of Sgr A\*. On **19 August 2026** MPE announced [S301](https://www.mpe.mpg.de/8222492/news20260819-2), a star reaching 280 gravitational radii with the prospect of measuring the black hole's spin. Adding S301 and refreshing the orbital elements is a data edit, and the email writes itself: "your press release, live, in a true-scale zoom from Earth". Their press office already produces videos; a browser embed is the one thing they do not have.

### Peers at this scale, not targets

Gaia Sky (Toni Sagristà, Heidelberg ARI), OpenSpace (AMNH / Linköping), and G-Tomo-3D (EXPLORE). They are the people who will say which Gaia DR4 tables matter on 2 December; talk to them before then.

### Also on the radar

- **GLADE+ / UpGLADE — Gergely Dálya (ELTE Budapest).** Skymap ships GLADE v2.3; GLADE+ is 22M galaxies built for gravitational-wave host searches. The outreach hook is live: overlay a LIGO-Virgo-KAGRA sky localisation and show "which of these galaxies could have hosted it". Feedback: GLADE's own completeness-versus-distance is something they visualise in 2D only.
- **Zone of Avoidance — Renée Kraan-Korteweg (UCT, emerita) and MeerKAT HI surveys.** Reached through the Cosmicflows / Vela-Banzi door above.
- **Euclid** first cosmology release is planned for **October 2026**; Dutch groups (Leiden, Groningen) are deep in the consortium. Too big to be a "group", but the release is a timing hook for whatever local-structure layer is current then.
- **Rubin EDP2** (July 2026) and **4MOST** (first light Oct 2025, 4HS hemisphere survey to come) are data-rights-gated or not yet released; note and revisit.

## 3. Scoring

| Group                        | Product to render           | Open GPU-able method              | Their viz is offline       | Contested knob                         | Validation target            | Existing skymap thread               |
| ---------------------------- | --------------------------- | --------------------------------- | -------------------------- | -------------------------------------- | ---------------------------- | ------------------------------------ |
| Cosmicflows                  | yes                         | streamlines + watershed           | yes (SDvision)             | smoothing, basin edges                 | manlius/laniakea, Dupuy 2023 | CF4 density, flow, ZoA layer         |
| MPA cartography              | yes (dust, HI, CO)          | no (IFT) — but posterior samples  | yes                        | none live; uncertainty                 | published samples            | Edenhofer `.scfd` waiting            |
| Aquila / Manticore           | yes (posterior, voids)      | no (HMC) — but 50 realisations    | yes                        | prior, bias model                      | same SDSS box as MCPM        | void markers, MCPM VAC               |
| DisPerSE                     | yes                         | partly (precomputed cuts)         | yes                        | persistence σ                          | our own edge-lock finding    | buildFilaments                       |
| NEXUS+                       | catalog-derived             | **yes** (Hessian filter)          | yes                        | scale range                            | Cautun's public code         | none yet                             |
| Bisous                       | yes (VizieR)                | weak (MCMC)                       | yes                        | none                                   | VizieR catalog               | none yet                             |
| Radcliffe / Local Bubble     | yes (surface models)        | n/a                               | no (glue, plotly)          | none                                   | published models             | young-stars field                    |
| Vienna (Alves) neighbourhood | yes (surfaces, memberships) | **yes** (orbit integrator, SigMA) | partly (glue, plotly)      | traceback potential, density threshold | published members/ages       | Gaia stars, young-stars field, clock |
| Helmi / Galactic archaeology | yes (membership labels)     | **yes** (orbit integrator)        | yes (velocity-space plots) | potential, selection                   | published stream members     | Gaia stars, clock                    |
| GRAVITY (S-stars)            | yes (orbital elements)      | n/a                               | video only                 | none                                   | Gillessen 2017 in-app        | S-stars + Sgr A\* lens               |
| Bailer-Jones encounters      | yes (60-star table)         | **yes** (orbit integrator)        | yes                        | potential                              | published table              | clock                                |
| Hunt & Reffert clusters      | yes (VizieR)                | n/a                               | yes                        | none                                   | VizieR                       | structure markers                    |
| GLADE+                       | yes                         | n/a                               | 2D only                    | completeness                           | GLADE v2.3 pipeline          | GLADE parser                         |

## 4. What the offer looks like (reusable package)

Every approach so far has converged on the same four deliverables. Naming them makes the pitch one paragraph.

1. **A layer in skymap** with credit and a shareable `#focus=` URL per figure. Costs the group nothing; the tour beat is the outreach.
2. **A workbench**, when the method is GPU-shaped: a browser port that runs their algorithm on their data live, with the contested parameters as sliders. The MCPM workbench is the reference.
3. **A validation harness** against their published product, so the port is quotable. This is what produced the trace-mass offset finding and is the credibility item in the email.
4. **A recorded clip** via `npm run record-tour` for their press office, since institutes want video before they want an app.

## 5. Suggested order

1. **Cosmicflows (Lyon)** now: warm, deepest existing dependency, and the Vela-Banzi story gives a press-ready reason to write this month.
2. **MPA Galactic Cartography** now: ship the Edenhofer layer first, then write. Target being in place before Gaia DR4 on 2 December.
3. **NEXUS+ (Cautun/van de Weygaert)** in parallel: the only Dutch cosmic-web group, and the only Tier 2 method that ports as cleanly as MCPM did.
4. **Aquila / Manticore** once one of the above is public: the MCPM-vs-Manticore comparison is the research payoff, and it is a stronger pitch with the MCPM group's name attached.
5. **GRAVITY / MPE** this week: S301 is a data edit on a layer that already exists, and the press release is three weeks old.
6. **Vienna (Alves group)** before Gaia DR4: the orbit-integrator workbench is the second MCPM-shaped tool, and it lands on the four groups (Sco-Cen, Radcliffe, Hyades tails, encounters) in one build. Open with the Local Bubble + Radcliffe layer.
7. **Helmi (Kapteyn)** in the Kavli year, once the integrator exists; same tool, halo selection.
8. DisPerSE, Bisous, GLADE+, Hunt & Reffert, the 20 pc census, and the Local Interstellar Clouds as follow-ons that mostly reuse existing formats.

## 6. Funding note (NL)

NWO's WECOM science-communication call has **no 2026 round**; the programme is being restructured and the 2027 call was to be announced mid-2026 ([WECOM](https://www.nwo.nl/en/researchprogrammes/dutch-research-agenda-nwa/science-communication-and-outreach/wecom-science-communication)). [NWA Citizen Science 2026](https://www.nwo.nl/en/calls/nwa-citizen-science-2026) (up to €100k per project) is open and a university partner (Leiden/Kapteyn via NOVA) would be the applicant. Any of the Dutch contacts above can carry that; it is a reason to open with them even if the science payoff is elsewhere.
