import type { GlyphId } from '../../../@types/kinds/GlyphId';
import Glyph from '../Glyph/Glyph';
import s from './InspectorHead.module.css';

type Props = {
  readonly glyph?: GlyphId;
  /** Where the row sits: its block, Start, or Clip. */
  readonly where: string;
  readonly range?: string;
  /** Names the row and its value once; the grid below does not repeat it. */
  readonly title: string;
};

function InspectorHead({ glyph, where, range, title }: Props) {
  return (
    <header className={s.root}>
      <p className={s.where}>
        {glyph && <Glyph id={glyph} />}
        <span className={s.whereText}>{where}</span>
        {range && <span className={s.range}>{range}</span>}
      </p>
      <h2 className={s.title}>{title}</h2>
    </header>
  );
}

export default InspectorHead;
