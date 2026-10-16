/**
 * remoteSearchMatches — a remote's search: the palette's own ranking cut to ten. Each match
 * carries the `PaletteAction` the remote sends back in a `goTo`, so the remote never encodes a
 * focus id itself.
 */

import { actionForRow } from '../palette/actionForRow';
import { paletteRowLabel } from '../palette/paletteRowLabel';
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';
import type { ScoredRow } from '../../@types/palette/ScoredRow';

const MAX_MATCHES = 10;

export function remoteSearchMatches(ranked: readonly ScoredRow[]): RemoteSearchMatch[] {
  return ranked
    .slice(0, MAX_MATCHES)
    .map((row) => ({ ...paletteRowLabel(row), action: actionForRow(row) }));
}
