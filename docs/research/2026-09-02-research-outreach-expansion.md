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

### Tier 3 — Milky Way and stars (Gaia DR4 timing)

- **Radcliffe Wave / Local Bubble — Catherine Zucker (STScI), Alyssa Goodman (CfA), João Alves (Vienna).** They already publish interactive 3D figures (glue, plotly exports) and a 3D [Local Bubble surface model](https://arxiv.org/abs/2403.04961). Skymap has Gaia stars and a [young-stars field](../grill-sessions/young-stars-field-2026-08-09.md); adding the bubble surface and the wave in true scale, then zooming out to the cosmic web, is a Powers-of-Ten beat they do not have. They are the most viz-literate group on this list and the easiest to talk to about method.
- **Gaia DPAC — Anthony Brown (Leiden).** DR4 on 2 December 2026; Leiden runs the Dutch press side. A skymap DR4 layer ready on release day is an outreach asset for them, not a research one.
- **Peers, not targets:** Kevin Jardine ([galaxymap.org](http://galaxymap.org/), independent Gaia structure mapper who already collaborates with Leiden and Heidelberg), Toni Sagristà (Gaia Sky, Heidelberg ARI), OpenSpace (AMNH / Linköping). Worth knowing; they are the people who will tell you which DR4 tables matter.

### Also on the radar

- **GLADE+ / UpGLADE — Gergely Dálya (ELTE Budapest).** Skymap ships GLADE v2.3; GLADE+ is 22M galaxies built for gravitational-wave host searches. The outreach hook is live: overlay a LIGO-Virgo-KAGRA sky localisation and show "which of these galaxies could have hosted it". Feedback: GLADE's own completeness-versus-distance is something they visualise in 2D only.
- **Zone of Avoidance — Renée Kraan-Korteweg (UCT, emerita) and MeerKAT HI surveys.** Reached through the Cosmicflows / Vela-Banzi door above.
- **Euclid** first cosmology release is planned for **October 2026**; Dutch groups (Leiden, Groningen) are deep in the consortium. Too big to be a "group", but the release is a timing hook for whatever local-structure layer is current then.
- **Rubin EDP2** (July 2026) and **4MOST** (first light Oct 2025, 4HS hemisphere survey to come) are data-rights-gated or not yet released; note and revisit.

## 3. Scoring

| Group                    | Product to render      | Open GPU-able method             | Their viz is offline | Contested knob         | Validation target            | Existing skymap thread       |
| ------------------------ | ---------------------- | -------------------------------- | -------------------- | ---------------------- | ---------------------------- | ---------------------------- |
| Cosmicflows              | yes                    | streamlines + watershed          | yes (SDvision)       | smoothing, basin edges | manlius/laniakea, Dupuy 2023 | CF4 density, flow, ZoA layer |
| MPA cartography          | yes (dust, HI, CO)     | no (IFT) — but posterior samples | yes                  | none live; uncertainty | published samples            | Edenhofer `.scfd` waiting    |
| Aquila / Manticore       | yes (posterior, voids) | no (HMC) — but 50 realisations   | yes                  | prior, bias model      | same SDSS box as MCPM        | void markers, MCPM VAC       |
| DisPerSE                 | yes                    | partly (precomputed cuts)        | yes                  | persistence σ          | our own edge-lock finding    | buildFilaments               |
| NEXUS+                   | catalog-derived        | **yes** (Hessian filter)         | yes                  | scale range            | Cautun's public code         | none yet                     |
| Bisous                   | yes (VizieR)           | weak (MCMC)                      | yes                  | none                   | VizieR catalog               | none yet                     |
| Radcliffe / Local Bubble | yes (surface models)   | n/a                              | no (glue, plotly)    | none                   | published models             | young-stars field            |
| GLADE+                   | yes                    | n/a                              | 2D only              | completeness           | GLADE v2.3 pipeline          | GLADE parser                 |

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
5. DisPerSE, Bisous, Radcliffe, GLADE+ as follow-ons that mostly reuse existing formats.

## 6. Funding note (NL)

NWO's WECOM science-communication call has **no 2026 round**; the programme is being restructured and the 2027 call was to be announced mid-2026 ([WECOM](https://www.nwo.nl/en/researchprogrammes/dutch-research-agenda-nwa/science-communication-and-outreach/wecom-science-communication)). [NWA Citizen Science 2026](https://www.nwo.nl/en/calls/nwa-citizen-science-2026) (up to €100k per project) is open and a university partner (Leiden/Kapteyn via NOVA) would be the applicant. Any of the Dutch contacts above can carry that; it is a reason to open with them even if the science payoff is elsewhere.
