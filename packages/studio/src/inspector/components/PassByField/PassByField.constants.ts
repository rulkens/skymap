import { DEFAULT_PASS_BY_DIR } from '../../../../../../src/services/engine/animation/pathDefaults';
import type { PassByConfig } from '../../../../../../src/@types/animation/PassByConfig';

export const SIDE_OPTIONS = [
  { value: 'outsideBend', text: 'Outer' },
  { value: 'above', text: 'Above' },
  { value: 'screenSide', text: 'Right' },
];

/** What buildPathTrack flies with no pass-by authored: through every centre. */
export const ABSENT_PASS_BY: PassByConfig = { offset: 0, dir: DEFAULT_PASS_BY_DIR };
