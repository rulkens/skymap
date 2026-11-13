/**
 * antiqueLabel — one label as the antique look shows it: renamed, kept, or null
 * (hidden), per its producer's `AntiqueLabelRule`, and cut in its tier's type
 * (`AntiqueLettering`; both capital cuts take V for U, SATVRNVS). A subject the user is
 * looking at (`subjectKept`) always keeps a label, its modern name Latinised when
 * the table has none, centred at the plate's one largest size. Other names sit
 * left-aligned so a lifted name falls upper-right of its glyph; a name set over the
 * land or sea it names (`ANTIQUE_AREA_LETTERING`) shows in its own cut, centred; a
 * placed map name (`ANTIQUE_PLACE_LETTERING`) in its own cut and size, keeping the
 * alignment and size clamp its producer gave it (a crater name flipped left of its rim
 * is right-aligned, and grows with the crater).
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { AntiqueLabelRule } from '../../@types/rendering/AntiqueLabelRule';
import type { FontId } from '../../@types/data/FontId';
import type { AntiqueLettering } from '../../@types/rendering/AntiqueLettering';
import { ANTIQUE_LABEL_STYLE } from '../../data/labels/antiqueLabelStyle';
import { ANTIQUE_MODERN_NAME_EDITS } from '../../data/labels/antiqueModernNameEdits';
import { ANTIQUE_AREA_LETTERING } from '../../data/labels/antiqueAreaLettering';
import { ANTIQUE_PLACE_LETTERING } from '../../data/labels/antiquePlaceLettering';
import { bayerGreek } from './bayerGreek';
import { isKeyOf } from '../object/isKeyOf';
import { CAPTION_PRIORITY_SCALE } from '../../data/labels/captionPriorityScale';

const DIGIT = /\d/;

export function antiqueLabel(
  label: Label2D,
  rule: AntiqueLabelRule | undefined,
  subjectKept: boolean,
  hasFont: (font: FontId) => boolean,
): Label2D | null {
  const place = isKeyOf(ANTIQUE_PLACE_LETTERING, label.id)
    ? ANTIQUE_PLACE_LETTERING[label.id]
    : undefined;
  const area = isKeyOf(ANTIQUE_AREA_LETTERING, label.id)
    ? ANTIQUE_AREA_LETTERING[label.id]
    : place?.cut;
  const name = rule && isKeyOf(rule.names, label.id) ? rule.names[label.id] : undefined;
  const hidden =
    area === undefined &&
    (name === null ||
      (name === undefined && (rule?.unlisted === 'hide' || DIGIT.test(label.text))));
  if (hidden && !subjectKept) return null;

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
    area ??
    (letteringOf && isKeyOf(letteringOf, label.id) ? letteringOf[label.id] : rule?.lettering) ??
    'capitals';
  let cut: AntiqueLettering = tier;
  if (subjectKept) {
    // A glossed title is judged by its name line alone.
    const nameChars = text.split('\n')[0]!.length;
    cut = tier === 'italic' || nameChars > style.titleMaxChars ? 'italic' : 'capitals';
  }
  if ((cut === 'italic' || cut === 'spacedItalic') && DIGIT.test(text)) cut = 'roman';

  // Until the look's fonts land (`loadLookFonts`), the label keeps its own. White
  // is full ink: the plate inks a caption by its fill's lightness.
  const italic = cut === 'italic' || cut === 'spacedItalic';
  const fell = italic ? style.italicFont : style.romanFont;
  const px = subjectKept
    ? style.subjectPx
    : place
      ? (label.maxPixelSize ?? place.px)
      : area
        ? style.areaPx
        : style[cut].px;
  const alignX =
    subjectKept || (area && (place?.centred ?? true))
      ? 'center'
      : (place && label.alignX) || 'left';
  // The subject is named first; a rule's band re-ranks its producer, keeping the tie-break.
  const own = label.declutterPriority;
  const declutterPriority = subjectKept
    ? Number.MAX_VALUE
    : rule?.priority === undefined
      ? own
      : rule.priority * CAPTION_PRIORITY_SCALE + ((own ?? 0) % CAPTION_PRIORITY_SCALE);
  return {
    ...label,
    declutterPriority,
    text:
      cut === 'capitals' || cut === 'spacedItalic'
        ? text
            .split('\n')
            // A gloss in brackets keeps its case, so it reads under the name, not as a second one.
            .map((line) => (line.startsWith('(') ? line : line.toUpperCase().replace(/U/g, 'V')))
            .join('\n')
        : cut === 'italic'
          ? bayerGreek(text)
          : text,
    font: hasFont(fell) ? fell : label.font,
    trackingEm: place?.trackingEm ?? style[cut].trackingEm,
    color: [1, 1, 1, 1],
    alignX,
    minPixelSize: px,
    maxPixelSize: px,
  };
}
