# 0008 — Build per-shell datasets at deploy time, fetch lazily from R2 with tour-start prefetch

**Status:** Accepted (proposed by the cosmic-zoom plan author; awaiting team review)
**Date:** 2026-05-08
**Deciders:** the cosmic-zoom plan author (proposed); awaiting review by @rulkens

## Context

The cosmic zoom adds **roughly 370 MB of new binary data** to skymap on top
of the ~280 MB already living on R2 ([`../data/00-data-sources.md`](../data/00-data-sources.md)
"Total size impact"). The biggest single contributor is the
Cosmicflows-4 reconstructed density + flow field at ~128 MB; Gaia DR3 (~30
MB cut down) is second. Most other shells add 1–15 MB each. The expected
total R2 footprint after the cosmic zoom ships is **~650 MB across all
catalogs and tiers.**

Skymap's existing deploy workflow is described in detail in `CLAUDE.md`'s
"Deploy workflow (Cloudflare Workers Assets + R2)" section. The relevant
constraints:

- **Static shell** (HTML, JS, CSS, WGSL) deploys via Cloudflare's
  dashboard-managed GitHub integration on every push to `main`. There are
  per-file and per-deploy size caps on Workers Assets. The largest current
  catalog file (`glade-large.bin` ~130 MB) blew through them — that is
  exactly why the existing R2 split exists.
- **`.bin` catalog files** live on R2 at `skymap-data.rulkens.com`,
  uploaded manually via `npm run sync-r2` after `npm run build-tiers`.
  Storage is unmetered, egress is free under R2's pricing.
- **Runtime fetches** go through `dataUrl()`, which prefixes paths with
  `VITE_DATA_BASE_URL` (set in the committed `.env.production`). The
  `cloudLoader` requests `<source>-<tier>.bin` per source as the user
  switches tiers; nothing is bundled into the JS payload.

The cosmic zoom must decide **how its new datasets reach the browser.**
The decision interacts with three things at once:

1. **Workers Assets size caps** — anything ≥25 MB needs to be on R2 anyway,
   which covers Gaia and the CF-4 cubes regardless.
2. **First-paint cost** — a user landing on the home page who never starts
   the tour must not pay any of the new ~370 MB.
3. **Tour smoothness** — a user who clicks "Take the tour" must not stall
   between shells. CF-4 at ~128 MB is the obvious chokepoint: at a typical
   30 Mbit broadband link, that's ~35 seconds of download — easily longer
   than the four shells preceding Shell 7 take to play through.

## Decision

We adopt a **lazy, per-shell fetch from R2 with prefetch on tour start.**

Concretely:

1. **Build at deploy time, host on R2.** Each new dataset gets its own
   `tools/buildXyz.ts` that writes to `public/data/`. A new
   `npm run build-shell-data` orchestrates them in sequence (not parallel,
   for log legibility). `tools/syncR2.ts` ALLOW filter grows ~10 entries
   covering the new filenames (`solar-system.bin`, `gaia-bright.bin`,
   `gaia-medium.bin`, `mw-disk.bin`, `local-volume.bin`,
   `tully-groups.bin`, `clusters.bin`, `cf4-catalog.bin`,
   `cf4-density.bin`, `cf4-flow.bin`, `rosat-allsky.bin`,
   `planck-cmb.bin`).

2. **Lazy fetch per shell.** The shell controller for shell N requests its
   `.bin` files via the existing `dataUrl()` + `fetch()` pattern at the
   moment shell N becomes the active or next-imminent shell. Nothing is
   eagerly loaded at app startup. A user who never starts the tour
   downloads only the existing catalog tiers.

3. **Prefetch on tour click.** The "Take the tour" button kicks off a
   priority-ordered background prefetch of every shell's bin set. Order is
   shell-arrival order (1, 2, 3, ...) with the **CF-4 bundle promoted to
   first** — its ~128 MB has the longest download time and is needed at
   shell 7, so starting it the moment the user clicks gives the cinematic
   ~6 shells of head-room to finish the transfer in the background. The
   prefetch uses `<link rel="prefetch">` for under-25-MB assets and
   explicit `fetch()` with `Cache-Control: max-age=86400` re-validation
   for the larger ones (browsers cap `<link rel="prefetch">` at varying
   sizes per implementation; explicit `fetch()` is the reliable path).

4. **Loading-indicator UX.** A small per-shell progress affordance shows
   only when the active shell's data has not yet arrived by the moment the
   camera reaches it. In the common case (prefetch wins) the indicator
   never appears. Specified in [`../ux/00-interaction-model.md`](../ux/00-interaction-model.md).

5. **Slow-network fallback.** If by Shell 6 the CF-4 bundle is < 50%
   downloaded, the tour engine substitutes the **CF-4 fallback path**
   (Shell 7 with GLADE/2MRS points only and a static Laniakea boundary
   overlay) rather than holding the user on a loading spinner. The
   fallback already exists as an alternative in
   [`0007-data-licensing.md`](0007-data-licensing.md); reusing it here
   keeps the "no usable Shell 7" failure mode out of the codebase.

## Alternatives considered

**(a) Bundle everything into the Vite `dist/` payload.** The new datasets
ride along with HTML/JS/CSS into Workers Assets. Pros: one deploy step,
no R2 sync needed for the new data, deterministic version coupling
between code and data. Cons: blows through the per-file Workers Assets
size cap on day one (CF-4 alone is over the limit), and inflates first-
paint cost for users who never start the tour by ~370 MB. **Rejected** —
incompatible with both the size caps and the latency goals.

**(b) On-demand build at fetch time.** A Worker proxies catalog requests
through `tools/buildXyz.ts` running in a Worker context. Pros: zero R2
storage, always-fresh data, no sync step. Cons: builds take seconds to
minutes (CF-4's f32 → f16 over 67M voxels is ~20 s on a beefy laptop —
slower in a Worker), several upstream sources have multi-week outage
windows (EDD has been down for weeks at a stretch — see
[`../data/07-cosmicflows.md`](../data/07-cosmicflows.md) "Risks"), and
WebGPU clients cannot tolerate seconds of TTFB on a startup-critical
fetch. **Rejected** — wrong tool for the job; the existing build-time
pattern is correct.

**(c) Lazy R2 fetch with tour-start prefetch.** Chosen. Matches the
existing skymap deploy model, respects the size caps, costs nothing at
first paint, and keeps the tour smooth via the CF-4 prefetch promotion.

**(d) Eager fetch all shell data on app boot, no tour gate.** Pros:
simpler engine code, no prefetch coordination. Cons: forces every visitor
to pay ~370 MB even if they never click the tour button — that's a 10×
inflation of the existing first-paint footprint. **Rejected** — fails
the "non-tour visitor pays nothing" requirement.

## Consequences

**Positive:**
- First-paint cost is unchanged for users who do not start the tour. The
  existing `glade-medium.bin` + `2mrs.bin` + `famous.bin` payload is what
  they pay; the cosmic zoom is invisible until activated.
- The CF-4 prefetch promotion absorbs the worst-case latency: by the time
  the camera reaches Shell 7, CF-4 is already in the browser cache.
- Reuses the existing `dataUrl()` + `cloudLoader` + R2 + `tools/syncR2.ts`
  machinery. No new deploy infrastructure, just more entries in the ALLOW
  filter and one more orchestration script (`build-shell-data`).
- Failure modes are graceful — the slow-network CF-4 fallback already
  exists for licensing reasons (see
  [`0007-data-licensing.md`](0007-data-licensing.md)) and is reused for
  network reasons here.

**Negative:**
- The tour engine grows a non-trivial **prefetch coordinator**: priority
  queue ordered by shell arrival, with explicit promotion of the CF-4
  bundle. This is genuinely new logic with its own failure modes (stalled
  fetches, retries, cache eviction). Spec lives in
  [`../implementation/00-phasing.md`](../implementation/00-phasing.md)
  Phase 1.
- A loading indicator must be designed and styled (small UX cost) even
  though it should rarely appear in the common case. We accept the cost
  because "rarely visible" still means "must look good when it does
  appear."
- `tools/syncR2.ts` ALLOW filter grows by ~12 entries; a CI check should
  warn if `public/data/*.bin` files exist that are not in the ALLOW
  filter (otherwise we silently fail to ship them on the next sync).
- Each new shell-data fetch is one more thing that can stall under poor
  connectivity. The Risk Register
  ([`../implementation/03-risk-register.md`](../implementation/03-risk-register.md))
  must enumerate which shells have hard data dependencies and which can
  degrade to a fallback view.

**Operational:**
- The full deploy workflow becomes: `npm run build-tiers` (existing) plus
  `npm run build-shell-data` (new) → `npm run sync-r2` (existing,
  filter expanded) → `npm run deploy` (existing, code-only push). A
  cosmic-zoom-only deploy (no catalog regeneration) skips the first two
  steps.
- R2 storage grows to ~650 MB. Still negligible against R2's free tier
  (10 GB) and unmetered storage pricing.
- Cache-Control behavior is unchanged: R2 objects are uploaded with
  `max-age=86400` per the existing `tools/syncR2.ts` policy. The
  CORS rule already covers the production and dev origins; the new
  filenames inherit it.

## References

- `CLAUDE.md` "Deploy workflow (Cloudflare Workers Assets + R2)" — the
  ground-truth description of how skymap currently deploys.
- [`../data/00-data-sources.md`](../data/00-data-sources.md) — total size
  impact and per-shell incremental download table that justifies the
  prefetch promotion.
- [`../data/07-cosmicflows.md`](../data/07-cosmicflows.md) — CF-4 size
  numbers and Option A vs B downsampling discussion.
- [`0007-data-licensing.md`](0007-data-licensing.md) — the CF-4 fallback
  path reused here for slow-network failure mode.
- [`../implementation/00-phasing.md`](../implementation/00-phasing.md) —
  prefetch coordinator implementation phase.
- [`../implementation/03-risk-register.md`](../implementation/03-risk-register.md)
  — per-shell network-dependency risks.
- `tools/syncR2.ts` — current ALLOW filter implementation; the file the
  new entries land in.
