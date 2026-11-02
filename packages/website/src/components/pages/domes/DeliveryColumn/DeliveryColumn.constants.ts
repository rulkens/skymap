import { narrowSizes } from '../../../../utils/narrowSizes.ts';

// A phone's 70vw understates the disc on purpose: at 3x the full width would fetch the desktop file.
export const SIZES = narrowSizes('70vw', '20rem');
