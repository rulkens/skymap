import { selectEngineFacts } from '../../../../state/engine/selectors';
import type { RootState } from '../../../../store/types';
import type { FamousStarMetaEntry } from '../../../../@types/loading/FamousStarMetaEntry';

/** A stable empty list for the pre-seed window, so a subscriber sees no spurious change. */
const NO_FAMOUS_STARS_META: readonly FamousStarMetaEntry[] = [];

/** The famous-star InfoCard sidecar, `[]` until it lands (or after it fails). */
export const selectFamousStarsMeta = (state: RootState): readonly FamousStarMetaEntry[] =>
  selectEngineFacts(state).starCatalog?.famousStarsMeta ?? NO_FAMOUS_STARS_META;
