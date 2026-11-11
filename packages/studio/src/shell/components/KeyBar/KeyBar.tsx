import cx from 'classnames';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import { CHANNEL_FAMILY_LEGEND } from '../../../data/channelFamilies';
import { familyStyle } from '../../../timeline/utils/familyStyle';
import { MARK_LEGEND } from './KeyBar.constants';
import s from './KeyBar.module.css';

/** The dock's foot: what the channel tints and the mark shapes mean. Keys are not printed here (Q30). */
function KeyBar() {
  return (
    <footer className={s.root} aria-label="Legend">
      <span className={s.group}>
        {CHANNEL_FAMILY_LEGEND.map(({ family, name, glyph }) => (
          <span key={family} className={s.item}>
            <span className={s.tint} style={familyStyle(family)}>
              <Glyph id={glyph} size={12} />
            </span>
            {name}
          </span>
        ))}
      </span>
      <span className={s.group}>
        {MARK_LEGEND.map(({ shape, name }) => (
          <span key={name} className={s.item}>
            {shape === 'background' ? (
              <Glyph id="fork" size={12} />
            ) : (
              <span className={cx(s.swatch, s[shape])} />
            )}
            {name}
          </span>
        ))}
      </span>
    </footer>
  );
}

export default KeyBar;
