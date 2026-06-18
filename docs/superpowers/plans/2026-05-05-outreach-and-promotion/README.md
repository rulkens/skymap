# Skymap Outreach and Promotion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **NOTE — this is an ops/content/external-outreach plan, not a code plan.** "Verify by running test" becomes "verify by checking <concrete thing>" — no fake unit tests for ops actions. Tasks are still bite-sized with exact deliverables.

## Goal

Take skymap from a deployed-but-unknown personal project to a citable, discoverable, talked-about tool — without overclaiming. Ship the small artifacts that make the repo look credible to astronomers (DOI, screenshots, JOSS draft, releases), then surface it to the right communities (HN, Bluesky, Reddit), then warm-pitch the academic groups who would actually use it.

## Architecture

Sequenced in three waves:

- **Wave A (Tasks 0–2):** Release + repo polish — everything that makes a stranger landing on the GitHub page take it seriously. Task 0 (v0.2.0 release) is the news hook; Task 1 (hero GIF, screenshots, DOI badge) is the storefront; Task 2 (HyperLEDA R2) removes the biggest contributor friction wall.
- **Wave B (Task 3):** Durable artifact — the JOSS paper draft, citable and indexable in ADS. (Task 6 RNAAS dropped — see re-scope below.)
- **Wave C (Tasks 4, 5, 7, 8):** Outreach — public posts, Product Hunt, ed-tech blogs, and targeted academic emails, all now anchored to the steady traffic baseline rather than a launch spike.

## Re-scope (2026-06-18)

Six weeks and two releases on (v0.3.0, **v0.4.0** shipped 2026-05-30), the
plan's original spine — *"ride the v0.2.0 launch traction"* — is obsolete.
The launch moment passed and HN landed soft (score 5). Two facts reset the
plan:

1. **Steady 80–100 visitors/day.** A *durable* traction anchor that beats
   the launch-spike framing. It becomes the honest opener for every email,
   pitch, and post — replacing "got 5 points on HN".
2. **Competitive intel from a direct peer — AstroGrid** (velonspace.com).
   Same segment, same catalogs (2MRS + SDSS + HYG + JPL). Its *entire*
   visible footprint was **Product Hunt** (117 upvotes, #12 of day) +
   organic ed-tech blog pickup (outilstice.com). **No Reddit/HN thread.**
   Skymap's footprint is the exact mirror — HN/Bluesky/Reddit done, PH +
   ed-tech untouched. So the two highest-value new moves are the channels
   a proven peer used and skymap skipped.

**Net live campaign:**

- **Task 3 — JOSS paper** → keystone, do first. Time-independent; makes the
  emails real ("submitted to JOSS" > "5 points on HN").
- **Task 5 — academic emails** → re-gated onto Task 3 + the traffic stat,
  *not* onto cold public-post traction. Drafts already exist; Email 5 (LVK)
  dropped.
- **Task 7 — Product Hunt launch** → NEW, biggest gap, proven for this
  segment. See [task-7-product-hunt.md](task-7-product-hunt.md).
- **Task 8 — ed-tech blogger outreach** → NEW. See
  [task-8-edtech-blogs.md](task-8-edtech-blogs.md).
- **Task 4 — public posts** → dated May schedule dropped; untapped
  subreddit tiers (r/InternetIsBeautiful, r/cosmology, r/space) kept for
  opportunistic posting.
- **Task 6 — RNAAS** → DROPPED. Overlaps ~entirely with the JOSS paper;
  revisit only if JOSS stalls.

## Tech stack

`gh` CLI, Zenodo (web UI + GitHub OAuth), CleanShot X / ffmpeg / gifski for capture, plain Markdown for the JOSS paper, plain text for posts and emails. No code changes to the renderer.

## Voice

Skymap is a personal didactic project that happens to be a useful tool. Outreach should match: "interactive WebGPU explorer documented didactically as a learning project; useful for X/Y/Z" — never "next-generation cosmology platform". Astronomers smell hype. The README's existing tone (honest, technical, with a learning-to-read-the-code angle) is the right register; copy that into every artifact.

## Sequencing

| Task | Depends on | Status |
|---|---|---|
| [0 — Cut v0.2.0 + concept-DOI](task-0-release.md) | nothing | done 2026-05-06 (now at v0.4.0) |
| [1 — Repo polish](task-1-repo-polish.md) | (Task 0 helpful but not strict) | done 2026-05-06 |
| [2 — HyperLEDA R2 distribution](task-2-hyperleda-r2.md) | nothing | done 2026-05-07 (partial cache shipped) |
| [3 — JOSS paper](task-3-joss-paper.md) | concept DOI (have it) | **pending — keystone, do first** |
| [4 — Public posts](task-4-public-posts.md) | nothing (opportunistic) | HN/Bluesky/r-dataisbeautiful done; rest re-scoped |
| [5 — Academic emails](task-5-academic-emails.md) | Task 3 + traffic stat | drafted, unsent |
| [7 — Product Hunt launch](task-7-product-hunt.md) | capture video | **pending — NEW, biggest gap** |
| [8 — Ed-tech blogs](task-8-edtech-blogs.md) | (Task 7 helpful, not strict) | pending — NEW |
| [6 — RNAAS note](task-6-rnaas.md) | — | **DROPPED (overlaps JOSS)** |

## Status snapshot (2026-06-18)

- **Task 0** — done 2026-05-06. v0.2.0 release cut; concept DOI
  `10.5281/zenodo.20037028` is cited everywhere (auto-resolves to latest).
  **Now at v0.4.0** (shipped 2026-05-30); CITATION.cff already updated.
  *Open verification:* confirm Zenodo actually minted a deposit for the
  v0.3.0/v0.4.0 GitHub releases (webhook may or may not have fired) — the
  concept DOI resolving is what matters and is non-blocking.
- **Task 1** — done 2026-05-06. All eight README assets present and wired in.
- **Task 2** — done 2026-05-07. R2 serves the partial HyperLEDA cache.
- **Task 4** — partially done. HN (soft), Bluesky thread, r/dataisbeautiful
  all sent. Remaining Reddit re-scoped to opportunistic untapped tiers.
- **Tasks 3, 5, 7, 8** — pending; see the Re-scope section above for the
  live sequence. **Task 6 dropped.**

### Traction baseline
- **80–100 visitors/day, steady** (as of 2026-06-18) — the durable anchor
  for all Wave-C copy.

## Files in this folder

| File | Contents |
|---|---|
| `README.md` | This index — goals, voice, sequencing table, status snapshot |
| `TODO.md` | Flat checklist of currently-actionable unchecked items |
| `task-0-release.md` | v0.2.0 tag, GitHub release, Zenodo wait, concept-DOI switch |
| `task-1-repo-polish.md` | Topic chips, hero GIF, screenshots, Zenodo DOI, README embeds |
| `task-2-hyperleda-r2.md` | HyperLEDA CSV fetch → gzip → R2 sync |
| `task-3-joss-paper.md` | JOSS paper draft (`paper/paper.md` + `paper/paper.bib`) |
| `task-4-public-posts.md` | Show HN, Bluesky thread, Reddit posts + re-scoped subreddit tiers |
| `task-5-academic-emails.md` | Cold emails to SDSS, GLADE, AAS WWT, CDS (LVK dropped) |
| `task-6-rnaas.md` | RNAAS note — **DROPPED 2026-06-18** (overlaps JOSS) |
| `task-7-product-hunt.md` | Product Hunt launch (NEW — AstroGrid-derived channel) |
| `task-8-edtech-blogs.md` | Ed-tech blogger / newsletter outreach (NEW) |

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
