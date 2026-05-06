# Skymap Outreach and Promotion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **NOTE — this is an ops/content/external-outreach plan, not a code plan.** "Verify by running test" becomes "verify by checking <concrete thing>" — no fake unit tests for ops actions. Tasks are still bite-sized with exact deliverables.

**Goal:** Take skymap from a deployed-but-unknown personal project to a citable, discoverable, talked-about tool — without overclaiming. Ship the small artifacts that make the repo look credible to astronomers (DOI, screenshots, JOSS draft, releases), then surface it to the right communities (HN, Bluesky, Reddit), then warm-pitch the academic groups who would actually use it.

**Architecture:** Sequenced in three waves. Wave A (Tasks 1-2) is repo polish — everything that makes a stranger landing on the GitHub page take it seriously. Wave B (Tasks 3, 6) is durable artifacts — JOSS paper draft and the optional RNAAS note, both citable. Wave C (Tasks 4-5) is outreach — broad public posts first, then targeted academic emails that can reference traction. Repo polish is a hard prerequisite for everything else: a GitHub page without a hero image, DOI, or topics looks abandoned.

**Tech stack:** `gh` CLI, Zenodo (web UI + GitHub OAuth), CleanShot X / ffmpeg / gifski for capture, plain Markdown for the JOSS paper, plain text for posts and emails. No code changes to the renderer.

**Voice:** Skymap is a personal didactic project that happens to be a useful tool. Outreach should match: "interactive WebGPU explorer documented didactically as a learning project; useful for X/Y/Z" — never "next-generation cosmology platform". Astronomers smell hype. The README's existing tone (honest, technical, with a learning-to-read-the-code angle) is the right register; copy that into every artifact.

---

## Task 0: Cut v0.2.0 release + refresh Zenodo DOI

Since v0.1.0, several user-visible features have shipped: deep-link `#focus=…` URLs, the App.tsx hook refactor, and R2 catalog distribution (this branch). A new tagged release creates a fresh news hook for the outreach posts in Task 4 and re-mints a Zenodo version-DOI under the existing concept record. The existing concept DOI (`10.5281/zenodo.1228374974`) always resolves to the latest version — so switching outreach drafts to cite the concept DOI means they won't go stale after a future release.

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/package.json` — bump `"version"` from `"0.1.0"` to `"0.2.0"`.
- Modify: `/Users/rulkens/Development/js/skymap/CITATION.cff` — bump `version:`, update `date-released:`, switch `doi:` from the v0.1.0 version-DOI to the concept DOI.
- Modify: `/Users/rulkens/Development/js/skymap/README.md` — update the DOI badge URLs from the v0.1.0 version-DOI to the concept DOI.

### Step 0.1: Bump version in package.json + CITATION.cff

- [ ] **Edit `package.json`** — change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Edit `CITATION.cff`** — change `version: 0.1.0` to `version: 0.2.0` and update `date-released:` to today's date.

- [ ] **Verify:**

```bash
grep -E '^[[:space:]]*"version"' /Users/rulkens/Development/js/skymap/package.json
grep -E '^(version|date-released):' /Users/rulkens/Development/js/skymap/CITATION.cff
```

Expected: `package.json` shows `"version": "0.2.0"`; `CITATION.cff` shows `version: 0.2.0` and the updated `date-released:` line.

### Step 0.2: Tag + push

- [ ] **Tag the release:**

```bash
git tag -a v0.2.0 -m "v0.2.0 — deep-link focus, hook refactor, R2 catalog distribution"
git push origin v0.2.0
```

> The tag message summarises the user-visible features since v0.1.0. If the App.tsx hook-refactor PR (#15) or the R2 branch haven't merged yet, adjust the message to only list what has actually landed on `main`.

### Step 0.3: Cut a GitHub release

Two paths, depending on your personal-access-token scopes (the v0.1.0 release was created via the web UI after `gh release create` returned a 403 — the fine-grained PAT was missing `Contents: write`):

**Path A — CLI (works if the PAT has `Contents: write`):**

```bash
gh release create v0.2.0 \
  --title "skymap v0.2.0" \
  --notes "$(cat <<'NOTES'
## What's new in v0.2.0

- **Deep-link focus** — `#focus=m81`-style URLs fly the camera to any named galaxy on load; shareable links to specific galaxies now work.
- **App.tsx hook refactor** — React state model cleaned up; camera, selection, and UI hooks are now properly separated (#15).
- **R2 catalog distribution** — `.bin` catalog files served from `data.skymap.rulkens.com` (Cloudflare R2) instead of bundled in the Workers deploy; no per-file size cap, egress-free.
- **HyperLEDA cache via R2** — `hyperleda_pa.csv.gz` downloadable from R2; contributors no longer need a 1-hour `npm run fetch-hyperleda` run before building with real orientation data.

## Cite this release

DOI: https://doi.org/10.5281/zenodo.1228374974 (concept DOI — always resolves to the latest version)
NOTES
)"
```

**Path B — GitHub web UI (always works):**

1. Open https://github.com/rulkens/skymap/releases/new.
2. Select tag `v0.2.0` from the tag dropdown.
3. Title: `skymap v0.2.0`.
4. Release notes: paste the bullet list from Path A above.
5. Click "Publish release".

- [ ] **Verify:**

```bash
gh release view v0.2.0 --repo rulkens/skymap
```

Expected: the release shows the correct tag, title, and notes. If the PAT returned a 403, use Path B and then run the verify command after the web-UI publish.

### Step 0.4: Wait ~60 s, verify Zenodo minted a new version-DOI

Zenodo's GitHub integration fires on the `release` webhook event. After publishing the release, wait about 60 seconds then check:

- [ ] **Refresh** https://zenodo.org/account/settings/github/ — the `rulkens/skymap` row should now show `v0.2.0` under the existing concept record (`1228374974`).
- [ ] **Click the new version badge** — it should open a Zenodo deposit page for `v0.2.0` with a new version-DOI of the form `10.5281/zenodo.<NEW_DIGITS>`.
- [ ] **Verify the version-DOI resolves:**

```bash
# Replace <NEW_DIGITS> with the actual digits shown on the Zenodo page
curl -sI "https://doi.org/10.5281/zenodo.<NEW_DIGITS>" | head -5
```

Expected: `HTTP/2 302` (or `301`) redirect to the Zenodo record for `v0.2.0`. Note the new digits — you'll need them in Step 0.5 if you want to record the version-DOI anywhere. The concept DOI (`1228374974`) is what the outreach drafts will cite going forward.

### Step 0.5: Switch outreach to cite the concept DOI

The v0.1.0 outreach drafts cited the version-DOI `10.5281/zenodo.20037028`. That DOI remains valid but will forever point at v0.1.0. The concept DOI (`10.5281/zenodo.1228374974`) always resolves to the latest version, so future releases don't break references in posts or emails.

- [ ] **Update `CITATION.cff`** — change the `doi:` field from the v0.1.0 version-DOI (`10.5281/zenodo.20037028`) to the concept DOI (`10.5281/zenodo.1228374974`):

```yaml
# Before:
doi: 10.5281/zenodo.20037028

# After:
doi: 10.5281/zenodo.1228374974
```

- [ ] **Update `README.md`** — find the DOI badge line (badge image URL + click-through link) and change `20037028` to `1228374974` in both places:

```markdown
<!-- Before: -->
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20037028.svg)](https://doi.org/10.5281/zenodo.20037028)

<!-- After: -->
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.1228374974.svg)](https://doi.org/10.5281/zenodo.1228374974)
```

- [ ] **Verify:**

```bash
grep -E '10\.5281/zenodo' /Users/rulkens/Development/js/skymap/README.md /Users/rulkens/Development/js/skymap/CITATION.cff
```

Expected: every hit shows `1228374974`, none shows `20037028`.

### Step 0.6: Commit Task 0 (single commit)

- [ ] **Commit:**

```bash
cd /Users/rulkens/Development/js/skymap
git add package.json CITATION.cff README.md
git commit -m "$(cat <<'EOF'
chore: bump to v0.2.0 and switch to concept DOI

Bump package.json and CITATION.cff to v0.2.0 (deep-link focus, hook
refactor, R2 catalog distribution).  Switch the CITATION.cff doi: field
and the README DOI badge from the v0.1.0 version-DOI (20037028) to the
Zenodo concept DOI (1228374974) so future releases don't break outreach
references.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Repo polish for credibility

This bundles four small actions because none of them is large enough to be its own task and they are mutual prerequisites for everything below. After this task, a stranger landing on the GitHub repo sees: topic chips, a hero GIF at the top of the README, four-six embedded screenshots, a Zenodo DOI badge, and a working "How to cite" block. That is the bar for being taken seriously.

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/README.md` — replace the GIF placeholder comment with embedded GIF + screenshot references; add Zenodo DOI badge at top; update citation block.
- Modify: `/Users/rulkens/Development/js/skymap/CITATION.cff` — fill in the `doi:` field after Zenodo mints.
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/hero.gif` (and `hero.mp4` source).
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/synthetic-data.png`.
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/all-three-surveys.png`.
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/zoomed-thumbnail-infocard.png`.
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/density-correction-modes.png`.
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/milky-way-closeup.png` (only if Milky Way impostor task has shipped — otherwise skip).
- Create: `/Users/rulkens/Development/js/skymap/docs/screenshots/cosmic-web-filaments.png` (only if filament rendering has shipped — otherwise skip).

### Step 1.1: Add GitHub topic chips

- [x] **Run:**

```bash
gh repo edit rulkens/skymap \
  --add-topic webgpu \
  --add-topic astronomy \
  --add-topic sdss \
  --add-topic glade \
  --add-topic 2mass \
  --add-topic gravitational-waves \
  --add-topic data-visualization \
  --add-topic galaxy-catalog \
  --add-topic cosmology \
  --add-topic typescript \
  --add-topic cosmic-web
```

- [x] **Verify:**

```bash
gh repo view rulkens/skymap --json repositoryTopics
```

Expected: JSON output containing all 11 topic names. The GitHub web sidebar (https://github.com/rulkens/skymap) should show 11 topic chips under the description.

### Step 1.2: Capture the hero GIF

The hero GIF is the single most important asset. It runs above the fold on the README and on every social post. Aim for 15-20 s, looping, < 4 MB once converted to GIF.

- [x] **Camera path to record (rehearse once before recording):**
  1. Start zoomed out, full-sky view of all three surveys loaded (or synthetic if you don't want to load real data — synthetic still looks good).
  2. Slow orbit drag (about 3 s) to show 3D structure / Sloan Great Wall.
  3. Cmd+K to open command palette, type "M51", hit Enter — focus tween flies in (about 4 s).
  4. Once stopped on M51, the per-galaxy thumbnail quad replaces the dot. Click it to pin the InfoCard.
  5. Hover off, then re-hover a neighbouring galaxy to show the InfoCard updating.
  6. Open the Settings panel, toggle through the four density-correction modes (about 4 s), close panel.
  7. Cmd+K again, type "back" or hit Escape, end on a wide-angle view that mirrors the start frame so the loop seams.

- [x] **Record using CleanShot X** (or QuickTime → Screen Recording, restricted to the browser window; or `scrcpy`-style tools on Linux): record at 1280×800 viewport, 30 fps, save as MP4 to `/Users/rulkens/Development/js/skymap/docs/screenshots/hero.mp4`.

- [x] **Convert MP4 to GIF using `ffmpeg` + `gifski`** (gifski produces much smaller, sharper GIFs than ffmpeg's palette filter):

```bash
cd /Users/rulkens/Development/js/skymap/docs/screenshots
ffmpeg -i hero.mp4 -vf "fps=18,scale=900:-1:flags=lanczos" frame_%04d.png
gifski -o hero.gif --fps 18 --width 900 --quality 80 frame_*.png
rm frame_*.png
ls -lh hero.gif
```

If `gifski` isn't installed: `brew install gifski`. Fallback if you must use ffmpeg only:

```bash
ffmpeg -i hero.mp4 -vf "fps=18,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" hero.gif
```

- [x] **Verify:**

```bash
ls -lh /Users/rulkens/Development/js/skymap/docs/screenshots/hero.gif
file /Users/rulkens/Development/js/skymap/docs/screenshots/hero.gif
```

Expected: file size between 1.5 and 4 MB; `file` reports `GIF image data, version 89a, 900 x ...`. Open it in Preview / a browser and watch the loop — verify the seam is acceptable and no UI element shows a debug overlay.

> **Actually shipped (2026-05-05):** `hero.gif` (580 px × 12 fps × 13 s, **7.8 MB** — not the 1.5–4 MB target; the dense additive-billboard frame is high-entropy and resists palette compression). Plus `zoomed.gif` (540 × 10 fps, 6.1 MB) as a secondary close-up loop. Both well under the 10 MB GitHub inline limit. Re-encoded twice to get under that threshold; gifski quality 55 + lossy 30 was the breakpoint.

### Step 1.3: Capture the still screenshots

Each still uses the existing `docs/screenshots/README.md` checklist as the spec. Use CleanShot or `Cmd+Shift+4` and save into `/Users/rulkens/Development/js/skymap/docs/screenshots/` with the exact filenames below.

> **Actually shipped (2026-05-05):** Three stills with different framings than the plan called for, named for their content rather than the planned filenames. The original plan's checklist below is left untouched as a backlog of shots still worth capturing.
>
> Captured & embedded in README:
> - `ui-overview.png` (1600 wide, 2.3 MB) — the full HUD with all three surveys + filament overlay + InfoCard pinned. Closest analogue to the planned `all-three-surveys.png`.
> - `local-group.png` (1200 wide, 1.06 MB) — Local Volume close-up (~10–20 Mpc) with Famous-galaxy thumbnail quads and the cosmic-web filament overlay. Doubles as the `cosmic-web-filaments.png` shot from the optional list.
> - `wide-field.png` (1200 wide, 1.6 MB) — supercluster-scale view (~200–400 Mpc) showing the dense cluster cores and surrounding voids.
>
> Still missing per the original spec — capture in a future pass:
> - `synthetic-data.png` — synthetic-sphere fallback (no .bin files present).
> - `zoomed-thumbnail-infocard.png` — explicit Cmd+K to M51, InfoCard pinned with NED link visible. (`zoomed.gif` covers the *motion*; a still showing the pinned InfoCard is still missing.)
> - `density-correction-modes.png` — Settings panel expanded with the four mode buttons + angular-isotropy toggle visible. (Not visually represented in any current asset.)

- [ ] **`synthetic-data.png`** — launch with no `.bin` files in `public/data/`. Capture the 100 k-galaxy synthetic sphere from a 3/4 view. About 1500 px wide.

- [ ] **`all-three-surveys.png`** — launch with all three `.bin` files present. Position the camera so the SDSS wedge is on the right half, GLADE all-sky fill is visible behind it, and the 2MRS local-volume cluster is in the foreground centre. About 1500 px wide.

- [ ] **`zoomed-thumbnail-infocard.png`** — Cmd+K to M51 (or M31, NGC 5128 — anything with a known thumbnail). Click to pin the InfoCard. The textured quad must be replacing the dot. The InfoCard on the right shows pinned metadata. About 1500 px wide.

- [ ] **`density-correction-modes.png`** — open Settings panel, expand the Density Correction section so all four modes (None / Volume-limited / 1/V_max alpha / Schechter LF) are visible plus the angular-isotropy toggle. Crop to just the panel + a little galaxy field for context.

- [ ] **`milky-way-closeup.png`** _(skip if Milky Way impostor task hasn't shipped)_ — camera close to origin, Milky Way impostor visible.

- [ ] **`cosmic-web-filaments.png`** _(skip if filament rendering hasn't shipped)_ — wide view with filament skeleton overlay enabled.

- [ ] **Verify:**

```bash
ls -lh /Users/rulkens/Development/js/skymap/docs/screenshots/
```

Expected: at minimum `hero.gif`, `synthetic-data.png`, `all-three-surveys.png`, `zoomed-thumbnail-infocard.png`, `density-correction-modes.png`. Each < 3 MB.

### Step 1.4: Mint the Zenodo DOI

Zenodo's GitHub integration mints a permanent DOI per release. The DOI never expires and is the citation key academics will paste into BibTeX. This is the single highest-leverage 10-minute action in the plan.

- [x] **Connect Zenodo to GitHub:**
  1. Open https://zenodo.org/account/settings/github/ in a browser.
  2. If not signed in, sign in with GitHub OAuth.
  3. Find `rulkens/skymap` in the repository list. Toggle the switch to ON.
  4. If the repo isn't in the list, click "Sync now" (top right) and refresh.

- [x] **Cut a tagged release on GitHub** (Zenodo only mints DOIs for tagged releases, not arbitrary commits):

```bash
cd /Users/rulkens/Development/js/skymap
git tag -a v0.1.0 -m "v0.1.0 — first citable release"
git push origin v0.1.0
gh release create v0.1.0 \
  --title "skymap v0.1.0" \
  --notes "First citable release. WebGPU 3D explorer for SDSS, 2MRS, and GLADE galaxy catalogs. See README for use cases."
```

> **Done 2026-05-05:** tag pushed via CLI, release published via the GitHub web UI (the user's fine-grained PAT was missing `Contents: write`, which 403'd `gh release create` — web UI bypassed it entirely).

- [x] **Wait about 60 seconds**, then verify Zenodo picked up the release:
  1. Refresh https://zenodo.org/account/settings/github/
  2. The skymap row should now show a DOI badge link. Click it.
  3. The DOI page (https://doi.org/10.5281/zenodo.NNNNNNNN) must resolve to a Zenodo deposit page with skymap metadata, files attached, and a DOI of the form `10.5281/zenodo.<8-digit-number>`.

> **Minted DOI:** `10.5281/zenodo.20037028` (Zenodo concept-record ID `1228374974`).

- [x] **Verify by URL HEAD check:**

```bash
DOI_URL="https://doi.org/10.5281/zenodo.NNNNNNNN"   # paste actual DOI URL here
curl -sI "$DOI_URL" | head -5
```

Expected: `HTTP/2 302` or `301` redirect to the Zenodo record. Replace `NNNNNNNN` with the actual digits before running.

### Step 1.5: Update CITATION.cff with the DOI

- [x] **Edit `/Users/rulkens/Development/js/skymap/CITATION.cff`** — uncomment and fill the DOI line. Replace the two TODO comment lines with a single concrete `doi:` line:

Before:

```yaml
# Once a Zenodo DOI is minted for a release, fill it in here and uncomment.
# Example: doi: 10.5281/zenodo.0000000
# doi: TODO-ZENODO-DOI
```

After (substitute the real digits):

```yaml
doi: 10.5281/zenodo.NNNNNNNN
version: 0.1.0
date-released: 2026-05-05
```

- [x] **Verify:**

```bash
grep -E "^(doi|version|date-released):" /Users/rulkens/Development/js/skymap/CITATION.cff
```

Expected: three lines, none containing `TODO`. Then visit https://github.com/rulkens/skymap on the web — the right sidebar's "Cite this repository" widget should show APA / BibTeX entries with the DOI included.

> **Done 2026-05-05** (commit `238e126`): `doi: 10.5281/zenodo.20037028`, `version: 0.1.0`, `date-released: '2026-05-05'`.

### Step 1.6: Embed the GIF, screenshots, and DOI badge in the README

Two README edits. The first is at the very top (replacing the existing placeholder comment); the second adds a new "Screenshots" section after "Use cases" but before "Requirements".

- [x] **Replace the GIF placeholder comment block at the top of `/Users/rulkens/Development/js/skymap/README.md`.**

  Find this block (currently at the top, just under the live-demo line):

  ```markdown
  <!--
    GIF placeholder — paste an embedded hero GIF here, e.g.
    ![skymap demo](docs/screenshots/hero.gif).  See
    docs/screenshots/README.md for the capture checklist.
  -->
  ```

  Replace it with (substitute the real DOI digits):

  ```markdown
  ![skymap demo](docs/screenshots/hero.gif)

  [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.NNNNNNNN.svg)](https://doi.org/10.5281/zenodo.NNNNNNNN)
  ```

  > **Done partially:** GIF embedded as `![skymap — orbit, command palette, focus tween, info card](docs/screenshots/hero.gif)`. The DOI badge is **not yet added** — pending Zenodo DOI mint (Step 1.4 second item: needs a tagged release first).

- [x] **Add a `## Screenshots` section** between the existing `## Use cases` section and `## Requirements` section:

  ```markdown
  ## Screenshots

  Synthetic-data fallback (no real catalogs needed):

  ![Synthetic data fallback](docs/screenshots/synthetic-data.png)

  All three surveys loaded — SDSS wedge, GLADE all-sky fill, 2MRS local volume:

  ![All three surveys](docs/screenshots/all-three-surveys.png)

  Zoom into a famous galaxy: textured thumbnail replaces the dot, InfoCard pins metadata:

  ![Zoomed thumbnail and info card](docs/screenshots/zoomed-thumbnail-infocard.png)

  Density-correction modes in the settings panel:

  ![Density correction modes](docs/screenshots/density-correction-modes.png)
  ```

  If you also captured `milky-way-closeup.png` and/or `cosmic-web-filaments.png`, add corresponding `![...]()` lines at the end of this section.

- [x] **Verify:**

```bash
grep -n "hero.gif\|zenodo.org/badge\|all-three-surveys.png" /Users/rulkens/Development/js/skymap/README.md
```

Expected: at least 3 matching lines. Then preview the README on github.com/rulkens/skymap (push the commit first) and confirm: hero GIF plays, DOI badge renders and links to the Zenodo deposit, all four screenshot embeds resolve.

> **Done partially:** `hero.gif` reference present; the four screenshot embeds resolve (`ui-overview.png`, `local-group.png`, `wide-field.png`, `zoomed.gif`). The DOI badge is **not yet present** — pending tagged release + Zenodo DOI (Steps 1.4, 1.5, plus a follow-up edit to insert the badge once digits are known).

### Step 1.7: Commit Task 1

- [x] **Commit:**

```bash
cd /Users/rulkens/Development/js/skymap
git add README.md CITATION.cff docs/screenshots/
git commit -m "$(cat <<'EOF'
docs: add hero GIF, screenshots, and Zenodo DOI

Replace the GIF placeholder in README with an embedded hero loop and
four still screenshots (synthetic, all-surveys, zoomed-thumbnail,
density-modes). Add Zenodo DOI badge and fill the DOI field in
CITATION.cff so the GitHub "Cite this repository" widget produces
ready-to-paste BibTeX with a permanent identifier.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin main
```

> **Actually shipped (2026-05-05):** Two commits rather than one — kept screenshots and the DOI work separable so the README+screenshots could land before the DOI was minted.
> - `9ced122` docs(readme): add hero gif and screenshots section — README, .gitignore, hero.gif, zoomed.gif, ui-overview.png, local-group.png, wide-field.png. Push pending (user holds it).
> - DOI badge + CITATION.cff update will be a follow-up commit once Zenodo mints the DOI for v0.1.0.

- [ ] **Verify post-push:** Open https://github.com/rulkens/skymap in a browser. Confirm: 11 topic chips visible, hero GIF plays, DOI badge clicks through to a Zenodo record, "Cite this repository" sidebar shows DOI in the BibTeX block, four screenshots render inline.

---

## Task 2: HyperLEDA position-angle cache via R2

The current README tells users to run `npm run fetch-hyperleda` for "roughly 1 hour" against HyperLEDA's servers, fetching about 1.5 M PGCs at 4 concurrent requests. Every new user does this. Two problems: (1) HyperLEDA gets hammered by every reader; (2) it's a friction wall that drops 90% of would-be users before they see real data. Fix: ship the resulting CSV via R2 (the same Cloudflare R2 bucket that already serves the `.bin` catalog files). Users `curl` it instead of running the script.

**Why R2 and not a GitHub release asset (the original plan)?**

The original Task 2 called for uploading `hyperleda_pa.csv.gz` to the v0.1.0 GitHub release. R2 is strictly better for this use case:

- **No size cap.** GitHub's per-asset limit is 2 GB, but more practically releases are awkward to update without bumping the tag. R2 has no such constraint.
- **Egress-free.** R2's zero-egress pricing means frequent downloads don't accumulate costs; GitHub release assets are served by GitHub's CDN but with less predictable cost characteristics at scale.
- **Decoupled from release tags.** The CSV is a build artefact like the `.bin` files — it should be refreshable whenever the catalog changes, independently of code releases. Updating a GitHub release asset requires either re-uploading to the same tag (messy) or bumping the tag (forces a new version number just for a data refresh). An R2 sync is idempotent and has no version semantics attached.
- **Consistent contributor experience.** After this change, all build artefacts (`.bin` catalogs, `.csv.gz` enrichment caches) come from the same host (`data.skymap.rulkens.com`) with the same `curl` pattern. There's no conceptual split between "catalog data lives in R2" and "enrichment cache lives in a GitHub release".
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
curl -sI https://data.skymap.rulkens.com/data/hyperleda_pa.csv.gz | head -6
```

Expected: `HTTP/1.1 200 OK` (R2 serves objects directly, no redirect), `Content-Encoding: gzip` or `Content-Type: application/gzip`, and `Cache-Control: public, max-age=86400`. If you see a 404, the sync didn't include the file — check that `data/raw/hyperleda_pa.csv.gz` exists before re-running.

### Step 2.5: Update README to point at the R2 URL

> **Already done** in the `feat/outreach-r2-hyperleda-cache` branch commit. Verify the new section is present:

```bash
grep -n "data.skymap.rulkens.com/data/hyperleda_pa.csv.gz" \
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
Switch to R2 (data.skymap.rulkens.com) instead — same infra already
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

---

## Task 3: JOSS paper draft

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

---

## Task 4: Public posts (HN, Bluesky, Reddit)

Three audiences, three angles. Drop them in a stepped rhythm so a single dud doesn't cap exposure: HN first (Tuesday morning, US east coast — that's the proven peak), Bluesky two hours later (the #astrodataviz crowd is largely Europe + east-coast US, late afternoon their time), then Reddit over the next 1-2 days. Don't ship them all at once: a high-traction Show HN gives you a link to reference in subsequent posts. _All three of HN, Bluesky, and Reddit must wait for Tasks 0 and 1 to complete — Task 0 provides the v0.2.0 release as a fresh news hook, and Task 1 provides the hero GIF and screenshots that make the README worth sharing._

**Files:** No source-tree files. Drafts live in this plan, copy-paste at post time.

### Step 4.1: Show HN draft

- [ ] **At submit time**, open https://news.ycombinator.com/submit. Use these exact fields:
  - **Title:** `Show HN: Skymap – a 3D galaxy catalog explorer in the browser via WebGPU`
  - **URL:** `https://skymap.rulkens.com`
  - **Text:** _(leave URL set; HN auto-pulls)_

- [ ] **First comment** (post immediately after submitting, as the OP — this is the "story" comment that anchors the thread):

```
Author here. I'm a frontend dev, and a few years ago I fell
down the astronomy rabbit hole. Skymap is what happened when
I wanted to actually do something with galaxy catalog data
instead of just reading papers.

It loads SDSS (~500k galaxies), 2MRS (~45k), and GLADE (~2M)
and renders them as WebGPU instanced billboards. A tier
selector lets you switch dataset size without a reload;
mobile auto-picks the smallest tier and pinch-zoom works.

Past a certain on-screen size, each galaxy crossfades from a
dot into a procedural 3D-oriented disk (using the catalog's
axis-ratio + position angle from HyperLEDA / 2MASS XSC), and
then into a real survey image when you're close enough. The
images come from SDSS DR18 ImgCutout, DSS via CDS hips2fits,
or hand-curated DESI Legacy thumbnails for the Messier
greatest-hits. There's also a cosmic-web filament overlay
(DisPerSE-built offline) — a faint blue lattice tracing the
ridges of the density field. Striking at supercluster scale.

The code's commented to be read, not just to satisfy a
linter. If you've been meaning to learn WebGPU or wondering
how distance from redshift actually works, the source is
meant to be a worked example.

Live: https://skymap.rulkens.com
Repo: https://github.com/rulkens/skymap (MIT)
DOI:  https://doi.org/10.5281/zenodo.20037028

Would love feedback on any of it.
```

- [ ] **Verify a few hours after posting:**

```bash
# Replace ITEM_ID with the actual numeric ID from the URL bar
curl -s "https://hacker-news.firebaseio.com/v0/item/ITEM_ID.json" | jq '{title, score, descendants}'
```

Expected: title matches, `score` ≥ 1 (your own upvote), `descendants` (comment count) increasing if the post landed. A submission still on the front page after ~3 hours is a hit; one stuck on /new at 1 point isn't.

### Step 4.2: Bluesky draft

The astronomy crowd (Brice Ménard, the Map of the Universe collaborators, AAS WWT folks, SDSS team) skews heavily to Bluesky now. Different framing: lead with science visuals, not engineering.

- [ ] **At post time**, on bsky.app, post this thread (post-and-reply, four parts):

  **Post 1:**

  ```
  Spent the last few months building skymap — an interactive WebGPU
  3D explorer for SDSS, 2MRS, and GLADE galaxy catalogs in the
  browser. No install, just Chrome 113+.

  Live: https://skymap.rulkens.com
  Source: https://github.com/rulkens/skymap

  [attach hero.gif]
  ```

  **Post 2 (reply to 1):**

  ```
  The cosmic-web wedge is right there — Sloan Great Wall, the
  Coma cluster, the local-volume 2MRS galaxies. Density-correction
  toggle (1/V_max, Schechter LF) lets you see structure unbiased
  by Malmquist.

  [attach all-three-surveys.png]
  ```

  **Post 3 (reply to 2):**

  ```
  Up close, dots become DR18 thumbnail cutouts (SDSS) or DSS proxies
  via CDS hips2fits (2MRS / GLADE). Click to pin metadata: redshift,
  lookback time, NED link.

  [attach zoomed-thumbnail-infocard.png]
  ```

  **Post 4 (reply to 3):**

  ```
  Built as a personal learning project — the source is documented
  didactically (every WebGPU surprise written up where it bit me).
  GW EM follow-up folks, SDSS team, AAS WWT crowd — feedback very
  welcome.

  cc @sdss.bsky.social @aaswwt.bsky.social
  (and Brice Ménard / mapoftheuniverse — handle?)
  ```

  Note: confirm the actual Bluesky handles for SDSS, AAS WWT, and Brice Ménard before posting; if any of them don't have an account, drop the mention silently rather than guessing.

- [ ] **Verify** the thread is live and chained correctly: open your profile, confirm all four posts in the thread, hero GIF auto-plays on post 1.

### Step 4.3: Reddit posts (stepped over 24-48 hours)

Three subs, three angles, _stepped_ — not simultaneous. Reddit's spam detection flags identical content across subs.

- [ ] **r/Astronomy** _(post Day 2, morning US time — angle: science / catalogs)_:
  - **Title:** `I built a browser-based 3D explorer for SDSS, GLADE, and 2MRS — open source, no install`
  - **Body:**

    ```
    Hey r/Astronomy — I've been working on a personal-learning project
    that I think might be useful to some of you.  It's a free-explore
    3D viewer for three galaxy catalogs (SDSS DR18, the 2MASS Redshift
    Survey, and GLADE) running directly in the browser via WebGPU. No
    install, no Python, just Chrome / Edge 113+.

    Live demo: https://skymap.rulkens.com
    Source: https://github.com/rulkens/skymap

    What you can do:
    - Orbit the SDSS wedge — Sloan Great Wall is right there
    - Cmd+K for a famous-galaxy command palette (M31, M51, etc.)
    - Density-correction toggle (1/V_max, Schechter LF) for unbiased
      structure visualisation
    - Zoom into a galaxy, get its DR18 thumbnail or a DSS cutout, plus
      pinned metadata + NED link

    It's documented didactically — the source is meant to be readable.
    Citation file is in the repo if you'd ever use it for teaching.

    Happy to take feedback on the science end especially.  Suggestions
    for what to add next?
    ```

- [ ] **r/dataisbeautiful** _(post Day 2, afternoon US time — angle: visual / structure)_:
  - **Title:** `[OC] Cosmic-web structure in 3 galaxy catalogs (SDSS + GLADE + 2MRS, 3.5M galaxies, WebGPU)`
  - **Body:**

    ```
    Source data: SDSS DR18 (~500k galaxies, sky.sdss.org), GLADE v2.3
    (~3M, gravitational-wave host catalog), and 2MASS Redshift Survey
    (~45k local-volume).  Cross-matched and rendered as instanced
    points in the browser using WebGPU.

    Tools: TypeScript, raw WebGPU + WGSL shaders, custom 48-byte
    binary format for the catalogs.

    Live (Chrome / Edge 113+): https://skymap.rulkens.com
    Source: https://github.com/rulkens/skymap

    [attach all-three-surveys.png]
    ```

- [ ] **r/WebGPU** _(post Day 3 — angle: graphics engineering)_:
  - **Title:** `Skymap: instanced billboards + GPU picking + per-instance texture quads, 3.5M galaxy points`
  - **Body:**

    ```
    Sharing a WebGPU project I've been building — happy to talk
    implementation.

    What's interesting graphics-wise:

    - 3.5M instanced point billboards, single draw call, 28-byte
      per-instance vertex stride
    - r32uint pick texture + copyTextureToBuffer for hover/click
      across the full set, sub-millisecond
    - 2048x2048 LRU texture atlas with 128x128 slots; thumbnails
      streamed in based on per-galaxy apparent-pixel-size gating
    - Render-on-demand main loop — idles cleanly when nothing's moving

    A bug that took me a week: queue.writeBuffer ordering isn't
    preserved across submits in the same frame.  Per-instance state
    has to be in the vertex buffer, not a mid-frame-mutated uniform.

    Live: https://skymap.rulkens.com
    Source: https://github.com/rulkens/skymap (didactic comments
    throughout)
    ```

- [ ] **Verify** each post is live by visiting the subreddit and confirming the post appears in /new, then check upvote count + comment count after ~6 hours per post.

### Step 4.4: Maintain the threads

- [ ] **For 48 hours after each post**, refresh hourly during waking hours to reply to comments. The half-life of a thread is short; engagement in the first 6 hours determines reach.

- [ ] **Verify** by checking notification badges — aim for at least 3 substantive replies on HN, 5 on Reddit per sub. If a thread is dead at 6 hours, don't keep checking — accept and move on.

---

## Task 5: Targeted academic outreach (cold emails)

After Show HN lands (or doesn't — but ideally lands), send five customised cold emails. Each email has its own audience and angle. _Wait until Task 4 has at least one piece of traction to reference_ — even a Show HN with 30 points is a real warm-opener. If HN was a complete dud, lead with the live demo and Zenodo DOI instead.

**Files:** No source-tree files. Drafts below; copy-paste at send time.

### Step 5.1: Email 1 — SDSS outreach team

- [ ] **To:** `outreach@sdss.org` _(check the SDSS web team's current contact at https://www.sdss.org/people/ if this address bounces)_
- [ ] **Subject:** `Browser-based WebGPU 3D explorer for SDSS DR18 — feedback welcome`
- [ ] **Body:**

```
Dear SDSS Outreach team,

I'm writing as an independent developer with a small project that uses
SDSS DR18 data and that I hope might be useful to your education /
public-outreach work.  I've built skymap, a free browser-based 3D
explorer that loads SDSS, 2MRS, and GLADE galaxy catalogs and lets
users orbit the cosmic-web wedge in real time.  It runs on WebGPU
(Chrome/Edge 113+) with no install, no Python.

For SDSS galaxies, the on-zoom thumbnail is fetched from your DR18
ImgCutout endpoint (which exposes CORS headers — thank you for that).
Spectroscopic redshift and photometric magnitudes are pulled directly
from your SkyServer SQL output.  Citation and attribution are listed
prominently in the README.

Live: https://skymap.rulkens.com
Source + acknowledgements: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

Two specific questions, if you have time:

1. Is there an SDSS Voyages page or classroom-resource list where a
   tool like this would fit naturally?  I'd value being suggested as
   a complement to the existing 2D sky viewers.
2. Any data-attribution language I should be using that I'm not?

Happy to incorporate feedback, and equally happy to hear "no thanks".

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify by checking your sent-mail folder** that the message went out without the placeholder DOI digits remaining.

### Step 5.2: Email 2 — GLADE authors

- [ ] **To:** Gergely Dálya (corresponding author on GLADE / GLADE+; lookup at https://orcid.org or via the most recent GLADE+ paper). Likely current affiliation is University of Ghent or Wigner Research Centre for Physics.
- [ ] **Subject:** `Skymap: a 3D GLADE explorer in the browser, GW host-galaxy use case`
- [ ] **Body:**

```
Dear Dr. Dálya,

I've built skymap, an open-source browser-based 3D explorer for
several galaxy catalogs.  GLADE is one of the three I load (alongside
SDSS and 2MRS), and it's the most useful of the three for the use
case I find personally most interesting: scanning the
gravitational-wave EM-counterpart host-candidate volume in 3D rather
than projected onto the sky.

The use case I write up in the README is exactly the one your group
designed GLADE for — so I wanted to flag the project to you directly,
both as an acknowledgement and because feedback from someone closer
to the actual GW follow-up community would be invaluable.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

It's a personal learning project, not a polished product, so I'd
welcome bluntness about where the GW host-candidate framing falls
short.  If there are GW-follow-up groups (GROWTH, ENGRAVE, others)
where it would be worth posting a pointer, I'd be grateful for the
introduction.

With thanks for GLADE,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify:** addressee email confirmed before sending (check the GLADE+ MNRAS paper's corresponding-author footnote).

### Step 5.3: Email 3 — AAS WorldWide Telescope team (Peter Williams)

- [ ] **To:** Peter Williams at AAS (`pwilliams@aas.org` — confirm at https://www.aas.org/about/staff before sending)
- [ ] **Subject:** `Skymap (browser WebGPU 3D galaxy explorer) — possible AAS WWT community list?`
- [ ] **Body:**

```
Dear Peter,

I've been following the AAS WWT renewal effort with a lot of
admiration.  I wanted to share a small open-source project that
overlaps the browser-astronomy-tool space: skymap, an interactive
WebGPU 3D explorer for SDSS, 2MRS, and GLADE galaxy catalogs.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN
JOSS submission: in progress

It's not a WWT alternative — WWT is a far broader platform — but it
does occupy a free-exploration, 3D, no-install niche that I think
complements the WWT toolkit.  If there's an AAS-maintained list of
community-built browser tools, or any guidance on submitting to one,
I'd appreciate the pointer.

Recent traction on Hacker News [link if Show HN worked] suggests there
is real public appetite for "open the browser, see the galaxies"
tools, which I think bodes well for the WWT mission.

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify:** if Show HN didn't get traction, _delete the "Recent traction on Hacker News" sentence entirely_ before sending.

### Step 5.4: Email 4 — CDS Strasbourg / Aladin team

- [ ] **To:** Thomas Boch (`thomas.boch@astro.unistra.fr`) and Pierre Fernique (`pierre.fernique@astro.unistra.fr`) — both are the CDS Aladin maintainers.
- [ ] **Subject:** `Skymap — a WebGPU 3D viewer using hips2fits; awareness + interop?`
- [ ] **Body:**

```
Dear Thomas and Pierre,

I'm an independent developer with a small project that depends
heavily on CDS infrastructure.  Skymap is a browser-based 3D
explorer for SDSS, 2MRS, and GLADE galaxy catalogs, built on WebGPU.
For 2MRS and GLADE galaxies (which have no native CORS-permitted
thumbnail source), I fetch DSS cutouts via your hips2fits endpoint —
which has been *the* enabling piece of infrastructure for this part
of the project.  Thank you.

Live: https://skymap.rulkens.com
Source + acknowledgements: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

Two questions, no hurry on either:

1. Is there a CDS-maintained listing of community tools that build on
   VizieR / hips2fits / Aladin Lite where skymap might fit?  Awareness
   among the CDS user community would be valuable; I'd accept a
   "thanks but no" gracefully.
2. If I added VOTable export of the current selection or a hips2fits
   "open this region in Aladin Lite" deep-link, would either be
   actually useful to your users, or just clutter?  I'm genuinely
   unsure of the priority.

The project is a personal learning effort; I'm not pitching it as
infrastructure.  Feedback in any direction welcome.

With thanks for CDS,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify:** confirm both addresses on the CDS team page (https://cds.unistra.fr/) before sending — they sometimes change.

### Step 5.5: Email 5 — LIGO-Virgo-KAGRA EM follow-up (GROWTH / ENGRAVE)

- [ ] **To:** Either the GROWTH coordinator (Mansi Kasliwal, Caltech — `mansi@astro.caltech.edu`) or the ENGRAVE coordination email (`engrave@ligo.org`). Choose one initially; if both come back warm, that's fine. Don't BCC both at once.
- [ ] **Subject:** `Browser 3D explorer for GLADE — GW host-candidate use case, feedback welcome`
- [ ] **Body:**

```
Dear [Dr. Kasliwal / ENGRAVE coordination team],

I've built skymap, an open-source browser tool that I think has a
small but real use case in EM-follow-up triage: a 3D interactive
explorer of the GLADE catalog (~3M galaxies, all-sky), running
directly in Chrome / Edge via WebGPU with no install.

The intended workflow: given a GW localisation contour, you orbit
the GLADE volume, see candidate hosts in 3D, click for redshift +
NED link, get a sense of which structures (clusters, walls) actually
intersect the contour rather than just the projected sky region.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.NNNNNNNN

Important caveats: skymap currently has no GW skymap overlay —
that's a near-term feature I want to add but it's not there yet.  I
am aware that real follow-up triage runs through TreasureMap, GW
Skynet, gracedb, and bespoke pipelines.  This is meant as a
rapid-orientation companion, not a replacement.

If anyone in your group has a few minutes to look and tell me whether
adding a Multi-Order HEALPix skymap overlay would actually be useful
for triage (vs. people just using treasuremap.space), I'd be very
grateful for the steer.

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

- [ ] **Verify** — _do not_ claim skymap has a GW skymap overlay if it doesn't. The body above is honest about the gap; keep it that way.

### Step 5.6: Send-all checklist

- [ ] **Substitute the real Zenodo DOI** in all five emails (do this once with `sed` against a draft file or use email-template merging).

- [ ] **Send each email individually**, not as a single thread. Spread them over 3-5 days; an inbox flood from a stranger looks like a mailing-list robot.

- [ ] **Verify by checking your sent-mail folder** that no email retains the literal string `NNNNNNNN`. Spot-check one or two for typos before sending the rest.

- [ ] **Track replies in a simple text log** at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/outreach_log.md` — date sent, recipient, reply summary. Update when responses come in. (This is project memory only; don't commit it to the repo.)

---

## Task 6: RNAAS note (optional, parallel to JOSS)

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

---

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

- [x] **Ordering:** Repo polish (Task 1) → release artifact (Task 2) → durable artifact (Task 3) → public posts (Task 4) → cold emails (Task 5) → optional second durable artifact (Task 6). Tasks 4 and 5 explicitly gate on Task 1; Task 5 explicitly gates on Task 4.
