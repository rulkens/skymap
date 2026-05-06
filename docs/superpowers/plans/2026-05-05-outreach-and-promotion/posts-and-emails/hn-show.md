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
Hi HN, Alex here, designer-engineer based in the Netherlands. Day job is
building Repper (a pattern-design tool); skymap is a side project — built
last weekend in 4 days with Claude Code, ~32 hours of focused pair-
programming.

I've followed Anton Petrov on YouTube for years and kept seeing those
beautiful pans over galaxy catalogs in research videos, then thinking
"why can't I just fly through that myself?" Apparently the answer was
"because nobody had built it yet for the browser." So I did.

It loads SDSS (~500k galaxies), 2MRS (~45k), and GLADE (~2M after dedup)
and renders them as WebGPU instanced billboards. A tier selector swaps
dataset size without a page reload. Past a certain on-screen size, each
galaxy crossfades from a dot into a procedural 3D-oriented disk (using
catalog axis-ratio + position angle from HyperLEDA / 2MASS XSC), then
into a real survey image when you're close enough — SDSS DR18 ImgCutout,
or DSS via CDS hips2fits for the rest. There's also a cosmic-web
filament overlay built offline by DisPerSE (Sousbie 2011), a faint blue
lattice tracing ridges of the density field. Pretty striking at
supercluster scale.

The actual unlock for me with Claude wasn't "code faster" — it was that
I could read about an algorithm in a paper, ask Claude to derive the
math against the catalog, and have a working interactive implementation
the same evening. DisPerSE filament skeletons, Schechter luminosity-
function corrections, HEALPix angular re-weighting, K-correction in the
fragment shader, comoving distance from redshift — algorithms I'd
otherwise have only watched a YouTube video about, now things you can
drag around in the browser. That collapse-the-paper-to-runtime gap is
the new thing for me.

The bug-arc texture: I came from years of WebGL, where "set a uniform
per draw call" is muscle memory. In WebGPU, queue.writeBuffer ordering
isn't preserved across submits in the same frame, so per-instance state
set via mid-frame uniform writes ends up out of order with the draw it
was supposed to apply to. That bit me twice (same root cause, different
symptoms — galaxies rendering on the wrong galaxy, then the selection
halo lighting up the wrong one). Fix: bake per-instance state into the
vertex buffer. Also bumped the binary format four times in one day on
day 1 (the discipline being "bump it again, regenerate, keep building"
rather than building a flexible extension scheme).

Live: https://skymap.rulkens.com
Repo: https://github.com/rulkens/skymap (MIT, comments are written to
be read)
DOI:  https://doi.org/10.5281/zenodo.20037028

Plenty of unpolished UX edges; touch / mobile gestures aren't built yet
(works on recent phones with WebGPU but with mouse-style controls).

One thing I'm genuinely curious about for HN: how do people grow a
project from a seed like this into something more substantial? I keep
shipping personal-learning side projects and I'd love to read what
others do — any reading material, blog posts, or bluntness on what the
next step looks like would be more than welcome.
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

