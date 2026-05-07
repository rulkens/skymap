# Outreach Plan — Actionable TODO

Flat checklist of currently-unchecked items, grouped by task. Skip items marked `[x]` in the per-task files. Start at Task 0 and work down.

## Task 0: Cut v0.2.0 release + refresh Zenodo DOI

- [ ] Edit `package.json` — bump `"version"` to `"0.2.0"`
- [ ] Edit `CITATION.cff` — bump `version:` to `0.2.0` and update `date-released:`
- [ ] Verify: `grep -E '^[[:space:]]*"version"' package.json` and `grep -E '^(version|date-released):' CITATION.cff`
- [x] Tag + push v0.2.0 (done 2026-05-06)
- [x] Cut GitHub release (web UI; PAT lacks `Contents: write`)
- [x] Zenodo minted v0.2.0 version-DOI `10.5281/zenodo.20053519` under concept DOI `10.5281/zenodo.20037028`
- [x] CITATION.cff + README badge cite concept DOI `10.5281/zenodo.20037028` (always-latest)

## Task 1: Repo polish — DONE 2026-05-06

All eight README assets are present in `docs/screenshots/` and wired in:
`hero.gif`, `ui-overview.png`, `tier-selector.png`, `infocard-detail.png`,
`local-group.png`, `wide-field.png`, `zoomed.gif`, `density-correction-modes.png`.
Topic chips, DOI badge, and inline rendering verified.

## Task 2: HyperLEDA R2 distribution (remaining items)

- [ ] Check CSV completeness: `wc -l data/raw/hyperleda_pa.csv` — expect ~1.5 M lines
- [ ] If incomplete, run: `npm run fetch-hyperleda` (~1 hour, resumable)
- [ ] Verify CSV header: `head -3 data/raw/hyperleda_pa.csv`
- [ ] Compress: `gzip -k -9 data/raw/hyperleda_pa.csv`
- [ ] Run sync: `npm run sync-r2`
- [ ] Verify upload: `curl -sI https://data.skymap.rulkens.com/data/hyperleda_pa.csv.gz | head -6`

## Task 3: JOSS paper draft

- [ ] Create `paper/` directory: `mkdir -p paper`
- [ ] Write `paper/paper.md` (full JOSS-format draft — content in [task-3-joss-paper.md](task-3-joss-paper.md) Step 3.1)
- [ ] Verify `paper.md`: `wc -w paper/paper.md` — expect 700–1100 words
- [ ] Write `paper/paper.bib` (BibTeX entries — content in [task-3-joss-paper.md](task-3-joss-paper.md) Step 3.2)
- [ ] Verify citekey parity: diff between `paper.md` keys and `paper.bib` entries should be empty
- [ ] Commit: `git add paper/paper.md paper/paper.bib`
- [ ] Submit at https://joss.theoj.org/papers/new once Task 0's DOI is locked in
- [ ] Verify: `gh issue list --repo rulkens/skymap --search "JOSS in:title"` shows pre-review issue within 24 h

## Task 4: Public posts (all pending Task 0 + Task 1)

- [ ] Show HN: submit title + URL at https://news.ycombinator.com/submit, post first-comment text immediately after
- [ ] Verify HN: `curl -s "https://hacker-news.firebaseio.com/v0/item/ITEM_ID.json" | jq '{title,score,descendants}'`
- [ ] Bluesky: post 4-part thread on bsky.app (content in [task-4-public-posts.md](task-4-public-posts.md) Step 4.2)
- [ ] Verify Bluesky thread is live and chained
- [ ] **Thu 7 May, 12:00 CEST**: r/MapPorn (image, no video needed; +10pp morning lift)
- [ ] **Thu 7 May, 12:00-18:00 CEST**: record 20-30 s screen capture of skymap orbit + zoom (Tab-hidden UI). Reused for r/Astronomy and r/WebGPU.
- [ ] **Thu 7 May, ~19:00 CEST**: r/Astronomy (VIDEO; +17pp lift)
- [ ] **Fri 8 May, ~12:00 CEST**: r/dataisbeautiful (image, short title; time-of-day is noise)
- [ ] **Fri 8 May, ~21:00-22:00 CEST**: r/WebGPU (VIDEO; +14pp lift, +8pp evening)
- [ ] Verify each Reddit post appears in /new; check upvote + comment count after 6 h
- [ ] Maintain threads: reply to comments for 48 h after each post

## Task 5: Academic emails (pending Task 4 traction)

- [ ] Substitute concept DOI `10.5281/zenodo.20037028` into all five email drafts
- [ ] Send Email 1 — SDSS outreach team (`outreach@sdss.org`)
- [ ] Send Email 2 — GLADE authors (Gergely Dálya — confirm address first)
- [ ] Send Email 3 — AAS WWT / Peter Williams (`pwilliams@aas.org` — confirm)
- [ ] Send Email 4 — CDS Strasbourg / Thomas Boch + Pierre Fernique (confirm addresses)
- [ ] Send Email 5 — LVK EM follow-up (GROWTH or ENGRAVE — choose one)
- [ ] Verify sent-mail: no `NNNNNNNN` literal in any sent message
- [ ] Start reply log at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/outreach_log.md`

## Task 6: RNAAS note (optional)

- [ ] Write `paper/rnaas.md` (content in [task-6-rnaas.md](task-6-rnaas.md) Step 6.1)
- [ ] Verify: `wc -w paper/rnaas.md` — expect ~400–700 words
- [ ] Convert to PDF: `pandoc paper/rnaas.md -o paper/rnaas.pdf`
- [ ] Verify PDF renders cleanly
- [ ] Submit at https://aas.org/journals/journals_about/research_notes_aas
- [ ] Commit: `git add paper/rnaas.md`
