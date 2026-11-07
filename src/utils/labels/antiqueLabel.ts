/**
 * antiqueLabel — one label as the antique look shows it: renamed, kept, or null
 * (hidden), per its producer's `AntiqueLabelRule`, and cut in the rule's
 * lettering: star names in italic as named, everything else in letter-spaced
 * roman capitals with V for U (SATVRNVS). A subject the user is looking at
 * (`subjectKept`) always keeps a label, its modern name Latinised when the table
 * has none, centred at the plate's one largest size. Other names sit left-aligned
 * so a lifted name falls upper-right of its glyph.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../@types/rendering/AntiqueLabelRule';
import type { FontId } from '../../@types/data/FontId';
import { ANTIQUE_LABEL_STYLE } from '../../data/labels/antiqueLabelStyle';
import { ANTIQUE_MODERN_NAME_EDITS } from '../../data/labels/antiqueModernNameEdits';
import { LABEL_MIN_PX_DEFAULT, LABEL_MAX_PX_DEFAULT } from '../../data/labels/labelSizingDefaults';

const DIGIT = /\d/;

export function antiqueLabel(
  label: Label2D,
  rule: AntiqueLabelRule | undefined,
  subjectKept: boolean,
  hasFont: (font: FontId) => boolean,
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
  const text =
    name ??
    (subjectKept
      ? ANTIQUE_MODERN_NAME_EDITS.reduce((t, [from, to]) => t.replace(from, to), label.text)
      : label.text);

  // The italic cut carries letters only; a kept catalog number goes roman. Until
  // the look's fonts land (`loadLookFonts`), the label keeps its own.
  const style = ANTIQUE_LABEL_STYLE;
  const italic = rule?.lettering === 'italic' && !DIGIT.test(text);
  const fell = italic ? style.italicFont : style.romanFont;
  const font = hasFont(fell) ? fell : label.font;
  const lettering: Partial<Label2D> = italic
    ? { text, font }
    : { text: text.toUpperCase().replace(/U/g, 'V'), font, trackingEm: style.trackingEm };
  if (subjectKept) {
    const px = style.subjectPx;
    return { ...placed, ...lettering, alignX: 'center', minPixelSize: px, maxPixelSize: px };
  }
  const cap = italic ? style.italicPx : style.capitalsPx;
  return {
    ...placed,
    ...lettering,
    alignX: 'left',
    minPixelSize: Math.min(label.minPixelSize ?? LABEL_MIN_PX_DEFAULT, cap),
    maxPixelSize: Math.min(label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT, cap),
  };
}
