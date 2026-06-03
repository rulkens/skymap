/**
 * galaxyInfoBuilder — pure helpers for turning raw catalog arrays into a
 * `GalaxyInfo` value the React layer can render.
 *
 * Three things live here:
 *
 *   - `buildGalaxyInfo(cloud, idx)` — the only place in the engine that knows
 *     how to turn a (cloud, index) pair into a fully-derived `GalaxyInfo`.
 *     Concentrating the data → display path in one function makes the trig
 *     and physics math easy to trace and unit-test.
 *   - `maxAbsCoord(cloud)` — bounding-box heuristic used at startup to frame
 *     the camera around whichever cloud loaded.
 *   - `niceRound(x)` — axis-ticker style "round down to {1,2,5}×10^k" used by
 *     the scale-bar legend.
 *
 * All three functions are pure (no mutation, no I/O) which makes them easy
 * to test in isolation and means they don't need engine state threaded in.
 */

import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { sourceClassLabel, milliquasParentSurveyPrefix } from '../../../data/sourceClass';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import { famousDisplayName } from './famousDisplayName';
import { fallbackOrientation } from '../../../utils/random/fallbackOrientation';
import type { SourceType } from '../../../@types/data/SourceType';
import {
  cartesianToRaDecZ,
  formatRaSexagesimal,
  formatDecSexagesimal,
  iauName,
  iauRaDecSuffix,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyType,
  sdssExplorerUrl,
  sdssThumbnailUrl,
  dssThumbnailUrl,
  galaxyThumbnailFovArcmin,
  nedByNameUrl,
  nedNearPositionUrl,
  DEFAULT_GALAXY_DIAMETER_KPC,
} from '../../../utils/math';

/**
 * Return the maximum absolute value of any coordinate component in the cloud's
 * positions array.
 *
 * We use *max abs of any component* rather than computing a true bounding
 * radius (which would require a sqrt per point). For camera-distance purposes
 * this is a heuristic — slightly over-estimating is harmless — and avoiding
 * sqrt keeps this O(N) scan as cheap as possible.
 *
 * The result is used to auto-frame the camera so any cloud (real SDSS or
 * synthetic sphere) is comfortably visible regardless of its spatial extent.
 */
export function maxAbsCoord(cloud: GalaxyCatalog): number {
  let m = 0;
  for (let i = 0; i < cloud.positions.length; i++) {
    const v = Math.abs(cloud.positions[i]!);
    if (v > m) m = v;
  }
  return m;
}

/**
 * Round `x` down to the nearest "nice" number from the {1, 2, 5} × 10^k family.
 *
 * This is the same rounding scheme used by axis tickers in plotting libraries
 * (matplotlib's MaxNLocator, d3's ticks(), etc.). Given any positive real, it
 * returns the largest "round" value ≤ x where round means the mantissa is one
 * of 1, 2, or 5. Examples:
 *
 *     niceRound(  3.7) →   2     (3.7 → mantissa 3.7 → rounds down to 2)
 *     niceRound( 47)   →  20     (47 → 4.7 × 10¹ → 2 × 10¹)
 *     niceRound(800)   → 500     (800 → 8 × 10² → 5 × 10²)
 *     niceRound(  0.07)→   0.05  (0.07 → 7 × 10⁻² → 5 × 10⁻²)
 *
 * Why floor (not nearest)? For a scale bar we want the *bar to fit inside* the
 * desired pixel target, never overflow it. Rounding down to the nice value
 * below the target guarantees the rendered bar is ≤ targetPx.
 */
export function niceRound(x: number): number {
  if (x <= 0) return 0;
  const exp = Math.floor(Math.log10(x));
  const power = Math.pow(10, exp);
  const mantissa = x / power; // ∈ [1, 10)
  const niceMantissa = mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1;
  return niceMantissa * power;
}

/**
 * Build a `GalaxyInfo` value from raw cloud arrays for the given index.
 *
 * This is the only place in the engine that touches `cartesianToRaDecZ` and
 * the physics helpers — the React components receive the computed result and
 * never import data modules directly.  The computation is intentionally
 * concentrated here so the data→display path is easy to trace and test.
 *
 * The function is called at most once per hover/select event (not per frame),
 * so the modest cost of the trig + physics math is not on the hot path.
 *
 * The `source` parameter is required because the picker resolves a global
 * instance ID into a (source, localIdx) pair *before* calling us — the cloud
 * itself doesn't carry its own source tag (every point in a cloud shares it,
 * so storing it per-point would be wasteful).  We pipe it through here so we
 * can decide which thumbnail service to use and whether an SDSS Explorer
 * link makes sense.
 *
 * The optional `famousMeta` argument is the sidecar loaded at engine startup
 * by the `famousMeta` AssetSlot (`famousMetaFetcher`).  It is only consulted
 * when `source === Source.Famous`, so passing it for SDSS / 2MRS / GLADE rows
 * is harmless.  If the sidecar hasn't arrived yet (fetch still in flight when
 * the user first hovers a famous galaxy), the arg will be empty / undefined
 * and we silently omit the `famous` block — the InfoCard falls back to its
 * generic layout until the next hover triggers a rebuild.
 */
export function buildGalaxyInfo(
  cloud: GalaxyCatalog,
  idx: number,
  source: SourceType,
  famousMeta?: readonly FamousMetaEntry[],
): GalaxyInfo {
  const px = cloud.positions[idx * 3 + 0]!;
  const py = cloud.positions[idx * 3 + 1]!;
  const pz = cloud.positions[idx * 3 + 2]!;

  // Recover sky coordinates from the Cartesian position stored in the cloud.
  // cartesianToRaDecZ inverts the Hubble-law conversion used at import time.
  // We deliberately discard its `z` channel: for local-volume galaxies the
  // build pipeline replaced position with a CF4 / HyperLEDA measured distance,
  // and inverting that distance back to a Hubble z gives a wrong-signed
  // nonsense value (e.g. M31 at 0.78 Mpc would read +0.00018, not the
  // catalogued −0.001). The catalogued spec-z lives on `cloud.spectroscopicZ`.
  const [ra, dec, fallbackRedshift] = cartesianToRaDecZ(px, py, pz);
  const storedZ = cloud.spectroscopicZ[idx]!;
  // NaN is the documented "no published spec-z" sentinel (Famous-galaxy
  // distance-only rows) — fall back to the cartesian-derived value so the
  // InfoCard never shows NaN to the user. For every other row the stored
  // and fallback values agree modulo float32 precision; the local-volume
  // override is the only place they diverge meaningfully.
  const redshift = Number.isFinite(storedZ) ? storedZ : fallbackRedshift;

  // Euclidean distance in Mpc — same as the comoving distance under Hubble's law.
  const distanceMpc = Math.sqrt(px * px + py * py + pz * pz);

  // Pull all five photometric bands.  The `!` non-null assertions are safe here
  // because all mag arrays are guaranteed to have `count` elements (enforced by
  // the decoder and generator), and idx is always a valid pick result in [0, count).
  const magU = cloud.magU[idx]!;
  const magG = cloud.magG[idx]!;
  const magR = cloud.magR[idx]!;
  const magI = cloud.magI[idx]!;
  const magZ = cloud.magZ[idx]!;

  // Galaxy-type classification dispatches by source: SDSS / Synthetic still
  // use the canonical u−r red-sequence / blue-cloud split (Strateva et al.
  // 2001), GLADE switches to B−J, and 2MRS uses J−K.  Each survey's
  // classifier returns the same GalaxyTypeInfo shape so the InfoCard
  // renders "Red, quiescent" / "Blue, star-forming" / etc. uniformly
  // regardless of which colour pair fed the decision.

  // ── Band labels + colour pairs ─────────────────────────────────────────────
  //
  // Look up which actual photometric bands occupy each mag slot for this
  // source, then build the list of colour indices that make sense given
  // those bands.  Non-SDSS surveys don't carry u-band, so the canonical
  // u−g colour is replaced with whatever bluest-band colour they DO have
  // (e.g. B−J for GLADE).  Slots marked '—' are skipped.
  //
  // The `colours` array is what the InfoCard renders in its "Colour" row;
  // pre-computing it here keeps the React layer presentational and avoids
  // sprinkling per-source band-pair logic throughout the components.
  // Only survey rows carry photometry. The picker only routes survey
  // sources into the points pipeline, so any other kind (POI, filament,
  // volume) reaching here is a bug upstream.
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey') {
    throw new Error(`buildGalaxyInfo: non-survey source ${source} has no photometric bands`);
  }
  const bands = entry.bandLabels;

  // Available pairs in adjacent-slot order: each entry pairs the label and
  // value only if BOTH constituent bands are real (not '—') AND the
  // computed difference is finite.  Adjacent-slot pairs (u−g, g−r, r−i, i−z)
  // are the standard convention because adjacent SED bands give the most
  // information per colour — non-adjacent pairs (u−r etc.) are less common
  // and not needed to characterise galaxy type.
  const candidatePairs: Array<[keyof typeof bands, keyof typeof bands, number]> = [
    ['u', 'g', magU - magG],
    ['g', 'r', magG - magR],
    ['r', 'i', magR - magI],
    ['i', 'z', magI - magZ],
  ];
  const colours: Array<{ label: string; value: number }> = [];
  for (const [a, b, value] of candidatePairs) {
    if (bands[a] === '—' || bands[b] === '—') continue;
    if (!Number.isFinite(value)) continue;
    colours.push({ label: `${bands[a]}−${bands[b]}`, value });
  }

  // ── Per-source link / thumbnail wiring ─────────────────────────────────────
  //
  // SDSS galaxies get the proper SDSS DR18 ImgCutout (sharper, deeper, and the
  // same data the SDSS Explorer page itself uses).  Everything else (2MRS,
  // GLADE, Synthetic) falls back to the all-sky DSS service so we never
  // request blank frames from regions SDSS didn't observe.
  //
  // ── External catalogue URL ────────────────────────────────────────────────
  //
  // Pick a per-source target so every real galaxy gets a useful link:
  //
  //   - SDSS rows with a valid objID → SDSS DR18 Quick Look (skyserver),
  //     which shows the same image-cutout + photometry + spectrum the
  //     thumbnail pass already pulls from.
  //   - 2MRS rows → NED byname lookup using the runtime-formatted
  //     `2MASX J<RA><Dec>` designation (`iauName` produces it for free
  //     from coords).  NED resolves these directly to the object page.
  //   - GLADE rows with a real PGC → NED byname `PGC <n>`.  The PGC is
  //     persisted in the SDSS-shaped `objID` slot — see the comment in
  //     `tools/parsers/glade.ts` for why the slot is safe to repurpose.
  //   - GLADE rows with no PGC (the source line had a sentinel) → NED
  //     near-position search at the row's RA/Dec.  The user lands on a
  //     short results table sorted by distance to the search centre and
  //     clicks through; one extra click vs. a direct hit, but always
  //     resolves to *some* page that describes the row.
  //   - Famous rows → NED byname using the curated primary name (M31,
  //     NGC 224, …).  The famous-block in the InfoCard previously
  //     inlined the same URL; now the field is centralised here so
  //     every renderer of the card sees a consistent value.
  //   - Synthetic rows → null.  The coords are randomly drawn and
  //     don't correspond to any real object, so a real-catalogue link
  //     would be misleading.
  //
  // Why route everything through NED rather than HyperLEDA / SIMBAD?
  // Coverage.  NED indexes the deep WISE / 2MASS layers that GLADE
  // rides on top of, including faint distant galaxies that drop out
  // of HyperLEDA's PGC-only database.  Verified empirically.
  const isSdss = source === Source.SDSS;
  const objID = cloud.objIDs[idx]!;
  // Single source of truth for "is this a famous row with loaded metadata?":
  // the catalogue link, the curated thumbnail, and the famous block below all
  // key off the same entry.  Undefined for non-famous rows or before the
  // sidecar resolves (the InfoCard then renders the generic survey layout).
  const famousEntry = source === Source.Famous && famousMeta ? famousMeta[idx] : undefined;
  let catalogUrl: string | null;
  if (isSdss && objID > 0n) {
    catalogUrl = sdssExplorerUrl(objID);
  } else if (source === Source.TwoMRS) {
    // 2MRS rows are routed through NED's near-position search rather
    // than a 2MASX byname lookup.  Reason: NED's name index has
    // coverage gaps for the 2MASX prefix — verified empirically against
    // NED's `srs/ObjectLookup` JSON endpoint, where many real 2MRS
    // rows return `ResultCode: 2 — Unknown name` even though the
    // underlying object is present in NED under a different catalogue
    // name (PGC, MCG, IRAS, …).  A position search finds the object
    // regardless of which name NED indexes it under; the one-extra-
    // click on the results page is preferable to a "not recognized"
    // dead-end.
    catalogUrl = nedNearPositionUrl(ra, dec);
  } else if (source === Source.Glade) {
    catalogUrl = objID > 0n ? nedByNameUrl(`PGC ${objID}`) : nedNearPositionUrl(ra, dec);
  } else if (famousEntry) {
    catalogUrl = nedByNameUrl(famousEntry.names[0]!);
  } else if (source === Source.SDSS) {
    // SDSS row with objID = 0n (synthetic-style test fixture).  Falling
    // back to coord search keeps the link non-null in tests so the UI
    // path is exercised, while pointing somewhere real-ish.
    catalogUrl = nedNearPositionUrl(ra, dec);
  } else {
    catalogUrl = null;
  }
  // Size the cutout to the galaxy's angular extent so a nearby giant and a
  // distant dwarf both roughly fill the frame, instead of a fixed FOV that
  // crops the former and shrinks the latter.
  const fovArcmin = galaxyThumbnailFovArcmin(cloud.diameterKpc[idx]!, distanceMpc);
  const surveyThumbnailUrl = isSdss
    ? sdssThumbnailUrl(ra, dec, 200, fovArcmin)
    : dssThumbnailUrl(ra, dec, fovArcmin);
  // Famous galaxies have a curated, non-deprojected tile committed at
  // /images/famous-thumb/<id>.webp — prefer it, since the survey cutout is
  // generic and lower quality.  The survey cutout becomes the fallback for the
  // few famous rows whose source couldn't be re-fetched (no curated tile);
  // Thumbnail swaps to it on the curated tile's 404.
  const thumbnailUrl = famousEntry
    ? `/images/famous-thumb/${famousEntry.id}.webp`
    : surveyThumbnailUrl;
  const thumbnailFallbackUrl = famousEntry ? surveyThumbnailUrl : undefined;

  // ── Orientation provenance recovery ────────────────────────────────────────
  //
  // Detect orientation provenance by replaying the deterministic fallback
  // for this row and comparing to the stored value. If they match exactly
  // (down to the float bits — the build pipeline writes the same f32 that
  // we re-compute here), the row is a fallback; otherwise it's real.
  //
  // Why a runtime replay instead of an explicit per-row provenance flag in
  // the binary? Storing a one-byte source tag per galaxy would inflate every
  // .bin and force a format-version bump for what is purely UI metadata.
  // The fallback is deterministic and cheap, so we re-derive provenance only
  // when the user actually opens an InfoCard (hover / click), not per frame.
  //
  // Float32 round-trip: the bin stores f32, but `fallbackOrientation` returns
  // f64 numbers. Encoding through `Float32Array` truncates to the same bit
  // pattern the build pipeline wrote, so `===` is the right comparison.
  const ar = cloud.axisRatio[idx]!;
  const pa = cloud.positionAngleDeg[idx]!;
  const fb = fallbackOrientation(cloud.objIDs[idx]!, ra, dec);
  const fbAr = new Float32Array([fb.axisRatio])[0]!;
  const fbPa = new Float32Array([fb.positionAngleDeg])[0]!;
  const isFallback = ar === fbAr && pa === fbPa;
  let provenance: string;
  if (isFallback) {
    provenance = 'deterministic fallback';
  } else if (source === Source.SDSS) {
    provenance = 'SDSS exp+deV blend';
  } else if (source === Source.TwoMRS) {
    provenance = '2MASS XSC sup_phi';
  } else if (source === Source.Glade) {
    provenance = 'HyperLEDA PGC';
  } else {
    provenance = 'deterministic fallback';
  }

  // ── Diameter provenance ────────────────────────────────────────────────────
  //
  // The cloud's diameterKpc is always finite (build pipeline guarantee), but
  // we can't recover *which* parser produced it from the float alone. The
  // best we can do without a per-row provenance flag in the binary format is
  // a per-source hint: when the value equals exactly DEFAULT_GALAXY_DIAMETER_KPC
  // it's certainly the build-pipeline fallback; otherwise we credit the source
  // catalog's known size column.  This isn't perfect (a 2MRS row whose Riso
  // happens to round to exactly 30 kpc would be miscredited as fallback), but
  // it's good enough for an InfoCard chip that's primarily a "real or
  // estimated?" hint.
  const dKpc = cloud.diameterKpc[idx]!;
  let diameterProvenance: string;
  if (dKpc === DEFAULT_GALAXY_DIAMETER_KPC) {
    diameterProvenance = 'fallback (30 kpc)';
  } else if (source === Source.SDSS) {
    diameterProvenance = 'SDSS petroR50_r';
  } else if (source === Source.TwoMRS) {
    diameterProvenance = '2MRS Riso';
  } else if (source === Source.Glade) {
    diameterProvenance = 'GLADE Tully';
  } else {
    diameterProvenance = 'fallback (30 kpc)';
  }

  // ── Per-record metadata bytes (v5 format) ──────────────────────────────────
  //
  // Both bytes are zero-default across every non-Milliquas source;
  // sourceClassLabel + milliquasParentSurveyPrefix gate on `source`
  // internally so it's safe to read them unconditionally here.
  const classByte = cloud.classByte[idx]!;
  const parentSurveyByte = cloud.parentSurveyByte[idx]!;
  const agnClass = sourceClassLabel(source, classByte) ?? undefined;
  const parentSurveyPrefix = milliquasParentSurveyPrefix(parentSurveyByte);

  // Milliquas "<PARENT> J<RA><Dec>" reconstruction.  When the bin
  // carries a recognised parent-survey byte (the vast majority of
  // Milliquas rows), produce the historical display name without a
  // JSON sidecar; otherwise leave the field undefined and let the
  // displayName ladder fall through to the IAU "MQ J…" fallback.
  //
  // The J-suffix here is recomputed from the row's stored RA/Dec
  // floats via the shared `iauRaDecSuffix` emitter, so it may differ
  // in the least-significant digits from the upstream catalogue's
  // original Name column (different rounding/truncation of slightly
  // different coord measurements).  The prefix half always matches.
  const milliquasDisplayName =
    source === Source.Milliquas && parentSurveyPrefix !== null
      ? `${parentSurveyPrefix} ${iauRaDecSuffix(ra, dec)}`
      : undefined;

  // ── Famous-galaxy enrichment ───────────────────────────────────────────────
  //
  // Look up the curated sidecar metadata only for Famous rows.  For every other
  // source this block is a no-op: we never index into `famousMeta` and the
  // returned `GalaxyInfo` carries no `famous` key, which is exactly what the
  // InfoCard expects for a plain survey row.
  //
  // Graceful degradation: if the sidecar fetch hasn't resolved yet (empty
  // arrays / undefined), `famousMeta[idx]` is undefined and we skip the block
  // entirely — the InfoCard renders the generic layout on that hover, and the
  // next hover (after sidecars land) will produce the full block.
  let famous: GalaxyInfo['famous'];
  if (famousEntry) {
    famous = {
      id: famousEntry.id,
      ...(famousEntry.commonName !== undefined ? { commonName: famousEntry.commonName } : {}),
      names: famousEntry.names,
      description: famousEntry.description,
      type: famousEntry.type,
    };
  }

  return {
    index: idx,
    objID: cloud.objIDs[idx]!,

    // World-space coordinates — copied so the React layer can pass them
    // straight into engine.focusOn() without redoing the trig.
    x: px,
    y: py,
    z: pz,

    // Sky coordinates — both decimal and pre-formatted sexagesimal strings.
    ra,
    dec,
    raSexagesimal: formatRaSexagesimal(ra),
    decSexagesimal: formatDecSexagesimal(dec),

    // Cosmology derived from the recovered redshift and distance.
    redshift,
    distanceMpc,
    hubbleVelocityKmS: hubbleVelocityKmS(redshift),
    lookbackGyr: lookbackTimeGyr(redshift),
    earthEra: earthEraForLookback(lookbackTimeGyr(redshift)),

    // Five-band photometry — raw values, let the UI format them.
    magU,
    magG,
    magR,
    magI,
    magZ,

    // Derived quantities.
    absoluteMagG: absoluteMagnitude(magG, distanceMpc),
    galaxyType: galaxyType(source, { magU, magG, magR, magI, magZ }),
    iauName: iauName(source, ra, dec),

    // Best human-readable headline for this row.  Treats the choice
    // as a priority-ordered list of candidates with a single "first
    // non-empty wins" selection rule (matching `famousDisplayName`'s
    // strategy, just with extra survey-row candidates appended):
    //
    //   1. Famous → curated `commonName` then `names[0]`.  Routed
    //      through the shared `famousDisplayName` helper so the
    //      InfoCard headline and the POI label can't drift.
    //   2. Milliquas → "<PARENT> J<RA><Dec>" reconstructed from the
    //      per-record `parentSurveyByte` slot in the .bin (e.g.
    //      "SDSS J012345.67+891234.5", "2MASX J…").  When the byte is
    //      0 (literature designation) or otherwise unrecognised the
    //      candidate is undefined and we fall through to the IAU
    //      fallback below, which produces "MQ J<RA><Dec>".
    //   3. Survey row with a real PGC in objID → `PGC <n>`.  Applies
    //      to BOTH 2MRS (PGC populated by the build-time GLADE→2MRS
    //      cross-match) and GLADE (PGC inherited directly from the
    //      source line).  PGC is widely indexed by NED / SIMBAD,
    //      shorter than a coord-based name, and especially valuable
    //      for GLADE rows where the iauName ("GLADE J…") is a
    //      synthetic prefix we generate ourselves.
    //   4. IAU coord-based name (`SDSS J…`, `2MASX J…`, `GLADE J…`,
    //      `MQ J…`).
    displayName:
      [
        famous ? famousDisplayName(famous) : undefined,
        milliquasDisplayName,
        (source === Source.TwoMRS || source === Source.Glade) && cloud.objIDs[idx]! > 0n
          ? `PGC ${cloud.objIDs[idx]!}`
          : undefined,
        iauName(source, ra, dec),
      ].find((c) => c !== undefined && c.length > 0) ?? iauName(source, ra, dec),

    // Per-slot band names + pre-computed adjacent-slot colour pairs.
    bands,
    colours,

    // Source attribution — fed through to the InfoCard's badge + link logic.
    source,
    sourceLabel: SOURCE_REGISTRY[source].label,

    // Per-record AGN class string, or undefined when the source
    // doesn't define one (every non-Milliquas row today).
    agnClass,

    // External URLs — chosen above based on `source` (and PGC for GLADE).
    catalogUrl,
    thumbnailUrl,
    ...(thumbnailFallbackUrl !== undefined ? { thumbnailFallbackUrl } : {}),

    // Physical size — drives the focus-tween framing distance and the
    // diameter row in the InfoCard.
    diameterKpc: dKpc,
    diameterProvenance,

    // Orientation provenance — fed to the InfoCard's <details> orientation row.
    orientation: {
      axisRatio: ar,
      positionAngleDeg: pa,
      provenance,
    },

    // Famous enrichment — present only for Source.Famous rows.  `undefined`
    // for all survey rows so the InfoCard's `info.famous &&` guard works
    // without an explicit `?? null` at each consumer.
    famous,
  };
}
