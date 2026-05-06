# Show HN

## Target

- **Submit URL:** `https://news.ycombinator.com/submit`
  _(source: https://github.com/igrigorik/hackernews-button — the submit endpoint has been stable for years; retrieved 2026-05-06)_
- **Best window:** Tuesday morning, US east coast (proven peak for Show HN traction).
- **Account requirement:** the HN account must have submission privileges (any non-throwaway account does).

## Send checklist

- [ ] Open `https://news.ycombinator.com/submit` while logged in.
- [ ] Paste the **Title** below into the title field.
- [ ] Paste the **URL** `https://skymap.rulkens.com` into the url field.
- [ ] Leave the text field blank — HN will auto-pull the page title and Open Graph card.
- [ ] Submit.
- [ ] _Immediately_ open the new thread and post the **First comment** below as the OP. This is the "story" comment that anchors the thread; HN regulars expect it on Show HN.
- [ ] Note the numeric item ID from the resulting URL (`https://news.ycombinator.com/item?id=NNNNNNNN`) for the verification command.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD ID=NNNNNNNN`.

## Title

```
Show HN: Skymap – a 3D galaxy catalog explorer in the browser via WebGPU
```

## First comment (post immediately after submit, as OP)

```
Author here. I'm a frontend dev, and a few years ago I fell down the
astronomy rabbit hole. Skymap is what happened when I wanted to
actually do something with galaxy catalog data instead of just reading
papers.

It loads SDSS (~500k galaxies), 2MRS (~45k), and GLADE (~2M) and
renders them as WebGPU instanced billboards. A tier selector lets you
switch dataset size without a reload; mobile auto-picks the smallest
tier and pinch-zoom works.

Past a certain on-screen size, each galaxy crossfades from a dot into a
procedural 3D-oriented disk (using the catalog's axis-ratio + position
angle from HyperLEDA / 2MASS XSC), and then into a real survey image
when you're close enough. The images come from SDSS DR18 ImgCutout, DSS
via CDS hips2fits, or hand-curated DESI Legacy thumbnails for the
Messier greatest-hits. There's also a cosmic-web filament overlay
(DisPerSE-built offline) — a faint blue lattice tracing the ridges of
the density field. Striking at supercluster scale.

The code's commented to be read, not just to satisfy a linter. If
you've been meaning to learn WebGPU or wondering how distance from
redshift actually works, the source is meant to be a worked example.

Live: https://skymap.rulkens.com
Repo: https://github.com/rulkens/skymap (MIT)
DOI:  https://doi.org/10.5281/zenodo.20037028

Would love feedback on any of it.
```

## Verification command

A few hours after posting, sanity-check the score and comment count:

```bash
# Replace NNNNNNNN with the actual numeric item ID from the URL
curl -s "https://hacker-news.firebaseio.com/v0/item/NNNNNNNN.json" | jq '{title, score, descendants}'
```

_Expected: `title` matches the submission, `score` ≥ 1 (at minimum your own upvote), `descendants` (comment count) climbing if the post landed. A submission still on the front page after ~3 hours is a hit; one stuck on `/new` at 1 point isn't — accept and move on rather than re-submitting._

## Maintenance

For 48 h after posting, refresh the thread hourly during waking hours and reply to substantive comments. The half-life of an HN thread is short; engagement in the first 6 h determines reach. Aim for at least three substantive author replies before you stop checking.

## Status

`pending`

> Audit pass: 2026-05-06 — submit URL re-verified, body-claims (galaxy counts, browser support, DOI, image source list, filament overlay) checked against `README.md` and the live repo.

