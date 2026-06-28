---
name: add-famous
description: Use when adding a galaxy to skymap's famous layer — the named Messier/Caldwell/notable galaxies that get a thumbnail quad on close approach and a rich InfoCard. Triggers like "/add-famous", "add a famous galaxy", "add M64 to the famous catalog", "curate a new galaxy thumbnail", or "put NGC 5128 in the famous layer". Also for re-curating an existing famous galaxy's thumbnail.
---

# `/add-famous` — add a galaxy to the famous layer

## Overview

The famous layer (`public/data/famous.bin`) is the hand-curated set of named
galaxies — Messier, Caldwell, and a few extras — that get a per-galaxy thumbnail
quad on close approach and a rich InfoCard. Adding one is a short pipeline of npm
scripts with **one irreducibly manual step in the middle**: drawing the crop and
disk overlay in the curator UI. This skill runs the scriptable steps, stops for
that handoff (exactly like `/release` stops before the Zenodo publish), then
resumes for the build, the PR, and the R2 sync.

Two paths exist. **Curated** is the default — every one of the ~72 existing
entries was curated, and it produces a star-removed, deprojected, face-on disk.
**Fast** skips the curator and uses a Wikipedia hero image as-is; it's the
escape hatch for a galaxy not worth hand-tuning.

## When to use

- The maintainer wants a new named galaxy in the famous layer.
- A galaxy already in the seed needs its thumbnail (re-)curated.

**Not** for: bulk catalog rebuilds (`build-tiers`), or re-syncing data that
hasn't changed. Re-curating one existing galaxy doesn't need the seed step —
jump straight to the curator.

## Input

A galaxy identifier — a Messier/Caldwell number (`M64`, `C77`) or an NGC/IC name.
If omitted, ask which galaxy.

## The two paths

```
CURATED (default)
  seed entry  →  curate-famous [HANDOFF: crop + disk + Commit in UI]
    →  build-famous + build-tiers  →  commit (specific paths)  →  PR + merge  →  sync-r2-secure

FAST (no star-removal / no deproject)
  seed entry  →  fetch-famous-images  →  build-famous + build-tiers
    →  commit (specific paths)  →  PR + merge  →  sync-r2-secure
```

The only difference is how the images are produced: the curator (interactive,
high quality) vs. `fetch-famous-images` (automatic Wikipedia hero). Everything
after the image step is identical.

## Procedure

### 1. Preflight

- Run from the **main checkout** (not a worktree). Worktrees have throwaway
  `public/data/` (see CLAUDE.md "worktree data isolation"); the build + R2 sync
  must happen where the real bins live.
- Confirm the survey bins exist: `ls public/data/glade-*.bin public/data/2mrs.bin`.
  `build-famous` reads **only** the seed; the famous-vs-survey dedup lives in
  `build-tiers` (`buildAllBins` → `dropFamousMatches`), which drops survey rows
  within 30″ of a famous-seed position. So the survey bins must exist **and be
  rebuilt after the seed changes** (step 4b). If they're absent, run
  `npm run build-tiers` once first.
- Branch + PR, never a direct push to `main` (project rule).

### 2. Add the seed entry

The seed is `data/seeds/famous_galaxies.seed.json`, a JSON array sorted by `id`. Write
fields in the canonical order used by `expandFamousFromCatalogs.orderEntryFields`
so a later `expand-famous` run produces a zero diff: `id`, `names`, `ra`, `dec`,
`distanceMpc`, `diameterKpc`, `type`, `description`, then optional `axisRatio`,
`positionAngleDeg`, `magB`, `magV`, `magK`. That serializer omits `commonName`,
so don't add one — the display name falls back to `names[0]`.

- **Messier (M1–110) or Caldwell (C1–109):** run `npm run expand-famous`. It
  walks the M/C tables, pulls distance / diameter / orientation / photometry from
  HyperLEDA, and (for genuinely new entries) a Wikipedia summary for the
  `description`. It **preserves** `id` / `names` / `description` on existing
  entries and **overwrites** the photometric/size fields from HyperLEDA. Use
  `--dry-run` to preview, `--no-cache` to force a refetch.
- **Anything else (a non-M/C NGC/IC, e.g. NGC 3166):** hand-author the entry —
  `expand-famous` only knows the M/C tables, so it won't reach it. Reassurance: a
  later `expand-famous` run **keeps** your manual entry untouched (it preserves
  any seed `id` not in its M/C tables — see its "preserved unmatched curated
  entry" pass). Use a filesystem-safe lowercase `id` like `ngc3166`, and pull the
  data from HyperLEDA so your values match the rest of the catalog — see 2b.

### 2b. Hand-authoring a custom entry from HyperLEDA

**Use the helper script** — it fetches HyperLEDA and prints paste-ready seed
entries with every field already computed by the pipeline's own formulas:

```bash
npm run famous-seed-from-leda -- NGC3166 NGC3169
```

It emits a JSON array (canonical field order) with `description` left empty for
you to fill from each galaxy's Wikipedia lead. Paste the objects into
`data/seeds/famous_galaxies.seed.json` (sorted by `id`; `ngc…` ids sort after `m…`,
i.e. at the end), then write the descriptions. That's the whole step — the rest
of this section is what the script does under the hood.

The script (`tools/famous/famousSeedFromHyperleda.ts`) reuses
`parseHyperLedaMeandata` + `mergeIntoFamousEntry` + `orderEntryFields`, so it
can't drift from `expand-famous`. It hits the `meandata` endpoint on the
plain-HTTP `atlas.obs-hp.fr` mirror, so a Node `fetch` reaches it directly — the
expired-cert wall only bites browser/WebFetch paths that upgrade
`leda.univ-lyon1.fr` to HTTPS. If you ever need the human-readable record in a
browser, that path *does* hit the expired cert + a 302, so fall back to curl:

```bash
#   -k accept the expired cert   -L follow the 302 to the atlas.obs-hp.fr mirror
curl -skL "http://leda.univ-lyon1.fr/ledacat.cgi?o=NGC3166" -o /tmp/leda.html
```

The field-by-field mapping the script applies (from
`tools/famous/expandFamousFromCatalogs.ts`):

| Seed field | HyperLEDA param | Formula |
|------------|-----------------|---------|
| `ra` / `dec` | `al2000` (hours), `de2000` (deg) | `ra = al2000 × 15`; `dec = de2000` |
| `distanceMpc` | `mod0` (if its error < 0.3), else `v3k` | `10^((mod0−25)/5)`, else `v3k/70` — **not** `modbest`/`modz` |
| `diameterKpc` | `logd25` + `distanceMpc` | `0.1×10^logd25 × (π/180/60) × distanceMpc × 1000` |
| `axisRatio` | `logr25` | `10^(−logr25)` (keep only if in (0.05, 1]) |
| `positionAngleDeg` | `pa` | as-is (0–180) |
| `magB` / `magV` / `magK` | `bt` / `vt` / `kt` | drop any band whose HyperLEDA error > 0.5 mag |
| `type` | `type` | verbatim string (e.g. `S0-a`, `Sa`) |

Two traps the formulas encode:

- **Use the total magnitudes `bt`/`vt`/`kt`.** Never SIMBAD or aperture mags —
  they measure a fixed aperture, not the whole galaxy, and disagree badly
  (NGC 3169's SIMBAD B = 13.46 vs HyperLEDA total `bt` = 11.25).
- **Drop a band when its HyperLEDA error exceeds 0.5 mag** — the big error bar is
  HyperLEDA signalling the aggregate is unreliable (e.g. NGC 3169's
  `vt = 10.90 ± 0.84` is rejected, so that entry has no `magV`).

Take `description` from the galaxy's Wikipedia lead, matching the M/C entries'
prose style.

**Add the cross-ID aliases** to `names` after the NGC/IC name (the script only
emits the one primary name). The InfoCard renders `names[1+]` as alias chips and
the Cmd+K palette indexes them, so include the designations from the HyperLEDA
record — the UGC and PGC numbers, plus any pair label (`KPG …` for an
interacting pair). The Wikipedia link resolves via the NGC/IC name regardless of
alias order (`famousWikipediaTitle`), so the aliases are free to be the obscure
ones — e.g. `["NGC 3166", "UGC 5516", "PGC 29814", "KPG 228A"]`.

**Interacting pairs — co-locate them in depth.** The seed's `distanceMpc` is a
HyperLEDA value (`mod0`, or `v3k/70` when `mod0` is missing), *not* the CF4
override the GLADE/2MRS bins use. For a close pair, one member often has `mod0`
and the other falls back to `v3k`, splitting them by several Mpc along the line
of sight — they render light-years apart despite sharing a tidal bridge. Anchor
both at the CF4 *group* distance instead: grab `table3.dat.gz` from VizieR
`J/ApJ/944/94` (the local `fetch-cf4` only pulls `table2`), find the row whose
`1PGC` is the pair's brightest member, and use its `DMav`
(`distanceMpc = 10^((DMav−25)/5)`; remember to rescale each `diameterKpc` by the
distance ratio — angular size is fixed). Co-locating leaves only the real on-sky
separation (tens of kpc). If the disks then overlap and you want a depth cue,
nudge the measured-farther member back by a few tens of kpc — CF4's individual
`table2` `DM`s say which is farther, but keep the offset at interacting-pair
scale: the per-galaxy error bars dwarf the real gap, so a literal split would
un-interact them. NGC 3166/3169 are the worked example (co-located at the group
24.04 Mpc, then split 60 kpc so 3169 sits just behind 3166).

### 3a. CURATED path — hand-tune in the curator, then stop

**First check whether the curator is already running** — the maintainer often
has it open at `http://localhost:5200`. If so, reuse that tab and skip the
launch. Do **not** start a second one: a second `curate-famous` finds 5200 taken
and (Vite's non-strict port) silently starts on `5201`, so you'd be curating
against the wrong instance while the maintainer watches the first. Only launch if
none is running:

```bash
STARNET_WEIGHTS="$(pwd)/data/starnet/StarNet2_weights.pt" npm run curate-famous
```

The path is given absolute on purpose: the curator runs `starnet2` from a
session tmpdir, so it pins `STARNET_WEIGHTS` to an absolute path at boot
(`resolveStarnetConfig`) — a relative value would otherwise resolve against the
tmpdir and fail with `starnet2 exited 255: Failed`. The `$(pwd)/…` form is
robust regardless of where you launch from.

This opens the curator UI at `http://localhost:5200`. **Stop here and hand off
to the human** — print:

> "Curator is up at http://localhost:5200. For each new galaxy: paste or drop a
> source image, draw the crop footprint, set the disk overlay (centre / radius /
> PA / axis ratio) if you want deprojection, tune the alpha curve, then click
> **Commit**. Tell me when you've committed every galaxy and I'll build, open the PR, and sync R2."

On Commit, the curator writes the full tile set to
`public/images/famous-curated/<id>/` (`source` / `starless` / `atlas` / `full` /
`thumb`.webp + `recipe.json`), publishes the runtime copies
(`atlas → public/images/famous/<id>.webp`,
`thumb → public/images/famous-thumb/<id>.webp`,
`full → public/data/images/famous-hires/<id>.webp`), and records the source URL
+ licence + author in `data/seeds/famous_curated_overrides.json`. **Do not run
`fetch-famous-images` on this path** — the curator's output would just be
overwritten by it.

### 3b. FAST path — auto-fetch the image

```bash
npm run fetch-famous-images
```

For every seed entry without a curated override, this downloads a Wikipedia hero
image (DESI Legacy cutout fallback), applies a radial fade, and writes
`public/images/famous/<id>.webp` (256×256). No star removal, no deprojection, no
hi-res LOD.

### 4. Build the catalog

```bash
npm run build-famous
```

Reads the updated seed + any `recipe.json` calibration and regenerates
`public/data/famous.bin` (positions/sizes/orientation) and
`public/data/famous_meta.json` (names/description/calibration). `build-famous`
reads **only** the seed — it has no dedup pass and never touches the survey bins.

### 4b. Re-dedup the survey bins — required when the galaxy is also in a survey

Almost every famous galaxy is *also* catalogued in GLADE / 2MRS / SDSS, and the
renderer draws each source as its own billboard layer — so without dedup the new
galaxy renders **twice** (once from the survey layer, once from the famous
layer), and the local-volume distance override drags the two on top of each
other. The dedup that prevents this lives in `build-tiers` (`buildAllBins` →
`dropFamousMatches`), which drops survey rows within 30″ of a famous-seed
position. It only takes effect on a survey-bin rebuild **after** the seed entry
exists:

```bash
npm run build-tiers   # re-runs dropFamousMatches against the updated seed
```

Skip this only when the galaxy is genuinely absent from every survey catalog
(rare — e.g. the LMC, which GLADE and 2MRS both omit; the SMC, by contrast, is
GLADE PGC 3085 and *does* need the rebuild). When unsure, rebuild — it's
idempotent. Verify by confirming the rebuilt `glade-*.bin` / `2mrs.bin` no
longer carry a row at the new galaxy's position.

### 5. Commit — specific paths only

Never `git add -A` (project rule). Stage exactly what changed:

```bash
git add data/seeds/famous_galaxies.seed.json \
        data/seeds/famous_curated_overrides.json \
        public/images/famous/<id>.webp \
        public/images/famous-thumb/<id>.webp \
        public/images/famous-curated/<id>/
git commit -m "feat(famous): add <galaxy>" -m "Co-Authored-By: ..."
```

The curator's `mask.jpg` and `.tmp/` scratch are gitignored, so they won't ride
along. `famous.bin` / `famous_meta.json` are untracked build outputs (gitignored
under `/public/data/`, regenerated by `build-famous`) — they won't appear in
`git status` and reach prod via R2, not git, so there's nothing to stage for
them here.

### 6. Open the PR, then sync R2

Push the branch and open a PR (`gh pr create`). A new galaxy touches both deploy
surfaces, but only one is a manual step:

- **Workers Assets** (automatic) serves the committed billboard + InfoCard webps
  (`public/images/famous*`). There is **no `npm run deploy` step** — the
  Cloudflare GitHub integration rebuilds the shell on every push to `main`, so
  **merging the PR is the deploy**. (`npm run deploy` is just `git push origin
  main`, which the branch+PR rule forbids anyway.)
- **R2** (manual) serves the catalog data (`famous.bin`, `famous_meta.json`) and
  the hi-res close-approach LOD (`public/data/images/famous-hires/<id>.webp`).
  R2 isn't wired to git, so after the merge, from the **main checkout**:

```bash
git switch main && git pull   # pick up the merged seed + tiles
npm run build-famous          # regenerate famous.bin + famous_meta.json from merged seed
npm run build-tiers           # re-dedup the survey bins against the merged seed (skip only if the galaxy is in no survey)
npm run sync-r2-secure        # upload famous.bin + meta + hi-res + the rebuilt glade-*/2mrs bins to R2
```

A new entry changes `famous.bin`, `famous_meta.json`, the hi-res tile, **and**
(via the dedup) the survey bins, so `sync-r2-secure` **is** required — this is
the common case, not the exception. The only time you can skip R2 is an
image-only re-tune that changes a committed webp without touching the catalog or
the hi-res tile.

## Optional maintenance scripts

- `npm run build-famous-thumbs` — backfills the non-deprojected `thumb.webp` for
  galaxies curated before the thumb route existed. Needs `STARNET_WEIGHTS`.
  Idempotent (skips galaxies that already have `thumb.webp`).
- `npm run build-famous-hires` — bulk-flattens every
  `famous-curated/<id>/full.webp` into `public/data/images/famous-hires/`. The
  curator already publishes hi-res per-commit, so this is for fresh clones, not
  the day-to-day add.

## Gotchas

| Gotcha | Why it matters |
|--------|----------------|
| Run from the main checkout | Worktree `public/data/` is throwaway; build + R2 sync must use the real bins |
| Re-run `build-tiers` after the seed changes | The famous-vs-survey dedup lives in `build-tiers` (`dropFamousMatches`), not `build-famous`; skip it and a galaxy that's also in GLADE/2MRS renders twice |
| Merging the PR deploys the shell; `sync-r2-secure` is still manual | Committed webps ride the auto Workers Assets rebuild on merge; bin + meta + hi-res live on R2 and need a manual sync |
| Don't run `fetch-famous-images` on the curated path | It overwrites the curator's published `famous/<id>.webp` |
| `expand-famous` only covers M/C | Custom (non-Messier/Caldwell) galaxies need a hand-authored seed entry (see 2b) — but a later `expand-famous` run preserves them |
| HyperLEDA's cert is expired and it redirects | `curl -skL` reaches the `atlas.obs-hp.fr` mirror; plain WebFetch refuses the expired TLS cert |
| Use total `bt`/`vt`/`kt`, drop bands with error > 0.5 | SIMBAD/aperture mags aren't whole-galaxy; HyperLEDA's large error bars flag unreliable aggregates |
| Stage specific paths | Project rule: never `git add -A`; the famous webps span three dirs |
| `STARNET_WEIGHTS` must point at the weights | The curator and `build-famous-thumbs` shell out to StarNet — see `reference_starnet_weights` |
| Check for an already-running curator before launching | The maintainer usually has it open at `:5200`; a second `curate-famous` silently lands on `:5201` (Vite non-strict port) and you curate the wrong instance |
| Interacting pairs land at mismatched depths | Seed `distanceMpc` is HyperLEDA (`mod0`/`v3k`), not the CF4 override the survey bins use — one member gets `mod0`, the other `v3k`, splitting them by Mpc. Co-locate both at the CF4 group distance (`table3` `DMav`); see the pairs note in 2b |

## Red flags — STOP

- About to `git add -A` / `git add .` → stop; stage the specific famous paths.
- About to skip `sync-r2-secure` after adding a new galaxy → stop; the catalog
  and hi-res LOD won't reach prod, and the renderer will 404 the new tile.
- Ran `build-famous` but not `build-tiers` for a galaxy that's also in a survey
  → stop; the survey row isn't deduped and the galaxy renders twice (see 4b).
- Running the build or R2 sync from a worktree → stop; switch to the main
  checkout first.
- About to commit `mask.jpg` or a `.tmp/` dir → stop; those are gitignored
  scratch (if they appear, the gitignore rule regressed — fix that, don't commit).

## Related skills

- `/release` — its attribution-review step reads `famous_curated_overrides.json`
  for new imagery sources (e.g. NOIRLab/ESO) that need crediting in
  `ATTRIBUTIONS.md` before a tagged release.
- `/dev` — start the Vite server to eyeball the new galaxy's billboard +
  InfoCard before committing.
- `/link-data` — in a worktree, symlinks `public/data/` to main; but per the
  preflight, prefer running this skill from the main checkout outright.
