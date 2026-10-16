/**
 * remoteSearchMatches — a remote's search, ranked exactly as the palette ranks
 * it and cut to ten. Each match carries the `PaletteAction` the remote sends
 * back in a `goTo`, so the remote never encodes a focus id itself.
 */

import { actionForRow } from '../palette/actionForRow';
import { paletteRowLabel } from '../palette/paletteRowLabel';
import { rankPaletteMatches } from '../palette/rankPaletteMatches';
import type { RemoteSearchInputs } from '../../@types/remote/RemoteSearchInputs';
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';

const MAX_MATCHES = 10;

export function remoteSearchMatches(
  inputs: RemoteSearchInputs,
  query: string,
): RemoteSearchMatch[] {
  const { entries, aliasIndex, structures, layerRows } = inputs;
  return rankPaletteMatches(entries, aliasIndex, structures, layerRows, query)
    .slice(0, MAX_MATCHES)
    .map((row) => ({ ...paletteRowLabel(row), action: actionForRow(row) }));
}
