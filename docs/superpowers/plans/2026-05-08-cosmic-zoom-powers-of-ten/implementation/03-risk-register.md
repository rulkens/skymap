# Risk Register — Cosmic Zoom

The durable list of risks for the Powers-of-Ten cosmic zoom. Owned by the project lead; re-read at every phase boundary (see [`00-phasing.md`](00-phasing.md)). Writing risks down forces us to commit on paper to a *contingency* — what we will actually do if a risk fires — rather than discovering it under pressure. Before dispatching parallel agents against any shell or renderer spec, read the relevant rows here first.

## 1. Methodology

Probability and impact are each rated **L / M / H**. Severity collapses the 3×3 grid into four bands:

| Severity | Cells | Meaning |
|----------|-------|---------|
| **Critical** | H × H | Could kill the launch. Must have a written contingency. |
| **Major** | H × M, M × H | Will cause visible slip or quality regression. Mitigation in flight. |
| **Moderate** | M × M, H × L, L × H | Worth tracking; one mitigation suffices. |
| **Minor** | L × L, L × M, M × L | Logged; no active mitigation required. |

Coarse beats 1–5 because fine-grained scoring invites false precision; we can honestly distinguish "more likely than not" from "possible but I'd be surprised," not 17 % from 31 %. The **owner** column lists who watches each risk; externally owned ones (archive uptime, license terms) are listed so we remember we can only react. A risk leaves the register when it materialises (move to issues) or its phase ships without it firing.

## 2. The risk table

| # | Risk | P | I | Severity | Owner |
|---|------|---|---|----------|-------|
| **Schedule** | | | | | |
| S1 | Engine restructure (Spec B) slips past Phase 0 boundary | M | H | Major | Maintainer |
| S2 | MSDF labels spec delayed or re-scoped | M | H | Major | Maintainer |
| S3 | Asset-loader primitive doesn't expose required slot states | L | H | Moderate | Maintainer |
| S4 | Per-shell renderers can't parallelise; share too much GPU state | M | M | Moderate | Maintainer |
| S5 | Science-copy reviewer unavailable for weeks | L | M | Minor | Maintainer |
| **Technical** | | | | | |
| T1 | Volumetric DM density (Shell 7) misses 60 fps on integrated GPU | H | M | Major | Renderer lead |
| T2 | Depth precision insufficient even with per-shell frames | M | H | Major | Renderer lead |
| T3 | WebGPU gap leaves tour unreachable for ~30 % of mobile visitors | H | M | Major | Maintainer |
| T4 | `layout: 'auto'` trap recurs in a new per-shell pipeline | M | M | Moderate | Renderer lead |
| T5 | Floating-origin rebase causes jitter at crossfades | M | M | Moderate | Renderer lead |
| T6 | Per-frame thumbnail loop (~3.5 M iters) bottlenecks Shell 8 | M | M | Moderate | Renderer lead |
| T7 | Per-shell pipelines fragment shader cache → first-shell stutter | L | M | Minor | Renderer lead |
| **Data** | | | | | |
| D1 | Cosmicflows-4 license incompatible with redistribution | L | H | Moderate | Maintainer |
| D2 | Gaia archive down/rate-limited during a critical re-fetch | M | M | Moderate | Maintainer |
| D3 | Planck CMB SMICA (HEALPix FITS) decoder underestimated | M | M | Moderate | Maintainer |
| D4 | NED LVC table format changes between fetch and re-fetch | L | M | Minor | Maintainer |
| D5 | ROSAT X-ray data has fewer named clusters than the script assumes | L | M | Minor | Maintainer |
| **Visual** | | | | | |
| V1 | Ray-traced Sun looks like a yellow disc | M | H | Major | Renderer lead |
| V2 | X-ray halos read as painted overlays, not physical gas | M | M | Moderate | Renderer lead |
| V3 | CMB sphere is visually boring after the prior eight shells | H | L | Moderate | Renderer lead |
| V4 | MW impostor looks flat edge-on at the Shell 3 entry waypoint | M | M | Moderate | Renderer lead |
| V5 | Crossfades show a perceptible "double exposure" frame | L | M | Minor | Renderer lead |
| **UX** | | | | | |
| U1 | Constant-log-speed motion causes motion sickness | M | H | Major | UX lead |
| U2 | Overlay copy too dense; users miss it watching the visual | M | M | Moderate | UX lead |
| U3 | Pause-and-resume re-easing disorients | L | M | Minor | UX lead |
| **Adoption** | | | | | |
| A1 | Tour completion rate below 50 % despite a polished cinematic | M | M | Moderate | Maintainer |
| A2 | 30 s clip falls short of targeted ≥10× outreach lift | M | M | Moderate | Maintainer |
| **Operations** | | | | | |
| O1 | R2 bandwidth spikes if tour goes viral and prefetches all 9 shells | L | M | Minor | Maintainer |
| O2 | Cloudflare Workers Assets build time exceeds dashboard timeout | L | M | Minor | Maintainer |

## 3. Per-risk narratives

### S1 — Engine restructure slips
Spec B is in progress on `chore/bootstrap-phases`; the cosmic zoom assumes a clean attachment surface for per-shell renderers. **Mitigation:** Phase 1 is deferred until Spec B is "done enough" — in Phase 0 exit criteria. **Contingency:** ship Phase 1's Local Group shell against the *current* surface as a throwaway integration spike; refactor after Spec B lands.

### S2 — MSDF labels delayed
Every shell's overlay copy and named-object labels (M31, Sirius, Coma) ride the MSDF pipeline. **Mitigation:** the text overlay spec ([`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md)) splits prose blocks (React-DOM) from world-anchored labels (MSDF); prose blocks ship without MSDF. **Contingency:** if MSDF is >4 weeks late at the Phase 3 boundary, render world-anchored labels as DOM-projected `<span>` — jittery under motion, but functional.

### S3 — Asset-loader shape mismatch
The cosmic zoom assumes a slot-state machine (EMPTY → LOADING → READY → ACTIVE → IDLE → UNLOADED, see [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md)). **Mitigation:** review the asset-loader spec at the next checkpoint and request slot states explicitly. **Contingency:** layer slot tracking in `tour/slotManager.ts`; accept coarse-grained eviction.

### S4 — Per-shell renderers can't parallelise
Phase 3 dispatches parallel agents for nine renderers. **Mitigation:** the `ShellRenderer` interface ([`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)) owns its own pipeline and bind groups; shared resources are passed by reference. **Contingency:** serialise shells 1, 7, 9 under one engineer; parallelise the rest. Adds 2–3 weeks.

### S5 — Science reviewer unavailable
Vision principle 1 demands astronomy-background review. **Mitigation:** identify reviewer before Phase 4; share drafts as Phase 3 hands off. **Contingency:** ship with a "copy under review" disclaimer; pull uncertain claims.

### T1 — Volumetric DM density too slow
Shell 7 renders CF-4 dark-matter density as a volumetric pass ([`../rendering/03-volumetric-effects.md`](../rendering/03-volumetric-effects.md)). 60 fps on Intel UHD is not a given. **Mitigation:** prototype on a target low-end GPU early in Phase 3; expose a step-count uniform to dial quality per device. **Contingency:** fall back to a 2D supergalactic-plane slice with isocontours.

### T2 — Depth precision insufficient
Spanning 10²⁷ orders of magnitude is the central technical bet ([`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md), [`../rendering/06-depth-precision.md`](../rendering/06-depth-precision.md)). Even with reverse-Z + log-depth + per-shell frames, depth fighting at crossfades is plausible. **Mitigation:** per-shell frames isolate each shell to a few orders of magnitude; floating-origin ([`../rendering/05-floating-origin.md`](../rendering/05-floating-origin.md)) keeps the camera near world origin. **Contingency:** add a 200 ms full-screen alpha crossfade at any boundary that fights — covers the artefact at the cost of one second across the whole tour.

### T3 — WebGPU mobile gap
~30 % of mobile traffic gets "WebGPU not supported" today; the cosmic zoom amplifies this (more shaders, more device bugs). **Mitigation:** keep the existing "not supported" landing page polished. **Contingency:** record a 90 s MP4 of the tour as authored on a known-good machine and offer it as "Watch the tour" — non-interactive but the user still sees it.

### T4 — `layout: 'auto'` recurs
Per CLAUDE.md and auto-memory: `auto` bind-group layouts are pipeline-specific. Nine new pipelines multiplies the surface area. **Mitigation:** the `ShellRenderer` interface requires explicit `BindGroupLayout`; code-review every shell PR for `layout: 'auto'`. **Contingency:** shared bind-group-layout registry every shell pulls from.

### T5 — Floating-origin jitter at crossfades
Rebase during a crossfade shifts the outgoing shell's points by the delta in one frame. **Mitigation:** rebase only when the outgoing shell is fully faded (alpha = 0). **Contingency:** double-buffer the rebase, holding both old and new origins for the crossfade duration.

### T6 — Thumbnail loop bottleneck
The per-frame priority loop over 3.5 M candidates is already CPU-dominant. Shell 8 shows the full cloud. **Mitigation:** render-on-demand keeps idle free; decimation/BVH for active panning. **Contingency:** disable the priority loop in tour mode; use whatever thumbnails were already loaded.

### T7 — Shader cache fragmentation
Nine new pipelines = nine cold-compiles at first tour run. **Mitigation:** warm all pipelines after "Take the tour" click but before the cinematic begins, via dummy offscreen draws. **Contingency:** preload shells 1–3 only; warm later shells during their predecessor's dwell time.

### D1 — CF-4 license
CF-4 may restrict redistribution of derived products; our `.bin` is derived. **Mitigation:** read the license at start of Phase 2 *before* writing the parser; document derivation in [`../data/00-data-sources.md`](../data/00-data-sources.md); contact authors for ambiguous clauses. **Contingency:** derive the velocity field client-side from a smaller published table.

### D2 — Gaia archive downtime
ESA Gaia TAP has had multi-day outages. The DR3 cut for Shell 2 is one ADQL query. **Mitigation:** cache the parsed cut in `data/raw/`; document the fetch command. **Contingency:** delay the fetch; one Gaia query is not on a critical path.

### D3 — Planck CMB format
SMICA ships as HEALPix-pixelised FITS; we have no HEALPix tooling. **Mitigation:** spike the decoder in Phase 2 against a low-resolution SMICA file before committing to Shell 9 timeline. **Contingency:** ship Shell 9 with a static equirectangular JPEG (~1 MB) — loses "real per-pixel data" but visually identical at user resolutions.

### D4 — NED LVC format change
NED LVC tables are versioned; column order has changed historically. **Mitigation:** parse defensively by column name, not position. **Contingency:** pin to a specific release.

### D5 — ROSAT data sparser than scripted
Shell 6's copy may name clusters (Coma, Virgo, Hydra) the data won't well-detect. **Mitigation:** generate the cluster list from actual ROSAT detections. **Contingency:** rewrite copy to name only well-detected clusters.

### V1 — Sun looks like a yellow disc
Shell 1 is the user's first visual impression; a naïve textured sphere is not a star. **Mitigation:** treat the Sun renderer as a research spike — noise + limb-darkening + chromosphere bloom ([`../rendering/03-volumetric-effects.md`](../rendering/03-volumetric-effects.md)); allocate explicit Phase 3 time; verify visually with a non-team viewer. **Contingency:** swap to a NASA SDO photo on a sphere with bloom — sacrifices "real-time procedural" but keeps the user impressed.

### V2 — X-ray halos look painted
Translucent red blobs around cluster centers can read as graphic overlay. **Mitigation:** sample the actual ROSAT surface-brightness profile; non-uniform falloff; respect elliptical asymmetry. **Contingency:** suppress halos at low integrated brightness — fewer real-looking is better than many fake-looking.

### V3 — CMB sphere is boring
After 80 s of escalation, a static speckle is anticlimactic. **Mitigation:** slow pull-away revealing the previous shells' filament structure inside the sphere as CMB fades up — a "containment" beat ([`../shells/09-observable-universe.md`](../shells/09-observable-universe.md)). **Contingency:** shorten Shell 9 to 4 s; treat as a pure outro card.

### V4 — MW impostor looks flat
Edge-on at the Shell 3 entry waypoint a flat texture reveals itself. **Mitigation:** the impostor spec plans multi-angle billboards; coordinate Shell 3 entry angle with strongest views. **Contingency:** approach the MW from above the disk plane regardless — the user has no anchor for "above the MW" anyway.

### V5 — Crossfade double-exposure
Overlapping content during the crossfade can flash a "two suns" frame. **Mitigation:** the camera-choreography spec ([`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md)) sequences the crossfade so the outgoing hero has shrunk to a sub-pixel first. **Contingency:** brief radial darkening at the focal point during the crossfade window.

### U1 — Motion sickness
Constant-log-speed is unusual; perceived acceleration through inner shells is real. Literature: 5–20 % susceptible. **Mitigation:** "reduce motion" toggle at tour start — halves speed, linear interpolation. **Contingency:** make reduce-motion the *default* if even one usability tester reports nausea; let the impatient user opt in to "fast."

### U2 — Overlay copy too dense
Easy to violate the "zero text below the fold" principle under deadline. **Mitigation:** every shell's copy passes "would my non-astronomer friend skim this in 5 s?" — cut anything that fails. **Contingency:** trim to one sentence per shell.

### U3 — Re-easing confuses
**Mitigation:** the camera-choreography spec defines a 500 ms re-ease with velocity matching. **Contingency:** show a 1 s "Resuming…" overlay during re-ease.

### A1 — Tour completion below 50 %
**Mitigation:** instrument shell-entry events; review drop-off curve in launch week one. **Contingency:** trim or swap the slowest-paced shell based on data — per-shell time-in-shell is an authoring parameter.

### A2 — Outreach lift below target
The tour-animation brainstorm cited +14–17pp; we forecasted ≥10×. **Mitigation:** A/B two clip cuts in the first launch month. **Contingency:** treat outreach as longer-tail; the primary value is on-site engagement (A1), not virality.

### O1 — R2 bandwidth spike
R2 is ~$0.015/GB. At ~280 MB total, 100 K full prefetches ≈ 28 TB ≈ $420. **Mitigation:** cosmic zoom adds only ~100–200 MB. **Contingency:** if costs spike, defer non-critical shells behind explicit user request.

### O2 — Build timeout
**Mitigation:** per CLAUDE.md, `build-tiers`/`build-filaments` run locally and sync to R2; the deploy build is only `tsc + vite build`. **Contingency:** if the deploy build slows, split into vendor + app chunks more aggressively.

## 4. Top 5 risks to watch closely

The five risks most likely to cause launch slip or user-visible regression:

1. **T2 — Depth precision.** Central technical bet; if it fails, the renderer cannot span the required scales. Watch at end of Phase 1 — a working Local Group shell with adjacent-shell stubs reveals whether the precision scheme works.
2. **V1 — Sun looks like a yellow disc.** Shell 1 is the user's first impression and colours reception of every later shell. Watch at start of Phase 3.
3. **U1 — Motion sickness.** The reduce-motion toggle is cheap insurance but the *default* matters. Resolve in Phase 4 with usability testing, not opinion.
4. **S1 — Engine restructure slip.** Drives Phase 1 schedule; everything downstream waits.
5. **T1 — Volumetric DM density too slow.** Shell 7 is one of three hero technical shells; missing 60 fps forces the 2D fallback and weakens the CF-4 hero claim.

## 5. Risk-monitoring cadence

Risks are re-read at every phase boundary ([`00-phasing.md`](00-phasing.md)). For each: still relevant? Probability changed? Mitigation still in flight? Contingency still feasible?

The maintainer holds a 30-minute review per boundary, document open. Output: a summary commit plus a working-log note. The Phase 0 → Phase 1 review additionally validates Schedule rows S1–S3 since they drive Phase 1.

## 6. Risks we accept without mitigation

Not every risk justifies engineering effort. We react if these materialise but do not pre-invest:

- **VR / WebXR users get nothing.** Out of scope per vision.
- **Color-blind users may struggle with red X-ray halos.** Vision locks the palette; v2 candidate.
- **No translation; English only.** Out of scope per vision.
- **Tour-script changes invalidate completion-rate baselines.** The tour is a product, not a benchmark.
- **4K reveals SMICA-fallback CMB pixelation.** v2 quality issue; the contingency exists so we can ship Shell 9 if the real decoder isn't ready.
- **Single-author scientific copy may wince.** Reviewer mitigation reduces but doesn't eliminate residual.

Promote to the active table if any turn out to matter more than expected.

## 7. Open questions

Answers that would materially change one or more risk ratings:

1. CF-4 license text? — resolves D1 to either Vanishing or H.
2. Does our low-end GPU target include software-WebGPU Chrome on Linux? — resolves T3 coverage estimate.
3. Is the maintainer the only science reviewer? — resolves S5.
4. Floating-origin rebase cadence — per-shell, per-N-frames, or distance-triggered? — resolves T5 mitigation clarity.
5. Have we measured first-paint pipeline-compile cost on the existing renderer? — resolves T7 probability.
6. Is "reduce motion" already a setting elsewhere in skymap, or do we set the precedent? — affects U1 framing.
7. Will the asset-loader expose a `bytesLoaded` progress event we can wire into per-shell indicators? — resolves part of S3.
8. Upper bound on `?tour=auto` loop count before WebGPU device loss in long-lived classroom installs? — new risk candidate; investigate before kiosk-mode adoption.

File these as issues if they remain open at the start of Phase 1.
