# Task 0: Cut v0.2.0 release + refresh Zenodo DOI

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
