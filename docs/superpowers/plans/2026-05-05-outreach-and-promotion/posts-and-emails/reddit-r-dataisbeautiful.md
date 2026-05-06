# Reddit — r/dataisbeautiful

## Target

- **Submit URL:** `https://www.reddit.com/r/dataisbeautiful/submit`
  _(source: https://reddit.com/r/dataisbeautiful/ — confirmed active subreddit; retrieved 2026-05-06)_
- **Members:** ~21–22 M as of 2024 _(source: https://gummysearch.com/r/dataisbeautiful/ — 21.7 M; en.wikipedia.org/wiki/R/dataisbeautiful — "exceeds 22 million subscribers"; retrieved 2026-05-06)_
- **Best window:** Day 2 of the campaign — afternoon US time, ideally a few hours after the r/Astronomy post so they're not stacked on the same hour.
- **Angle:** visual / structure. The sub's core value is the visualisation itself, not what you can do scientifically with it. Lead with the picture.
- **Required tag:** `[OC]` (Original Content). Without it, the post is shadow-deprioritised.

## Send checklist

- [ ] Read the current r/dataisbeautiful submission rules. The sub is strict: `[OC]` flair on the title is mandatory for original work, and a top-level comment from OP describing the data sources + tools is required within ~30 minutes or the post is auto-removed.
- [ ] Open `https://www.reddit.com/r/dataisbeautiful/submit` while logged in.
- [ ] Choose **Image** post type — this sub heavily prefers a visual as the primary, with the link/source in the body or an OP comment.
- [ ] Upload `docs/screenshots/all-three-surveys.png` (or whichever screenshot most strikingly shows the cosmic-web structure with all three surveys layered).
- [ ] Paste the **Title** below.
- [ ] Add the `[OC]` flair when the submit form prompts for it.
- [ ] Submit.
- [ ] **Within 5 minutes**, post the **Source / tools comment** below as a top-level comment on your own post. r/dataisbeautiful's rules require this and the auto-mod enforces it ruthlessly.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD URL=<permalink>`.

## Title

```
[OC] Cosmic-web structure in 3 galaxy catalogs (SDSS + GLADE + 2MRS, ~3.5M galaxies, WebGPU)
```

## Source / tools comment (post within 5 min of submission)

```
Source data:
- SDSS DR18 — ~500k galaxies, https://skyserver.sdss.org/dr18
- GLADE v2.3 — ~2M galaxies after cross-match dedup
  (a gravitational-wave host catalogue; original ~3.3M rows)
- 2MRS — ~45k local-volume galaxies, https://tdc-www.harvard.edu/2mass/

Cross-matched and rendered as instanced points in the browser using
WebGPU.

Tools: TypeScript + React for the UI, raw WebGPU + WGSL shaders for
the renderer, custom 64-byte-per-point binary format for the catalog
files.

Live (Chrome / Edge 113+, Firefox 141+, Safari 26+):
  https://skymap.rulkens.com
Source (MIT):
  https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.20037028
```

_Editorial note: the original draft said "48-byte binary format". The on-disk per-point record is now **64 bytes** (v4 format — see README "Browser binary format (SKMP v4)"); the **vertex stride** in GPU memory after the buffer-bake is 52 bytes (13 × float32 slots). Two different numbers, both real. The post deliberately quotes the on-disk number because that's the meaningful one for "what does the data file look like"._

## Maintenance

- [ ] First 6 h are decisive — engagement-rate over those hours determines whether the post hits r/all.
- [ ] Reply to comments asking about specific data sources / methodology with links straight into the README's relevant sections.
- [ ] Aim for at least 5 substantive author replies before disengaging.

## Status

`pending`

> Audit pass: 2026-05-06 — submit URL active; on-disk per-point size re-verified at 64 bytes (SKMP v4 header + record table in `README.md` "Browser binary format"); GLADE post-dedup count rephrased as "~2M after cross-match dedup" matching the README's 2.1M number.

