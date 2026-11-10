import type { SelectionRelation } from '../../@types/SelectionRelation';
import type { CSSProperties } from 'react';
import cx from 'classnames';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import { useObjectName } from '../../../session/hooks/useObjectName';
import { CHANNEL_FAMILY_LEGEND } from '../../../data/channelFamilies';
import { ROW_KINDS } from '../../../kinds/data/rowKinds';
import { familyStyle } from '../../utils/familyStyle';
import type { TimelineRow } from '../../../@types/rows/TimelineRow';
import s from './OutlineRow.module.css';

type Props = {
  readonly row: TimelineRow;
  /** Outermost first: one rail each, drawn in the row's left margin. */
  readonly ancestors: readonly TimelineRow[];
  /** The row, or the folded ancestor standing in for a hidden selection. */
  readonly selected: boolean;
  readonly relation: SelectionRelation;
  readonly onSelect: () => void;
  readonly onToggle: () => void;
};

function OutlineRow({ row, ancestors, selected, relation, onSelect, onToggle }: Props) {
  const group = ROW_KINDS[row.kind].mark === 'group';
  const invalid = row.errors.length > 0;
  const { op, value, qualifier } = row.label;
  const subjectName = useObjectName(row.label.subject);
  // An open block's children are its rows below; only a folded one summarises them.
  const members = row.collapsed ? row.members : undefined;
  return (
    <div
      role="treeitem"
      className={cx(
        s.root,
        selected && s.selected,
        relation.insideAt !== null && s.inside,
        relation.contains && s.contains,
        invalid && s.invalid,
      )}
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.expandable ? !row.collapsed : undefined}
      aria-invalid={invalid || undefined}
      onClick={onSelect}
    >
      {ancestors.map((ancestor, k) => (
        <span
          key={ancestor.id}
          className={cx(
            s.rail,
            ancestor.kind === 'all' && s.railAll,
            ancestor.kind === 'fork' && s.railFork,
            k === relation.insideAt && s.railSelected,
            relation.pathAt.includes(k) && s.railPath,
          )}
          style={{ '--k': k } as CSSProperties}
          aria-hidden
        />
      ))}
      <span className={s.step} style={{ '--d': row.depth } as CSSProperties}>
        {row.expandable ? (
          <button
            type="button"
            className={s.twisty}
            aria-label={row.collapsed ? `Unfold ${row.label.name}` : `Fold ${row.label.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {row.collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className={s.twisty} />
        )}
        <span
          className={cx(s.icon, group && s.iconGroup, row.background && s.iconBackground)}
          style={familyStyle(row.family)}
        >
          <Glyph id={row.glyph} size={14} />
        </span>
        <span className={cx(s.name, group && s.nameGroup)}>{row.label.name}</span>
      </span>
      <span className={s.value}>
        <span className={s.op}>{op}</span>
        {subjectName !== undefined && (
          <span className={s.subject}>
            <Glyph id="subject" size={12} />
            {subjectName}
          </span>
        )}
        <span className={s.val}>{value}</span>
        {members !== undefined && (
          <span
            role="img"
            className={s.members}
            aria-label={members
              .map((m) => (m.count > 1 ? `${m.name} ×${m.count}` : m.name))
              .join(', ')}
          >
            {members.map((m, i) => (
              <span key={i} className={s.member} style={familyStyle(m.family)}>
                <Glyph id={m.glyph} size={12} />
                {m.count > 1 && <span className={s.count}>×{m.count}</span>}
              </span>
            ))}
          </span>
        )}
        {qualifier !== undefined && (
          <span className={s.qualifier}>
            {value !== '' || subjectName !== undefined || members !== undefined ? ' · ' : ''}
            {qualifier}
          </span>
        )}
      </span>
      <span className={cx(s.dur, (invalid || row.hidesErrors) && s.durInvalid)}>
        {row.duration}
        {(invalid || row.hidesErrors) && ' ⚠'}
      </span>
      <span className={s.slots}>
        {CHANNEL_FAMILY_LEGEND.map(({ family, glyph }) => (
          <span key={family} className={s.slot} style={familyStyle(family)}>
            {row.writes.includes(family) && <Glyph id={glyph} size={12} />}
          </span>
        ))}
      </span>
    </div>
  );
}

export default OutlineRow;
