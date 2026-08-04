/**
 * MultiGalaxySection — the background-scatter perf test: an enable
 * checkbox, a 1–200 satellite-count slider, and a regenerate button.
 * Section-collapse chrome (the "MULTIPLE GALAXIES" header + chevron) is the
 * caller's concern — ControlsPanel wraps this in a
 * `CollapsibleSection` the same way it wraps every slider group, so this
 * component only owns what's inside the body.
 *
 * Reads/writes the `extras` slice directly rather than taking props: the
 * count slider fires on every drag tick, and debouncing that into a single
 * `setExtras` call is `engineBridge`'s job (its 220 ms timer), not
 * this component's — dispatching the raw value on every change keeps this
 * component dumb.
 */
import type { ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { extrasToggled, extrasCountSet, extrasRegenerated } from '../../state/slices/extrasSlice';
import ParamSlider from '../ParamSlider/ParamSlider';
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
          <ParamSlider
            label="Distant galaxies"
            value={extras.count}
            min={1}
            max={200}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(extrasCountSet(Math.round(v)))}
          />
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
