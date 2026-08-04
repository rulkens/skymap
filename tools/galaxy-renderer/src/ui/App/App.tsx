/**
 * App — the Galaxy Renderer's outer shell: the fullscreen `Viewport`, the
 * always-on `Hud` + `ControlsPanel`, and the toggleable `ComparePanel`
 * validation panel.
 *
 * The one imperative wire this component owns: `Viewport.onEngine` hands
 * back the live `GalaxyEngineHandle`, and `connectEngineBridge` is the
 * ONLY place that handle gets attached to the store (see its own
 * docblock). `Viewport` itself guarantees an `onEngine(null)` call on
 * unmount (its own cleanup — see `Viewport.tsx`), so tearing the bridge
 * down on engine loss needs no separate effect here: `handleEngine`
 * disconnects the previous bridge before attaching a new one (or none),
 * whichever direction the handle changes.
 *
 * `perf`/`stats` are engine telemetry, not app state — they live in
 * local `useState` and feed `Hud` directly, never the store (see
 * `HudProps`'s docblock for why).
 */
import { useRef, useState, type ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyEngineHandle } from '../../../@types/engine/GalaxyEngineHandle';
import type { EngineStats } from '../../../@types/engine/EngineStats';
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import type { PerfReport } from '../../../@types/engine/PerfReport';
import { useAppDispatch, useAppSelector, useAppStore } from '../../state/hooks';
import { connectEngineBridge } from '../../state/engineBridge';
import { comparePanelToggled } from '../../state/slices/compareSlice';
import { autoRotateSet } from '../../state/slices/uiSlice';
import AutoRotateToggle from '../../../../../src/components/AutoRotateToggle/AutoRotateToggle';
import Viewport from '../Viewport/Viewport';
import Hud from '../Hud/Hud';
import ComparePanel from '../ComparePanel/ComparePanel';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import styles from './App.module.css';

const NO_STATS: EngineStats = { stars: 0, dust: 0 };
// Pre-first-report placeholder. `timingEnabled: false` here only means "no
// report yet"; the engine's first `onPerf` carries the real gate state.
const NO_PERF: PerfReport = { frameMs: 0, fps: 0, passes: [], timingEnabled: false };

function App(): ReactNode {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const compareOpen = useAppSelector((state) => state.compare.open);
  const autoRotate = useAppSelector((state) => state.ui.autoRotate);

  const [engine, setEngine] = useState<GalaxyEngineHandle | null>(null);
  const [perf, setPerf] = useState<PerfReport>(NO_PERF);
  const [stats, setStats] = useState<EngineStats>(NO_STATS);
  // Null until the engine's first report, which `FadeSection` renders as em
  // dashes — a zeroed placeholder would read as a real "alpha 0.000" instead.
  const [fade, setFade] = useState<MilkyWayFadeReadout | null>(null);
  // Same null-until-first-report treatment, for the same reason — see
  // `SfMapSection`'s own readout.
  const [orientationDiagnostics, setOrientationDiagnostics] = useState<OrientationDiagnostics | null>(
    null,
  );
  const disconnectRef = useRef<(() => void) | null>(null);

  const handleEngine = (next: GalaxyEngineHandle | null): void => {
    disconnectRef.current?.();
    disconnectRef.current = next ? connectEngineBridge(store, next) : null;
    setEngine(next);
  };

  return (
    <div className={styles.root}>
      <Viewport
        onEngine={handleEngine}
        onPerf={setPerf}
        onStats={setStats}
        onFade={setFade}
        onOrientationDiagnostics={setOrientationDiagnostics}
      />
      <Hud perf={perf} stars={stats.stars} dust={stats.dust} />
      <div className={styles.autoRotatePill}>
        <AutoRotateToggle
          playing={autoRotate}
          onToggle={() => dispatch(autoRotateSet(!autoRotate))}
        />
      </div>
      <button
        type="button"
        className={cx(styles.compareToggle, compareOpen && styles.compareToggleActive)}
        onClick={() => dispatch(comparePanelToggled())}
      >
        <span aria-hidden>◧</span> {compareOpen ? 'Hide reference' : 'Compare vs. real'}
      </button>
      {compareOpen && <ComparePanel engine={engine} />}
      <ControlsPanel fade={fade} orientationDiagnostics={orientationDiagnostics} />
    </div>
  );
}

export default App;
