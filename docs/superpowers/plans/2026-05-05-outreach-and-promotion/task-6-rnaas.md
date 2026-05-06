# Task 6: RNAAS note (optional, parallel to JOSS)

A Research Note of the AAS (RNAAS) is a 1000-word, lightly-reviewed, citable note in the AAS journals system. It lands in ADS and Crossref, just like JOSS, but the review is much faster (days, not weeks) and the audience is squarely astronomers. The cost is one re-write of the JOSS paper from a slightly different angle — JOSS frames it as software, RNAAS frames it as a tool/announcement. This is optional: do it only if Task 3's JOSS draft went smoothly and you have an evening.

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/paper/rnaas.md` (a derivative of `paper.md` with a different framing).

### Step 6.1: Write `rnaas.md`

- [ ] **Create** `/Users/rulkens/Development/js/skymap/paper/rnaas.md`:

```markdown
---
title: 'Skymap: An Interactive WebGPU 3D Explorer for the SDSS, 2MRS, and GLADE Galaxy Catalogs'
authors:
  - Alexander Rulkens (rulkens@gmail.com)
date: 2026-05-05
---

# Abstract

We present skymap, a free, open-source, browser-based interactive 3D
visualisation tool for galaxy catalogs. Skymap loads selected slices
of SDSS DR18 (~500k galaxies), the 2MASS Redshift Survey (~45k), and
the GLADE catalog (~3M), cross-matches them by sky position, and
renders the combined catalog as instanced billboards using the WebGPU
graphics API. Per-galaxy thumbnail textures are streamed in on close
approach from SDSS DR18 ImgCutout (for SDSS sources) and from the CDS
hips2fits proxy (for 2MRS and GLADE sources). The tool requires only
a Chrome 113+ or Edge 113+ browser; no installation, Python
environment, or local data download is needed.

# Description

Skymap is intended for three distinct audiences: (1) gravitational-wave
electromagnetic-counterpart follow-up groups, who can use the GLADE
volume to scan host-candidate populations in 3D rather than projected
on the celestial sphere; (2) educators and students teaching
large-scale structure, who can orbit the SDSS wedge and visually
inspect the Sloan Great Wall, the cosmic web, and local-volume
clusters with no environment setup; and (3) the general curious
public.

The renderer supports four density-correction modes (none,
volume-limited, $1/V_{\max}$, Schechter LF weighting) plus an
angular-isotropy toggle, addressing Malmquist bias for visual
comparison across distance. GPU-side picking via an `r32uint` texture
permits interactive hover and click selection across the full
multi-million galaxy set. A 2048×2048 LRU texture atlas streams in
per-galaxy thumbnails based on a per-frame apparent-pixel-size gate;
optional HyperLEDA orientation enrichment renders disc galaxies as
oriented impostors.

The codebase is documented didactically — explanatory prose lives
alongside implementation — and is released under the MIT license. Live
demonstration: https://skymap.rulkens.com. Source code, citation
metadata, and attribution: https://github.com/rulkens/skymap.

# Acknowledgements

Built on publicly available data from the SDSS, 2MRS, and GLADE
collaborations; thumbnail and DSS proxy services from the CDS
Strasbourg. WebGPU specification by the W3C GPU for the Web Working
Group.

# Software citation

Rulkens, A. (2026). skymap: An interactive WebGPU explorer for galaxy
catalogs (v0.1.0). Zenodo. https://doi.org/10.5281/zenodo.NNNNNNNN
```

- [ ] **Verify:**

```bash
wc -w /Users/rulkens/Development/js/skymap/paper/rnaas.md
```

Expected: ~400-700 words (RNAAS targets ~1000 max; shorter is fine).

### Step 6.2: Submit to RNAAS

- [ ] **Open** https://aas.org/journals/journals_about/research_notes_aas — follow the "Submit a Research Note" link to the IOP submission system.

- [ ] **Submit** with `paper/rnaas.md` content (RNAAS accepts a single PDF; convert via `pandoc rnaas.md -o rnaas.pdf` first):

```bash
cd /Users/rulkens/Development/js/skymap/paper
pandoc rnaas.md -o rnaas.pdf
ls -lh rnaas.pdf
```

- [ ] **Verify** the PDF renders cleanly (open it; check the abstract, body, citation block all look right).

### Step 6.3: Commit the RNAAS draft

- [ ] **Commit:**

```bash
cd /Users/rulkens/Development/js/skymap
git add paper/rnaas.md
git commit -m "$(cat <<'EOF'
docs: add RNAAS draft (parallel to JOSS submission)

Add paper/rnaas.md, a Research Note of the AAS draft framing skymap
as a tool announcement for astronomers (vs. paper.md which frames it
as software for the JOSS audience).  ~600 words, ADS-indexable on
acceptance.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```
