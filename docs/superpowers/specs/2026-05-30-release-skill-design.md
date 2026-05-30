# `/release` skill — design

**Status:** approved (brainstorm 2026-05-30)
**Deliverable:** a single project skill, `.claude/skills/release/SKILL.md`. No runtime code.

## Problem

Cutting a skymap release is a multi-step, easy-to-botch ritual: bump the version in
three files, curate release notes from a few hundred commits, tag, and publish a
GitHub release — the last of which triggers a **permanent** Zenodo versioned DOI
that can't be unminted. The steps live only in the maintainer's head and in the
shape of the last release (`v0.3.0`). Codify them so every release is identical and
the irreversible step is always gated behind human review.

## Scope

In scope: a checklist skill that drives a release end-to-end up to a **draft**
GitHub release, then hands off. Out of scope: publishing the release (the human
does that), R2/data syncs (orthogonal to versioning), and changelog file
maintenance (the repo has no `CHANGELOG.md`; notes live on the GitHub release).

## Trigger

`/release`, or natural-language: "cut a release", "tag v0.X.0", "release the
version", "bump and release". Input: target version (`0.4.0`); if omitted, infer
the next minor from `package.json`.

## The checklist the skill encodes

1. **Preflight.** Confirm cwd is the main checkout on `main`, tree clean,
   `git pull` + `git fetch --tags`. Identify `PREV` = latest `v*` tag. Confirm the
   tests/typecheck gate is green (CI covers it on the bump PR; a local `npm test`
   is optional). Abort with a clear message if dirty, detached, or behind.

2. **Version bump — via PR, never direct push.**
   - Branch `chore/bump-vX.Y.Z` off `main`.
   - `npm version X.Y.Z --no-git-tag-version` — rewrites `package.json` and
     `package-lock.json` together (the `--no-git-tag-version` flag suppresses
     npm's own commit + tag; the skill owns tagging).
   - Update `CITATION.cff`: `version:` → `X.Y.Z`, `date-released:` → today
     (the agent reads today's date from session context).
   - Commit `chore: bump to vX.Y.Z` (user git identity, `Co-Authored-By` trailer
     only — never `--author`). Stage the three files by path, never `git add -A`.
   - Push, open PR, wait for green CI, squash-merge, delete branch.
   - `git switch main && git pull` so the tag will cut from the bumped commit.

3. **Compose curated release notes.** `git log PREV..main` → group into themed
   sections matching the `v0.3.0` precedent (New visualisation layers / Engine +
   renderer / Testing + tooling / Documentation — adapt headings to what actually
   landed). Lead line: `N commits since vPREV (date). Highlights:`. Include the
   current test count (`npm test` summary). End with a **Cite this release** block:
   concept DOI `10.5281/zenodo.20037028` + the note that a versioned DOI is minted
   within minutes of publishing. The skill ships the `v0.3.0` notes as a worked
   template so the structure is concrete.

4. **Create a DRAFT release + deferred tag.**
   `gh release create vX.Y.Z --draft --target main --title "skymap vX.Y.Z"
   --notes-file <notes>`.
   **Core safety property:** a *draft* release does **not** create the git tag in
   the repo until it is published. So every step up to here is reversible —
   deleting the draft leaves no tag and no DOI. The skill states this explicitly so
   the maintainer understands why the draft gate is safe.

5. **Hand off.** Print the draft URL with: "Review the rendered notes, then click
   Publish. Publishing creates the `vX.Y.Z` tag from `main` and triggers Zenodo's
   permanent versioned DOI." The skill stops here. It never publishes.

## Encoded gotchas

- Branch + PR for the bump; no direct push to `main`.
- Stage specific paths; never `git add -A`/`.`.
- Commits use the user's git identity; only a `Co-Authored-By` trailer in the body.
- `CITATION.cff` `date-released` = today.
- `--target main` so the tag is cut from the right commit at publish time.
- The bump must be merged to `main` *before* the release is created, so the
  eventual tag points at the bumped commit, not a pre-bump one.
- `gh release create --draft` with a new tag name does not move/create the tag
  until publish — this is what makes the whole flow reversible.

## Why a skill, not a script

The release needs judgement at step 3 (which commits are highlights, how to group
them) that a deterministic script can't supply — that's the curation the user chose
over an auto-generated changelog. A skill puts an agent in the loop for the prose
while pinning every mechanical step (flags, file list, ordering, safety gate) so
they don't drift release-to-release. Authored directly with `skill-creator`
conventions (single `SKILL.md`); no TDD plan, matching how `link-data`/`wt`/`dev`
were made.

## Shipping

The skill file is a repo change, so it lands via its own PR (spec doc + `SKILL.md`
together). Once merged, the skill is invoked to cut `v0.4.0` — producing the bump
PR and the draft release for maintainer review.
