/**
 * paletteRowLabel — a `ScoredRow` as plain text. `ROW_VIEW` takes its primary
 * text from `name`, and the dome remote lists the same name, so the two lists
 * never name a row differently. `kind` is for the remote, which has no chips.
 */

import { MILKY_WAY_NAMES } from '../../data/palette/milkyWayNames';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import type { PaletteRowLabel } from '../../@types/palette/PaletteRowLabel';
import type { ScoredRow } from '../../@types/palette/ScoredRow';

const UNNAMED = '(unnamed)';

export function paletteRowLabel(row: ScoredRow): PaletteRowLabel {
  switch (row.kind) {
    case 'famous':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Galaxy' };
    case 'milkyWay':
      return { name: MILKY_WAY_NAMES[0], kind: 'Galaxy' };
    case 'alias':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Galaxy' };
    case 'body':
      return { name: row.body.label, kind: 'Object' };
    case 'starCatalog':
      return { name: row.star.label, kind: 'Star' };
    case 'structure':
      return { name: row.entry.name, kind: CATEGORY_DISPLAY_INFO[row.entry.category].shortLabel };
    case 'exhibit':
      return { name: row.exhibit.label, kind: 'Exhibit' };
    case 'tour':
      return { name: row.tour.label, kind: 'Tour' };
    case 'place':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Place' };
    case 'layer':
      return { name: row.entry.names[0] ?? UNNAMED, kind: 'Object' };
  }
}
