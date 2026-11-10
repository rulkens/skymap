import cx from 'classnames';
import type { GlyphId } from '../../../@types/kinds/GlyphId';
import { GLYPH_PATHS } from '../../data/glyphPaths';
import s from './Glyph.module.css';

type Props = { readonly id: GlyphId; readonly className?: string };

function Glyph({ id, className }: Props) {
  return (
    <svg className={cx(s.root, className)} viewBox="0 0 16 16" aria-hidden>
      <path d={GLYPH_PATHS[id]} />
    </svg>
  );
}

export default Glyph;
