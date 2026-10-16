/* FeedbackDock — the corner control: the Feedback button, and above it, while feedback is on, the notes left on this page. */
import type { Ref } from 'react';

import type { FeedbackPin } from '../@types/FeedbackPin';
import FeedbackBadge from '../FeedbackBadge/FeedbackBadge.tsx';
import styles from './FeedbackDock.module.css';

type FeedbackDockProps = {
  on: boolean;
  pins: FeedbackPin[];
  onToggle: () => void;
  onDelete: (pin: FeedbackPin) => void;
  toggleRef: Ref<HTMLButtonElement>;
};

function FeedbackDock({ on, pins, onToggle, onDelete, toggleRef }: FeedbackDockProps) {
  return (
    <div className={styles.root}>
      {on && pins.length > 0 && (
        <section className={styles.list} aria-label="Feedback notes on this page">
          <ol>
            {pins.map((pin) => (
              <li key={pin.id}>
                <FeedbackBadge n={pin.n} />
                <span className={styles.text}>{pin.text.split('\n')[0]}</span>
                <button
                  className={styles.delete}
                  type="button"
                  aria-label={`Delete note ${pin.n}`}
                  onClick={() => onDelete(pin)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <button
        ref={toggleRef}
        className={styles.toggle}
        type="button"
        aria-pressed={on}
        title="Feedback mode (F)"
        onClick={onToggle}
      >
        Feedback
      </button>
    </div>
  );
}

export default FeedbackDock;
