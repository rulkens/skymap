import Glyph from '../../../primitives/components/Glyph/Glyph';
import { useObjectIndex } from '../../../session/hooks/useObjectIndex';
import { objectText } from '../../../kinds/utils/object/objectText';
import type { PathWaypoint } from '../../../../../../src/@types/animation/PathWaypoint';
import s from './WaypointsField.module.css';

type Props = {
  readonly waypoints: readonly PathWaypoint[];
  readonly onSelect: (index: number) => void;
};

/** A Fly's waypoints in order, as chips that select their waypoint; the last one is where it settles. */
function WaypointsField({ waypoints, onSelect }: Props) {
  const objects = useObjectIndex();
  return (
    <span className={s.root}>
      {waypoints.map((w, i) => {
        const last = i === waypoints.length - 1;
        const name = 'id' in w ? objectText(w.id, objects) : 'Point';
        return (
          <button
            key={i}
            type="button"
            className={s.chip}
            title={name}
            aria-label={`${last ? 'Settle' : 'Pass'} ${i + 1}, ${name}`}
            onClick={() => onSelect(i)}
          >
            <span className={s.n}>{i + 1}</span>
            {'id' in w && <Glyph id="subject" size={10} />}
            <span className={s.name}>{name}</span>
            {last && <Glyph id="settle" size={10} />}
          </button>
        );
      })}
    </span>
  );
}

export default WaypointsField;
