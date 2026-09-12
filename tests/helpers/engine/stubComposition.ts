import type { EngineComposition } from '../../../src/@types/engine/EngineComposition';

/** The composition for fixtures that never read one — no layers, no home to seed. */
export const STUB_COMPOSITION: EngineComposition<[]> = {
  layers: [],
  home: { focus: null, seedSelection: false },
};
