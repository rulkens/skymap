# Grill Session: README.md rewrite — 2026-08-24

Source: conversation — user asked for a full feature audit of the codebase followed by a grilled proposal for a greenfield README structure.

The README's last real rewrite was 2026-05-12; ~3.5 months of shipped work (solar system/Earth, Gaia stars, procedural Milky Way, time simulation, grand tour, structures, flow field, labels, mobile support) is absent, and several sections are actively false (SpaceMouse was removed 2026-06-16, test counts, roadmap items that shipped). The session settled the structure, depth split, data story, and delivery plan for a from-scratch rewrite.

---

## Audit inputs

Four parallel codebase audits fed the session (renderer/engine layers, UI/state surfaces, data pipeline/tools, shipped-plans timeline). Headline facts the structure is built on:

- Five binary formats ship: SKMP v9 (galaxies), SKST v1 (stars), CCAT v1 (structures), SCFD v3 (scalar fields incl. flow), FILA v1 (filaments).
- Three deployed tool pages: `/galaxy/`, `/mcpm/`, `/flow/`; `curate-famous` is local-only.
- Off-by-default but toggleable: DESI cones, CF4++ flow field, constellations, CF-4 density volume. Hidden with no toggle: Polyphorm and MCPM-workbench volumes, Sgr A\* (caption-only).
- No WebXR and no SpaceMouse on main; input is keyboard + mouse/touch.
- ~1140 test files.

## Q1: Primary reader and identity

**The question:** Who is the README's primary reader, and what is skymap in the first sentence? This drives tagline, section order, and gallery order.

**Considerations:**

- **Option A (experience-first):** "A true-scale journey from Earth's surface to the edge of the observable universe, in your browser" — powers-of-ten framing; the zoom is the product, the catalogs are the evidence. Matches where the work since May actually went (the descent) and the tour's name, "The Long Way Out."
- **Option B (instrument-first):** "An interactive WebGPU explorer for the major galaxy redshift surveys" — the old README's science-tool framing; safer for a JOSS-style scholarly-purpose narrative, but demotes the solar-system/stars work to a garnish.

**Decision:** Experience-first, with the real-data claim fused into the first sentence — the visitor gets the powers-of-ten hook, the scientist gets the credibility signal immediately. Primary reader: curious visitor / potential user, covering both self-hosters and scientists wanting astrophysical data visualized. Real data everywhere is a first-sentence claim, backed by the provenance table (Q6). Copy constraint reaffirmed: no LLM tells anywhere in the copy.

## Q2: Where the evicted depth lives

**The question:** Going slim means the current README's good essays (density-correction science, disk-impostor math, brightness model, coordinate frame, build walkthroughs) need a destination.

**Considerations:**

- **Option A (new reader-facing page):** `docs/science.md` — "what the pixels mean": coordinate frame, distance model, brightness→alpha, density correction, colour indices, galaxy LOD passes. Build walkthroughs move to `docs/DATA.md` / existing `data/raw/*/README.md`s. One new doc to maintain, but it's the page a citing scientist wants.
- **Option B (fold into DATA.md/RENDERER.md):** no new files, but mixes reader prose into contributor landmine docs — both audiences lose.
- **Option C (funeral):** delete; git history keeps them. Throws away the didactic voice.

**Decision:** Option A, written to port — the user plans to upgrade the README into a user-facing Astro website later, so depth pages are authored as standalone markdown (self-contained, no README anchor coupling, one page per topic) that lift into Astro content collections unchanged. The README is the repo-facing door; the future site is the visitor-facing one.

## Q3: The real-data story in the quickstart

**The question:** A fresh clone renders synthetic fallback; real data means either the full pipeline (hours, GBs, Python/Rust) or prebuilt artifacts. What posture does the quickstart take?

**Considerations:**

- **Option A (prebuilt-first):** quickstart step 2 pulls prebuilt binaries from the public R2 bucket (`skymap-data.rulkens.com`), full pipeline relegated to `docs/DATA.md`. Commits the bucket as a stable public download endpoint and requires a fetch script.
- **Option B (pipeline-first):** the old README's approach — teach the SDSS query and fixed-width downloads. Reproducible but the visitor bounces off a multi-hour wall.
- **Option C (demo-only):** live demo for real data, local dev is synthetic. Weakens the self-hosting audience.

**Decision:** Option A. Companion deliverable: a supported fetch script (shape settled in Q10).

## Q4: How much gated/experimental surface the README admits

**The question:** Shipped features span default-on → opt-in toggle → hidden with no toggle → dev-only. Where's the advertising line?

**Considerations:**

- **Option A:** advertise only features with a real UI toggle (DESI cones, flow field, constellations, CF-4 volume — "off by default" noted in passing), one line for the debug panel (`d`), silent on half-shipped internals (Polyphorm/MCPM-workbench volumes, Sgr A\* placeholder).
- **Option B:** Option A plus an "Experimental" subsection naming the half-shipped items.
- **Option C:** default-on features only; even opt-in toggles undocumented.

**Decision:** Option A. Half-shipped internals in a README read as clutter or broken promises; the git log and docs already record them.

## Q5: The gallery

**The question:** Every current screenshot/GIF predates Earth, planets, stars, Milky Way, labels, and the tour. Media is the highest-leverage element for a visitor-facing README; regenerating is real work.

**Considerations:**

- **Option A (fresh capture set):** one hero (still or short descent GIF) + ~5 stills ordered by scale — Earth close-up, solar system + orbit trails, Gaia field/Milky Way, local volume with famous galaxies + labels, cosmic web with volumes/filaments. Captured via the existing record/cinema tooling.
- **Option B (salvage):** keep the least-stale shots, placeholders for missing scales, proper pass later with the Astro site.
- **Option C (minimal):** hero only; gallery becomes an Astro-site concern.

**Decision:** Option A. Captures scripted via cinema-mode tooling where possible; manual retakes flagged where scripting falls short.

## Q6: Scope of the data-provenance table

**The question:** The section that backs "every pixel is real data" — how many rows?

**Considerations:**

- **Option A (everything, terse):** ~14 one-line rows covering galaxy surveys (SDSS, 2MRS, GLADE, Milliquas, DESI DR1), Gaia DR3 + GCNS + Hipparcos-2, famous atlas, structures (MCXC/MSCC + VizieR), DisPerSE filaments, CF-4 density, MCPM slime VAC, CF4++ flow field, Earth/planet imagery (BMNG, EOX s2cloudless, night lights, textures), grouped sky vs. solar system.
- **Option B:** astronomical catalogs only; imagery gets a sentence + ATTRIBUTIONS.md link.
- **Option C:** headline surveys only (5 rows).

**Decision:** Option A, kept really terse, with `ATTRIBUTIONS.md` (already exists at repo root) linked as the authoritative credit list — attribution matters.

## Q7: The roadmap section

**The question:** The old roadmap rotted badly (half its items shipped). What replaces it?

**Considerations:**

- **Option A (item roadmap):** refreshed from the backlog — informative today, rots by December.
- **Option B (direction & non-goals):** 3–4 durable direction lines + explicit non-goals + `docs/BACKLOG.md` link as the live list.
- **Option C:** no roadmap section.

**Decision:** Option B minus the non-goals — a short "Direction" (durable lines only) plus the backlog link.

## Q8: The use-cases section

**The question:** The old README had a dedicated use-cases section (teaching, outreach, GW host candidates). Does it survive?

**Considerations:**

- **Option A (keep):** helps the scientist self-identify; JOSS-style reviewers look for stated scholarly purpose.
- **Option B (fold into pitch):** one sentence ("built for teaching, outreach, and catalog exploration"); the data table does the credibility work.
- **Option C:** drop entirely.

**Decision:** Option B.

## Q9: Deliverables and sequencing

**The question:** The rewrite decomposes into the README, the docs extraction (science.md + build-walkthrough moves), the fetch-prebuilt script the quickstart depends on, and the capture set. How do they land?

**Considerations:**

- **Option A (two PRs):** small script PR first (the README must reference a command that exists), then README + science.md + doc moves + images in one PR.
- **Option B:** everything in a single PR.
- **Option C:** three+ staged PRs.

**Decision:** Option A. Branch + draft PR from the start; this transcript saved before writing begins.

## Q10: Shape of the fetch-prebuilt script

**The question:** Full prebuilt data is heavy (large-tier galaxy bins ~165 MB, star bins, volume tiers; Earth tiles are their own multi-GB pyramid). What does the fetch script pull by default?

**Considerations:**

- **Option A (manifest-driven, essentials):** roughly what the live site loads, with flags for larger tiers and extra volumes; Earth tiles excluded (streamed from R2 at runtime, no local copy needed).
- **Option B (everything except Earth tiles, no flags):** simplest script, biggest download.
- **Option C (minimal small-tier default):** everything else via flags.

**Decision:** Option A modified: manifest-driven, but **all tiers by default** — galaxy + star bins across small/medium/large, structures, filaments, fonts, and the default-on volumes; flags for the hidden volumes; Earth tiles explicitly excluded.

---

## Settled structure

```
README.md  (~300 lines)
1. Hero        Name, one-line pitch (true-scale descent + real-data claim),
               hero media, [Launch demo →], browser-support matrix
2. The zoom    Powers-of-ten narrative paragraph (~10^7 m to ~10^26 m), with
               the teaching/outreach/catalog-exploration sentence folded in
3. Highlights  Scannable grid, ~12 one-liners with links (opt-in features
               marked "off by default"; one line for the debug panel)
4. Gallery     Hero + ~5 fresh captioned stills ordered by scale
5. The data    Terse provenance table (~14 rows, sky vs. solar system) +
               ATTRIBUTIONS.md link
6. Quickstart  npm install / dev (synthetic fallback), fetch-prebuilt step
               for real data, docs/DATA.md for the full pipeline
7. How it works  One paragraph (engine/React split, WebGPU HDR pipeline,
               tier streaming, render-on-demand) + 5-format one-liner list +
               links to docs/RENDERER.md, docs/DATA.md, docs/adrs/
8. Dev tools   Tool pages (/galaxy /mcpm /flow), perf harness, tour
               recorder, test-suite size — one line each
9. Direction   3–4 durable lines + docs/BACKLOG.md link
10. Cite · ATTRIBUTIONS.md · license · AI-assistance note
```

Depth pages (standalone markdown, Astro-portable): `docs/science.md` new; build walkthroughs into `docs/DATA.md` / `data/raw/*/README.md`s. Copy written with no LLM tells; final draft audited for them explicitly.
