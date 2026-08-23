# skymap

> Fly from Earth's surface to the edge of the observable universe in one true-scale WebGPU scene, built from real survey data.

[![CI](https://github.com/rulkens/skymap/actions/workflows/ci.yml/badge.svg)](https://github.com/rulkens/skymap/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/rulkens/skymap)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.20037028-1f87b3?logo=zenodo&logoColor=white)](https://doi.org/10.5281/zenodo.20037028)

<!-- TODO capture: replace with a fresh hero still or short descent GIF -->

![skymap: the descent from the cosmic web to Earth](docs/screenshots/hero.gif)

**[Live demo →](https://skymap.rulkens.com)** &nbsp; · &nbsp; Chrome 113+ &nbsp; · &nbsp; Edge 113+ &nbsp; · &nbsp; Firefox 141+ (145+ on Apple Silicon macOS) &nbsp; · &nbsp; Safari 26+

## The zoom

Skymap covers nineteen orders of magnitude, from Earth's surface (about 10⁷ m) to the horizon of the observable universe (about 10²⁶ m), in a single scene with no scale breaks. Zoom out from Earth and you pass the planets, then the Gaia star field, then the galactic disk, and finally the cosmic web: about three million catalogued galaxies. Everything sits where its catalog says it should.

The guided tour, "The Long Way Out," plays the whole descent with captions and timed camera moves. You can also just explore: orbit freely, or jump anywhere by name with Cmd+K. Skymap is meant for teaching large-scale structure, for outreach, and for browsing the catalogs themselves.

## Highlights

- About 3 million galaxies from SDSS, 2MRS, GLADE, and Milliquas. Each is a dot until you approach, then a procedural disk, then a real thumbnail ([how](docs/science.md#galaxy-level-of-detail)).
- A DisPerSE filament skeleton and an MCPM slime-mould density volume trace the cosmic web between the points.
- Clusters, superclusters, voids, and groups from MCXC, MSCC, and other VizieR catalogs, with markers and labels.
- Curated thumbnails and descriptions for the famous Messier and NGC galaxies.
- 16.8 million Gaia DR3 stars, extended by the GCNS and Hipparcos-2 supplements. Stars close enough to resolve become true-scale spheres.
- The S-stars orbit Sagittarius A\* on their measured Keplerian elements, with trails.
- The solar system runs on a live clock: all the planets plus Pluto and Charon, Saturn's rings, orbit trails, the Sun with bloom.
- Earth has PBR shading, night lights, relief, clouds, an atmosphere, and streamed surface tiles down to city scale.
- Jump the simulation to any date, change its rate, and share the moment with a `#t=` link.
- Cmd+K searches the famous atlas, 48,000 PGC name aliases, and named structures. `#focus=` links share camera targets.
- Off by default in the Settings panel: DESI DR1 cones, the CF4++ flow field, constellations, and the CF-4 dark-matter volume.
- Press `d` for per-pass GPU timings and render-pass toggles.

## Gallery

<!-- TODO capture -->

![Earth close-up with night lights and streamed surface tiles](docs/screenshots/earth-closeup.png)

_Earth from low orbit, with night lights and streamed surface tiles over the base map._

<!-- TODO capture -->

![Solar system with orbit trails](docs/screenshots/solar-system.png)

_The solar system at the current simulated time._

<!-- TODO capture -->

![Gaia star field and the procedural Milky Way](docs/screenshots/stars-milky-way.png)

_The Gaia star field giving way to the procedural Milky Way disk._

<!-- TODO capture -->

![Local volume with famous-galaxy thumbnails and labels](docs/screenshots/local-volume.png)

_The local volume: famous galaxies with curated thumbnails, structure labels, and filaments._

<!-- TODO capture -->

![Cosmic web at supercluster scale](docs/screenshots/cosmic-web.png)

_The point cloud, filament skeleton, and MCPM volume at supercluster scale._

## The data

Every dataset skymap renders is listed below. [docs/science.md](docs/science.md) explains how catalogue brightness, colour, and selection effects turn into pixels. Full citations and license terms live in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

**Sky**

| Source                           | Contributes                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| SDSS DR17 (spectroscopic)        | Deep northern spectroscopic slice, ~500k galaxies                               |
| 2MRS                             | All-sky near-IR redshift survey, local volume in every direction                |
| GLADE v2.3                       | All-sky million-galaxy compilation, fills SDSS's footprint gaps                 |
| Milliquas v8                     | ~940k spectroscopic quasars and AGN                                             |
| DESI DR1 LSS                     | Deep cone (Corona Borealis), wedge, and Sloan Great Wall slices; off by default |
| Gaia DR3 + GCNS + Hipparcos-2    | ~16.8M Milky Way stars, local 100 pc supplement, naked-eye bright stars         |
| Famous atlas                     | Curated Messier/NGC thumbnails and editorial descriptions                       |
| MCXC + MSCC + VizieR structures  | Cluster, supercluster, void, and group markers                                  |
| DisPerSE filaments               | Derived cosmic-web skeleton, computed offline from the point cloud              |
| CF-4 density (Courtois 2025)     | Dark-matter density volume; off by default                                      |
| MCPM cosmic web VAC (Wilde 2023) | Slime-mould cosmic-web density volume                                           |
| CF4++ flow field                 | Peculiar-velocity streamline field; off by default                              |

**Solar system**

| Source                                        | Contributes                                                     |
| --------------------------------------------- | --------------------------------------------------------------- |
| Blue Marble Next Generation + EOX s2cloudless | Earth whole-globe imagery and a deeper Sentinel-2 tile band     |
| Planet, moon, and ring textures               | Solar System Scope, USGS Astrogeology, and NASA mission mosaics |

## Quickstart

Requires Node 20+.

```bash
npm install
npm run dev
```

Open http://localhost:5173. Drag to orbit, scroll to zoom (on touch: drag and pinch). With no data files present the renderer falls back to 100,000 synthetic galaxies.

For real data, pull the prebuilt catalogs:

```bash
npm run fetch-data
```

This downloads the catalog, star, structure, and filament binaries from R2 into `public/data/`. They are the same files the live site serves. If you want to build them from the raw catalogs instead, see [docs/DATA.md](docs/DATA.md).

## How it works

The render loop lives in a long-running imperative engine. React subscribes to it for the handful of state slices the UI needs and owns nothing that updates per frame. The engine renders on demand: input and loading events request a frame, and the loop goes idle when nothing is moving. Every visible pass draws into one `rgba16float` HDR target, tone-mapped to the display at the end of the frame. Reversed-Z depth and a floating-origin camera hold precision across the full 10⁷–10²⁶ m range.

Catalog data ships in five binary formats, tiered, content-hashed, and streamed from R2 through a manifest fetched at boot:

- **SKMP v9**: galaxies, 64 bytes per row
- **SKST v1**: stars
- **CCAT v1**: structures (clusters, superclusters, voids, groups)
- **SCFD v3**: scalar fields (density and flow volumes)
- **FILA v1**: filaments

For more depth: [docs/RENDERER.md](docs/RENDERER.md) (renderer map, WebGPU landmines), [docs/DATA.md](docs/DATA.md) (pipeline, binary formats), [docs/science.md](docs/science.md) (rendering conventions), [docs/adrs/](docs/adrs/) (decision records).

## Finding your way around

The code is documented didactically throughout. If you're also looking to learn WebGPU, GPU picking, or the basics of cosmological coordinate math, the source is meant to be read.

```
src/
  components/   React UI shell (settings, info cards, tour, time bar)
  services/
    engine/     frame program, render scheduling, catalog loading
    gpu/        renderers and the WGSL/WESL shaders
    camera/     orbit camera, tweens, animation clips
  state/        Redux Toolkit slices, selectors, sagas
  data/         source registry and binary format specs
  utils/        pure helpers, heavily tested
tools/          data pipeline: fetchers, builders, workbenches, recorder
data/raw/       raw catalog downloads (payloads gitignored)
public/data/    built binaries the renderer loads (gitignored)
docs/           DATA.md, RENDERER.md, science.md, adrs/, BACKLOG.md
tests/          Vitest suite, mirrors src/
```

## Dev tools

- Three renderer workbenches deploy next to the main app: [/galaxy/](https://skymap.rulkens.com/galaxy/) (procedural Hubble-sequence galaxy), [/mcpm/](https://skymap.rulkens.com/mcpm/) (MCPM cosmic-web workbench), [/flow/](https://skymap.rulkens.com/flow/) (CF4++ flow-field visualizer)
- `npm run perf` measures per-pass GPU timings headlessly
- `npm run record-tour` renders the guided tour to 4K video offline
- ~1,150 test files under Vitest

## Direction

- More measured data where procedural stand-ins currently fill in
- Comoving distance from a ΛCDM integration (currently linear Hubble's law)
- Spatial chunking to get past the few-million-point ceiling; SDSS's full photometric catalog holds around a billion objects
- Wider platform support as WebGPU lands in more browsers

The live queue is [docs/BACKLOG.md](docs/BACKLOG.md).

## Cite, credit, and license

If you use skymap in a publication, talk, or derived work, please cite it via [CITATION.cff](CITATION.cff). GitHub's "Cite this repository" sidebar button exposes BibTeX and APA forms.

Skymap's source code is MIT-licensed; see [LICENSE](LICENSE). The catalog data, imagery, and external services it uses carry their own citation requirements and license terms (CC-BY-SA, public domain, publication citation), all enumerated in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

[CLAUDE.md](CLAUDE.md) at the repo root is onboarding guidance for AI coding assistants. It isn't load-bearing for the build or runtime. It exists because parts of this project were developed with AI assistance, and that context helps future AI-assisted edits.
