/** REMOTE_SHEETS: the library's tiles in order, each opening the sheet of the same id. */

import type { RemoteGlyph } from '../../@types/remote/RemoteGlyph';
import type { RemoteSheetId } from '../../@types/remote/RemoteSheetId';

export const REMOTE_SHEETS: readonly {
  readonly id: RemoteSheetId;
  readonly label: string;
  readonly glyph: RemoteGlyph;
}[] = [
  { id: 'search', label: 'Search', glyph: 'search' },
  { id: 'tours', label: 'Tours', glyph: 'tour' },
  { id: 'exhibits', label: 'Exhibits', glyph: 'exhibit' },
  { id: 'clips', label: 'Clips', glyph: 'clip' },
  { id: 'time', label: 'Time', glyph: 'time' },
  { id: 'labels', label: 'Labels', glyph: 'labels' },
  { id: 'setup', label: 'Setup', glyph: 'setup' },
];
