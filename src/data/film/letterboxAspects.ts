/** letterboxAspects — the ratios the Film look board offers for `film.letterboxAspect`. */

import type { LetterboxAspectOption } from '../../@types/data/LetterboxAspectOption';

export const LETTERBOX_ASPECTS = [
  { value: 2.39, label: 'Scope 2.39:1' },
  { value: 2, label: 'Univisium 2:1' },
  { value: 1.85, label: 'Flat 1.85:1' },
  { value: 16 / 9, label: '16:9' },
  { value: 4 / 3, label: '4:3' },
  { value: 1, label: 'Square 1:1' },
  { value: 9 / 16, label: 'Portrait 9:16' },
] as const satisfies readonly LetterboxAspectOption[];
