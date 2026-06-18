# Task 7: Product Hunt launch

> **Added 2026-06-18.** Channel gap surfaced by studying a direct peer:
> **AstroGrid** (velonspace.com, maker John Lee / @johnastrogrid) — a
> browser WebGL/Three.js universe explorer that pulls the *same* catalogs
> as skymap (2MRS, SDSS, plus HYG + JPL, with procedural fill for empty
> regions). Its entire visible outreach footprint was **Product Hunt**
> (117 upvotes, #12 of the day, ~Apr/May 2026) plus organic ed-tech blog
> spillover. No Reddit/HN thread exists for it. Skymap's footprint is the
> mirror image — HN + Bluesky + r/dataisbeautiful done, **Product Hunt
> never attempted.** This is the single biggest untapped channel, and a
> peer has proven it converts in exactly this segment.

## Why now (the credibility floor exists)

Product Hunt rewards a working product with a clear hook. Skymap clears
the bar that a stranger-on-PH applies:

- **v0.4.0** shipped 2026-05-30 — a real, tagged, citable release.
- **80–100 visitors/day, steady** — durable organic use, not a launch
  spike. This is the honest "traction" line that replaces the soft HN
  numbers.
- Live, zero-install, no-signup demo — PH's audience can click and play
  in five seconds, which is the format the platform rewards.

## Positioning (the honesty caveat that matters)

AstroGrid wins PH on **accessible eye-candy** — fly-from-Earth, solar
system, gravitational lensing. Skymap is **more scientific / niche**
(cosmic web, real cross-matched catalogs, density-correction modes). For
a PH audience that means: **lead with the grabbiest visual** (a cosmic-web
flythrough or a Local Group zoom), *then* reveal the scientific depth.
Do **not** open with catalog mechanics ("2MRS J–H–K photometry"). Same
tool, different first five seconds. Keep the README's honest register —
"interactive WebGPU explorer, documented didactically as a learning
project; useful for X/Y/Z" — never "next-generation platform".

## Steps

- [ ] **Capture a 20–30 s flythrough video** (Tab-hidden UI): orbit the
  cosmic-web wedge → zoom to the Local Group → land on one galaxy
  thumbnail. CleanShot X / ffmpeg / gifski. This asset is shared with
  Task 4's video Reddit posts — record once, reuse.
- [ ] **Write the tagline** (≤60 chars) — visual-first, e.g. "Fly through
  2 million real galaxies in your browser". Verify length: `printf '%s' "<tagline>" | wc -c`.
- [ ] **Write the description** (~260 chars) — what it is, that the data
  is real (SDSS + 2MRS + GLADE), zero-install, open-source + didactic.
- [ ] **Write the maker's first comment** (~200 words) — the personal
  "why I built this" story in the README's voice; mention it's a learning
  project, link the repo + Zenodo DOI `10.5281/zenodo.20037028`.
- [ ] **Decide on a handle/account** — AstroGrid used a product-specific
  handle (@johnastrogrid). Decide: personal account vs. a skymap-specific
  one. (User decision — surface, don't assume.)
- [ ] **Pick gallery images** — reuse the README screenshots in
  `docs/screenshots/` (hero, local-group, wide-field, density modes).
- [ ] **Schedule the launch** — PH days run 00:01 PT; Tue–Thu generally
  outperform. Submit the night before so it goes live at 00:01 PT.
- [ ] **Launch-day maintenance** — reply to every comment within the
  first 6 h; first-6-h engagement determines rank, same as Reddit/HN.
- [ ] **Verify** the listing is live and accruing upvotes; log final
  rank + upvote count in `outreach_log.md`.

## What "good" looks like

AstroGrid's 117 upvotes / #12-of-day is a realistic ceiling for a niche
science tool. Anything that cracks the day's top 20 feeds the funnel and
gives the academic emails (Task 5) and ed-tech outreach (Task 8) a fresh,
honest reference point.
