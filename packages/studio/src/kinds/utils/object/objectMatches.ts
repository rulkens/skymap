/** The palette's own ranking for `query`, kept to the rows that focus an object (no tours, exhibits, places). */
import { rankPaletteMatches } from '../../../../../../src/utils/palette/rankPaletteMatches';
import { remoteSearchMatches } from '../../../../../../src/utils/remote/remoteSearchMatches';
import { NO_SKY_ROWS } from '../../data/noSkyRows';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { ObjectMatch } from '../../../@types/kinds/ObjectMatch';

export function objectMatches(index: ObjectIndex, query: string): ObjectMatch[] {
  const { famous, aliases, structures, layerRows } = index;
  const ranked = rankPaletteMatches(famous, aliases, structures, layerRows, query, NO_SKY_ROWS);
  return remoteSearchMatches(ranked).flatMap(({ name, kind, action }) =>
    action.kind === 'focus' ? [{ focusId: action.focusId, name, kind }] : [],
  );
}
