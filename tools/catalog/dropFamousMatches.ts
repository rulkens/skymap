/**
 * Drop catalog records that lie within `thresholdArcsec` of any famous
 * galaxy on the sky.
 *
 * ## Why this exists
 *
 * The famous-galaxy layer (`famous.bin`, built by `tools/famous/buildFamous.ts`)
 * carries hand-curated entries for ~75 well-known galaxies (M31, M87, etc.)
 * with their own positions, thumbnails, and metadata. The 2MRS / GLADE /
 * SDSS catalogs ALSO carry these galaxies — every one of them — because
 * they're observed galaxies that happen to be famous. The renderer draws
 * every source-bin as its own billboard layer, so without dedup each
 * famous galaxy renders TWICE (once from the catalog layer, once from the
 * famous layer).
 *
 * Pre-CF4-override the duplication was visually hidden: the catalog
 * billboard sat at the cz-mirrored position (e.g. M31 at ~3 Mpc on the
 * anti-Andromeda side, blueshifted) while the famous-seed billboard sat
 * at the curated literature distance (~0.78 Mpc). They were Mpc apart on
 * the screen, so the user never saw two M31s.
 *
 * Once the local-volume distance override fires, the catalog billboard
 * moves to the CF4 measured distance (~0.747 Mpc for M31), only 0.03 Mpc
 * from the famous billboard. The two now overlap visually and the user
 * sees an obvious duplicate.
 *
 * The clean fix is to drop the catalog row entirely whenever it falls
 * within `thresholdArcsec` of a famous-seed entry. The famous layer
 * becomes the single source of truth for those galaxies; the catalog
 * layer renders everything else.
 *
 * ## Algorithm
 *
 * Brute-force per-record check against every famous entry, with a cheap
 * declination bbox prefilter. 75 famous entries × 2.5M GLADE rows is
 * ~190M comparisons in the worst case, but the dec prefilter early-exits
 * on 99.9% of pairs, so the total cost is ~1-2 s on the build server.
 *
 * No spatial index — for 75 reference points it's overkill, and any
 * index structure adds enough overhead that the bbox-prefiltered linear
 * scan wins outright.
 */
import type { ParsedRecord } from '../parsers/common';

export type FamousSkyPosition = {
  readonly ra: number;
  readonly dec: number;
};

export type DropFamousMatchesResult = {
  readonly kept: ParsedRecord[];
  readonly dropped: number;
};

export function dropFamousMatches(
  records: ParsedRecord[],
  famousPositions: ReadonlyArray<FamousSkyPosition>,
  thresholdArcsec: number,
): DropFamousMatchesResult {
  if (famousPositions.length === 0) {
    return { kept: records, dropped: 0 };
  }
  const tDeg = thresholdArcsec / 3600;
  const tDegSq = tDeg * tDeg;
  let dropped = 0;
  const kept: ParsedRecord[] = [];

  // Hot loop: small-angle approximation with a dec-only bbox prefilter.
  // The cos(mean dec) compression of RA differences matches the existing
  // crossMatch.ts convention so the two consistencies don't drift.
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    let isFamous = false;
    for (let j = 0; j < famousPositions.length; j++) {
      const f = famousPositions[j]!;
      const dDec = r.dec - f.dec;
      // Bbox prefilter: declination difference alone gates ~99.9% of
      // pairs out without any trig.
      if (Math.abs(dDec) > tDeg) continue;
      const dRa = (r.ra - f.ra) * Math.cos(((r.dec + f.dec) * 0.5 * Math.PI) / 180);
      if (dRa * dRa + dDec * dDec < tDegSq) {
        isFamous = true;
        break;
      }
    }
    if (isFamous) {
      dropped++;
    } else {
      kept.push(r);
    }
  }

  return { kept, dropped };
}
