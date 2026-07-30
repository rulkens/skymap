/**
 * MultiGalaxySection — the background-scatter perf test: an enable
 * checkbox, a 1–200 satellite-count slider, and a regenerate button
 * (html:329-346). Section-collapse chrome (the "MULTIPLE GALAXIES" header
 * + chevron) is the caller's concern — ControlsPanel wraps this in a
 * `CollapsibleSection` the same way it wraps every slider group, so this
 * component only owns what's inside the body.
 *
 * Reads/writes the `extras` slice directly rather than taking props: the
 * count slider fires on every drag tick, and debouncing that into a single
 * `setExtras` call is `engineBridge`'s job (html:581's 220ms timer), not
 * this component's — dispatching the raw value on every change keeps this
 * component dumb.
 */
import type { ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { extrasToggled, extrasCountSet, extrasRegenerated } from '../../state/slices/extrasSlice';
import styles from './MultiGalaxySection.module.css';

function MultiGalaxySection(): ReactNode {
  const dispatch = useAppDispatch();
  const extras = useAppSelector((state) => state.extras);

  return (
    <div className={styles.root}>
      <label className={styles.toggleRow}>
        <span>
          Background galaxies <span className={styles.hint}>(perf test)</span>
        </span>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={extras.enabled}
          onChange={(e) => dispatch(extrasToggled(e.target.checked))}
        />
      </label>

      {extras.enabled && (
        <div className={styles.body}>
          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <span className={styles.sliderLabel}>Distant galaxies</span>
              <span className={styles.sliderValue}>{extras.count}</span>
            </div>
            <input
              type="range"
              className={styles.range}
              min={1}
              max={200}
              step={1}
              value={extras.count}
              onChange={(e) => dispatch(extrasCountSet(parseInt(e.target.value, 10)))}
            />
          </div>
          <Button className={styles.regenButton} onClick={() => dispatch(extrasRegenerated())}>
            ⟲ Regenerate distant galaxies
          </Button>
          <div className={styles.explainer}>
            Each is a random galaxy (40–200k stars). Zoom out to see them; watch the FPS badge.
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiGalaxySection;
