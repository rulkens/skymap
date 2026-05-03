/**
 * Derived-physics and formatting helpers for the SDSS galaxy renderer.
 *
 * This module is intentionally pure CPU code — no DOM, no GPU, no side
 * effects — so it can be consumed safely by React components, unit tests,
 * and any future server-side code.
 *
 * Contents:
 *   A. Sexagesimal coordinate formatting (RA as h/m/s, Dec as °/'/")
 *   B. SDSS IAU-style object name construction ("SDSS J…")
 *   C. Cosmological derivations (lookback time, recession velocity,
 *      absolute magnitude)
 *   D. Earth-history anchors for lookback times
 *   E. Galaxy type classification from u−r colour index
 *   F. SDSS external URL builders (Quick Look, image cutout)
 *
 * Formatting conventions follow the IAU style guide and the SDSS DR18
 * documentation (https://www.sdss.org/dr18/).
 *
 * Cosmological formulae use the simple linear (Hubble's law) approximation
 * throughout — appropriate for SDSS spectroscopic galaxies at z < 0.3 and
 * consistent with the coords.ts distance model already used in the renderer.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Speed of light in km/s (exact by definition since 1983).
 *
 * Same value used in coords.ts — kept local here so this module is
 * self-contained and the InfoCard component does not need to import
 * from coords.ts.
 */
const C_KM_S = 299792.458;

/**
 * Hubble constant H₀ in km/s/Mpc.
 *
 * 70 is a round, widely-used "concordance" value. The true value lies
 * somewhere between 67 and 73 depending on the measurement method (the
 * "Hubble tension"). For visualisation purposes the exact value is secondary.
 */
const H0_KM_S_MPC = 70;

/**
 * Hubble time t_H = 1/H₀, expressed in gigayears.
 *
 *   t_H = 1 / H₀  ×  (Mpc in km)  ÷  (seconds per Gyr)
 *       = 1/70  ×  3.0857 × 10¹⁹ km/Mpc  ÷  (3.156 × 10¹⁶ s/Gyr)
 *       ≈ 13.97 Gyr
 *
 * Reference: Ryden, "Introduction to Cosmology", 2nd ed., §2.4.
 * The seconds-per-year factor uses the Julian year (365.25 days).
 */
const HUBBLE_TIME_GYR =
  (1 / H0_KM_S_MPC) *
  3.0857e19 /           // 1 Mpc in km
  (60 * 60 * 24 * 365.25 * 1e9); // seconds in one gigayear (Julian)

// ─── A. Sexagesimal coordinate formatting ─────────────────────────────────────

/**
 * Zero-pad an integer to at least `width` digits.
 * e.g. pad(7, 2) → "07", pad(123, 2) → "123".
 */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Decompose a non-negative decimal value into integer sexagesimal components
 * using a fixed-point (integer) approach to avoid floating-point carry-up.
 *
 * The strategy:
 *   1. Convert the float to an integer by multiplying by `subunitFactor`
 *      (e.g. 100 for centiseconds, 10 for deciseconds) and rounding to the
 *      nearest integer. This collapses all intermediate floating-point error
 *      into a single rounding step on the original value, so 23.999999998°
 *      becomes 24°, not 23°59'60".
 *   2. Decompose the resulting integer by integer division — no further
 *      floating-point arithmetic.
 *
 * Returns [majorUnit, minutes, subunitsOfSecond] where:
 *   - majorUnit   : hours (for RA) or degrees (for Dec)
 *   - minutes     : arcminutes / hours-minutes
 *   - subunits    : arcseconds × subunitFactor (i.e. centiseconds or deciseconds)
 *
 * @param value         Non-negative value in hours (RA) or degrees (Dec).
 * @param subunitFactor 100 for centisecond RA, 10 for decisecond Dec.
 */
function decomposeSexagesimal(
  value: number,
  subunitFactor: number,
): [number, number, number] {
  // Total subunits (centiseconds or deciseconds) as an integer.
  // Math.round handles the floating-point accumulation that would otherwise
  // cause remainders like 59.9999999 to appear instead of 60.
  const totalSubunits = Math.round(value * 3600 * subunitFactor);

  // Integer decomposition — no further floating-point arithmetic.
  const subunitsPerMinute = 60 * subunitFactor;
  const subunitsPerMajor = 60 * subunitsPerMinute;

  const major = Math.floor(totalSubunits / subunitsPerMajor);
  const remAfterMajor = totalSubunits % subunitsPerMajor;
  const minutes = Math.floor(remAfterMajor / subunitsPerMinute);
  const subunits = remAfterMajor % subunitsPerMinute;

  return [major, minutes, subunits];
}

/**
 * Format Right Ascension (decimal degrees, [0, 360)) as sexagesimal
 * hours-minutes-seconds.
 *
 * Astronomical convention: RA is expressed in hours where 24h = 360°,
 * so 1h = 15°. Format: `HHhMMmSS.ssS` — e.g. 188.7365° → "12h34m56.76s".
 *
 * Wraps the input into [0, 360) so values like -10° or 370° still produce
 * a valid sexagesimal string.
 *
 * @param raDeg  Right Ascension in decimal degrees. Any real number — will
 *               be wrapped into [0, 360) before conversion.
 */
export function formatRaSexagesimal(raDeg: number): string {
  // Wrap into [0, 360). The ((x % 360) + 360) % 360 idiom handles both
  // negative values (e.g. -10° → 350°) and values above 360° (e.g. 370° → 10°).
  const wrapped = ((raDeg % 360) + 360) % 360;

  // Convert degrees to hours: 24h = 360°, so divide by 15.
  const totalHours = wrapped / 15;

  // Decompose to centiseconds (subunitFactor = 100).
  const [h, m, centisec] = decomposeSexagesimal(totalHours, 100);

  // centisec is an integer in [0, 5999]; format as SS.ss.
  const secInt = Math.floor(centisec / 100);
  const secFrac = centisec % 100;
  const sFmt = `${pad(secInt, 2)}.${pad(secFrac, 2)}`;

  return `${pad(h, 2)}h${pad(m, 2)}m${sFmt}s`;
}

/**
 * Format Declination (decimal degrees, [-90, 90]) as sexagesimal
 * degrees-minutes-seconds.
 *
 * Format: `±DD°MM'SS.s"` — e.g. 1.396° → "+01°23'45.6\"". The sign is
 * always included (so positive Decs get a leading +). The arcseconds field
 * has one decimal place.
 *
 * Clamps input to [-90, 90] before formatting (asin etc. can produce tiny
 * overshoots due to floating-point arithmetic).
 *
 * @param decDeg  Declination in decimal degrees. Clamped to [-90, 90].
 */
export function formatDecSexagesimal(decDeg: number): string {
  // Clamp to the physically valid range.
  const clamped = Math.max(-90, Math.min(90, decDeg));

  const sign = clamped < 0 ? '-' : '+';
  const abs = Math.abs(clamped);

  // Decompose to deciseconds (subunitFactor = 10).
  const [d, arcMin, decisec] = decomposeSexagesimal(abs, 10);

  // decisec is an integer in [0, 599]; format as SS.s.
  const secInt = Math.floor(decisec / 10);
  const secFrac = decisec % 10;
  const asFmt = `${pad(secInt, 2)}.${secFrac}`;

  return `${sign}${pad(d, 2)}°${pad(arcMin, 2)}'${asFmt}"`;
}

// ─── B. SDSS-style object name ────────────────────────────────────────────────

/**
 * Decompose a non-negative decimal value into integer sexagesimal components
 * using a fixed-point (integer) approach with *truncation* (not rounding).
 *
 * This mirrors `decomposeSexagesimal` but uses `Math.trunc` rather than
 * `Math.round` because SDSS catalog names must be stable: rounding a seconds
 * value up can change the name as measurements are refined, whereas truncation
 * always matches the digits that appear in the catalog.
 *
 * Returns [majorUnit, minutes, subunitsOfSecond] where subunitsOfSecond is
 * an integer in [0, 60 × subunitFactor).
 *
 * @param value         Non-negative value in hours (RA) or degrees (Dec).
 * @param subunitFactor 100 for centisecond RA, 10 for decisecond Dec.
 */
function decomposeSexagesimalTrunc(
  value: number,
  subunitFactor: number,
): [number, number, number] {
  // Convert to total subunits, truncating (flooring) rather than rounding.
  // Math.trunc is used for positive values — equivalent to Math.floor here
  // since value is always ≥ 0 after wrapping/clamping.
  const totalSubunits = Math.trunc(value * 3600 * subunitFactor);

  const subunitsPerMinute = 60 * subunitFactor;
  const subunitsPerMajor = 60 * subunitsPerMinute;

  const major = Math.floor(totalSubunits / subunitsPerMajor);
  const remAfterMajor = totalSubunits % subunitsPerMajor;
  const minutes = Math.floor(remAfterMajor / subunitsPerMinute);
  const subunits = remAfterMajor % subunitsPerMinute;

  return [major, minutes, subunits];
}

/**
 * Construct the IAU-style designation for an SDSS object: "SDSS J<RA><Dec>".
 *
 * The convention truncates (NOT rounds) to specific precision so the name
 * stays stable as catalogs are updated:
 *   - RA:  HHMMSS.ss  (centisecond precision)
 *   - Dec: ±DDMMSS.s  (decisecond precision)
 *
 * Example: ra=188.7365°, dec=+1.396° → "SDSS J123456.76+012345.6"
 *
 * The leading sign on the Dec part is always present.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 *
 * @param raDeg   Right Ascension in decimal degrees. Wrapped into [0, 360).
 * @param decDeg  Declination in decimal degrees. Clamped to [-90, 90].
 */
export function sdssName(raDeg: number, decDeg: number): string {
  // ── RA part ───────────────────────────────────────────────────────────────
  // Wrap into [0, 360) then convert to hours (24h = 360°, so divide by 15).
  const wrappedRa = ((raDeg % 360) + 360) % 360;

  // To avoid floating-point precision loss from dividing by 15 early, we
  // compute total centiseconds-of-time by multiplying degrees × 3600 × 100
  // first, then dividing by 15. Division last minimises accumulated error
  // because 3600 × 100 = 360000 is exact in float64, and the final ÷15 is
  // the only lossy step. For most SDSS coordinates the result is within 0.5
  // of the true integer, so Math.trunc gives the correct truncated digit.
  // Compare: wrappedRa/15 × 3600 × 100 suffers two lossy operations before trunc.
  const raTotalCentisec = Math.trunc(wrappedRa * 3600 * 100 / 15);

  // Decompose with integer division — no further floating-point arithmetic.
  const raH = Math.floor(raTotalCentisec / (60 * 60 * 100));
  const raRemAfterH = raTotalCentisec % (60 * 60 * 100);
  const raM = Math.floor(raRemAfterH / (60 * 100));
  const raCentisec = raRemAfterH % (60 * 100);

  const raSecInt = Math.floor(raCentisec / 100);
  const raSecFrac = raCentisec % 100;
  const raSecFmt = `${pad(raSecInt, 2)}.${pad(raSecFrac, 2)}`;

  const raPart = `${pad(raH, 2)}${pad(raM, 2)}${raSecFmt}`;

  // ── Dec part ──────────────────────────────────────────────────────────────
  const clampedDec = Math.max(-90, Math.min(90, decDeg));
  const decSign = clampedDec < 0 ? '-' : '+';
  const absD = Math.abs(clampedDec);

  // Convert degrees to total deciseconds of arc by truncation (not rounding).
  // 1° = 3600 arcsec = 36000 deciseconds.
  const decTotalDecisec = Math.trunc(absD * 3600 * 10);

  // Integer decompose — no floating-point arithmetic from here.
  const decD = Math.floor(decTotalDecisec / (60 * 60 * 10));
  const decRemAfterD = decTotalDecisec % (60 * 60 * 10);
  const decM = Math.floor(decRemAfterD / (60 * 10));
  const decDecisec = decRemAfterD % (60 * 10);

  const decSecInt = Math.floor(decDecisec / 10);
  const decSecFrac = decDecisec % 10;
  const decSecFmt = `${pad(decSecInt, 2)}.${decSecFrac}`;

  const decPart = `${decSign}${pad(decD, 2)}${pad(decM, 2)}${decSecFmt}`;

  return `SDSS J${raPart}${decPart}`;
}

// ─── C. Cosmological derivations ─────────────────────────────────────────────

/**
 * Lookback time in gigayears (Gyr) — how long ago the light we see now left
 * the source.
 *
 * Approximation: t_L = (z / (1 + z)) × t_H
 *
 * This is exact for a coasting (empty, Ω=0) universe and a good
 * approximation in our concordance ΛCDM model for z ≪ 1. SDSS galaxies are
 * mostly z < 0.3, so the error is under 5%. For z = 0 the function returns 0
 * (no lookback at the present epoch).
 *
 * Reference: Pen 1999 (ApJS 120, 49), eq. 4; also Hogg 1999 (astro-ph/9905116).
 *
 * @param z  Dimensionless redshift. z = 0 → present; z = 1 → light left the
 *           source when the universe was half its current age (in this approximation).
 */
export function lookbackTimeGyr(z: number): number {
  // z / (1 + z) maps [0, ∞) → [0, 1) and gives the exact lookback fraction
  // for an empty universe. Multiplied by the Hubble time it yields a time in Gyr.
  return (z / (1 + z)) * HUBBLE_TIME_GYR;
}

/**
 * Hubble recession velocity in km/s for a given redshift.
 *
 *   v = c × z
 *
 * This is the naïve (non-relativistic) relation, valid at low z. For
 * SDSS spectroscopic galaxies (z < 0.5) the error vs. the relativistic
 * formula is < 25%. At z ≈ 0.1 (the SDSS main galaxy sample peak) the
 * error is only ~5%.
 *
 * Reference: Hubble 1929; see also Harrison 1993 for caveats on interpreting
 * recession "velocity" in an expanding spacetime.
 *
 * @param z  Dimensionless redshift.
 */
export function hubbleVelocityKmS(z: number): number {
  return C_KM_S * z;
}

/**
 * Absolute magnitude in the same photometric band as the supplied apparent
 * magnitude.
 *
 *   M = m − 5·log₁₀(d / 10 pc)
 *     = m − 5·log₁₀(d_Mpc · 10⁶ / 10)
 *     = m − 5·log₁₀(d_Mpc) − 25
 *
 * The −25 arises because 1 Mpc = 10⁶ pc and the distance modulus zero-point
 * is defined at 10 pc: 5·log₁₀(10⁶/10) = 5·log₁₀(10⁵) = 5·5 = 25.
 *
 * Returns NaN if `distanceMpc <= 0` (logarithm undefined).
 *
 * Reference values:
 *   - Sun:                 M_g ≈ +5.1
 *   - Milky Way:           M_g ≈ −20
 *   - Brightest galaxies:  M_g ≈ −23
 *
 * @param apparentMag  Observed (apparent) magnitude.
 * @param distanceMpc  Luminosity distance in megaparsecs. Must be > 0.
 */
export function absoluteMagnitude(
  apparentMag: number,
  distanceMpc: number,
): number {
  if (distanceMpc <= 0) return NaN;
  return apparentMag - 5 * Math.log10(distanceMpc) - 25;
}

// ─── D. Earth-history anchor for lookback time ────────────────────────────────

/**
 * Map a lookback time (in Gyr) to a human-readable Earth-history anchor.
 *
 * The motivation: "1.3 Gyr ago" is hard to fathom; "during Earth's
 * Mesoproterozoic" gives the reader a concrete reference point.
 *
 * The mapping is approximate and educational, not authoritative — the goal is
 * to make cosmic distances feel relatable to a non-technical viewer.
 *
 * Boundary semantics: each band is half-open [lower, upper). A value at
 * exactly a boundary belongs to the *upper* band (the one with the higher
 * lower bound). For example, 0.066 Gyr belongs to "before the dinosaurs
 * went extinct", not "before the first humans".
 *
 * Era boundaries and their approximate sources:
 *   0.001 Gyr = 1 Ma  — earliest writing / agriculture (c. 10,000 BCE)
 *   0.0026 Gyr = 2.6 Ma — earliest Homo habilis fossils
 *   0.066 Gyr = 66 Ma  — Cretaceous–Palaeogene extinction event
 *   0.25  Gyr = 250 Ma — Triassic–Jurassic boundary (first dinosaurs)
 *   0.54  Gyr = 540 Ma — Cambrian explosion onset
 *   1.0   Gyr = 1000 Ma — Mesoproterozoic begins
 *   1.6   Gyr = 1600 Ma — Mesoproterozoic ends / Neoproterozoic begins
 *   2.4   Gyr = 2400 Ma — Great Oxidation Event onset
 *   3.5   Gyr = 3500 Ma — earliest credible microfossils (stromatolites)
 *   4.5   Gyr = 4500 Ma — Earth's approximate formation age
 *   13.7  Gyr — approximate age of the observable universe
 *
 * @param gyrAgo  Lookback time in gigayears. Use `lookbackTimeGyr(z)` to
 *                obtain this from a redshift.
 */
export function earthEraForLookback(gyrAgo: number): string {
  if (gyrAgo < 0.001) return 'essentially now (modern era)';
  if (gyrAgo < 0.0026) return 'during the rise of human civilisation';
  if (gyrAgo < 0.066) return 'before the first humans';
  if (gyrAgo < 0.25) return 'before the dinosaurs went extinct';
  if (gyrAgo < 0.54) return 'before the dinosaurs evolved';
  if (gyrAgo < 1.0) return 'before the Cambrian explosion';
  if (gyrAgo < 1.6) return "during Earth's Mesoproterozoic";
  if (gyrAgo < 2.4) return 'before complex life appeared on Earth';
  if (gyrAgo < 3.5) return "before Earth's atmosphere had oxygen";
  if (gyrAgo < 4.5) return 'near the time the first life emerged on Earth';
  if (gyrAgo < 13.7) return 'before Earth even existed';
  return 'near the dawn of the universe';
}

// ─── E. Galaxy type from colour ───────────────────────────────────────────────

/**
 * Coarse galaxy classification inferred from the u−r colour index.
 *
 * `category` is intended for UI tinting; `description` is human-readable
 * text suitable for display in an info card.
 */
export type GalaxyTypeInfo = {
  /** Coarse classification — for UI tinting. */
  category: 'red' | 'blue' | 'unknown';
  /** Human-readable description, e.g. "Red, quiescent galaxy". */
  description: string;
};

/**
 * Heuristic galaxy classification from the u−r colour index.
 *
 * The "red sequence" / "blue cloud" bimodality is a well-known feature of
 * galaxy colour distributions in u−r space:
 *   - u − r > 2.2  → red, quiescent (likely elliptical or S0; dominated by
 *                     old, red stellar populations with low star-formation rate)
 *   - u − r ≤ 2.2  → blue, star-forming (likely spiral or irregular; young,
 *                     hot O/B stars shift the integrated colour blueward)
 *
 * The threshold 2.2 is the canonical value from Strateva et al. 2001 for
 * separating early- and late-type galaxies in SDSS u−r colour.
 *
 * Returns 'unknown' when `uMinusR` is NaN (e.g. missing or flagged
 * photometry in the catalog).
 *
 * References:
 *   Strateva et al. 2001, AJ 122, 1861.
 *   Baldry et al. 2004, ApJ 600, 681.
 *
 * @param uMinusR  SDSS u-band minus r-band magnitude difference. Higher
 *                 values indicate redder integrated stellar populations.
 */
export function galaxyTypeFromColor(uMinusR: number): GalaxyTypeInfo {
  // NaN comparison is always false in JS, so an explicit isNaN check is the
  // clearest way to handle missing photometry.
  if (Number.isNaN(uMinusR)) {
    return { category: 'unknown', description: 'Unknown type (missing photometry)' };
  }

  // Threshold from Strateva et al. 2001.
  if (uMinusR > 2.2) {
    return {
      category: 'red',
      description: 'Red, quiescent galaxy (likely elliptical or lenticular)',
    };
  }

  return {
    category: 'blue',
    description: 'Blue, star-forming galaxy (likely spiral or irregular)',
  };
}

// ─── F. SDSS external URLs ────────────────────────────────────────────────────

/**
 * Build the URL of the SDSS Quick Look page for an object.
 *
 * Opens a web page showing an image cutout, photometric measurements, and
 * links to the spectrum.
 *
 * `objID` is a 64-bit unsigned integer. We accept `bigint` here to preserve
 * full precision — SDSS objIDs are 18-digit numbers that exceed Number's
 * safe integer limit (2⁵³ ≈ 9 × 10¹⁵), so passing them as `number` would
 * silently truncate the last few digits and retrieve the wrong object.
 *
 * URL template (DR18):
 *   http://skyserver.sdss.org/dr18/VisualTools/quickobj?objId={objId}
 *
 * @param objId  The SDSS 64-bit object identifier as a bigint.
 */
export function sdssExplorerUrl(objId: bigint): string {
  return `http://skyserver.sdss.org/dr18/VisualTools/quickobj?objId=${objId}`;
}

/**
 * Build the URL of an SDSS image cutout — a square JPEG centred on the
 * given sky coordinates.
 *
 * The cutout service is hot-link friendly (no auth required, no CORS issues
 * for `<img>` tags). Pixel scale is fixed at 0.4 arcsec/pixel, which
 * matches the native SDSS imaging resolution.
 *
 * `sizePx` is clamped to [32, 2048] per the DR18 ImgCutout service limits.
 * The default of 160 gives a comfortable thumbnail without a large download.
 *
 * URL template (DR18):
 *   http://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg
 *     ?ra={ra}&dec={dec}&scale=0.4&width={size}&height={size}
 *
 * @param raDeg   Right Ascension of the centre, in decimal degrees.
 * @param decDeg  Declination of the centre, in decimal degrees.
 * @param sizePx  Width and height of the cutout in pixels. Default 160.
 *                Clamped to [32, 2048].
 */
export function sdssThumbnailUrl(
  raDeg: number,
  decDeg: number,
  sizePx = 160,
): string {
  // Clamp to the service-documented pixel limits.
  const size = Math.max(32, Math.min(2048, sizePx));
  return (
    `http://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg` +
    `?ra=${raDeg}&dec=${decDeg}&scale=0.4&width=${size}&height=${size}`
  );
}
