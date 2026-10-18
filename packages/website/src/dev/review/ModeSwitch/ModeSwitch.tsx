/*
 * ModeSwitch — the two-button switch in the review bar between Notes (the pointer leaves notes) and
 * Marks (the pointer selects text for marks). The keys are printed on it: N, T, and Tab for either way.
 */
import { useDevOverlayMode } from '../../overlay/useDevOverlayMode';
import { devOverlay } from '../../overlay/devOverlay';
import styles from './ModeSwitch.module.css';

function ModeSwitch() {
  const mode = useDevOverlayMode();
  return (
    <span className={styles.root} role="group" aria-label="Mode" data-overlay-ui="">
      <button
        className={styles.button}
        type="button"
        aria-pressed={mode === 'notes'}
        title="Click or drag the page to leave a note (N)"
        onClick={() => devOverlay.setMode('notes')}
      >
        Notes <kbd>N</kbd>
      </button>
      <button
        className={styles.button}
        type="button"
        aria-pressed={mode === 'marks'}
        title="Select text to mark it (T)"
        onClick={() => devOverlay.setMode('marks')}
      >
        Marks <kbd>T</kbd>
      </button>
      <span className={styles.dim}>
        <kbd>Tab</kbd> switches
      </span>
    </span>
  );
}

export default ModeSwitch;
