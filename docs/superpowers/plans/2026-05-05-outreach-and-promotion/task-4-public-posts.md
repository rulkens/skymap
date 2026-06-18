# Task 4: Public posts (HN, Bluesky, Reddit)

> **Status:** drafts live locally on the maintainer's machine under `posts-and-emails/` (gitignored 2026-05-06 — they carry personal voice samples and recipient strategy that don't belong in the public repo). This file is the task-level summary only.

Three audiences, three angles, stepped rhythm so a single dud doesn't cap exposure: HN first (best window: weekday afternoon CET ≈ weekday morning US east coast), Bluesky two hours later (#astrodataviz crowd is largely Europe + east-coast US, ~early evening CET), then Reddit over the next 1-2 days. Don't ship them simultaneously — a high-traction Show HN gives you a link to reference in subsequent posts.

## Per-item files (gitignored, local-only)

- `posts-and-emails/hn-show.md` — Show HN.
- `posts-and-emails/bluesky-thread.md` — 4-part thread (#astrodataviz / #astronomy / #webgpu).
- `posts-and-emails/reddit-r-astronomy.md` — r/Astronomy.
- `posts-and-emails/reddit-r-dataisbeautiful.md` — r/dataisbeautiful.
- `posts-and-emails/reddit-r-webgpu.md` — r/WebGPU.
- `posts-and-emails/reddit-r-mapporn.md` — r/MapPorn (cartography angle, added 2026-05-07).

## Done (Wave-B launch, May 2026)

1. **HN** — sent 2026-05-06 (score 5, 10 comments). Soft.
2. **Bluesky** 4-part thread — sent 2026-05-07.
3. **r/dataisbeautiful** — sent 2026-05-07.

## Re-scope 2026-06-18 — the dated schedule is dead, the channels aren't

The original Thu/Fri-in-May Reddit schedule (r/MapPorn, r/Astronomy,
r/WebGPU) all slipped and the **v0.2.0 launch hook is gone** — there's no
"just shipped" news peg anymore. But the launch peg was never load-bearing:
skymap now has a **steady 80–100 visitors/day**, so a good post is *upside
on a proven funnel*, not a one-shot gamble. So: drop the calendar, keep the
subreddits, and post **opportunistically** — when there's a fresh feature
or a good capture video, pick the best-fit untapped sub.

### Untapped subreddit tiers (by fit)

**Tier 1 — highest fit, not yet hit:**

- **r/InternetIsBeautiful** (~17M) — purpose-built for interactive browser
  tools; probably the single best untapped sub. Title must sell the
  *interaction*; one-link posts only.
- **r/space** (~28M) — largest topical audience; strictest. Needs a strong
  video/GIF, read the sidebar, lead with the visual not "I built".
- **r/Astronomy** (~5M) — core knowledgeable audience; **video** lifts ~17pp.
- **r/cosmology** (~500k) — *exactly* the large-scale-structure / filament
  audience; small but high-signal, they get SDSS+2MRS+GLADE with no setup.

**Tier 2 — opportunistic:**

- **r/WebGPU**, **r/programming**, **r/javascript** — the *engineering*
  angle (raw WebGPU + WGSL, 2.5M instanced billboards). Different story
  than the science posts; reuse the engine narrative, not the catalog one.
- **r/visualization** / **r/dataviz** — discussion-oriented; good for
  feedback, low traffic.
- **r/askastronomy**, **r/amateurastronomy** — softer; share as "a tool to
  explore X", not a showcase.

**Skip:** r/threejs / r/webgl (wrong stack — skymap is WebGPU, they'll
nitpick), r/woahdude / r/interestingasfuck (viral, zero retention for a
niche tool), r/proceduralgeneration (not procedural).

### Universal rules (these bit the original plan)

- **10% self-promo rule** — ≤10% of recent activity may be self-promotional;
  the rest genuine participation. A fresh account that only posts its own
  tool reads as spam regardless of quality.
- **Per-sub karma/account-age gates** + **`[OC]` tag** + **data-source/tool
  credit** (r/dataisbeautiful enforces this).
- **Spread posts over days** across 4–5 subs — never a same-day blast.

## Maintenance

For 48h after each post, refresh the thread hourly during waking hours and reply to substantive comments. The half-life of a thread is short; engagement in the first 6h determines reach.
