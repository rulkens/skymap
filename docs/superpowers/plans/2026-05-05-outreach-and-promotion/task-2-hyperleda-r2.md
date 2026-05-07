# Task 2: HyperLEDA position-angle cache via R2

> **Status: done 2026-05-07.** Shipping the partial cache as-is.
>
> The fetcher targets ~1.5 M unique PGCs but the local run was paused at
> 52,178 queries (~41,332 with populated PA — the long tail is mostly
> empty HyperLEDA responses). On 2026-05-07 we decided NOT to spend the
> remaining ~1 hour to complete the fetch. Rationale:
>
> - The queried subset overwhelmingly covers the brightest,
>   most-cross-matched GLADE galaxies — i.e. the ones a user is most
>   likely to focus on or click on.
> - The empty-response tail produces no orientation data anyway, so
>   pushing through it adds runtime cost for negligible coverage gain.
> - Contributors who want a complete cache can still run
>   `npm run fetch-hyperleda` locally (resumable; README documents it).
>
> Verified 2026-05-07: `curl -sI https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz`
> returns `HTTP/2 200`, `content-type: application/gzip`, `cache-control: public, max-age=86400`.
> The remaining unchecked steps below are kept for historical reference; treat them as
> "not applicable" for this iteration.

The current README tells users to run `npm run fetch-hyperleda` for "roughly 1 hour" against HyperLEDA's servers, fetching about 1.5 M PGCs at 4 concurrent requests. Every new user does this. Two problems: (1) HyperLEDA gets hammered by every reader; (2) it's a friction wall that drops 90% of would-be users before they see real data. Fix: ship the resulting CSV via R2 (the same Cloudflare R2 bucket that already serves the `.bin` catalog files). Users `curl` it instead of running the script.

**Why R2 and not a GitHub release asset (the original plan)?**

The original Task 2 called for uploading `hyperleda_pa.csv.gz` to the v0.1.0 GitHub release. R2 is strictly better for this use case:

- **No size cap.** GitHub's per-asset limit is 2 GB, but more practically releases are awkward to update without bumping the tag. R2 has no such constraint.
- **Egress-free.** R2's zero-egress pricing means frequent downloads don't accumulate costs; GitHub release assets are served by GitHub's CDN but with less predictable cost characteristics at scale.
- **Decoupled from release tags.** The CSV is a build artefact like the `.bin` files — it should be refreshable whenever the catalog changes, independently of code releases. Updating a GitHub release asset requires either re-uploading to the same tag (messy) or bumping the tag (forces a new version number just for a data refresh). An R2 sync is idempotent and has no version semantics attached.
- **Consistent contributor experience.** After this change, all build artefacts (`.bin` catalogs, `.csv.gz` enrichment caches) come from the same host (`skymap-data.rulkens.com`) with the same `curl` pattern. There's no conceptual split between "catalog data lives in R2" and "enrichment cache lives in a GitHub release".
- **Infra already exists.** `tools/syncR2.ts` and `npm run sync-r2` are already in place. Adding one entry to `EXTRA_FILES` is three lines of code.

**Files:**

- Generate (one-time): `/Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv`
- Generate (one-time): `/Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv.gz`
- Modify: `/Users/rulkens/Development/js/skymap/tools/syncR2.ts` — add `hyperleda_pa.csv.gz` to `EXTRA_FILES` (already done in the infra commit that landed this plan edit).
- Modify: `/Users/rulkens/Development/js/skymap/README.md` — replace the "run the fetcher for 1 hour" guidance with a `curl` from R2 (already done in the same infra commit).

> **Status (2026-05-06):** `tools/syncR2.ts` and `README.md` edits have already landed on the `feat/outreach-r2-hyperleda-cache` branch. The CSV exists locally as a partial run (~52k rows / ~1.5M target). Steps 2.1 and 2.2 remain — the CSV needs a full re-fetch, then gzip. Step 2.4 (sync) follows.

### Step 2.1: Run the HyperLEDA fetcher to completion (if not already done)

The script is resumable — it reads the existing `hyperleda_pa.csv` and skips already-queried PGCs, so it's safe to interrupt and restart.

- [ ] **Check whether the cache already exists locally and how complete it is:**

```bash
ls -lh /Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv 2>/dev/null \
  || echo "MISSING — need to run fetcher"
wc -l /Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv 2>/dev/null
```

Expected when complete: line count near 1.5 million (one header + ~1.5 M data rows). A partial run will show a smaller count — run the fetcher to completion.

- [ ] **If missing or incomplete**, run the fetcher (~1 hour wall-clock; resumable):

```bash
cd /Users/rulkens/Development/js/skymap
npm run fetch-hyperleda
```

- [ ] **Verify the CSV looks sane after the fetch completes:**

```bash
wc -l /Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv
head -3 /Users/rulkens/Development/js/skymap/data/raw/hyperleda_pa.csv
```

Expected: ~1.5 M lines; first line is a header (`pgc,pa,logr25,logd25,e_logd25`) and subsequent lines parse as CSV.

### Step 2.2: Compress the CSV for R2 upload

Raw CSV at ~1.5 M rows is roughly 50–80 MB. Gzip compresses CSVs by 4–5×, taking it down to roughly 10–20 MB. Use `.csv.gz` so contributors know they need to `gunzip` before the build pipeline can read it.

- [ ] **Compress:**

```bash
cd /Users/rulkens/Development/js/skymap/data/raw
gzip -k -9 hyperleda_pa.csv
ls -lh hyperleda_pa.csv hyperleda_pa.csv.gz
```

`-k` keeps the original uncompressed copy (the build pipeline reads the plain `.csv`); `-9` is max compression — slow but this is a one-time operation and the smaller the upload, the less bandwidth the sync uses.

### Step 2.3: Add `hyperleda_pa.csv.gz` to `tools/syncR2.ts` EXTRA_FILES

> **Already done** in the `feat/outreach-r2-hyperleda-cache` branch commit. Verify the entry is present:

```bash
grep -A3 "hyperleda_pa.csv.gz" /Users/rulkens/Development/js/skymap/tools/syncR2.ts
```

Expected: the `EXTRA_FILES` array entry with `localPath: 'data/raw/hyperleda_pa.csv.gz'` and `r2Key: 'data/hyperleda_pa.csv.gz'` is visible.

### Step 2.4: Run `npm run sync-r2` and verify the upload

`sync-r2` re-uploads the full `public/data/` set plus any `EXTRA_FILES` that are present locally. It skips missing extras with a warning rather than aborting, so it's safe to run even if other `.bin` files are absent.

- [ ] **Run the sync:**

```bash
cd /Users/rulkens/Development/js/skymap
npm run sync-r2
```

- [ ] **Verify the object is reachable:**

```bash
curl -sI https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz | head -6
```

Expected: `HTTP/1.1 200 OK` (R2 serves objects directly, no redirect), `Content-Encoding: gzip` or `Content-Type: application/gzip`, and `Cache-Control: public, max-age=86400`. If you see a 404, the sync didn't include the file — check that `data/raw/hyperleda_pa.csv.gz` exists before re-running.

### Step 2.5: Update README to point at the R2 URL

> **Already done** in the `feat/outreach-r2-hyperleda-cache` branch commit. Verify the new section is present:

```bash
grep -n "skymap-data.rulkens.com/data/hyperleda_pa.csv.gz" \
  /Users/rulkens/Development/js/skymap/README.md
```

Expected: at least 1 matching line in the "HyperLEDA orientation cache: download instead of fetching" block. The `npm run fetch-hyperleda` fallback path must also still be present:

```bash
grep -n "fetch-hyperleda" /Users/rulkens/Development/js/skymap/README.md
```

Expected: the original fetch command is still there, with new text above it explaining the R2 download shortcut.

### Step 2.6: Commit (syncR2.ts + README + plan)

> **Already done** as the `feat/outreach-r2-hyperleda-cache` branch commit (covers syncR2.ts + README + this plan edit).  The `.csv.gz` file itself is gitignored and will not be committed — it lives only on R2 and in the local `data/raw/` directory.
>
> After Step 2.4 (the actual R2 sync) is verified, merge the branch into `main` via PR to make the README and syncR2 changes live.

The commit message for reference:

```bash
git commit -m "$(cat <<'EOF'
docs: distribute HyperLEDA cache via R2 instead of GitHub release

Task 2 of the outreach plan originally called for shipping the ~10–20 MB
gzipped HyperLEDA position-angle cache as a v0.1.0 release asset.
Switch to R2 (skymap-data.rulkens.com) instead — same infra already
serving the .bin catalog files, egress-free under R2 pricing, and
decoupled from release tags so cache refreshes don't need a new tag.

- Plan rewritten to describe the R2 workflow.
- tools/syncR2.ts EXTRA_FILES includes hyperleda_pa.csv.gz.
- README points users at the R2 download URL with npm run fetch-hyperleda
  preserved as a fallback for fresh-cache regeneration.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
