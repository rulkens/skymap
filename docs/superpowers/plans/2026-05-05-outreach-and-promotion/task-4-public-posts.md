# Task 4: Public posts (HN, Bluesky, Reddit)

> **Status:** drafts extracted into [posts-and-emails/](posts-and-emails/) with verified contacts on 2026-05-06. This file is kept for historical reference; the per-item files are authoritative going forward.


Three audiences, three angles. Drop them in a stepped rhythm so a single dud doesn't cap exposure: HN first (Tuesday morning, US east coast — that's the proven peak), Bluesky two hours later (the #astrodataviz crowd is largely Europe + east-coast US, late afternoon their time), then Reddit over the next 1-2 days. Don't ship them all at once: a high-traction Show HN gives you a link to reference in subsequent posts. _All three of HN, Bluesky, and Reddit must wait for Tasks 0 and 1 to complete — Task 0 provides the v0.2.0 release as a fresh news hook, and Task 1 provides the hero GIF and screenshots that make the README worth sharing._

**Files:** No source-tree files. Drafts live in this plan, copy-paste at post time.

### Step 4.1: Show HN draft

- [ ] **At submit time**, open https://news.ycombinator.com/submit. Use these exact fields:
  - **Title:** `Show HN: Skymap – a 3D galaxy catalog explorer in the browser via WebGPU`
  - **URL:** `https://skymap.rulkens.com`
  - **Text:** _(leave URL set; HN auto-pulls)_

- [ ] **First comment** (post immediately after submitting, as the OP — this is the "story" comment that anchors the thread):

```
Author here. I'm a frontend dev, and a few years ago I fell
down the astronomy rabbit hole. Skymap is what happened when
I wanted to actually do something with galaxy catalog data
instead of just reading papers.

It loads SDSS (~500k galaxies), 2MRS (~45k), and GLADE (~2M)
and renders them as WebGPU instanced billboards. A tier
selector lets you switch dataset size without a reload;
mobile auto-picks the smallest tier and pinch-zoom works.

Past a certain on-screen size, each galaxy crossfades from a
dot into a procedural 3D-oriented disk (using the catalog's
axis-ratio + position angle from HyperLEDA / 2MASS XSC), and
then into a real survey image when you're close enough. The
images come from SDSS DR18 ImgCutout, DSS via CDS hips2fits,
or hand-curated DESI Legacy thumbnails for the Messier
greatest-hits. There's also a cosmic-web filament overlay
(DisPerSE-built offline) — a faint blue lattice tracing the
ridges of the density field. Striking at supercluster scale.

The code's commented to be read, not just to satisfy a
linter. If you've been meaning to learn WebGPU or wondering
how distance from redshift actually works, the source is
meant to be a worked example.

Live: https://skymap.rulkens.com
Repo: https://github.com/rulkens/skymap (MIT)
DOI:  https://doi.org/10.5281/zenodo.20037028

Would love feedback on any of it.
```

- [ ] **Verify a few hours after posting:**

```bash
# Replace ITEM_ID with the actual numeric ID from the URL bar
curl -s "https://hacker-news.firebaseio.com/v0/item/ITEM_ID.json" | jq '{title, score, descendants}'
```

Expected: title matches, `score` ≥ 1 (your own upvote), `descendants` (comment count) increasing if the post landed. A submission still on the front page after ~3 hours is a hit; one stuck on /new at 1 point isn't.

### Step 4.2: Bluesky draft

The astronomy crowd (Brice Ménard, the Map of the Universe collaborators, AAS WWT folks, SDSS team) skews heavily to Bluesky now. Different framing: lead with science visuals, not engineering.

- [ ] **At post time**, on bsky.app, post this thread (post-and-reply, four parts):

  **Post 1:**

  ```
  Spent the last few months building skymap — an interactive WebGPU
  3D explorer for SDSS, 2MRS, and GLADE galaxy catalogs in the
  browser. No install, just Chrome 113+.

  Live: https://skymap.rulkens.com
  Source: https://github.com/rulkens/skymap

  [attach hero.gif]
  ```

  **Post 2 (reply to 1):**

  ```
  The cosmic-web wedge is right there — Sloan Great Wall, the
  Coma cluster, the local-volume 2MRS galaxies. Density-correction
  toggle (1/V_max, Schechter LF) lets you see structure unbiased
  by Malmquist.

  [attach all-three-surveys.png]
  ```

  **Post 3 (reply to 2):**

  ```
  Up close, dots become DR18 thumbnail cutouts (SDSS) or DSS proxies
  via CDS hips2fits (2MRS / GLADE). Click to pin metadata: redshift,
  lookback time, NED link.

  [attach zoomed-thumbnail-infocard.png]
  ```

  **Post 4 (reply to 3):**

  ```
  Built as a personal learning project — the source is documented
  didactically (every WebGPU surprise written up where it bit me).
  GW EM follow-up folks, SDSS team, AAS WWT crowd — feedback very
  welcome.

  cc @sdss.bsky.social @aaswwt.bsky.social
  (and Brice Ménard / mapoftheuniverse — handle?)
  ```

  Note: confirm the actual Bluesky handles for SDSS, AAS WWT, and Brice Ménard before posting; if any of them don't have an account, drop the mention silently rather than guessing.

- [ ] **Verify** the thread is live and chained correctly: open your profile, confirm all four posts in the thread, hero GIF auto-plays on post 1.

### Step 4.3: Reddit posts (stepped over 24-48 hours)

Three subs, three angles, _stepped_ — not simultaneous. Reddit's spam detection flags identical content across subs.

- [ ] **r/Astronomy** _(post Day 2, morning US time — angle: science / catalogs)_:
  - **Title:** `I built a browser-based 3D explorer for SDSS, GLADE, and 2MRS — open source, no install`
  - **Body:**

    ```
    Hey r/Astronomy — I've been working on a personal-learning project
    that I think might be useful to some of you.  It's a free-explore
    3D viewer for three galaxy catalogs (SDSS DR18, the 2MASS Redshift
    Survey, and GLADE) running directly in the browser via WebGPU. No
    install, no Python, just Chrome / Edge 113+.

    Live demo: https://skymap.rulkens.com
    Source: https://github.com/rulkens/skymap

    What you can do:
    - Orbit the SDSS wedge — Sloan Great Wall is right there
    - Cmd+K for a famous-galaxy command palette (M31, M51, etc.)
    - Density-correction toggle (1/V_max, Schechter LF) for unbiased
      structure visualisation
    - Zoom into a galaxy, get its DR18 thumbnail or a DSS cutout, plus
      pinned metadata + NED link

    It's documented didactically — the source is meant to be readable.
    Citation file is in the repo if you'd ever use it for teaching.

    Happy to take feedback on the science end especially.  Suggestions
    for what to add next?
    ```

- [ ] **r/dataisbeautiful** _(post Day 2, afternoon US time — angle: visual / structure)_:
  - **Title:** `[OC] Cosmic-web structure in 3 galaxy catalogs (SDSS + GLADE + 2MRS, 3.5M galaxies, WebGPU)`
  - **Body:**

    ```
    Source data: SDSS DR18 (~500k galaxies, sky.sdss.org), GLADE v2.3
    (~3M, gravitational-wave host catalog), and 2MASS Redshift Survey
    (~45k local-volume).  Cross-matched and rendered as instanced
    points in the browser using WebGPU.

    Tools: TypeScript, raw WebGPU + WGSL shaders, custom 48-byte
    binary format for the catalogs.

    Live (Chrome / Edge 113+): https://skymap.rulkens.com
    Source: https://github.com/rulkens/skymap

    [attach all-three-surveys.png]
    ```

- [ ] **r/WebGPU** _(post Day 3 — angle: graphics engineering)_:
  - **Title:** `Skymap: instanced billboards + GPU picking + per-instance texture quads, 3.5M galaxy points`
  - **Body:**

    ```
    Sharing a WebGPU project I've been building — happy to talk
    implementation.

    What's interesting graphics-wise:

    - 3.5M instanced point billboards, single draw call, 28-byte
      per-instance vertex stride
    - r32uint pick texture + copyTextureToBuffer for hover/click
      across the full set, sub-millisecond
    - 2048x2048 LRU texture atlas with 128x128 slots; thumbnails
      streamed in based on per-galaxy apparent-pixel-size gating
    - Render-on-demand main loop — idles cleanly when nothing's moving

    A bug that took me a week: queue.writeBuffer ordering isn't
    preserved across submits in the same frame.  Per-instance state
    has to be in the vertex buffer, not a mid-frame-mutated uniform.

    Live: https://skymap.rulkens.com
    Source: https://github.com/rulkens/skymap (didactic comments
    throughout)
    ```

- [ ] **Verify** each post is live by visiting the subreddit and confirming the post appears in /new, then check upvote count + comment count after ~6 hours per post.

### Step 4.4: Maintain the threads

- [ ] **For 48 hours after each post**, refresh hourly during waking hours to reply to comments. The half-life of a thread is short; engagement in the first 6 hours determines reach.

- [ ] **Verify** by checking notification badges — aim for at least 3 substantive replies on HN, 5 on Reddit per sub. If a thread is dead at 6 hours, don't keep checking — accept and move on.
