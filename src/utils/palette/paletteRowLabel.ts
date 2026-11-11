/**
 * paletteRowLabel — a `ScoredRow` as plain text. `ROW_VIEW` takes its primary
 * text from `name`, and the dome remote lists the same name, so the two lists
 * never name a row differently. `kind` is for lists without chips (the remote, the clip studio):
 * a Layer row reads its own chip where it has one.
 */

import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import type { PaletteRowLabel } from '../../@types/palette/PaletteRowLabel';
import type { ScoredRow } from '../../@types/palette/ScoredRow';

const UNNAMED = '(unnamed)';

export function paletteRowLabel(row: ScoredRow): PaletteRowLabel {
  switch (row.kind) {
    case 'famous':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Galaxy' };
    case 'alias':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Galaxy' };
    case 'structure':
      return { name: row.entry.name, kind: CATEGORY_DISPLAY_INFO[row.entry.category].shortLabel };
    case 'exhibit':
      return { name: row.exhibit.label, kind: 'Exhibit' };
    case 'tour':
      return { name: row.tour.label, kind: 'Tour' };
    case 'place':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Place' };
    case 'layer':
      return { name: row.entry.names[0] ?? UNNAMED, kind: row.entry.chip ?? 'Object' };
  }
}
