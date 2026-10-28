# Binary-star orbits (Alpha Centauri A/B prototype)

Status: converged 2026-10-28 in session; ground preparation below.

## 1. Intent

Alpha Centauri is drawn as one star, its A component. B (Toliman, HIP 71681) is only a dedup id,
so the nearest Sun-like pair reads as a single point. B becomes a star of its own on its measured
80-year orbit around A, traced by the orbit-trail renderer. This tests whether the pieces built for
the TRAPPIST-1 pilot generalise to a second star system: root-anchor regions, the trail cull and
star-relative bodies.

## 2. Goals, non-goals, anti-goals

**Goals**

- Alpha Centauri B is a famous star, searchable as "Toliman" and focusable (`#focus=star-alpha-centauri-b`).
  It moves on the sim clock along its published orbit around A.
- Its orbit is drawn by the orbit-trail renderer under the "Orbit trails" switch.
- The S-stars and B share one astrometric conversion, from sky elements to frame elements.

**Non-goals**

- **Other binaries.** Sirius, Procyon and 61 Cygni follow as seed rows once this lands.
- **The barycentric orbit.** A stays fixed and B moves relative to it: the visual-binary convention
  the published elements use. Both stars orbiting the barycentre would need a barycentre anchor. That
  is the "barycentric orbit pairs" backlog item.
- **Proxima's orbit.** The orbit around AB has P ≈ 550 kyr and is poorly constrained.

**Anti-goals**

- A second star table or catalogue for orbiting stars. B is a famous-star row.
- A copy of the S-star frame conversion.

## 3. Design

### 3.1 A famous star may carry an orbit

A `famous_stars.seed.json` row gains an optional `orbit` block in published visual-binary units, the
fields `SStarSeed` already uses:
- `host`: a famous-star id;
- `semiMajorArcsec`, `periodYr`, `eccentricity`;
- `inclinationDeg`, `ascendingNodeDeg` (position angle), `argPeriapsisDeg`;
- `periapsisEpochYr`.

`npm run build-famous-stars` carries the block into `FamousStarRow`.

A row with an orbit is positioned by its orbit, not by an anchor:
- `SCENE_ANCHORS` skips it;
- `ORBITAL_ELEMENTS` gains its elements, made by the shared conversion (§4 G1) in the host's sky
  frame, with arcsec converted to Mpc at the row's distance.

Its RA/Dec and distance stay in the row, for the card and the constellation lookup.

### 3.2 Alpha Centauri

- **B's orbit (relative, B around A):** Pourbaix et al. 2002 (A&A 386, 280):
  - a = 17.57″, P = 79.91 yr, e = 0.5179;
  - i = 79.205°, Ω = 204.85°, ω = 231.65°, T = 1875.66.
- **B's facts:** K1V, R 0.863 R☉, T 5260 K, M 0.909 M☉, L 0.50 L☉, V 1.33, M_V 5.70.
- **Ownership:** B carries `hip: 71681`, and A drops its `hipCompanions`, so the dedup id still
  hides the Hipparcos point once.
- **Names:** A's `commonName` becomes "Alpha Centauri A". "Toliman", B's IAU name, moves from A's
  names to B's.

### 3.3 Trails

B's elements land in `ORBITAL_ELEMENTS`, so they join core's "Orbit trails" group with no new show
key. Its root is the `alpha-centauri` anchor. The neighbourhood region and the root-keyed trail cull
(from the exoplanet pilot) cover it.

## 4. Ground preparation

The refactor-ground pass asked what a star on an orbit hits today.

- **G1. The sky-to-frame conversion is extracted from `makers/sStar.ts`.** Given the host frame
  `planeFrameFromPole`, it applies:
  - Ω_frame = 90° − Ω, i_frame = 180° − i, with ω unchanged;
  - mean anomaly at J2000 from T and P (`meanAnomalyAtJ2000`);
  - the mean-motion rate.

  `sStar` and the binary maker both call it. The S-star astrometry fixture test pins the result,
  so the extraction must leave every S-star value bit-identical. **Verdict: growth.**
- **G2. A famous star is positioned by its anchor *or* its orbit.** It is still one table: the split
  happens where `SCENE_ANCHORS` and `ORBITAL_ELEMENTS` read the generated rows. **Verdict: growth.**

**Checked, no prep needed:**
- **Seeded catalogue:** B rides `SEEDED_STAR_CATALOGS.famousStar` via `SCENE_STARS`, appended last.
- **Search and card meta:** both are keyed by row id.
- **Regions and the trail cull:** both are keyed by root (from the exoplanet pilot).

## 5. Rulings

1. **The relative orbit** (§2): A is the focus, as in the published elements.
2. **B's seed row is appended last**, so every existing star keeps its pick seed index.

## 6. Success criteria

- `#focus=star-alpha-centauri` shows A, B and B's trail.
- B's separation from A follows the published orbit: 11.3 au at the 2035.5 periastron, 35.7 au at
  the 1995.6 apastron. Its sky separation is about 4″ in early 2016, near the pair's closest
  apparent approach. Both are tests.
- Searching "Toliman" focuses B.
- The S-star values are unchanged: the astrometry test passes untouched.
