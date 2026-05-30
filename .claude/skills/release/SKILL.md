---
name: release
description: Use when cutting a tagged version release of skymap — triggers like "/release", "cut a release", "tag v0.X.0", "release the new version", "bump and release", or when a new Zenodo DOI needs minting for a version.
---

# `/release` — cut a skymap version release

## Overview

Drive a skymap release end-to-end up to a **draft** GitHub release, then hand off.
The one irreversible step — publishing, which mints a permanent Zenodo versioned
DOI — is always left for the human. Everything the skill does is reversible
because a *draft* release does not create the git tag until it is published.

## When to use

- Maintainer wants to ship a new version (`v0.4.0`, etc.) with the changes since the last tag.
- A new versioned Zenodo DOI needs minting.

**Not** for: code deploys (those happen on every push to `main`), or R2 data syncs
(see CLAUDE.md "Deploy workflow" — orthogonal to versioning).

## Input

Target version, e.g. `0.4.0`. If omitted, propose the next minor from
`package.json` and confirm.

## Procedure

### 1. Preflight
- Confirm cwd is the **main checkout** (not a worktree) on `main`, tree clean.
- `git switch main && git pull && git fetch --tags`.
- `PREV=$(git describe --tags --abbrev=0)` — the previous `v*` tag.
- Abort with a clear message if the tree is dirty, detached, or behind origin.

### 2. Version bump — via PR, never a direct push
```bash
git switch -c chore/bump-vX.Y.Z
npm version X.Y.Z --no-git-tag-version   # rewrites package.json + package-lock.json together
```
Then edit `CITATION.cff`: set `version: X.Y.Z` and `date-released: 'YYYY-MM-DD'`
(today — read it from session context). Stage the three files **by path**, commit
with the user's git identity (Co-Authored-By trailer only, never `--author`):
```bash
git add package.json package-lock.json CITATION.cff
git commit -m "chore: bump to vX.Y.Z" -m "Co-Authored-By: ..."
git push -u origin chore/bump-vX.Y.Z
gh pr create --base main --title "chore: bump to vX.Y.Z" --body "..."
```
Wait for green CI, then `gh pr merge <n> --squash --delete-branch`, and
`git switch main && git pull`. The bump must be on `main` **before** the release is
cut so the tag points at the bumped commit.

### 3. Review docs for new sources (README + ATTRIBUTIONS.md)
Before cutting the release, make sure every data, imagery, dependency, or
external-service source added since `PREV` is credited. Uncredited third-party
imagery is a real licensing problem, not a nicety.
- Read `git log PREV..main` and skim the diff for: new catalogs, new imagery
  sources, new external services/APIs, new runtime dependencies.
- **Imagery especially** — inspect `data/famous_curated_overrides.json` for
  `author` / `license` / `sourceUrl` institutions not yet covered in
  `ATTRIBUTIONS.md` → Imagery (e.g. a new press source like NOIRLab or ESO).
- If anything new is uncredited, update `ATTRIBUTIONS.md` (and any user-facing
  source description in `README.md` that's now stale) and land it as its own
  docs PR merged to `main` **before** cutting the release — so the tagged
  release includes correct attribution.
- Flag any `"license": "unknown"` entries to the maintainer as a redistribution
  risk; resolve them or document them as unresolved.

### 4. Compose curated release notes
```bash
git log PREV..main --oneline        # the raw material — read every line
git log PREV..main --oneline | wc -l # the "N commits since vPREV" count
```
Write notes to a temp file, structured like the previous release (read it live for
the canonical shape):
```bash
gh release view PREV          # the worked template — match its sections + tone
```
Curate, don't dump. Group commits into themed sections (adapt headings to what
actually landed — e.g. *New visualisation layers*, *Engine + renderer*,
*Testing + tooling*, *Documentation*). Lead line:
`N commits since vPREV (<PREV date>). Highlights:`. Include the current test count
(from the `npm test` summary). End with the cite block:

```markdown
## Cite this release

DOI: https://doi.org/10.5281/zenodo.20037028 (concept DOI — always resolves to the latest version)

A versioned DOI for vX.Y.Z specifically will be minted by Zenodo within minutes of this release going live.
```

### 5. Create the DRAFT release
```bash
gh release create vX.Y.Z --draft --target main \
  --title "skymap vX.Y.Z" --notes-file <notes-file>
```
A **draft** release with a new tag name does **not** create the tag in the repo
until it is published — this is what makes every step above reversible (delete the
draft → no tag, no DOI).

### 6. Hand off — stop here
Print the draft URL and:
> "Draft release ready at `<url>`. Review the rendered notes, then click **Publish**.
> Publishing creates the `vX.Y.Z` tag from `main` and triggers Zenodo's permanent
> versioned DOI. The skill does not publish for you."

**Never** run `gh release edit --draft=false` or otherwise publish. That is the
human's call.

## Gotchas

| Gotcha | Why it matters |
|--------|----------------|
| Bump lands on `main` before the release is created | Otherwise the tag points at a pre-bump commit |
| `--no-git-tag-version` on `npm version` | npm would otherwise make its own commit + tag, fighting the skill |
| `CITATION.cff` `date-released` = today | Stale date misrepresents the release date in citations |
| `--target main` on `gh release create` | Pins the tag to the right commit at publish time |
| Branch + PR for the bump; stage by path | Project rule: no direct push to `main`, no `git add -A` |
| Draft, not live | The live publish (Zenodo DOI) is permanent — leave it to the human |
| Run from the main checkout | Worktrees have throwaway `public/data/`; releases cut from main (see CLAUDE.md) |

## Red flags — STOP

- About to `gh release create` **without** `--draft` → stop; the DOI is permanent.
- About to publish the draft yourself → stop; that is the human's step.
- Tagging before the bump PR is merged to `main` → stop; tag would miss the bump.
