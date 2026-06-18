# Outreach Plan — Actionable TODO

Flat checklist of currently-unchecked items, grouped by task. Skip items marked `[x]` in the per-task files.

> **Re-scoped 2026-06-18** (see README "Re-scope" section). Live sequence:
> **Task 3 (JOSS, keystone) → Task 7 (Product Hunt) / Task 8 (ed-tech) /
> Task 5 (emails) / Task 4 (opportunistic subreddits)** — the last four
> no longer block each other; all anchor to the steady 80–100 visitors/day.
> Task 6 (RNAAS) is dropped.

## Task 0: Cut v0.2.0 release + refresh Zenodo DOI — DONE 2026-05-06

- [x] Edit `package.json` — bump `"version"` to `"0.2.0"`
- [x] Edit `CITATION.cff` — bump `version:` to `0.2.0` and update `date-released:`
- [x] Verify: `grep -E '^[[:space:]]*"version"' package.json` and `grep -E '^(version|date-released):' CITATION.cff`
- [x] Tag + push v0.2.0 (done 2026-05-06)
- [x] Cut GitHub release (web UI; PAT lacks `Contents: write`)
- [x] Zenodo minted v0.2.0 version-DOI `10.5281/zenodo.20053519` under concept DOI `10.5281/zenodo.20037028`
- [x] CITATION.cff + README badge cite concept DOI `10.5281/zenodo.20037028` (always-latest)

## Task 1: Repo polish — DONE 2026-05-06

All eight README assets are present in `docs/screenshots/` and wired in:
`hero.gif`, `ui-overview.png`, `tier-selector.png`, `infocard-detail.png`,
`local-group.png`, `wide-field.png`, `zoomed.gif`, `density-correction-modes.png`.
Topic chips, DOI badge, and inline rendering verified.

## Task 2: HyperLEDA R2 distribution — DONE 2026-05-07 (shipped partial cache)

Decision 2026-05-07: ship the partial run as-is rather than spending another
hour to fetch the remaining ~1.45 M PGCs. The 52,178-row CSV (41,332 with
populated PA) is already on R2 and covers the brightest, most-cross-matched
GLADE galaxies — the long tail is overwhelmingly empty HyperLEDA responses
anyway. Anyone who wants a fuller cache can still run `npm run fetch-hyperleda`
locally (it's resumable and the README still documents the fallback).

- [x] CSV exists at `data/raw/hyperleda_pa.csv` — 52,178 rows queried, 41,332 with PA
- [x] Compressed `hyperleda_pa.csv.gz` synced to R2
- [x] Verify upload: `curl -sI https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz` returns 200 (verified 2026-05-07)

## Task 3: JOSS paper draft

- [ ] Create `paper/` directory: `mkdir -p paper`
- [ ] Write `paper/paper.md` (full JOSS-format draft — content in [task-3-joss-paper.md](task-3-joss-paper.md) Step 3.1)
- [ ] Verify `paper.md`: `wc -w paper/paper.md` — expect 700–1100 words
- [ ] Write `paper/paper.bib` (BibTeX entries — content in [task-3-joss-paper.md](task-3-joss-paper.md) Step 3.2)
- [ ] Verify citekey parity: diff between `paper.md` keys and `paper.bib` entries should be empty
- [ ] Commit: `git add paper/paper.md paper/paper.bib`
- [ ] Submit at https://joss.theoj.org/papers/new once Task 0's DOI is locked in
- [ ] Verify: `gh issue list --repo rulkens/skymap --search "JOSS in:title"` shows pre-review issue within 24 h

## Task 4: Public posts — re-scoped (opportunistic, no calendar)

Done: Show HN (2026-05-06, soft), Bluesky thread (2026-05-07), r/dataisbeautiful (2026-05-07).

- [ ] Record a 20–30 s capture video (Tab-hidden UI) — shared asset with Task 7.
- [ ] **r/InternetIsBeautiful** — highest-fit untapped sub; interaction-first title.
- [ ] **r/cosmology** — large-scale-structure audience; high signal.
- [ ] **r/space** (VIDEO) and **r/Astronomy** (VIDEO; +17pp) — read sidebars first.
- [ ] Tier 2 opportunistic: r/WebGPU / r/programming (engineering angle).
- [ ] Obey the 10% self-promo rule, `[OC]` + data-source credit, spread over days.
- [ ] Verify each post in /new; reply to comments for 48 h.

## Task 5: Academic emails — re-gated onto Task 3 + traffic stat

- [x] Drafts exist locally under `posts-and-emails/` with concept DOI `10.5281/zenodo.20037028`.
- [ ] Refresh opener to lead with **80–100 visitors/day** + live demo (+ "JOSS submitted" once Task 3 lands).
- [ ] Confirm address — Email 2 GLADE / Gergely Dálya (current institution).
- [ ] Confirm address — Email 4 CDS / Thomas Boch + Pierre Fernique.
- [ ] Confirm address — Email 3 AAS WWT / Peter Williams (`pwilliams@aas.org`?).
- [ ] Send Email 1 (SDSS `outreach@sdss.org`), 2, 3, 4 — spread over 3–5 days.
- [ ] Email 5 (LVK) — **dropped** unless GW overlay ships or GW community reaches out.
- [ ] Verify sent-mail: no `NNNNNNNN` / `1228374974` literal; DOI correct everywhere.
- [ ] Start reply log at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/outreach_log.md`.

## Task 7: Product Hunt launch (NEW — see task-7-product-hunt.md)

- [ ] Capture flythrough video (shared with Task 4).
- [ ] Write tagline (≤60 chars), description (~260 chars), maker first-comment (~200 words).
- [ ] Decide account/handle (personal vs skymap-specific) — **user decision**.
- [ ] Pick gallery images from `docs/screenshots/`.
- [ ] Schedule launch (Tue–Thu, live 00:01 PT); reply to all comments in first 6 h.
- [ ] Log final rank + upvotes in `outreach_log.md`.

## Task 8: Ed-tech blogger outreach (NEW — see task-8-edtech-blogs.md)

- [ ] Build target list (~8–12 outlets, start with outilstice.com).
- [ ] Write pitch template (~120–150 words); state the WebGPU requirement up front.
- [ ] Customize per outlet; stagger sends; log in `outreach_log.md`.

## Task 6: RNAAS note — DROPPED 2026-06-18

Overlaps ~entirely with the JOSS paper (Task 3). Revisit only if JOSS stalls.
