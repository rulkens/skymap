import type { Label2D } from './Label2D';

/** The label fields text layout depends on — everything else is draw-time styling. */
export type TextLayoutInput = Pick<Label2D, 'text' | 'font' | 'alignX' | 'alignY'>;
