# Skymap Outreach and Promotion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **NOTE — this is an ops/content/external-outreach plan, not a code plan.** "Verify by running test" becomes "verify by checking <concrete thing>" — no fake unit tests for ops actions. Tasks are still bite-sized with exact deliverables.

## Goal

Take skymap from a deployed-but-unknown personal project to a citable, discoverable, talked-about tool — without overclaiming. Ship the small artifacts that make the repo look credible to astronomers (DOI, screenshots, JOSS draft, releases), then surface it to the right communities (HN, Bluesky, Reddit), then warm-pitch the academic groups who would actually use it.

## Architecture

Sequenced in three waves:

- **Wave A (Tasks 0–2):** Release + repo polish — everything that makes a stranger landing on the GitHub page take it seriously. Task 0 (v0.2.0 release) is the news hook; Task 1 (hero GIF, screenshots, DOI badge) is the storefront; Task 2 (HyperLEDA R2) removes the biggest contributor friction wall.
- **Wave B (Tasks 3, 6):** Durable artifacts — JOSS paper draft and the optional RNAAS note, both citable and indexable in ADS.
- **Wave C (Tasks 4–5):** Outreach — broad public posts first, then targeted academic emails that can reference traction and cite the v0.2.0 release.

## Tech stack

`gh` CLI, Zenodo (web UI + GitHub OAuth), CleanShot X / ffmpeg / gifski for capture, plain Markdown for the JOSS paper, plain text for posts and emails. No code changes to the renderer.

## Voice

Skymap is a personal didactic project that happens to be a useful tool. Outreach should match: "interactive WebGPU explorer documented didactically as a learning project; useful for X/Y/Z" — never "next-generation cosmology platform". Astronomers smell hype. The README's existing tone (honest, technical, with a learning-to-read-the-code angle) is the right register; copy that into every artifact.

## Sequencing

| Task | Depends on | Status |
|---|---|---|
| [0 — Cut v0.2.0 + concept-DOI](task-0-release.md) | nothing | pending |
| [1 — Repo polish](task-1-repo-polish.md) | (Task 0 helpful but not strict) | mostly shipped |
| [2 — HyperLEDA R2 distribution](task-2-hyperleda-r2.md) | nothing | committed (`97ff3cc`), CSV fetch pending |
| [3 — JOSS paper](task-3-joss-paper.md) | Task 0 (DOI) | pending |
| [4 — Public posts](task-4-public-posts.md) | Tasks 0 + 1 | pending |
| [5 — Academic emails](task-5-academic-emails.md) | Task 4 traction | pending |
| [6 — RNAAS note (optional)](task-6-rnaas.md) | Task 0 (DOI) | pending |

## Status snapshot (2026-05-06)

- **Task 0** — done 2026-05-06. v0.2.0 release cut, Zenodo minted version-DOI `10.5281/zenodo.20053519` under concept DOI `10.5281/zenodo.20037028`. v0.1.0 version-DOI is `10.5281/zenodo.20037029` (kept for reference). README badge + CITATION.cff cite the concept DOI so they always resolve to the latest version.
- **Task 1** — done 2026-05-06. All eight README assets present and wired in: `hero.gif`, `ui-overview.png`, `tier-selector.png`, `infocard-detail.png`, `local-group.png`, `wide-field.png`, `zoomed.gif`, `density-correction-modes.png`. Topic chips and DOI badge live.
- **Task 2** — infra committed on `feat/outreach-r2-hyperleda-cache`. `tools/syncR2.ts` and README updated. CSV fetch is ~52k / ~1.5M rows — needs a full re-run before gzip + sync. See [task-2-hyperleda-r2.md](task-2-hyperleda-r2.md).
- **Tasks 3–6** — not started.

## Files in this folder

| File | Contents |
|---|---|
| `README.md` | This index — goals, voice, sequencing table, status snapshot |
| `TODO.md` | Flat checklist of currently-actionable unchecked items |
| `task-0-release.md` | v0.2.0 tag, GitHub release, Zenodo wait, concept-DOI switch |
| `task-1-repo-polish.md` | Topic chips, hero GIF, screenshots, Zenodo DOI, README embeds |
| `task-2-hyperleda-r2.md` | HyperLEDA CSV fetch → gzip → R2 sync |
| `task-3-joss-paper.md` | JOSS paper draft (`paper/paper.md` + `paper/paper.bib`) |
| `task-4-public-posts.md` | Show HN, Bluesky thread, Reddit posts (full drafts) |
| `task-5-academic-emails.md` | Five cold emails to SDSS, GLADE, AAS WWT, CDS, LVK teams |
| `task-6-rnaas.md` | Optional RNAAS note (`paper/rnaas.md`) |

## Self-review checklist (run before declaring the plan ready)

- [x] **Spec coverage:** Each "still missing" item from the brief has at least one task.
  - Zenodo DOI → Task 1 (1.4, 1.5)
  - Hero GIF → Task 1 (1.2, 1.6)
  - Multiple screenshots → Task 1 (1.3, 1.6)
  - GitHub topics → Task 1 (1.1)
  - JOSS paper draft → Task 3
  - arXiv/RNAAS note → Task 6 (optional)
  - HyperLEDA cache via R2 → Task 2
  - Show HN post → Task 4 (4.1)
  - Bluesky post → Task 4 (4.2)
  - Reddit posts → Task 4 (4.3)
  - SDSS outreach → Task 5 (5.1)
  - GLADE authors → Task 5 (5.2)
  - AAS WWT → Task 5 (5.3)
  - CDS Strasbourg → Task 5 (5.4)
  - LVK EM follow-up → Task 5 (5.5)

- [x] **Placeholder scan:** No "TBD", "implement later", "fill in details", "add appropriate", "similar to Task N" inside step bodies. The literal string `NNNNNNNN` appears only as a substitution marker (and Step 1.5, 5.6 have explicit "substitute the real digits" instructions).

- [x] **Verification steps are concrete, not "looks right":**
  - Topic chips: `gh repo view --json repositoryTopics`
  - Hero GIF: `file` + `ls -lh` + visual loop check
  - DOI: `curl -sI` returns 302 redirect
  - CITATION.cff: `grep` for non-TODO `doi:` line, GitHub sidebar widget renders BibTeX
  - HyperLEDA R2 upload: `curl -sI https://data.skymap.rulkens.com/data/hyperleda_pa.csv.gz` returns 200
  - JOSS paper: `wc -w` and citekey diff against bib
  - HN: HN Firebase API for score/comments
  - Bluesky/Reddit: visit profile, confirm thread is live and chained
  - Cold emails: sent-mail folder check, no `NNNNNNNN` literal
  - RNAAS: `wc -w`, PDF renders

- [x] **Drafts complete, not skeletons:**
  - Show HN title + body + first comment (full prose, ~250 words)
  - Bluesky 4-post thread (full prose, all four posts)
  - Three Reddit posts (titles + bodies, all three subs)
  - Five cold emails (full prose, ~150-200 words each, customised by recipient)
  - JOSS paper (~1000 words, complete with bib)
  - RNAAS note (~600 words, complete)
  - All commit messages

- [x] **Ordering:** Release (Task 0) → repo polish (Task 1) → R2 artefact (Task 2) → durable artifact (Task 3) → public posts (Task 4) → cold emails (Task 5) → optional second durable artifact (Task 6). Tasks 4 and 5 explicitly gate on Tasks 0 + 1; Task 5 explicitly gates on Task 4.
