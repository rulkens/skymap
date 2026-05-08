# Cosmic Zoom — Two-page summary

**Codename:** cosmic zoom · **Public name:** "Powers of Ten" tour · **Date:** 2026-05-08

## What it is

A guided 60–90 second cinematic that takes the user from the surface of the Sun outward to the edge of the observable universe, in nine named shells, each rendered with its own dataset and visual style. After the cinematic, the user is dropped back at the wide-zoom default view; the tour is also pausable at any shell so the user can free-fly within it before resuming.

```
       Solar System
            │ ~10 AU
       Stellar Neighborhood
            │ ~50 ly
       Milky Way Disk
            │ ~100 kly
       Local Group
            │ ~5 Mly
       Local Sheet
            │ ~30 Mly
       Virgo Supercluster
            │ ~100 Mly
       Laniakea Supercluster
            │ ~500 Mly
       Cosmic Web
            │ ~3 Gly
       Observable Universe
```

Each transition crosses ~1.5 orders of magnitude, so the camera's apparent speed feels constant on a log scale.

## What's distinctive

Most "scale of the universe" web demos show *the same data* (a Solar System model, the Milky Way painted into a 2D disk image, a sphere of CMB) at all zoom levels. Skymap already has 2.5 million real galaxies in real positions; the cosmic zoom adds ~9 *more* real datasets, picked so that each shell has the *right* data for its scale and shows physical structure rather than a textbook diagram. The user is not flying through stock 3D art — they're flying through a real model of the universe assembled from real surveys.

The other distinctive: the experience integrates seamlessly with skymap's free-fly mode. At any shell, hit pause and the tour disengages; you're now free-flying inside (e.g.) Laniakea and can keep exploring. The tour is an entry-point and an aesthetic, not a separate mode.

## What it depends on (existing in-flight work)

| | Spec | Status |
|---|---|---|
| Required | MSDF labels (shell labels, overlay text) | designed, not built |
| Required | Asset-loading primitive (per-shell dynamic data load) | designed, not built |
| Required | Engine restructure Spec B (clean attachment surface) | in progress |
| Recommended | Milky Way impostor (Shell 3 hero visual) | pending |
| Subsumed | Tour-animation brainstorm | replace |
| Subsumed | CF-4 volume render (Shell 7 technique) | replace |

See [`decisions/0009-existing-plan-coordination.md`](decisions/0009-existing-plan-coordination.md) for sequencing.

## What's new (not covered by existing plans)

- **Scale architecture** ([`rendering/00-scale-architecture.md`](rendering/00-scale-architecture.md)) — a coordinate-system refactor that lets the renderer span 10²⁷ orders of magnitude (Sun radius to observable universe) without floating-point depth fighting. Today's renderer assumes Mpc throughout; we add nested camera-relative frames with floating origin per shell.
- **Per-shell render pipelines** — each shell gets its own GPU pipeline tuned to its visual: Solar System uses ray-traced spheres, Stellar Neighborhood uses Gaia-color points, Milky Way uses the impostor, Local Group uses textured disks, Local Sheet uses our existing point cloud, Virgo Supercluster uses point cloud + cluster halos, Laniakea uses CF-4 dark-matter volumetrics, Cosmic Web uses filaments, Observable Universe uses CMB sphere.
- **Camera choreography engine** ([`rendering/02-camera-choreography.md`](rendering/02-camera-choreography.md)) — replaces the existing `cameraTween` for tour mode. Multi-leg easing, shell-aware orientation, dwell-and-resume, branch points where the user can divert.
- **Information overlay system** ([`ux/01-information-overlays.md`](ux/01-information-overlays.md)) — a class of UI element that fades in with each shell, presents 2-4 key facts, and dismisses on transition. Built atop MSDF labels but with a separate React-side affordance for the prose blocks.
- **9 new datasets** ([`data/00-data-sources.md`](data/00-data-sources.md)) — Gaia DR3 stars, NED Local Volume catalog, Tully galaxy groups, Abell + ACO clusters, Cosmicflows-4 velocity field, ROSAT X-ray, Planck CMB, plus parametric models for Solar System and Milky Way.

## What's *not* in scope

- A user-editable tour script. Tour beats are author-defined in this version.
- Multiple parallel tour scripts ("guided tour: dark matter," "guided tour: spirals"). One canonical Powers-of-Ten tour, full stop.
- Voice narration / audio. Skymap has no audio system today; bringing one up is its own plan.
- VR / WebXR support. The cinematic is designed for a 2D screen.
- Mobile-first interaction. We support mobile (touch swipe to advance) but optimize for desktop with mouse + keyboard.
- Real-time-updated data. Datasets are committed binaries built at deploy time, not live API calls.

## Phasing at a glance

See [`implementation/00-phasing.md`](implementation/00-phasing.md) for detail. High-level:

- **Phase 0 (prerequisites):** MSDF labels land, asset-loader primitive lands, engine restructure lands. ~3-6 weeks of work that's already planned.
- **Phase 1 (skeleton, ~2 weeks):** Scale architecture refactor; tour-engine state machine; one shell working end-to-end (Local Group, easiest because the data is closest to what we already have).
- **Phase 2 (data ingestion, ~3 weeks):** Build pipelines for the 9 new datasets. Each is independent; can dispatch to parallel agents/contractors.
- **Phase 3 (per-shell renderers, ~4-6 weeks):** Implement the visual technique for each shell. Some are existing infra (filaments, point cloud); some are new (CMB sphere, ray-traced Sun).
- **Phase 4 (choreography + copy, ~2 weeks):** Wire up the camera tour, write the overlay copy, polish transitions.
- **Phase 5 (perf + polish, ~2 weeks):** 60 fps target across all shells on integrated graphics; mobile fallbacks; accessibility audit.

**Calendar estimate:** 12-16 weeks of focused engineering, assuming Phase 0 prerequisites are complete and one engineer at full focus. With Claude-assisted parallel work on data ingestion and shell renderers, possibly compressible to 8-10 weeks.

## Risks (top 3 — see [`implementation/03-risk-register.md`](implementation/03-risk-register.md) for the full set)

1. **Scope balloon.** Each shell is a temptation to add "just one more dataset." The MVP must define hard cuts for each shell and stick to them.
2. **Visual quality bar.** The user explicitly asked for "excellent visuals at every layer." Several shells (Solar System, Milky Way, CMB) require new GPU techniques that have no precedent in the codebase. Each is a research spike.
3. **Mobile / low-end performance.** A 2.5M-galaxy point cloud on a $200 Android device is already marginal. Adding volumetric rendering, ray-traced Sun, and CMB sphere risks falling off a cliff. Need an explicit mobile shell schedule (probably skip Solar System and CMB on mobile, or use simpler fallbacks).

## What to read next

→ [`vision/00-product-vision.md`](vision/00-product-vision.md) — the *why*.
→ [`vision/01-narrative-script.md`](vision/01-narrative-script.md) — the *story*.
→ [`shells/00-shell-overview.md`](shells/00-shell-overview.md) — the *what*.
