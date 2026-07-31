/**
 * sStarAppearance — temperature, absolute magnitude and radius for an S-star
 * draw record, from its apparent K magnitude and Gillessen+ 2017's coarse
 * early/late spectral flag.
 *
 * Representative, not measured: each class is a small brightness-ordered
 * table, so brighter members read hotter and larger — mass on the main
 * sequence for `early` (B dwarfs), luminosity class for `late` (giants).
 * S2 (M_K ≈ −3.11, early) lands near a real B1V dwarf (Teff ≈ 25,400 K,
 * R ≈ 6.4 R☉, Pecaut & Mamajek 2013) — a spot check, not a fit.
 */
import { absMagFromGalacticCentreK } from '../../utils/star/absMagFromGalacticCentreK';
import type { SStarSeed } from '../../@types/scene/SStarSeed';

type AppearanceStep = { readonly temperatureK: number; readonly radiusSolar: number };
type AppearanceBin = AppearanceStep & { readonly maxAbsMag: number };

// Ascending faint-edge, brightest-first. Values span real B-dwarf properties
// from an O9/B0-ish top end down to a B8-9V-ish faint end.
const EARLY_BINS: readonly AppearanceBin[] = [
  { maxAbsMag: -6, temperatureK: 30000, radiusSolar: 8 },
  { maxAbsMag: -3, temperatureK: 22000, radiusSolar: 6 },
  { maxAbsMag: 0, temperatureK: 16000, radiusSolar: 4 },
];
const EARLY_FAINTEST: AppearanceStep = { temperatureK: 12000, radiusSolar: 3 };

// The `late` population's observed M_K spans only about -1.8 to +0.4, so one
// edge plus a faint fallback already separates the brighter giants.
const LATE_BINS: readonly AppearanceBin[] = [
  { maxAbsMag: -1, temperatureK: 4200, radiusSolar: 20 },
];
const LATE_FAINTEST: AppearanceStep = { temperatureK: 3800, radiusSolar: 12 };

// Two of the 39 rows carry no spectral flag. A neutral, roughly solar
// representative rather than guessing early or late.
const UNKNOWN_APPEARANCE: AppearanceStep = { temperatureK: 5800, radiusSolar: 1.5 };

function scan(
  bins: readonly AppearanceBin[],
  faintest: AppearanceStep,
  absMag: number,
): AppearanceStep {
  for (const bin of bins) {
    if (absMag < bin.maxAbsMag) return bin;
  }
  return faintest;
}

export function sStarAppearance(
  mK: number,
  cls: SStarSeed['spectralClass'],
): { temperatureK: number; absMag: number; radiusSolar: number } {
  const absMag = absMagFromGalacticCentreK(mK);
  const { temperatureK, radiusSolar } =
    cls === 'early'
      ? scan(EARLY_BINS, EARLY_FAINTEST, absMag)
      : cls === 'late'
        ? scan(LATE_BINS, LATE_FAINTEST, absMag)
        : UNKNOWN_APPEARANCE;
  return { temperatureK, absMag, radiusSolar };
}
