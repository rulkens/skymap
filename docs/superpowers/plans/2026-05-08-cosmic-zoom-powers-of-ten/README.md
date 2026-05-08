# Cosmic Zoom — "Powers of Ten" for skymap

**Status:** Plan in progress (initial sketch — 2026-05-08, overnight planning session).
**Owner:** @rulkens.
**Audience for this folder:** the agent or human who picks this work up tomorrow morning, plus future readers who want to understand why the feature is shaped the way it is.
**Branch:** `worktree-cosmic-zoom-plan` (worktree at `.claude/worktrees/cosmic-zoom-plan`).

## What this folder is

A multi-document plan for adding a **guided cosmic zoom** to skymap — the "Powers of Ten" experience that takes the user from the Sun outward in a series of named shells (Solar System → Local Stars → Milky Way → Local Group → Local Sheet → Virgo Supercluster → Laniakea → Cosmic Web → Observable Universe), with each shell rendered with its own data sources, visual style, camera choreography, and overlay information.

The plan is split across many files because the feature touches every layer of the codebase (data pipeline, GPU renderers, engine orchestration, UX, copy-writing) and because each layer has its own audience. A single 5000-line spec would be unreadable. This README is the index — everything lives here, follow the links.

The plan is **not yet a commitment to build.** It is a deeply elaborated design for the user to react to in the morning. Some decisions are recommendations with alternatives; some sections explicitly defer to a later spec round once the user has weighed in.

## Why this plan exists

From the brainstorming session that triggered this work:

> "I really like the powers of 10 idea, I had it myself. But this is quite an undertaking. I would like every layer to have excellent visuals. We need dynamic data loading, pull in other data sources, do some overlay rendering of text, information that is actually genuinely interesting for a user."

Three threads converge here:

1. **A headline experience.** skymap today is excellent at "fly around 2.5 million galaxies and zoom into one." It does not yet have a curated, narrative experience that *explains itself* to a first-time visitor. The cosmic zoom is that experience.
2. **A reason to extend the data.** The catalogs we have (SDSS / 2MRS / GLADE) cover redshift-space galaxies from ~5 Mpc to ~1 Gpc. They cannot draw a planet, a nearby star, the Milky Way disk, or the cosmic microwave background. Each new shell pulls in a new dataset (Gaia, NED Local Volume, Cosmicflows-4, ROSAT, Planck, ...), broadening skymap from a "galaxy viewer" into a "cosmos viewer."
3. **A consolidation of in-flight work.** Several pending plans — MSDF labels, Milky Way impostor, tour animation, CF-4 dark-matter volume, asset-loading infrastructure — were each conceived in isolation. The cosmic zoom is the *integration target* that gives all of them a shared north star.

## How to read this folder

If you have **30 seconds**, read [`SUMMARY.md`](SUMMARY.md). Two pages. Tells you what this is.

If you have **15 minutes**, read in this order:
1. [`vision/00-product-vision.md`](vision/00-product-vision.md) — what we're building and for whom.
2. [`vision/01-narrative-script.md`](vision/01-narrative-script.md) — the actual story beats from Sun to CMB.
3. [`shells/00-shell-overview.md`](shells/00-shell-overview.md) — the nine shells at a glance.
4. [`implementation/00-phasing.md`](implementation/00-phasing.md) — what we'd actually build first.

If you have **an hour**, read everything in `vision/`, then skim every `shells/0*.md`, then read `rendering/00-scale-architecture.md` (the foundational technical spec) and `data/00-data-sources.md` (the master dataset catalog).

If you are about to **start implementing**, read [`implementation/00-phasing.md`](implementation/00-phasing.md), then the first phase's shell specs, then [`rendering/00-scale-architecture.md`](rendering/00-scale-architecture.md). The ADRs in `decisions/` answer "why was X done that way?" — read them when you're about to question or change a load-bearing choice.

## Folder map

```
2026-05-08-cosmic-zoom-powers-of-ten/
├── README.md                          ← you are here
├── SUMMARY.md                         ← 2-page exec summary
│
├── vision/                            ← what & why
│   ├── 00-product-vision.md
│   ├── 01-narrative-script.md         ← THE STORY (most important doc)
│   ├── 02-aesthetic-references.md
│   └── 03-comparison-products.md
│
├── shells/                            ← one file per zoom level
│   ├── 00-shell-overview.md
│   ├── 01-solar-system.md             ← ~10⁰ to 10² AU
│   ├── 02-stellar-neighborhood.md     ← ~10⁰ to 10² ly
│   ├── 03-milky-way.md                ← ~10² to 10⁵ ly
│   ├── 04-local-group.md              ← ~10⁰ to 10¹ Mly
│   ├── 05-local-sheet.md              ← ~10¹ to 10² Mly
│   ├── 06-virgo-supercluster.md       ← ~10² to 10² Mly
│   ├── 07-laniakea.md                 ← ~10² to 10³ Mly
│   ├── 08-cosmic-web.md               ← ~10³ Mly
│   └── 09-observable-universe.md      ← ~10⁴ Mly + CMB
│
├── data/                              ← acquisition plans per dataset
│   ├── 00-data-sources.md             ← master catalog
│   ├── 01-solar-system-ephemeris.md
│   ├── 02-gaia-stars.md
│   ├── 03-milky-way-model.md
│   ├── 04-local-group-catalog.md
│   ├── 05-tully-galaxy-groups.md
│   ├── 06-cluster-catalogs.md
│   ├── 07-cosmicflows.md
│   ├── 08-rosat-xray.md
│   ├── 09-planck-cmb.md
│   └── 10-binary-formats.md
│
├── rendering/                         ← GPU & math foundations
│   ├── 00-scale-architecture.md       ← FOUNDATIONAL
│   ├── 01-shell-transitions.md
│   ├── 02-camera-choreography.md
│   ├── 03-volumetric-effects.md
│   ├── 04-text-overlay.md
│   ├── 05-floating-origin.md
│   ├── 06-depth-precision.md
│   └── 07-performance.md
│
├── ux/                                ← interaction & copy
│   ├── 00-interaction-model.md
│   ├── 01-information-overlays.md
│   ├── 02-information-content.md      ← actual prose per shell
│   ├── 03-controls.md
│   ├── 04-accessibility.md
│   ├── 05-mobile.md
│   └── 06-onboarding.md
│
├── implementation/                    ← how we'd build it
│   ├── 00-phasing.md                  ← build order
│   ├── 01-mvp-definition.md
│   ├── 02-dependency-graph.md
│   ├── 03-risk-register.md
│   ├── 04-milestones.md
│   └── 05-test-plan.md
│
└── decisions/                         ← ADRs (why was X done that way?)
    ├── 0001-floating-origin.md
    ├── 0002-shell-discrete-vs-continuous.md
    ├── 0003-data-format-strategy.md
    ├── 0004-camera-rotation-during-tour.md
    ├── 0005-units-and-scale.md
    ├── 0006-information-pacing.md
    ├── 0007-data-licensing.md
    ├── 0008-build-pipeline.md
    └── 0009-existing-plan-coordination.md
```

## Coordination with existing in-flight plans

This plan does not exist in a vacuum. The following pending specs in `docs/superpowers/specs/` are either **dependencies** (we need them landed before cosmic zoom can ship) or **subsumed** (we replace / extend them):

| Existing spec | Relationship | Action |
|---|---|---|
| [MSDF labels](../../specs/2026-05-07-msdf-labels-design.md) | **Dependency.** Shell labels and overlay text use this. | Land first as designed; cosmic zoom adds many more `Label` instances. |
| [Tour animation](../../specs/2026-05-07-tour-animation-design.md) | **Subsumed.** The cosmic zoom IS the tour, expanded. | Close the tour-animation brainstorm; redirect its open questions into [`decisions/0004-camera-rotation-during-tour.md`](decisions/0004-camera-rotation-during-tour.md). |
| Milky Way impostor (`2026-05-04-milky-way-impostor.md`) | **Dependency** for Shell 3. | Land first; shell 3 shows it off. |
| CF-4 dark-matter volume render | **Subsumed** as Shell 7 visual technique. | The volume renderer becomes the Laniakea shell's primary visual. |
| Asset loading infrastructure | **Dependency.** New per-shell datasets use the AssetSlot primitive. | Land first; cosmic zoom adds ~10 new slots. |
| Engine restructure (Spec B) | **Dependency.** Shell controllers attach to the post-restructure engine. | Land all five PRs first; cosmic zoom assumes a clean `engine.ts` with phases extracted. |
| Services folder structure (Spec C) | **Soft dependency.** Cosmic-zoom code lands in the new folders. | Either land first, or put cosmic-zoom code in the new locations directly and let Spec C absorb. |

See [`decisions/0009-existing-plan-coordination.md`](decisions/0009-existing-plan-coordination.md) for the recommended sequencing.

## Naming

"Powers of Ten" refers to the [1977 Eames film](https://www.youtube.com/watch?v=0fKBhvDjuy0) that zooms from a picnic in Chicago out to the cosmic-microwave background and back into a proton. That film is the spiritual ancestor; see [`vision/03-comparison-products.md`](vision/03-comparison-products.md) for what we're trying to do better than the half-dozen extant "scale of the universe" web demos.

Internally, the codename is **"cosmic zoom"** — shorter than the user-facing label, and easier to grep. User-facing copy uses "Tour" or "Powers of Ten."

## Amendments

- **2026-05-09 — Earth opening and closing.** The cold open and the close beat have been replaced. Instead of dollying into the Sun's photosphere, the tour now opens at ground level on Earth at sunset (sky darkens, stars emerge, Milky Way rises, camera lifts off the surface, Earth shrinks below) and closes mirroring this on Earth at sunrise. Adds 4 new docs: [`shells/00a-earth-opening.md`](shells/00a-earth-opening.md), [`data/11-earth-textures.md`](data/11-earth-textures.md), [`rendering/08-atmosphere.md`](rendering/08-atmosphere.md), [`decisions/0010-earth-opening.md`](decisions/0010-earth-opening.md). The narrative script ([`vision/01-narrative-script.md`](vision/01-narrative-script.md)) now carries a "REVISED OPEN" / "REVISED CLOSE" section ahead of the legacy script. Drives ~2-3 weeks of new work; tightens the 90 s budget to ~1:48.

## Provenance

This plan was produced overnight on 2026-05-08 by an agent (Claude Opus 4.7) given an open-ended brief: "sketch out a plan in a subfolder of plans/ to the highest detail that you can manage overnight." The user approved the headline ("Powers of Ten zoom-out") during a brainstorm earlier the same day; the per-shell content, technical architecture, and implementation phasing are all proposed by the agent and **awaiting human review.**

Treat this folder as a thoroughly-elaborated proposal, not a final spec. Sections marked "**OPEN QUESTION**" need user input before implementation can start. Sections marked "**RECOMMENDATION**" are the agent's best judgment with the alternatives noted.
