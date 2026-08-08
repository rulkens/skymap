# Young-star clustering statistics — literature pass (2026-08-09)

Companion to [10-young-star-placement.md](10-young-star-placement.md): the
measured multi-scale statistics a synthetic young-star field should
reproduce. Sources: LEGUS/PHANGS/JWST-FEAST clustering papers, Elmegreen &
Elmegreen hierarchy series, Gusev/Efremov regular-chain work, Chandar/
Shabani M51 age-gradient work.

## Hierarchy

- Projected fractal dimension of young-star distributions **D₂ ≈ 1.2–1.7**
  (use 1.5); old stars are Poisson-homogeneous. NGC 628 measures D₂ ≈ 1.5. MEASURED.
- Two-point correlation function: power law out to a correlation length
  l_corr ~ few hundred pc–1 kpc, Poisson beyond; NGC 628 needs a **broken**
  power law (steeper sub-complex regime, shallower complex-to-complex). MEASURED.
- **Three characteristic size rungs in NGC 628: ≈65 pc (OB associations),
  ≈240 pc (aggregates), ≈600 pc (complexes)**; cumulative size slope −1.5
  over 5 pc–1 kpc. MEASURED. (Maps onto the renderer's scale split: the ISM
  map texture carries the 240/600 pc rungs, the baked star-grain volume's
  octaves carry ≤65 pc.)
- Complex luminosity/mass function dN/dL ∝ **L⁻²**, masses 10⁴–10⁷ M☉ —
  heavy-tailed "few bright over many faint", the same character as the
  star-grain bake's log-normal amplitudes. MEASURED.

## Two independent clocks

- **Gas-decoupling clock τ ≈ 4–6 Myr** (cluster leaves natal cloud) — the
  HII/shell tier's window.
- **Structural-dissolution clock τ ≈ 40–60 Myr**, homogeneous by ~100 Myr
  (clustering amplitude fades with age) — the young-star tier's decay
  constant, and it is positional as well as photometric: structure shears
  apart as it dims. MEASURED.
  (In the tracer: decay + advection under the same flow reproduce both.)

## Beads on a string

- Classic (Elmegreen & Elmegreen 1983): obvious regular chains in only
  22/200 spirals; spacing 1–4 kpc, ~5 beads per coherent run. MEASURED.
- Modern (Gusev et al. 2013–2025): quasi-regular chains are common, spacing
  **350–500 pc** (often integer multiples), across S0–Scd. MEASURED.
- Rule of thumb: bead spacing ≈ **3× the compressed lane width** (Jeans
  scale of the gas layer). THEORY; the few-kpc linear-instability prediction
  vs the 350–500 pc measurement is an open problem in the literature.
- **Strong visual regularity is the exception (~10% of arms)** — a renderer
  should let beads emerge noisily (event spacing + deposit kernel + shear),
  never author a regular comb.

## Age structure

- Within-complex age spread scales with size: Δage ∝ size^0.16–0.35
  (~30 Myr for a 1 kpc complex, few Myr for a 65 pc association). MEASURED.
- Cross-arm age gradients are real but messy: present in M51's inner arm,
  absent in its outer arm; Shabani et al. (2018) find them in one arm of one
  galaxy out of three. Arm-crossing time (~40 Myr at M51's inner radii) is
  comparable to the dissolution clock, washing gradients out. MEASURED.

## Synthesis targets for the tracer + grain stack

| quantity          | target                       | carried by                       |
| ----------------- | ---------------------------- | -------------------------------- |
| clump scale floor | 100–300 pc decorrelation     | deposit kernel size              |
| bead spacing      | 350–500 pc, noisy            | event spacing × shear (emergent) |
| dissolution       | τ ≈ 50–100 Myr               | tracer decay + advection         |
| rungs ≤65 pc      | −1.5 size slope, L⁻²         | star-grain octaves (exists)      |
| regularity        | visible in ~10% of arms only | do not author; emerge            |
