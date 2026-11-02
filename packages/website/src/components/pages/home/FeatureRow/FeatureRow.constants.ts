import { narrowSizes } from '../../../../utils/narrowSizes.ts';

// A subject is drawn a fifth of the page column wide, and a third of a phone's.
export const SUBJECT_SIZES = narrowSizes('33vw', '16rem');

// How far each picture is enlarged in its slot, so the subjects stand at about one height (keyed by shot id).
export const SUBJECT_ZOOM: Readonly<Record<string, number>> = {
  'cut-earth': 1.35,
  'cut-saturn': 1.1,
  'cut-voyager1': 1.3,
  'render-milky-way': 1.4,
  'features-filaments': 1.3,
};
