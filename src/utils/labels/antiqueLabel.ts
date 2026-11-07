/**
 * antiqueLabel — one label as the antique look shows it: renamed, kept, or null
 * (hidden), per its producer's `AntiqueLabelRule`. A subject the user is looking
 * at (`subjectKept`) always keeps a label, renamed when the table has a name for
 * it, else its own without the bracketed catalog number, and set centred at the
 * plate's one largest size. Every other name is capped and left-aligned, so a
 * lifted name sits upper-right of its glyph, as an engraver set it.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../@types/rendering/AntiqueLabelRule';
import { ANTIQUE_LABEL_STYLE } from '../../data/labels/antiqueLabelStyle';
import { LABEL_MIN_PX_DEFAULT, LABEL_MAX_PX_DEFAULT } from '../../data/labels/labelSizingDefaults';

const DIGIT = /\d/;
const BRACKETED = /\s*\([^)]*\)/g;

export function antiqueLabel(
  label: Label2D,
  rule: AntiqueLabelRule | undefined,
  subjectKept: boolean,
): Label2D | null {
  const name = rule && Object.hasOwn(rule.names, label.id) ? rule.names[label.id] : undefined;
  const hidden =
    name === null || (name === undefined && (rule?.unlisted === 'hide' || DIGIT.test(label.text)));
  if (hidden && !subjectKept) return null;

  // A producer that lifts its own label (COSMO: famous galaxies, the Milky Way)
  // carries the subject as its leader's foot; the name goes back there.
  const placed: Label2D =
    label.leader && !label.lift
      ? { ...label, worldPos: label.leader.fromWorld, leader: undefined }
      : label;
  const text = name ?? (subjectKept ? label.text.replace(BRACKETED, '') : label.text);
  if (subjectKept) {
    const px = ANTIQUE_LABEL_STYLE.subjectPx;
    return { ...placed, text, alignX: 'center', minPixelSize: px, maxPixelSize: px };
  }
  const cap = ANTIQUE_LABEL_STYLE.maxPx;
  return {
    ...placed,
    text,
    alignX: 'left',
    minPixelSize: Math.min(label.minPixelSize ?? LABEL_MIN_PX_DEFAULT, cap),
    maxPixelSize: Math.min(label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT, cap),
  };
}
