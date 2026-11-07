/**
 * antiqueLabel — one label as the antique look shows it: renamed, kept, or null
 * (hidden), per its producer's `AntiqueLabelRule`, and cut in its tier's type
 * (`AntiqueLettering`; capitals take V for U, SATVRNVS). A subject the user is
 * looking at (`subjectKept`) always keeps a label, its modern name Latinised when
 * the table has none, centred at the plate's one largest size. Other names sit
 * left-aligned so a lifted name falls upper-right of its glyph.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../@types/rendering/AntiqueLabelRule';
import type { FontId } from '../../@types/data/FontId';
import type { AntiqueLettering } from '../../@types/rendering/AntiqueLettering';
import { ANTIQUE_LABEL_STYLE } from '../../data/labels/antiqueLabelStyle';
import { ANTIQUE_MODERN_NAME_EDITS } from '../../data/labels/antiqueModernNameEdits';
import { isKeyOf } from '../object/isKeyOf';

const DIGIT = /\d/;

export function antiqueLabel(
  label: Label2D,
  rule: AntiqueLabelRule | undefined,
  subjectKept: boolean,
  hasFont: (font: FontId) => boolean,
): Label2D | null {
  const name = rule && isKeyOf(rule.names, label.id) ? rule.names[label.id] : undefined;
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

  // A subject is a title: capitals, or italic when it would span the plate. The
  // italic cut carries letters only, so a catalog number goes roman.
  const style = ANTIQUE_LABEL_STYLE;
  const letteringOf = rule?.letteringOf;
  const tier =
    (letteringOf && isKeyOf(letteringOf, label.id) ? letteringOf[label.id] : rule?.lettering) ??
    'capitals';
  let cut: AntiqueLettering = tier;
  if (subjectKept) {
    cut = tier === 'italic' || text.length > style.titleMaxChars ? 'italic' : 'capitals';
  }
  if (cut === 'italic' && DIGIT.test(text)) cut = 'roman';

  // Until the look's fonts land (`loadLookFonts`), the label keeps its own. White
  // is full ink: the plate inks a caption by its fill's lightness.
  const fell = cut === 'italic' ? style.italicFont : style.romanFont;
  const px = subjectKept ? style.subjectPx : style[cut].px;
  return {
    ...placed,
    text: cut === 'capitals' ? text.toUpperCase().replace(/U/g, 'V') : text,
    font: hasFont(fell) ? fell : label.font,
    trackingEm: style[cut].trackingEm,
    color: [1, 1, 1, 1],
    alignX: subjectKept ? 'center' : 'left',
    minPixelSize: px,
    maxPixelSize: px,
  };
}
