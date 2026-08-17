# Young-star placement vs dust structure — literature pass (2026-08-09)

Commissioned during the YOUNG STARS redesign grill (see
`docs/grill-sessions/young-stars-field-2026-08-09.md`): where do 5–100 Myr
stellar complexes actually sit relative to dust/molecular gas in spiral
discs? Compiled from PHANGS-ALMA/HST/JWST-era measurements; MEASURED numbers
flagged against qualitative claims. Companion: [11-young-star-clustering.md](11-young-star-clustering.md).

## 1. Dust-lane → young-star offsets

- Chandar et al. (2017), M51 HST: dust lane → bright young (<6 Myr) clusters
  ≈ **220 pc**; young → old (100–400 Myr) clusters ≈ 1 kpc total spread
  (R = 3–6 kpc). MW arm-tracer studies: ~100–350 pc. MEASURED.
- Egusa et al. (2004, 2009): CO→Hα offsets over 13 galaxies give SF
  timescales **4–13 Myr** (~10 Myr standard); offsets shrink with radius
  inside corotation. MEASURED.
- PHANGS 24-galaxy CO/Hα offset survey (2025): only **14/24** show a mean
  positive offset at all, and only **4/24 (~17%)** the clean radial trend a
  single density wave predicts; ~40% noisy, ~40% none. MEASURED.
  **Renderer implication: a fixed painted offset law over-fits the textbook
  cartoon — scatter is the norm; offsets should emerge, not be authored.**
- Thilker et al. (2023), NGC 628 spurs: spur SF regions are <10 Myr old where
  pure arm-drift would need 100–150 Myr — spur populations form **in situ**
  from local gas. MEASURED. (Validates seeding spur events from local map
  forcing rather than advecting arm populations outward.)

## 2. Correlation vs anti-correlation by scale ("uncertainty principle")

Framework: Kruijssen & Longmore (2014); Chevance et al. (2020–22);
PHANGS-JWST extensions. Converged numbers:

- GMC lifetime **5–30 Myr**; feedback/overlap phase (gas and young stars
  coincident) **1–6 Myr**; integrated SFE per cloud **1–8%**;
  decorrelation scale between independent regions **λ ≈ 100–300 pc**. MEASURED.
- Cluster–GMC association by age: median age of clusters _inside_ a GMC
  ≈ 1 Myr; dissociation onset 2–3 Myr; **statistically unassociated by
  ~6 Myr; essentially all clear of natal gas by ~10 Myr** (PHANGS 11-galaxy
  cluster×GMC study; Grasha et al. 2018 NGC 7793). MEASURED.
- NGC 628 dust filament network (Thilker 2023): 75–80% of HII regions and
  ~60% of <5 Myr clusters sit _in_ the filament network — but looser NUV
  associations of the same age are **anti-correlated** with it. MEASURED.

**Age-bin summary for the renderer:** 0–1 Myr embedded (~100% gas-associated);
1–5 Myr clearing (shell phase); 5–10 Myr rapid dissociation; 10–100 Myr fully
decoupled — located by dynamics/drift, not by any residual gas association.
The renderer's YOUNG STARS tier (5–100 Myr) is therefore **spatially decoupled
from the dust field**; deriving its placement from dust density has the wrong
sign at clump scale.

## 3. Cavity-centric geometry (NGC 628 bubble work)

- Watkins et al. (2023), PHANGS-JWST: **1,694 bubbles**, radii **6–552 pc**;
  **31% contain a child bubble on their rim** (sequential triggering). MEASURED.
- Barnes et al. (2023), "Phantom Void" (>1 kpc): youngest (~1 Myr) massive
  associations sit **on the shell rim**; a ~20 Myr generation sits **inside
  the cavity interior** — the stars that blew it. MEASURED.
- ALMA superbubbles (325 cavities, 18 galaxies): central cluster ages/masses
  consistent with driving the shells at ~10% SN coupling. MEASURED.

**The spatial pattern with age is cavity-centric, not conveyor-belt**: born
at a gas peak → blow a bubble → age inside the cleared hole while new SF
continues on the advancing rim. Nested and self-similar.

## 4. Renderer placement rule (synthesis)

1. Seed young-star events at/near local gas-density peaks (weight ~density^1–2)
   at the 100–300 pc decorrelation scale.
2. 0–5 Myr: pinned to the seed, embedded → clearing (this is the HII/shell
   tier's clock, not the young-star tier's).
3. 5–100 Myr: the population rides the flow (shear/drift), decays in
   clustering strength, and sits in the gas-poor cavities it carved — never
   re-painted onto gas-rich structure.
4. Treat the textbook monotonic arm offset as a minority mode (~17%); let
   offsets and scatter emerge from the flow field.

This is exactly a deposit-advect-decay tracer in the ISM map's own fluid —
the mechanism the redesign adopts (stars channel replacing the fluid
generator's `eventAge` lane).
