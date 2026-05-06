# Bluesky thread (4 posts)

## Target

- **Compose URL:** `https://bsky.app` _(source: bsky.app is the canonical web client for the AT-protocol Bluesky network; retrieved 2026-05-06)_
- **Best window:** Roughly 2 h after the HN post — late afternoon in continental Europe / lunchtime US east coast. The astronomy community on Bluesky skews EU + east-coast US, and posting after HN means the embed/OG card will work and the thread can reference HN traction by reply if it landed.

### A note on @-mentions: dropped

The earlier draft of this thread cc'd `@sdss.bsky.social`,
`@aaswwt.bsky.social`, and a "(handle?)" placeholder for Brice Ménard.
None could be verified as real, official accounts on 2026-05-06, AND I
don't have a genuine relationship with any of them — tagging strangers
reads as cargo-cult outreach. So this thread relies on **hashtags for
discovery** instead: `#astrodataviz`, `#astronomy`, `#webgpu`. If real
relationships exist on Bluesky after this post lands, future threads
can warm-open from those.

## Send checklist

- [ ] Open Bluesky web; create the four posts as a chained reply thread (post 1, then "Reply" → post 2, etc).
- [ ] Attach `docs/screenshots/hero.gif` to post 1.
- [ ] Attach `docs/screenshots/all-three-surveys.png` (or equivalent — see Task 1 deliverables) to post 2.
- [ ] Attach `docs/screenshots/infocard-detail.png` to post 3.
- [ ] No image on post 4.
- [ ] After all four are up, open your profile and confirm the thread is chained (not four orphan posts).
- [ ] Verify the hero GIF auto-plays on post 1.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD`.

## Body

### Post 1

```
Built skymap last weekend in 4 days with Claude Code: an interactive
WebGPU 3D explorer for SDSS, 2MRS, and GLADE galaxy catalogs, running in
the browser. No install (Chrome / Edge 113+, Firefox 141+, Safari 26+).

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap

#astrodataviz #astronomy #webgpu

[attach hero.gif]
```

### Post 2 (reply to 1)

```
The cosmic-web wedge is right there — Sloan Great Wall, the Coma
cluster, the local-volume 2MRS galaxies. Density-correction toggle
(1/V_max, Schechter LF, HEALPix angular re-weighting) lets you see
structure unbiased by Malmquist.

[attach all-three-surveys.png]
```

### Post 3 (reply to 2)

```
Up close, dots become DR18 thumbnail cutouts (SDSS) or DSS proxies via
CDS hips2fits (2MRS / GLADE). Click to pin metadata: redshift, lookback
time, NED link.

[attach zoomed-thumbnail-infocard.png]
```

### Post 4 (reply to 3)

```
Personal-learning project — source is documented didactically (every
WebGPU surprise written up where it bit me).

One thing I'd genuinely love feedback on: getting the volume corrections
right. 1/V_max + Schechter LF + HEALPix angular re-weighting are
implemented as runtime shader uniforms, but I have no way to confirm
from where I'm standing whether the result is actually a spatially-
homogeneous visualisation or just looks plausible. If anyone working in
catalog statistics has a few minutes to tell me what's wrong, I'd be
more than grateful.

#astrodataviz #astronomy
```

_Editorial note: post 4 deliberately drops the GW-EM-follow-up @-mention
that was in the original draft (no GW overlay feature exists; soft-
pedalling that entire framing). It also drops the
`cc @sdss.bsky.social @aaswwt.bsky.social` and Brice Ménard mentions
from the original — see the "A note on @-mentions" section above._

## Verification

After posting, manually:

- [ ] Open your Bluesky profile and confirm all four posts appear in a single thread (each marked "in reply to" the previous).
- [ ] Confirm hero.gif auto-plays on post 1 (Bluesky autoplay was sometimes flaky on large GIFs — if it shows as a static frame, the file may be over the size limit and you'll want to re-encode smaller and edit-replace).
- [ ] Confirm any cc-mentioned handles resolved to real accounts, not unclaimed-handle placeholders.

## Status

`pending`

> Audit pass: 2026-05-06 — bsky.app composer URL confirmed; second-pass Bluesky searches for SDSS / WWT / Brice Ménard re-confirmed no verified handles exist (the TO-VERIFY callout above is the source of truth and stays in place).

