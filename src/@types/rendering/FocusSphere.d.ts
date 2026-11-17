import type { FocusUniformsValue } from './FocusUniformsValue';

/** The spatial part of a focus: the sphere outside which galaxies and stars dim, per vertex. */
export type FocusSphere = Omit<FocusUniformsValue, 'blend'>;
