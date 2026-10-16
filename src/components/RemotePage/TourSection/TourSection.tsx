/** TourSection — start a tour; while one runs, step back, pause and step on. */

import { REMOTE_TOUR_LABELS } from '../../../data/remote/remoteTourLabels';
import type { TourId } from '../../../@types/animation/tour/TourId';
import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import controls from '../remoteControls.module.css';

const TOURS = (Object.entries(REMOTE_TOUR_LABELS) as [TourId, string | null][]).flatMap(
  ([id, label]) => (label ? [{ id, label }] : []),
);

export type TourSectionProps = {
  tour: DomeStatus['tour'];
  onCommand: (command: RemoteCommand) => void;
};

function TourSection({ tour, onCommand }: TourSectionProps) {
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Tours</h2>
      {tour && (
        <>
          <p role="status">
            {(tour && REMOTE_TOUR_LABELS[tour.id]) ?? tour.id}, beat {tour.beatIndex + 1} of{' '}
            {tour.beatCount}
            {tour.paused ? ', paused' : ''}
          </p>
          <div className={controls.row}>
            <button
              type="button"
              className={controls.button}
              onClick={() => onCommand({ name: 'tourPrev', payload: null })}
            >
              Previous
            </button>
            <button
              type="button"
              className={controls.button}
              onClick={() => onCommand({ name: 'tourTogglePause', payload: null })}
            >
              {tour.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className={controls.button}
              onClick={() => onCommand({ name: 'tourAdvance', payload: null })}
            >
              Next
            </button>
          </div>
        </>
      )}
      <div className={controls.row}>
        {TOURS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${controls.button} ${tour?.id === t.id ? controls.on : ''}`}
            onClick={() => onCommand({ name: 'goTo', payload: { kind: 'tour', tourId: t.id } })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default TourSection;
