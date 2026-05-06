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
Hi HN, Alex here, designer-engineer in the Netherlands. My day job is
Repper (a pattern-design tool). Skymap is a side project, built last
weekend in 4 days (~32 hours, AI-assisted with Claude Code).

I've followed Anton Petrov on YouTube for years and kept seeing nice
pans over galaxy catalogs in research videos, thinking "why can't I just
fly through that?" Turned out nobody had built it for the browser yet.

It loads SDSS (~500k galaxies), 2MRS (~45k), and GLADE (~2M) as WebGPU
instanced billboards. Past a certain on-screen size each galaxy
crossfades from a dot into a procedural oriented disk (catalog
axis-ratio + PA from HyperLEDA / 2MASS XSC), then into a real survey
image when close enough: SDSS DR18 ImgCutout, or DSS via CDS hips2fits
for the rest. There's a cosmic-web filament overlay built offline with
DisPerSE (Sousbie 2011), a faint blue lattice over the point field.
Striking at supercluster scale.

What I love about coding with Claude is that I can read about an
algorithm in a paper and have it running interactively the same
evening. DisPerSE skeletons, Schechter LF corrections, HEALPix
re-weighting, K-correction in the fragment shader. Stuff I'd otherwise
only have watched a video about.

War story: years of WebGL conditioned me to "set a uniform per draw
call". In WebGPU, queue.writeBuffer ordering isn't preserved across
submits in the same frame, so per-instance state set via mid-frame
uniform writes lands on the wrong draw. Bit me twice (galaxy data on
the wrong galaxy, then the selection halo lighting up the wrong one).
Fix: bake per-instance state into the vertex buffer.

Live: https://skymap.rulkens.com
Repo: https://github.com/rulkens/skymap (MIT)
DOI:  https://doi.org/10.5281/zenodo.20037028

UX has plenty of rough edges, mobile gestures aren't there yet. I'm not
an astronomer (the cosmology math is all Claude-derived against
textbook formulas), so if anyone here works in the field and spots
something off, I'd love to hear it.

I'm also curious how people grow side projects like this into something
more substantial. I keep shipping personal-learning projects and would
love any reading or bluntness on what the next step usually looks like.
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

