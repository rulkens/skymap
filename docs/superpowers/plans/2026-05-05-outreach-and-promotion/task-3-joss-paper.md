# Task 3: JOSS paper draft

The Journal of Open Source Software accepts ~1000-word software papers with a light, public review process. A merged JOSS submission gets a DOI, a Crossref entry, and lands in ADS — meaning when astronomers grep ADS for "WebGPU galaxy", skymap shows up. This is the single most durable academic artifact we can produce. JOSS expects a specific structure: summary, statement of need, key features, acknowledgements, references. Write the draft now; submit at joss.theoj.org once Task 1's Zenodo DOI is in place.

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/paper/paper.md`
- Create: `/Users/rulkens/Development/js/skymap/paper/paper.bib`

### Step 3.1: Create the `paper/` directory and write `paper.md`

- [ ] **Create the directory:**

```bash
mkdir -p /Users/rulkens/Development/js/skymap/paper
```

- [ ] **Write `/Users/rulkens/Development/js/skymap/paper/paper.md`** with this exact content (substitute the Zenodo DOI digits and ORCID iD if available; if no ORCID, remove that line):

```markdown
---
title: 'skymap: An interactive WebGPU explorer for galaxy catalogs'
tags:
  - astronomy
  - galaxy catalogs
  - WebGPU
  - data visualization
  - cosmology
  - gravitational-wave follow-up
authors:
  - name: Alexander Rulkens
    orcid: 0000-0000-0000-0000
    affiliation: 1
affiliations:
  - name: Independent researcher
    index: 1
date: 5 May 2026
bibliography: paper.bib
---

# Summary

`skymap` is a browser-based interactive 3D explorer for combined galaxy
catalogs. It loads selected slices of the Sloan Digital Sky Survey
(SDSS DR18; @Almeida2023), the 2MASS Redshift Survey (2MRS;
@Huchra2012), and the GLADE catalog (@Dalya2018) — together totalling
several million galaxies — and renders them as point primitives with
selective per-galaxy thumbnail textures on close approach, using the
WebGPU graphics API directly from a Chromium-based browser. The user
can orbit the cosmic-web wedge, focus on individual galaxies via a
command palette, view their photometric and spectroscopic metadata in a
side panel, and toggle between four density-correction modes
(volume-limited, $1/V_{\max}$, Schechter luminosity-function weighting,
and uncorrected) for visually unbiased exploration of the local
universe.

The tool is documented didactically: source files include explanatory
prose alongside implementation, so the codebase doubles as a worked
example of WebGPU rendering, GPU-side picking, and cosmological
coordinate transforms in TypeScript.

# Statement of need

Astronomers and outreach educators frequently want to inspect 3D galaxy
distributions without spinning up a Jupyter notebook with `astropy` and
`plotly`, and without installing a desktop visualisation suite such as
TOPCAT [@Taylor2005] or Aladin Desktop [@Bonnarel2000]. Existing
browser tools either focus on 2D sky overlays (Aladin Lite,
@Boch2014), provide curated guided tours rather than free
exploration (AAS WorldWide Telescope, @Rosenfield2018), or are limited
to a single survey.

`skymap` fills the niche of a free-exploration, multi-survey, 3D,
zero-install browser tool. Its three target user groups are:

1. _Gravitational-wave electromagnetic follow-up._ Given a sky
   localisation region from a LIGO–Virgo–KAGRA detection (@LVK2021),
   observers can scan the GLADE-derived nearby-universe volume for
   plausible host galaxies in 3D rather than projected onto the sphere.
2. _Teaching and student exploration of large-scale structure._ The
   SDSS wedge with the Sloan Great Wall, the 2MRS local-volume cluster,
   and the cosmic-web filaments are visible at a glance, supporting
   classroom demonstrations without preparation overhead.
3. _Public outreach and general curiosity._ A WebGPU-capable browser
   is the only requirement; no Python, no data download, no install.

# Key features

- _Three real galaxy catalogs_ parsed at build time into a custom 48-byte
  binary format and loaded incrementally in the browser. Cross-matched
  by position to deduplicate galaxies present in more than one survey.
- _Density-correction modes_ implementing $1/V_{\max}$ (@Schmidt1968)
  and Schechter luminosity-function (@Schechter1976) weights, plus an
  angular-isotropy toggle, addressing Malmquist bias for visual
  comparison across distance.
- _Per-galaxy thumbnail rendering_ on close approach, using a 2048×2048
  texture atlas with LRU eviction. Thumbnails are fetched on demand
  from SDSS DR18 ImgCutout (CORS-permitted) for SDSS galaxies and from
  the CDS hips2fits DSS proxy for 2MRS and GLADE.
- _GPU-side picking_ via an `r32uint` pick texture, allowing
  interactive hover and click selection across the full multi-million
  galaxy set with constant-time lookup.
- _Render-on-demand_ main loop: the renderer idles when the camera and
  thumbnail queue are quiescent, enabling the tab to remain open in the
  background without sustained GPU load.
- _HyperLEDA orientation enrichment_ (@Makarov2014) for galaxies with
  measurable axis ratio and position angle, so disc galaxies render as
  oriented impostors rather than circular dots.

# Acknowledgements

This project is built entirely on publicly available data and open
software. The author thanks the SDSS, 2MRS (Huchra et al.), GLADE, and
HyperLEDA teams for releasing their catalogs in machine-readable form,
the CDS Strasbourg group for the VizieR service and the hips2fits proxy,
and the WebGPU working group at the W3C for an API that makes
multi-million-point browser rendering tractable. Skymap was developed
as a personal didactic project; community feedback and bug reports are
welcome via the GitHub issue tracker.

# References
```

- [ ] **Verify** the file is well-formed YAML front-matter + Markdown:

```bash
head -20 /Users/rulkens/Development/js/skymap/paper/paper.md
wc -w /Users/rulkens/Development/js/skymap/paper/paper.md
```

Expected: front-matter delimited by `---` lines, body word count between 700 and 1100 (JOSS target ~1000 words excluding front-matter and references).

### Step 3.2: Write `paper.bib`

- [ ] **Write `/Users/rulkens/Development/js/skymap/paper/paper.bib`** with the bibtex entries cited above:

```bibtex
@article{Almeida2023,
  author       = {Almeida, A. and others},
  title        = {The Eighteenth Data Release of the {Sloan Digital Sky Surveys}: Targeting and First Spectra from {SDSS-V}},
  journal      = {The Astrophysical Journal Supplement Series},
  volume       = {267},
  number       = {2},
  pages        = {44},
  year         = {2023},
  doi          = {10.3847/1538-4365/acda98}
}

@article{Huchra2012,
  author       = {Huchra, J. P. and Macri, L. M. and Masters, K. L. and others},
  title        = {The {2MASS} Redshift Survey---Description and Data Release},
  journal      = {The Astrophysical Journal Supplement Series},
  volume       = {199},
  number       = {2},
  pages        = {26},
  year         = {2012},
  doi          = {10.1088/0067-0049/199/2/26}
}

@article{Dalya2018,
  author       = {D{\'a}lya, G. and Galg{\'o}czi, G. and Dobos, L. and others},
  title        = {{GLADE}: A galaxy catalogue for multimessenger searches in the advanced gravitational-wave detector era},
  journal      = {Monthly Notices of the Royal Astronomical Society},
  volume       = {479},
  number       = {2},
  pages        = {2374--2381},
  year         = {2018},
  doi          = {10.1093/mnras/sty1703}
}

@inproceedings{Taylor2005,
  author       = {Taylor, M. B.},
  title        = {{TOPCAT} \& {STIL}: Starlink Table/{VOTable} Processing Software},
  booktitle    = {Astronomical Data Analysis Software and Systems XIV},
  series       = {ASP Conference Series},
  volume       = {347},
  pages        = {29},
  year         = {2005}
}

@article{Bonnarel2000,
  author       = {Bonnarel, F. and Fernique, P. and Bienaym{\'e}, O. and others},
  title        = {The {ALADIN} interactive sky atlas},
  journal      = {Astronomy and Astrophysics Supplement Series},
  volume       = {143},
  pages        = {33--40},
  year         = {2000},
  doi          = {10.1051/aas:2000331}
}

@inproceedings{Boch2014,
  author       = {Boch, T. and Fernique, P.},
  title        = {Aladin Lite: Embed your Sky in the Browser},
  booktitle    = {Astronomical Data Analysis Software and Systems XXIII},
  series       = {ASP Conference Series},
  volume       = {485},
  pages        = {277},
  year         = {2014}
}

@article{Rosenfield2018,
  author       = {Rosenfield, P. and Fay, J. and Gilchrist, R. K. and others},
  title        = {{AAS WorldWide Telescope}: A Seamless, Cross-Platform Data Visualization Engine for Astronomy Research, Education, and Democratizing Data},
  journal      = {The Astrophysical Journal Supplement Series},
  volume       = {236},
  number       = {1},
  pages        = {22},
  year         = {2018},
  doi          = {10.3847/1538-4365/aab776}
}

@article{LVK2021,
  author       = {{LIGO Scientific Collaboration} and {Virgo Collaboration} and {KAGRA Collaboration}},
  title        = {{GWTC-3}: Compact Binary Coalescences Observed by {LIGO} and {Virgo} during the Second Part of the Third Observing Run},
  journal      = {Physical Review X},
  volume       = {13},
  number       = {4},
  pages        = {041039},
  year         = {2023},
  doi          = {10.1103/PhysRevX.13.041039}
}

@article{Schmidt1968,
  author       = {Schmidt, M.},
  title        = {Space Distribution and Luminosity Functions of Quasi-Stellar Radio Sources},
  journal      = {The Astrophysical Journal},
  volume       = {151},
  pages        = {393},
  year         = {1968},
  doi          = {10.1086/149446}
}

@article{Schechter1976,
  author       = {Schechter, P.},
  title        = {An analytic expression for the luminosity function for galaxies},
  journal      = {The Astrophysical Journal},
  volume       = {203},
  pages        = {297--306},
  year         = {1976},
  doi          = {10.1086/154079}
}

@article{Makarov2014,
  author       = {Makarov, D. and Prugniel, P. and Terekhova, N. and Courtois, H. and Vauglin, I.},
  title        = {{HyperLEDA}. III. The catalogue of extragalactic distances},
  journal      = {Astronomy \& Astrophysics},
  volume       = {570},
  pages        = {A13},
  year         = {2014},
  doi          = {10.1051/0004-6361/201423496}
}
```

- [ ] **Verify the bib parses**, e.g. with `pandoc` if available, otherwise just `grep` the citation keys against `paper.md`:

```bash
grep -oE '@[A-Z][A-Za-z]+[0-9]{4}' /Users/rulkens/Development/js/skymap/paper/paper.md | sort -u > /tmp/paper_citekeys.txt
grep -oE '^@[a-z]+\{[A-Z][A-Za-z]+[0-9]{4}' /Users/rulkens/Development/js/skymap/paper/paper.bib | sed 's/.*{//' | sort -u > /tmp/bib_citekeys.txt
diff /tmp/paper_citekeys.txt <(sed 's/^/@/' /tmp/bib_citekeys.txt)
```

Expected: empty diff — every `@Foo2020` in `paper.md` has a matching entry in `paper.bib`, and vice versa. If the diff isn't empty, fix the mismatched key.

### Step 3.3: Commit the JOSS draft

- [ ] **Commit:**

```bash
cd /Users/rulkens/Development/js/skymap
git add paper/paper.md paper/paper.bib
git commit -m "$(cat <<'EOF'
docs: add JOSS paper draft

Add paper/paper.md (~1000 words) and paper/paper.bib for submission to
the Journal of Open Source Software.  Covers summary, statement of
need (three target audiences: GW EM follow-up, large-scale-structure
teaching, public outreach), key features, and acknowledgements.

Submission to joss.theoj.org once the v0.1.0 Zenodo DOI is locked in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

### Step 3.4: Submit to JOSS (deferred until repo polish lands)

- [ ] **Open** https://joss.theoj.org/papers/new

- [ ] **Fill** the submission form: repository URL `https://github.com/rulkens/skymap`, branch `main`, version `v0.1.0`, software paper path `paper/paper.md`. Author name and email match `paper.md`. Submit.

- [ ] **Verify by checking** that JOSS bot posts a "Pre-Review" issue on `rulkens/skymap` within ~24 hours:

```bash
gh issue list --repo rulkens/skymap --search "JOSS in:title" --json number,title,state
```

Expected: a pre-review issue exists, opened by `whedon` or `editorialbot`. Reply on that issue when the editor pings — the JOSS review cadence is async over weeks.
