# Solar System Ephemeris (NASA JPL Horizons / DE440)

**Spec sibling for the consuming shell:** [`shells/01-solar-system.md`](../shells/01-solar-system.md).
**Master catalog row:** [`00-data-sources.md`](00-data-sources.md), row 1.

---

## 1. What it is

A frozen snapshot of the Solar System at a single instant — heliocentric positions of the eight planets plus Pluto on **2025-01-01 12:00 TT (J2025.0)**, plus the six classical Kepler orbital elements per body so we can reconstruct each closed orbit ellipse.

The numbers come from **NASA JPL's Horizons**, a web frontend onto the **DE440 planetary ephemeris** — the same numerically-integrated model NASA uses for spacecraft navigation. DE440 is accurate to sub-kilometre precision for the inner planets; we throw away essentially all of that precision (planet billboards are exaggerated to 3–24 px), but starting from the right number costs nothing and prevents the whole shell being subtly, embarrassingly wrong.

We take a **snapshot, not an integration**. Shell 1 spends ~6 s on screen — real-time Kepler propagation in WGSL would be meaningful shader work for an effect no eye registers. A snapshot also makes the build deterministic. The Kepler elements alone draw the orbit ellipses without any time-dependence; the snapshot positions are just dots on those ellipses.

## 2. Why we need it

**Used by shell 1, and only shell 1.** Two distinct visual responsibilities:

1. **Orbit ellipses** — one closed line-strip per body, drawn from the six Kepler elements. The vertex shader walks true anomaly `ν ∈ [0, 2π)` in 256 steps, emits the heliocentric position via `r = a(1-e²)/(1+e·cos ν)`, and rotates by `(Ω, i, ω)` into our coordinate frame. These are the structural backbone of the shell — they read as "this is the Solar System diagram" the moment they appear.
2. **Planet snapshot positions** — nine `vec3<f32>` instance positions, one per body, fed to the planet billboard renderer. They have to land *on* their ellipses (not next to them), which is why we co-source positions and elements from the same Horizons query at the same epoch.

Shell 2 puts the Sun at its origin but treats it as one star among many; the planets are sub-pixel by then. No other shell consumes this data.

## 3. Acquisition

- **URL:** <https://ssd.jpl.nasa.gov/horizons/>
- **API endpoint:** `https://ssd.jpl.nasa.gov/api/horizons.api` (plain-text response, no HTTP/2 or auth complications).
- **Authentication:** none. No documented rate limit; we still sleep 200 ms between requests to be polite.
- **Format:** Horizons fixed-form text with a clearly-delimited `$$SOE` / `$$EOE` data block.
- **Raw size:** ~10–20 KB per body × 9 bodies × 2 queries = ~150–300 KB total.

For each body, two queries: a `VECTORS` query (heliocentric, equatorial-J2000, AU) for the snapshot position, and an `ELEMENTS` query (heliocentric, ecliptic-referenced) for the six Kepler elements. The two frames are intentional — they match the conventions each output type uses upstream and avoid us doing a manual obliquity rotation we'd inevitably get a sign wrong on. The orbit-line vertex shader applies the J2000 obliquity rotation (`ε = 23.4392911°`) to bring Kepler-frame vertices into the same equatorial frame as the snapshot positions.

NAIF IDs: 199 Mercury, 299 Venus, 399 Earth (geocenter; not the EMB), 499 Mars, 599 Jupiter, 699 Saturn, 799 Uranus, 899 Neptune, 999 Pluto (Pluto-Charon barycenter — the ~2,000 km offset is five orders of magnitude below our render threshold).

## 4. Parsing

A tiny hand-written extractor in `tools/parsers/horizons.ts` — no third-party library; the format is too irregular to justify one.

For **vectors**, we extract `X`, `Y`, `Z` (AU, equatorial J2000) from the labelled line inside the `$$SOE` / `$$EOE` block.

For **elements**, we extract:
- `A` → semi-major axis (AU)
- `EC` → eccentricity (dimensionless)
- `IN` → inclination (degrees, ecliptic)
- `OM` → longitude of ascending node Ω (degrees)
- `W` → argument of perihelion ω (degrees)
- `MA` → mean anomaly at epoch (degrees)

Six elements per body × 9 = 54 numbers; 3 position components × 9 = 27 numbers. 81 floats of payload total. Parser is a `String.prototype.split` on whitespace after locating the relevant line by labelled prefix; loose enough to absorb the cosmetic format tweaks Horizons has shipped over the last decade. The parser also normalises the rare `D`-instead-of-`E` scientific notation seen in legacy Horizons responses.

## 5. Filtering / cross-matching

**None.** All 9 bodies included. No cross-match against any other catalog — the Solar System is a closed inventory and skymap's other catalogs (SDSS, 2MRS, GLADE) start at galactic distances. This is the only data spec in the plan with zero filtering logic.

## 6. Output binary format

A small bespoke binary at `public/data/solar-system.bin`, documented in [`10-binary-formats.md`](10-binary-formats.md), section "Solar System". 880 bytes — the smallest binary in the project — but we still ship it through the normal binary pipeline rather than as a TypeScript literal so the runtime loader stays uniform (one `fetch + ArrayBuffer + DataView` path per shell), future bodies don't bloat the JS bundle, and the J2025.0 epoch is swappable by re-running the build script.

```
header (16 bytes):
  magic:   uint32   = 0x534F4C53  ('SOLS')
  version: uint16   = 1
  count:   uint16   = 9
  epoch:   float64  = 2460677.0   (Julian Date TDB, J2025.0)

per-body record (96 bytes × 9 = 864 bytes):
  naifId:    uint32         // 199, 299, 399, ...
  _pad:      uint32         // align to 8
  posX:      float64        // AU, equatorial J2000 heliocentric
  posY:      float64
  posZ:      float64
  semiMajor: float64        // AU
  ecc:       float64        // dimensionless
  inc:       float64        // radians, ecliptic
  ascNode:   float64        // radians (Ω)
  argPeri:   float64        // radians (ω)
  meanAnom:  float64        // radians at epoch (M₀)

total: 880 bytes
```

`float64` is overkill for shell rendering, but float32 round-tripping through Kepler's equation accumulates visible error in the orbit closure (the last ellipse vertex drifts off the first). The cost is 480 extra bytes for the whole shell — trivial. Angles are stored in **radians** even though Horizons emits degrees: every consumer (the orbit shader, the position validator) works in radians; convert once at build time, not in nine separate consumers. `naifId` is preserved so the renderer can do `if (body.naifId === 599) attachJupiterBandsTexture(...)` without inventing a parallel keyspace.

## 7. Build script

**File:** `tools/buildSolarSystem.ts`
**Run command:** `npm run build-solar-system`; also called by the umbrella `npm run build-shell-data`.
**Idempotent:** yes — same Horizons response in, same `.bin` out, byte-for-byte.
**Approximate runtime:** ~10 s, network-bound (nine bodies × two HTTP round-trips + 200 ms inter-request sleep).

Implementation sketch:

```ts
// tools/buildSolarSystem.ts
const EPOCH_JD_TDB = 2460677.0; // 2025-01-01 12:00 TT
const D2R = Math.PI / 180;
const BODIES = [199, 299, 399, 499, 599, 699, 799, 899, 999];

type SolarBody = {
  naifId: number;
  posAU: [number, number, number];
  semiMajorAU: number; ecc: number;
  incRad: number; ascNodeRad: number;
  argPeriRad: number; meanAnomRad: number;
};

async function main() {
  const records: SolarBody[] = [];
  for (const naifId of BODIES) {
    const [vec, elem] = await Promise.all([
      fetchHorizonsVectors(naifId, EPOCH_JD_TDB),
      fetchHorizonsElements(naifId, EPOCH_JD_TDB),
    ]);
    records.push({
      naifId,
      posAU: [vec.x, vec.y, vec.z],
      semiMajorAU: elem.a, ecc: elem.ec,
      incRad: elem.in_deg * D2R, ascNodeRad: elem.om_deg * D2R,
      argPeriRad: elem.w_deg * D2R, meanAnomRad: elem.ma_deg * D2R,
    });
    await new Promise(r => setTimeout(r, 200));
  }
  const buf = encodeSolarSystem({ epochJD: EPOCH_JD_TDB, bodies: records });
  await writeFile("public/data/solar-system.bin", new Uint8Array(buf));
}
```

The encoder (`tools/encodeSolarSystem.ts`) is the symmetric pair of the runtime decoder (`src/services/engine/loaders/solarSystemLoader.ts`); both have round-trip property tests.

Because the `.bin` is under 1 KB, **it is committed to git** rather than synced via `npm run sync-r2`. R2 is the right home for multi-MB tier files; sub-1 KB is pure overhead there, and committing means clones get it for free. The `tools/syncR2.ts` ALLOW filter therefore does not include `solar-system.bin`.

## 8. Licensing & attribution

**License:** US Government work — public domain. NASA JPL Horizons data carries no copyright restrictions and may be used without attribution in any context.

**Attribution we provide anyway:** the shell-1 overlay credit reads "Solar System: NASA JPL DE440 ephemeris." The repo-root `CREDITS.md` carries the longer form: "Planet positions and orbital elements obtained from the NASA JPL Horizons system, backed by the DE440 planetary ephemeris (Park et al. 2021)." Courtesy, not obligation.

## 9. Risks

Low overall — the smallest, most stable dataset in the plan. Specific concerns:

- **Horizons API uptime.** JPL Horizons has occasional outages. Because we build the `.bin` at dev time and commit it, an outage cannot break the runtime — only "we can't regenerate today." The snapshot is for J2025.0, not "now," so there is no operational pressure to regenerate.
- **Output format drift.** Horizons has tweaked its text formatting twice in the last decade. Our parser is loose (regex on labelled lines, not column offsets) and the test fixture set catches breakage early.
- **Frame conventions.** Horizons supports three reference planes; picking the wrong one silently shifts everything by ~23.44° (the obliquity), which would be visually catastrophic. The build script pins the conventions explicitly per query, and `solarSystemLoader.test.ts` asserts that Earth's J2025.0 position lies within ±0.05 AU of the known truth as a frame-mismatch sentinel.

## 10. Sample/test data

Committed to the repo for offline test runs:

```
data/raw/horizons/
  399_vectors_J2025.txt     // Earth, vectors query, real Horizons response
  399_elements_J2025.txt    // ditto, elements query
  599_vectors_J2025.txt     // Jupiter, for parser robustness
  599_elements_J2025.txt
```

Two bodies × two query types — enough to exercise every line of the parser without inflating `data/raw/` with the full nine-body set. The build-script integration test (`tools/buildSolarSystem.test.ts`) mocks the HTTP client to return these fixtures (plus known-good synthetic data for the other seven), then asserts:

- The output `.bin` is exactly 880 bytes.
- Header magic, version, count, and epoch round-trip correctly.
- Earth's heliocentric position matches the fixture's `X/Y/Z` to within `1e-12 AU`.
- Jupiter's semi-major axis lies in `[5.20, 5.21]` AU (sanity check on the elements parser).
- All angles in the binary are in `[0, 2π)` (catches degree-vs-radian mistakes immediately).

There is no live-Horizons test in CI. Hitting an external service from CI is flaky and unnecessary; the parser fixtures + property tests cover the deterministic surface, and the network glue is exercised manually whenever the snapshot epoch changes (which we expect to do once, ever).

## 11. References

- **JPL Horizons web interface** — <https://ssd.jpl.nasa.gov/horizons/>
- **JPL Horizons API documentation** — <https://ssd-api.jpl.nasa.gov/doc/horizons.html>
- **DE440 ephemeris paper** — Park, R. S., Folkner, W. M., Williams, J. G., & Boggs, D. H. (2021). *The JPL Planetary and Lunar Ephemerides DE440 and DE441*. Astronomical Journal, 161(3), 105. <https://doi.org/10.3847/1538-3881/abd414>
- **NAIF ID conventions** — <https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html>
- **Kepler element conventions** — Murray & Dermott, *Solar System Dynamics* (Cambridge, 1999), Ch. 2. The orbit-line shader is a direct implementation of equations (2.122)–(2.126).

---

### Note on the optional minor-planet / comet question

The brief asked whether to include Ceres, Vesta, dwarf planets, comets (1P/Halley), top 10 asteroids. **Recommendation: no, exclude in v1.** The shell's pedagogical job is "this is the Solar System we know"; adding Ceres, Eris, Sedna, Halley creates an inventory the user is not primed to recognise. At the tour's camera distances (exit framing puts the eye 80 AU from the Sun) they would be sub-pixel even with the planet exaggeration clamp. The asteroid belt is already represented impressionistically as a torus haze at 2.2–3.2 AU (see [`shells/01-solar-system.md`](../shells/01-solar-system.md) §2.5); 5,000 individual bodies would not improve on that. Comet tails are real procedural-rendering work for a body that is sub-pixel at this framing.

The binary format has a `count: uint16` field with 65,535 of headroom; adding bodies later is a build-script edit, not a format change. The cost of saying "no" now is recoverable.
