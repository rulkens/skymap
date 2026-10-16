/** TourSection — start a tour; while one runs, step back, pause and step on. */

import type { DomeStatus } from '../../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteMenu } from '../../../@types/remote/RemoteMenu';
import controls from '../remoteControls.module.css';

export type TourSectionProps = {
  tours: RemoteMenu['tours'];
  tour: DomeStatus['tour'];
  onCommand: (command: RemoteCommand) => void;
};

function TourSection({ tours, tour, onCommand }: TourSectionProps) {
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Tours</h2>
      {tour && (
        <>
          <p role="status">
            {tours.find((t) => t.id === tour.id)?.label ?? tour.id}, beat {tour.beatIndex + 1} of{' '}
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
        {tours.map((t) => (
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
