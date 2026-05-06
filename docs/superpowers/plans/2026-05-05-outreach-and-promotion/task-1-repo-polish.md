# Task 1: Repo polish for credibility

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

> **Minted DOIs:** concept DOI `10.5281/zenodo.20037028` (always-latest); v0.1.0 version-DOI `10.5281/zenodo.20037029`; v0.2.0 version-DOI `10.5281/zenodo.20053519` (minted 2026-05-06).

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
