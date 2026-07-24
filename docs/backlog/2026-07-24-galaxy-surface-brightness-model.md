# Physically-honest galaxy surface-brightness model

**Status:** needs-design (2026-07-24)

## Ask

The galaxy point/disk passes are driven by a physical surface-brightness amplitude (`sbAmp`, shipped in the 2026-07 look spike). The _form_ is right but the _normalisation_ is not: it divides a catalog-**relative** luminosity by an **absolute** size reference. Replace it with a physically defensible model, or decide deliberately to keep the current tuning and stop calling it physical.

## Current state

The amplitude is one shared helper consumed by both passes, so any fix lands in one place:

- `src/utils/galaxy/galaxySbAmp.ts:36-41` — `lumRel = 10^(-0.4·(absMag − medianAbsMag))`, `raw = lumRel / (diameterKpc/30)²`.
- `src/utils/galaxy/galaxyMedianAbsMag.ts:43-71` — per-catalog median absolute magnitude, `-20.5` fallback.
- Point pass: baked into slot 13 (`buildPointInterleavedBuffer.ts:177,351`), consumed at `shaders/galaxyCatalog/points/vertex.wesl:223-234`.
- Disk pass: recomputed CPU-side per frame (`proceduralDiskSubsystem.ts:127-132`) and packed into `extras.w`.
- Live knobs: `DEFAULT_GALAXY_SB_SCALE = 5.0`, `SB_MAX = 30.0`, `FALLOFF_STRENGTH = 0.7` (`src/data/defaults.ts:184,193,203`).

**What is already physical:** the `L/D²` form. Surface brightness genuinely is distance-independent — `SB = M + 5·log₁₀(D) + const`, the distance cancels exactly. Keep this.

## Three defects

### 1. `medianAbsMag` conflates a calibration constant with real physics

Subtracting each catalog's own median absolute magnitude erases two different things at once:

- the **photometric band zero-point** (SDSS g / 2MRS J / GLADE B / Famous B) — a genuine per-catalog constant that _should_ be corrected;
- the catalog's **real luminosity distribution** — a genuine physical difference that should _not_ be erased.

Famous galaxies really are more luminous and higher surface brightness. Normalising that away and then re-introducing an absolute 30 kpc size term is what manufactures the mismatch. Secondary effect: the zero-point is a central statistic in log space, then exponentiated, so `lumRel` has median ≈ 1 but mean > 1 (Jensen) — a bright-tail skew that disappears with a fixed reference.

### 2. `sbBoost` is the right shape, derived the wrong way

A per-source multiplicative constant is _exactly_ how a band zero-point offset should be absorbed, so the knob sits in the correct slot. But `famous-galaxy.ts:55` is `0.45` because it cancels an observed median (measured `raw` median 2.14 vs nominal 1.0, tail to 11.7 for NGC 4449), not because of any photometric transformation. Famous's median diameter is 25.4 kpc against the fixed 30 kpc reference, so the size term alone inflates every row by `1/0.847² = 1.39×`. Note the `sbMax` ceiling never engaged — 0 of 80 rows reached it.

### 3. GLADE's surface brightness is synthetic — this caps how physical the model can get

GLADE carries no measured size. `tools/parsers/glade.ts:384-404` derives the diameter from the B magnitude via Tully (1988), implemented at `src/utils/math/galaxyDiameterKpc.ts:45-47`:

```
logR = −0.249·(M_B + 21) + 1.366   ⇒   D ∝ L^0.62   ⇒   SB = L/D² ∝ L^−0.245
```

So for the largest catalog, `sbAmp` is a deterministic re-parameterisation of the B magnitude carrying **no independent surface-brightness information** — and with an inverted slope, where more luminous galaxies render slightly _dimmer_ per pixel. A 40× luminosity range yields only ~2.5× SB variation.

Catalogs with genuinely measured sizes, where SB is real: SDSS (`petroR50_r`, `sdssCsv.ts:278`), 2MRS (`twoMrs.ts:311`), Famous (HyperLEDA `logd25`, `expandFamousFromCatalogs.ts:459`).

## What needs decided

- **Band unification.** Replace `medianAbsMag` with a per-catalog **band zero-point constant** plus a single **global absolute reference magnitude**. Needs a real transformation per source (B→g, J→g, …), each requiring a colour term — Famous has B−V, 2MRS has J−K, GLADE is B-only. Decide the target band and what to do where the colour term is missing.
- **What to do about GLADE.** Options: flag its SB as synthetic and render it at flat surface brightness; source measured diameters (HyperLEDA `logd25` by PGC — coverage is partial, see `project_hyperleda_partial_cache`); or accept the degeneracy and document it.
- **Re-tuning cost.** Dropping the per-catalog median shifts _every_ catalog's brightness, so this needs a full visual pass and probably new `sbScale` defaults. Famous would become legitimately brighter than the field, at which point "too bright" is an exposure/tone-map question, not a data one — it interacts with the HDR bloom threshold and the brightness slider the same way [star apparent-magnitude realism](2026-07-22-star-apparent-magnitude-realism.md) does.
- **Whether it's worth it.** A defensible alternative is to keep the current tuning, delete the "physically grounded" claim from the comments, and treat `sbAmp` as a legibility heuristic. Cheaper and honest.

## Validation

Compare rendered SB against published values for galaxies with real measurements (M31, M87, Sombrero sit around 20–22 mag/arcsec² for disks) from a fixed pose; confirm the point↔disk crossfade still holds constant brightness (`galaxyImpostorBaseline.test.ts` hashes the disk instances); check Milliquas and the DESI cones, which have their own `sbBoost` lifts, don't invert.
