/*
 * Icon — one of the site's own line drawings (data/icons.ts), always beside a
 * text label, so it is hidden from assistive technology. Sized and stroked by
 * `.glyph` in styles/site.css, next to the ring it stands in for; `data-icon`
 * lets that sheet set one drawing apart (the view mark is small and dim).
 */
import type { IconName } from '../../@types/IconName';
import { ICONS } from '../../data/icons.ts';

type IconProps = { name: IconName };

function Icon({ name }: IconProps) {
  return (
    <svg
      className="glyph"
      data-icon={name}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export default Icon;
