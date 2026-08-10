/**
 * GalaxyCatalog — the single renderer-ready data shape shared by the synthetic
 * generator, the .bin loader, and the GPU upload path. Uses a struct-of-arrays
 * layout so each typed array can be passed straight to `writeBuffer`.
 */

/**
 * A galaxy catalog in renderer-ready layout — a "struct of arrays" rather than
 * an array of objects.
 *
 * Why SoA? Two reasons:
 *   1. Float32Array (and BigUint64Array) map directly onto GPU buffers via
 *      `device.queue.writeBuffer`, no per-galaxy object allocation or copy work.
 *   2. CPUs and GPUs both prefer contiguous typed memory; a million `{x,y,z}`
 *      JS objects would blow up the heap and stall on garbage collection.
 *
 * Why separate arrays per magnitude band rather than a single 2D array?
 *   Typed-array views are the cheapest path to the GPU: we can pass each
 *   band's Float32Array straight to `writeBuffer` without any per-frame
 *   restructuring. A 2D array or interleaved layout would require a copy (or
 *   a non-trivial strided upload) every time we change which band to display.
 *
 * All distance units are megaparsecs (Mpc) — the natural unit at SDSS scales.
 * 1 Mpc ≈ 3.26 million light-years.
 */
export type GalaxyCatalog = {
  /** Number of galaxies. All typed arrays below derive their length from this. */
  count: number;

  /**
   * SDSS object identifiers — length === count.
   *
   * SDSS objIDs are 64-bit unsigned integers that encode the sky tile,
   * run/rerun/camcol/field, and object number. They are used to construct
   * image-cutout and Explorer URLs. We store them as `BigUint64Array` because
   * JavaScript's `number` type is a 64-bit float and can only represent
   * integers exactly up to 2^53 — SDSS objIDs regularly exceed that.
   *
   * For synthetic data `objIDs[i] = BigInt(i)` (sequential 0..N-1); those
   * values won't resolve to real SDSS images, but the field is always present
   * so the renderer code path is uniform.
   */
  objIDs: BigUint64Array;

  /**
   * Interleaved xyz coordinates in Mpc — length === count * 3.
   * Layout: [x0, y0, z0, x1, y1, z1, ...].
   */
  positions: Float32Array;

  /**
   * SDSS u-band (ultraviolet) model magnitude per galaxy — length === count.
   *
   * Astronomical magnitude is a logarithmic, *inverted* brightness scale:
   * smaller numbers = brighter objects. Combined with magG, the u−g color
   * index indicates star-forming (blue, low u−g) vs. quiescent (red, high u−g)
   * galaxies.
   */
  magU: Float32Array;

  /**
   * SDSS g-band (green) model magnitude per galaxy — length === count.
   *
   * The g-band is the primary brightness indicator used by the renderer.
   * Range in the SDSS main sample is roughly 14 (brightest) to 22 (faintest).
   */
  magG: Float32Array;

  /**
   * SDSS r-band (red) model magnitude per galaxy — length === count.
   *
   * Typically ≈0.3–1.3 mag fainter than g (i.e. numerically smaller than g
   * since magnitudes are inverted). Used for future multi-band color analysis.
   */
  magR: Float32Array;

  /**
   * SDSS i-band (near-infrared) model magnitude per galaxy — length === count.
   *
   * Typically ≈0.0–0.6 mag fainter than r. Useful for stellar population
   * diagnostics at low redshift.
   */
  magI: Float32Array;

  /**
   * SDSS z-band (far near-infrared) model magnitude per galaxy — length === count.
   *
   * Typically ≈0.0–0.4 mag fainter than i. The reddest of the five standard
   * SDSS photometric bands.
   */
  magZ: Float32Array;

  /**
   * Per-galaxy axis ratio b/a — length === count.
   *
   * The minor-to-major axis ratio of the galaxy's elliptical isophote on the
   * sky, in [0, 1]. A value near 1 means a face-on disk or round elliptical;
   * a value near 0 means an edge-on disk seen as a thin sliver. Combined with
   * `positionAngleDeg`, this drives the on-screen orientation of the disk
   * billboards introduced in the galaxy-orientation-disks plan.
   *
   * NaN is a legitimate sentinel meaning "no measurement available". The
   * build pipeline normally fills every entry — either with a real
   * cross-matched value, or with a deterministic fallback — but the binary
   * format itself preserves NaN faithfully so the encoder/decoder remain
   * pure and unit-testable independent of how the catalog was populated.
   */
  axisRatio: Float32Array;

  /**
   * Per-galaxy position angle in degrees — length === count.
   *
   * Astronomical convention: measured east of north on the sky, in the range
   * [0, 180). This is the orientation of the major axis of the galaxy's
   * isophote. Pairs with `axisRatio` to define the projected disk shape.
   *
   * NaN means "no measurement available" — same semantics as `axisRatio`.
   */
  positionAngleDeg: Float32Array;

  /**
   * Per-galaxy physical diameter in kiloparsecs — length === count.
   *
   * Drives the renderer's apparent-size math, the thumbnail quad's
   * world-space footprint, the 3D disk plane's geometry, and the focus
   * tween distance.  The build pipeline guarantees every entry is a
   * finite, positive value: real catalog measurement when the parser
   * supplied one, otherwise DEFAULT_GALAXY_DIAMETER_KPC = 30.
   *
   * Unlike `axisRatio`/`positionAngleDeg`, NaN is never a legitimate
   * decoded value here — the renderer multiplies and divides by this
   * field every frame and a NaN would turn the entire billboard black.
   * The encoder still preserves NaN bit-for-bit (it's a pure function
   * of the input catalog), but the pipeline never produces a NaN entry.
   */
  diameterKpc: Float32Array;

  /**
   * Per-record source-interpreted classification byte — length === count.
   *
   * The byte's meaning depends on which `Source` this catalog belongs
   * to: for `Source.Milliquas` it encodes the AGN class letter
   * (1=Q, 2=A, 3=B, 4=K, 5=N, 6=S), for every other source it is
   * always 0 ("unclassified") today.  Future morphology work on
   * SDSS or GLADE can re-use the same slot with a different lookup
   * table — the lookup helper `sourceClassLabel(source, byte)` in
   * `src/data/sourceClass.ts` is the single dispatch site.
   *
   * Stored as `Uint8Array` because the on-disk format gives each
   * record exactly one byte for this field (see
   * `galaxyCatalogFormat.ts` v5 layout).  Zero is a legal "no class
   * known" value for every source, so the typed array's default
   * zero-fill is the correct empty state.
   */
  classByte: Uint8Array;

  /**
   * Per-galaxy spectroscopic redshift z — length === count.
   *
   * Carries the *catalogued* redshift, NOT the value implied by the
   * stored 3-D position. The two diverge for galaxies inside ~30 Mpc
   * where the build pipeline overrides the cz-derived position with a
   * Cosmicflows-4 (or HyperLEDA `mod0`) measured distance — see
   * docs/superpowers/specs/2026-05-27-local-volume-distances.md.
   *
   * For rows that DON'T get the local-volume override, `spectroscopicZ`
   * equals the redshift used to derive the position (modulo float32
   * precision), so the InfoCard's "Redshift z" line and the rendered
   * point's distance remain self-consistent.
   *
   * Negative values are legal and preserved: the ~25 nearby galaxies
   * with peculiar-velocity-dominated blueshifts (M31, M86, etc.) really
   * do have z < 0 in their original catalogs, and the InfoCard shows
   * the catalog value rather than the linear-sign-mirrored
   * position-derived approximation.
   *
   * NaN is the "no spectroscopic measurement" sentinel — used for
   * Famous Galaxy records that have a measured distance but no
   * published spectroscopic redshift (rare; mostly Local Group dwarfs).
   * Consumers fall back to the cartesian-derived value in that case.
   */
  spectroscopicZ: Float32Array;

  /**
   * Per-record parent-survey enum byte — length === count.
   *
   * Only meaningful for `Source.Milliquas` rows: Milliquas Names are
   * almost always shaped `"<PARENT_SURVEY> J<RA><Dec>"`, where
   * PARENT_SURVEY is one of a small fixed set (SDSS, 2MASX, GAIA,
   * WISEA, NVSS, FIRST, 6dFGS).  At parse time we detect the prefix
   * and write the matching enum value here so the InfoCard can
   * reconstruct the historical display name at hover time by
   * combining the prefix lookup with `iauRaDecSuffix(ra, dec)`.
   *
   * `0` means "no recognised parent-survey prefix" (literature
   * designation like `3C 273` or `M 87`); the InfoCard falls back to
   * the generic `MQ J<RA><Dec>` IAU name in that case.
   *
   * For every non-Milliquas source the build pipeline writes `0` and
   * `milliquasParentSurveyPrefix(byte)` returns `null`.
   */
  parentSurveyByte: Uint8Array;

  /**
   * Per-catalog MEDIAN absolute magnitude — the surface-brightness
   * zero-point `galaxySbAmp` normalises against (see
   * `utils/galaxy/galaxySbAmp.ts` and `utils/galaxy/galaxyMedianAbsMag.ts`).
   *
   * Populated by every runtime construction path: `decodeGalaxyCatalog`,
   * `generateSyntheticCloud`, `emptyGalaxyCatalog`, and
   * `cloneGalaxyCatalogForTransfer`. Optional ONLY so lightweight test
   * fixtures may omit it — consumers that need a value fall back
   * themselves (the point bake recomputes via `galaxyMedianAbsMag`; the
   * disk planner falls back to -20.5).
   *
   * Derived, NOT stored in the `.bin` — `decodeGalaxyCatalog` recomputes
   * it from the decoded `magG` + `positions` on every load, so the field
   * costs no binary format version.
   */
  medianAbsMag?: number;

  /**
   * Per-galaxy "orientation is a deterministic fallback" flag — length ===
   * count. 1 means the (axisRatio, positionAngleDeg) pair was synthesised by
   * `fallbackOrientation(objID, ra, dec)` because the source catalog had no
   * measured axis-ratio / position-angle; 0 means the pair is a real
   * measurement (or a sentinel like NaN for synthetic clouds).
   *
   * This is the AUTHORITATIVE provenance signal, stamped at build time in
   * `recordsToCloud` where the real-vs-fallback decision is actually made,
   * and persisted verbatim through the .bin. Consumers (the sign-bit pack in
   * `buildPointInterleavedBuffer`, the InfoCard's "measured vs estimated"
   * chip via `extractGalaxyRow`) read it directly.
   *
   * Why a persisted byte rather than recomputing? The old load side inferred
   * the flag by re-hashing `fallbackOrientation` from the baked f32 cartesian
   * position and comparing floats for exact equality. That round-trip is lossy
   * — the position is stored as f32, `cartesianToRaDec` re-derives (ra, dec),
   * and the hash buckets `ra` at `Math.round(ra * 1e5)` — so ~10% of true
   * fallback rows failed the equality check and were misclassified as real.
   * One byte per row makes the build-side truth survive to the load side
   * exactly, no reconstruction.
   */
  orientationIsFallback: Uint8Array;

  /**
   * Per-galaxy "diameter is the flat fallback" flag — length === count. 1
   * means `diameterKpc[i]` is the project-wide DEFAULT_GALAXY_DIAMETER_KPC =
   * 30 default, applied because the parser had NO real measured size AND no
   * angular size to re-derive a physical diameter from; 0 means the row's
   * diameter is a real catalog measurement, an angular-derived value, or a
   * synthetic / famous-curated size.
   *
   * This is the AUTHORITATIVE persisted provenance signal, stamped at build
   * time in `recordsToCloud` on the exact `diameterKpc === null` distinction
   * that decides the fallback, and carried verbatim through the .bin. It
   * replaces the old lossy `diameterKpc === 30` compare the InfoCard used to
   * guess provenance — a real 30-kpc measurement is indistinguishable from
   * the fallback under that comparison, so the persisted byte is the only
   * exact signal.
   */
  diameterIsFallback: Uint8Array;

  /**
   * log₁₀(M★/M☉), photometric stellar-mass estimate — length === count.
   * NaN means no estimate. Every v9 mass is photometric (build-time,
   * `estimateLog10StellarMass`); the on-disk "mass-is-estimated" flag bit is
   * derived from `Number.isFinite` rather than a stored column, so this
   * field alone carries presence.
   *
   * Do NOT confuse with `StructureCatalog.significance`: that field is a
   * LINEAR mass proxy (M500 in solar masses, ~10¹⁴) for clusters/super-
   * clusters, not a log stellar mass, and the two are never comparable.
   */
  log10StellarMass: Float32Array;
};
