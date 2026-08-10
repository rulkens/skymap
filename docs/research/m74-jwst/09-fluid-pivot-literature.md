# 09 — Fluid pivot: prior art, visual ground truth, and the Latte lesson

Written 2026-08-05, after the spike's structural verdict on the CA (see 06 for
the design it closes out): the automaton cannot draw coherent walls at any
parameter setting — events are single-cell, single-step, and their 8-texel
deposit rings never correlate into fronts. The user confirmed from the tool
("I don't think I can get any realistic seed map out of this automaton") and
asked whether a fluid simulation is the next direction. This doc records the
research that answered that question. All links below were fetched and
verified live by research subagents this session unless marked otherwise.

## 1. The proposed direction

Not full hydro. Advected density through a **composed velocity field**:

1. **Differential rotation / shear** — already computed for the material
   frame; becomes a velocity term instead of an index remap. Stretches every
   feature into arcs; this is where filaments come from.
2. **Event outflows** — each SF event injects a radially-decaying outward
   impulse persisting tens of steps. The snowplough done right: walls build
   up under sustained push, neighbouring shells collide and pinch into
   ridges, cavities stay evacuated because velocity history moved the mass.
3. **Curl noise** — divergence-free turbulence; stirs without creating or
   destroying mass.

Semi-Lagrangian advection (one backward fetch per step, unconditionally
stable) — the step shader is *simpler* than the CA step. Pressure projection
(Stam stable fluids, ~30 Jacobi iterations) stays available as an upgrade if
the flow should react around cavities; start without. Budget: a few hundred
compute steps at model build on a ~1–2k² grid, not real-time.

Key reframe (user's, and correct): **supernovae are a mechanism, not a
requirement.** The actual requirement is a field with believable correlation
structure — arm-correlated foam, cavities and connected filaments in the
~100 pc–5 kpc band, credible power down to the grid limit — with per-pixel
procedural noise taking over below that (the layer skymap already has). Any
generator that yields that structure is admissible; the imagery in §3 is the
acceptance test, not the method.

## 2. Prior art: a verified negative

Searched explicitly, multiple angles: **no paper, repo, talk, or shipped game
combines stable-fluids-style solving + galactic shear + event injection for
galaxy dust appearance.** The two halves exist separately:

- **Graphics toolbox** (generic, all GPU-friendly at our scale):
  - Stam-lineage GPU stable fluids —
    [GPU Gems 3 ch. 30](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-30-real-time-simulation-and-rendering-3d-fluids);
    worked WebGL references by
    [Jamie Wong](https://jamie-wong.com/2016/08/05/webgl-fluid-simulation/) and
    [Amanda Ghassaei](https://github.com/amandaghassaei/FluidSimulation).
  - Curl noise — Bridson, Hourihan & Nordenstam, SIGGRAPH 2007
    ([dl.acm.org](https://dl.acm.org/doi/10.1145/1275808.1276435)). Source
    for the divergence-free guarantee the turbulence term relies on.
  - **Spiral-spectral fluid simulation** — Cui, Langlois, Sen & Kim,
    SIGGRAPH Asia 2021
    ([dl.acm.org](https://dl.acm.org/doi/abs/10.1145/3478513.3480536)).
    Fast spectral solver native to disc/radial domains via generalized
    Laplacian eigenfunctions. Top graphics-side read: bears directly on the
    log-polar-vs-Cartesian grid decision.
- **Astro side** (right physics, offline cost): TIGRESS
  ([Kim & Ostriker 2017](https://iopscience.iop.org/article/10.3847/1538-4357/aa8599))
  is the canonical shearing-box formulation of exactly our ingredient list.
  De Avillez & Breitschwerdt (overview:
  [arXiv:1408.0446](https://arxiv.org/pdf/1408.0446)): SN driving imprints
  structure at **~60–200 pc** — a concrete number for the outflow term's
  spatial frequency, bracketing the Watkins shell spectrum already in use.
  [Slyz, Kranz & Rix 2003](https://academic.oup.com/mnras/article/346/4/1162/1063106):
  gas response to an *imposed* spiral potential — calibrates how much arm
  structure shear+potential alone buys before any event injection.
- **Game industry does zero simulation** (each checked from ≥2 sources):
  Elite Dangerous nebulae are procedural noise over catalog data ("airbrush"
  per a Frontier dev), EVE's are hand-painted skyboxes, Space Engine
  ray-marches procedural fBm, No Man's Sky's GDC talk covers terrain only.
  The kinematic baseline for non-fluid galaxy structure is
  [beltoforion's density-wave renderer](https://beltoforion.de/en/spiral_galaxy_renderer/).

Space Engine's "infinite detail at interactive rates" is the flip side of the
same coin: its detail is a pure function of position (fBm + domain warp)
evaluated per pixel — cost scales with pixels, not world resolution, and
nothing evolves or has causal structure. It does only the cheap half
(statistical texture); the sim grid should do only the other half (coherent
low/mid frequencies) and never carry frequencies the render-time noise
provides for free.

## 3. Visual ground truth (face-on emphasis)

Ranked for "what should the seed map look like":

1. **Zhao et al. 2024** ([arXiv:2405.18474](https://arxiv.org/html/2405.18474)) —
   face-on whole-disc column density, filaments to 5 kpc and kpc-scale
   cavities in one frame; figs. 5–8 zoom to a 3 kpc patch with filaments
   joining at superbubble interfaces. *The* acceptance image.
2. **Pillsworth et al. 2025** ([arXiv:2504.01099](https://arxiv.org/html/2504.01099)) —
   same family, face-on, with traced filament skeletons overlaid; companion
   shape gallery [github.com/pillswor/Filaments_MW](https://github.com/pillswor/Filaments_MW)
   (hairpin/hook/long-arm morphology classes).
3. **SILCC movies** — live gallery at
   [girichidis.com](https://girichidis.com/index.php/research-overview/silcc)
   (the canonical Cologne URLs are dead). SILCC VII has explicit face-on
   column density; there is a literal dust-grain-dynamics-in-SN-driven-ISM
   movie.
4. **TIGRESS movies** —
   [changgoo.github.io/tigress-wind-figureset](https://changgoo.github.io/tigress-wind-figureset/movies.html);
   canonical framing is vertical/outflow, hunt for in-plane views.
5. **Chen et al.** ([arXiv:2603.27741](https://arxiv.org/html/2603.27741)) —
   3D superbubble interiors growing "tunnels" over 30 Myr; cavity/wall
   micro-shape, local patch only.

Dead/unreachable at time of writing: Phil Hopkins' Caltech animation pages
(expired TLS cert); de Avillez and Joung & Mac Low have no media pages —
figures inside papers only.

## 4. The Latte/FIRE lesson: the field is the gap, not the renderer

The user identified the Latte simulation renders
([wetzel.ucdavis.edu/latte-simulations](https://wetzel.ucdavis.edu/latte-simulations/))
as closest to the skymap target look. Verified pipeline findings:

- **Fully offline.** The real-colour stills/movies use STARBURST99 SEDs per
  star particle (age+metallicity) ray-traced through metal-weighted gas
  columns with a MW reddening curve, per-band, composited u/g/r with log
  stretch — method quoted in the FIRE-2 paper
  ([Hopkins et al. 2014, fig. 2](https://academic.oup.com/mnras/article/445/1/581/988797)),
  packaged as [FIRE Studio](https://github.com/agurvich/FIRE_studio)
  (Python, snapshot-by-snapshot batch).
- **Their real-time tool doesn't look like the movies.**
  [Firefly](https://arxiv.org/abs/2207.13706) is WebGL point sprites +
  additive blend + octree LOD, no dust absorption — a glowing point cloud,
  explicitly positioned as a complement to the offline renders. Skymap's
  renderer is the same family *plus* dust sprites, i.e. already one step
  past Firefly.
- **The detail is the simulation's:** 7,070 M☉ gas particles, softening to
  ~1 pc (numbers from Wetzel's page). Dust lanes are resolution, not
  rendering technique.

Conclusion: the render recipe is two terms — add starlight by age, multiply
by wavelength-dependent extinction — and skymap already implements both in
real time (emissive splats + dark dust sprites). The "Latte look" in real
time is unclaimed territory, and its distance is (a) a seed field with
multi-scale correlation structure, (b) the fidelity of the sorted-sprite
extinction approximation. Nothing found suggests the architecture is wrong.

## 5. Open threads

- FIRE Studio local run (in `~/Development/vendor/python/`) to reproduce
  their example render and time it — gauges what one offline frame costs and
  gives a reference implementation of the extinction term. In progress at
  time of writing.
- The generator decision itself: fluid advection (recommended above) vs
  analytic shell stamping vs spectral synthesis of a target power spectrum —
  judged against §3's imagery plus a connected-component spatial metric
  (value histograms provably cannot distinguish walls from speckle; see the
  spike's measurement post-mortem in the PR #544 thread).
