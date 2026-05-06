# Reddit — r/Astronomy

## Target

- **Submit URL:** `https://www.reddit.com/r/Astronomy/submit`
  _(source: https://reddit.com/r/Astronomy/ — confirmed active subreddit; retrieved 2026-05-06)_
- **Members:** ~3.1 M as of late 2025 _(source: https://gummysearch.com/r/Astronomy/, retrieved 2026-05-06; note that as of Sept 2025 Reddit replaced the public member count with active-visitor metrics, so the exact number is no longer surfaced in the sidebar)_
- **Best window:** Day 2 of the campaign — morning US time. Posting too close to a Show HN risks looking like simultaneous spam.
- **Angle:** science / catalogs. Lead with what the renderer lets you _do_ scientifically, not the engineering.

## Send checklist

- [ ] Read the current r/Astronomy posting rules (sidebar) — they shift periodically and self-promotion needs an explicit author tag.
- [ ] Confirm `r/Astronomy` is not currently in any restricted / quarantined state.
- [ ] Open `https://www.reddit.com/r/Astronomy/submit` while logged in.
- [ ] Choose **Link** (not Image / Video) post type, even though the body has a body-text section — Reddit allows body text on link posts.
- [ ] Paste the **Title** below.
- [ ] Paste `https://skymap.rulkens.com` as the URL.
- [ ] Paste the **Body** below into the post body.
- [ ] If the subreddit requires a flair, pick "Discussion" or the closest equivalent.
- [ ] Submit.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD URL=<permalink>`.

## Title

```
I built a browser-based 3D explorer for SDSS, GLADE, and 2MRS — open source, no install
```

## Body

```
Hey r/Astronomy — I've been working on a personal-learning project that
I think might be useful to some of you. It's a free-explore 3D viewer
for three galaxy catalogs (SDSS DR18, the 2MASS Redshift Survey, and
GLADE) running directly in the browser via WebGPU. No install, no
Python, just Chrome / Edge 113+ (also Firefox 141+ / Safari 26+).

Live demo: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.20037028

What you can do:
- Orbit the SDSS wedge — Sloan Great Wall is right there
- Cmd+K for a famous-galaxy command palette (M31, M51, etc.)
- Density-correction toggle (1/V_max, Schechter LF, HEALPix angular
  re-weight) for unbiased structure visualisation
- Zoom into a galaxy, get its DR18 thumbnail or a DSS cutout via CDS
  hips2fits, plus pinned metadata + NED link
- Cosmic-web filament overlay (DisPerSE-built offline) tracing the
  density-field ridges

It's documented didactically — the source is meant to be readable.
Citation file is in the repo if you'd ever use it for teaching.

Happy to take feedback on the science end especially. Suggestions for
what to add next?
```

## Maintenance

- [ ] First 6 h after posting are decisive on Reddit. Reply to substantive top-level comments quickly; the thread either gets traction in that window or it doesn't.
- [ ] Aim for at least 5 substantive author replies before disengaging.
- [ ] Note any cross-posts to other subs that organically appear; those are usually a positive signal.

## Status

`pending`

> Audit pass: 2026-05-06 — submit URL active; body claims (galaxy counts, browser support, density-correction modes, filament overlay, DOI) checked against `README.md`.

