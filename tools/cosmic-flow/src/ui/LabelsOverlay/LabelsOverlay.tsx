/**
 * LabelsOverlay — projects cosmic-structure labels onto the canvas each frame.
 *
 * The structure world positions are computed once (placeStructures); every frame
 * the engine writes the current view-projection into the store, and this overlay
 * re-projects each world point to screen space (column-major mvp; w<=0 means the
 * point is behind the camera, so it's hidden). It's a plain absolutely-positioned
 * DOM layer above the canvas, pointer-events: none, shown only when labels are on.
 */
import { useMemo, type ReactNode } from 'react';
import { useStore } from '../../state/useStore';
import { useAppStore } from '../storeContext';
import { placeStructures } from '../../field/placeStructures';
import { STRUCTURE_CATALOG } from '../../field/structureCatalog';
import styles from './LabelsOverlay.module.css';

function LabelsOverlay(): ReactNode {
  const store = useAppStore();
  const enabled = useStore(store, (s) => s.labels.enabled);
  const viewProj = useStore(store, (s) => s.camera.viewProj);
  const placed = useMemo(() => placeStructures(STRUCTURE_CATALOG), []);

  if (!enabled) return null;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const m = viewProj;

  return (
    <div className={styles.overlay}>
      {placed.map((p) => {
        const [x, y, z] = p.world;
        const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
        const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
        const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
        if (cw <= 0.0001) return null;
        const left = (cx / cw) * 0.5 * w + 0.5 * w;
        const top = (1 - ((cy / cw) * 0.5 + 0.5)) * h;
        return (
          <div key={p.name} className={styles.label} style={{ left: `${left}px`, top: `${top}px` }}>
            <span className={styles.dot} />
            {p.name}
          </div>
        );
      })}
    </div>
  );
}

export default LabelsOverlay;
