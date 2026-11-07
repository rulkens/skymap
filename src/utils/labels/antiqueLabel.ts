/**
 * antiqueLabel — one label as the antique look shows it: renamed, kept, or null
 * (hidden), per its producer's `AntiqueLabelRule`. A subject the user is looking
 * at (`subjectKept`) always keeps a label, renamed when the table has a name for
 * it; the look must never leave the subject of the view unnamed. Left-aligned so
 * the lifted name sits upper-right of its glyph, as an engraver set it.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../@types/rendering/AntiqueLabelRule';

const DIGIT = /\d/;

export function antiqueLabel(
  label: Label2D,
  rule: AntiqueLabelRule | undefined,
  subjectKept: boolean,
): Label2D | null {
  const name = rule && Object.hasOwn(rule.names, label.id) ? rule.names[label.id] : undefined;
  if (typeof name === 'string') return { ...label, text: name, alignX: 'left' };
  const hidden = name === null || rule?.unlisted === 'hide' || DIGIT.test(label.text);
  return hidden && !subjectKept ? null : { ...label, alignX: 'left' };
}
