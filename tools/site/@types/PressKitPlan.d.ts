import type { FactSentences } from './FactSentences';
import type { HeroMediaPlan } from './HeroMediaPlan';
import type { WordmarkInk } from './WordmarkInk';

/**
 * What `npm run site:press-kit` puts in the zip. `inks` are the wordmark's two colourings: `light` for a dark
 * ground, `dark` for a light one. `portraitFile` and `filmFile` are names in the zip. `film` is a cut of the hero recording, in the hero video's seconds. `short` and
 * `long` are the fact sheet's two descriptions, put together from the fact registry's sentences so they make no
 * claim the site does not.
 */
export type PressKitPlan = {
  file: string;
  logoWidth: number;
  iconSizes: readonly number[];
  jpegQuality: number;
  inks: { light: WordmarkInk; dark: WordmarkInk };
  portrait: string;
  portraitFile: string;
  portraitCredit: string;
  filmFile: string;
  film: Pick<HeroMediaPlan, 'inSec' | 'outSec' | 'width' | 'fps' | 'crf'>;
  filmCredit: string;
  short: readonly FactSentences[];
  long: readonly FactSentences[];
};
