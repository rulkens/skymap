/** How a row looks by its kind and subject: the families it writes, its icon and tint, and its label. */
import { ROW_KINDS } from '../../kinds/data/rowKinds';
import { familyGlyph } from './familyGlyph';
import type { RowKind } from '../../@types/rows/RowKind';
import type { RowSubjects } from '../../@types/rows/RowSubjects';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

const UNTINTED_MARKS = new Set(['group', 'gap', 'start']);

export function rowFace<K extends RowKind>(
  kind: K,
  subject: RowSubjects[K],
): Pick<TimelineRow, 'family' | 'glyph' | 'writes' | 'label'> {
  const spec = ROW_KINDS[kind];
  const writes = spec.writes(subject);
  const family = UNTINTED_MARKS.has(spec.mark) ? null : (writes[0] ?? null);
  const glyph =
    typeof spec.glyph === 'function' ? spec.glyph(subject) : (spec.glyph ?? familyGlyph(family));
  return { family, glyph, writes, label: spec.label(subject) };
}
