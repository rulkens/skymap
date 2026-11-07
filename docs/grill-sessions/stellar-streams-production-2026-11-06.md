# Grill Session: Stellar streams to production — 2026-10-20 to 2026-11-06

Source: the stellar-streams spike (branch `feat/stellar-streams`, formerly `ccr-03796997-nysv48`) and the owner's
"real feature, grill me if needed". Spec: `docs/superpowers/specs/2026-11-06-stellar-streams-design.md`.

The spike drew Milky Way stellar streams as drifting streak particles with a home-made Sagittarius model,
invented structure on the galstreams streams, and none of the Layer machinery (toggle, fade, bands, assets,
tests). This session decided what the production version is.

---

## Q0: Spike or feature, and the build tool's language

**The question:** keep the spike as a spike, or plan a production feature; and keep the Python builder?

**Considerations:**
- **Spike:** no maintenance cost, but nothing ships.
- **Feature with the Python tool:** fastest port, but pip + numpy + galstreams outside the TS toolchain, and
  no `rawDataRegistry` path.
- **Feature with a TS tool:** fits `tools/`, the registry and `build-*` scripts; needs a port.

**Decision:** "Real feature", and "the build tool should be in typescript". The Python file is deleted; the
galstreams tracks come from GitHub (`cmateu/galstreams`, BSD-3) through a fetcher.

## Q1: Where the Sagittarius particles come from

**The question:** the spike integrated its own Sgr spray (gala-like potential, no LMC, no dynamical friction, a
dropped Ω × offset velocity term). Keep, fix, or replace with a published model?

**Considerations:**
- **A. Vasiliev+2021 snapshot with the LMC** (Zenodo 4300977, CC-BY 4.0): 200k equal-mass star particles with
  positions, velocities, sky coordinates and stripping time; the best Gaia match. Deletes the integrator and its
  bug; the bound particles are the remnant; real velocities give the drift direction.
- **B. The same without the LMC:** same format, worse fit.
- **C. Fix the spray in TS:** keeps the potential and integrator code and its physics gaps.
- **D. Law & Majewski 2010:** older, no LMC, worse Gaia match.

**Decision:** A. Most accurate and the least code; the credit line is the only cost.

## Q2: How the galstreams streams get particles

**The question:** galstreams gives only a centre-line track and a width. The spike added random brightness
waves (`clump`) along each stream. Keep them?

**Considerations:**
- **A. No invented structure:** even along the track, measured width; keep the end fade (track ends are survey
  limits) and per-particle brightness/colour jitter (texture, not a feature).
- **B. Keep everything:** prettier, but the waves read as real features (GD-1 has a real gap and spur; ours
  would sit in random places).
- **C. Flat and literal:** no fade or jitter; hard ends, tube look.

**Decision:** A. A data app should not fake features.

## Q3: What Sagittarius brightness and colour show

**The question:** the spike made young debris brighter and (nominally) redder. The snapshot has `Tstrip`.

**Considerations:**
- **A. Brightness from density only; colour from `Tstrip`:** equal-mass particles make density already honest;
  recently stripped debris is from the metal-rich core (redder), a measured trend.
- **B. Keep the spike's boost:** the brightness double-counts density.
- **C. No `Tstrip` cue.**

**Decision:** A.

## Q4: Drift animation and idle cost

**The question:** the spike's planner kept the render loop awake whenever the bin was loaded.

**Considerations:**
- **A. Awake only while visible** (switched on, loaded, fade > 0).
- **B. Like the flow Layer:** awake whenever switched on and loaded, regardless of distance.
- **C. Static comet-shaped streaks:** no idle cost, no motion.
- **D. Comet streaks plus gated drift.**

**Decision:** A.

## Q5: At which camera distances the streams show

**The question:** the spike showed them at every distance.

**Considerations:**
- **A. Handoff window:** fade in as the Local Bubble leaves (4 → 10 kpc), leave with the Milky Way's marked
  places (2 × disc radius → the foreground gate).
- **B. Same arrival, full to ~1 Mpc.**
- **C. No in-edge:** a faint overlay from Earth too.

**Decision:** A. The asset load gate follows the out-edge (release at twice it).

## Q6: Default and toggle placement

**Considerations:** on by default in "Labels & guides" (part of the Galaxy's look); off by default like the
Local Bubble (no download or wake unless chosen); on with its own main-panel section.

**Decision:** off by default, toggle in "Labels & guides".

## Q7: Particle budget

**Considerations:**
- **A. Sgr subsampled to 60k:** ~127k records, ~5.1 MB, ×1.1 the spike's vertex work; equal-mass particles keep
  density under a uniform pick.
- **B. All 200k:** ~10.7 MB, ×2.3, detail the streak sprites blur.
- **C. 60k packed to 24 B:** ~3 MB, plus shader decode code.

**Decision:** A. (The greenfield cross-check later proposed C's packing again; it stays rejected.)

## Q8: Replacing the `window.__streamLooks` dev hook

**Considerations:** constants plus one intensity setting; a full DebugPanel section for both looks' knobs;
constants only.

**Decision:** full DebugPanel tuning section (the owner wants to tune live).

## Q9: Names, picking and detail cards

**Considerations:** out of v1 (backlog); labels only; labels + pick + card in this PR.

**Decision:** labels + pick + card in this PR, using the meta JSON sidecar pattern of the famous galaxies/stars
and structures.

## Q10: The selection-kind smear

**The question:** a new selectable kind needed rows in ~13 core tables plus union arms. Fix first, ride it, or
fold the fix into this PR?

**Considerations:** prep PR first (backlog trigger "the next new focusable kind"); ride the smear (fast, debt
grows); prep as first commits here (mixed diff).

**Decision:** prep first — which the owner was already doing elsewhere: #1057 (runtime pick codes) and #1064
(selection kinds declared by the Layer) merged before this spec. Streams add no core selection rows.

## Refactor-ground checkpoint (2026-11-06)

**Finding:** one bolt-on — asset demand restates the visibility band by hand (localBubble literals,
satellites' own from-Earth distance). The owner asked for it as pure data on the Layer; a survey showed most
asset rows across Layers (switch-only, switch + tier, band distance, always, palette) can be data, with only
per-body texture and craft-mesh rows keeping functions.

**Decision:** handed to the session already optimising GPU buffer loading (prompt given 2026-11-06); streams
consume its `near` form. No prep on this branch.
