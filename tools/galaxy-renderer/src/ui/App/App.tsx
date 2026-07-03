/**
 * App — the Galaxy Renderer's outer shell (html:13-146, 599-611): the
 * fullscreen `Viewport`, the always-on `Hud` + `ControlsPanel`, and the
 * toggleable `ComparePanel` validation panel.
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
 * `fps`/`stats` are per-frame telemetry, not app state — they live in
 * local `useState` and feed `Hud` directly, never the store (see
 * `HudProps`'s docblock for why).
 */
import { useRef, useState, type ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyEngineHandle } from '../../../@types/engine/GalaxyEngineHandle';
import type { EngineStats } from '../../../@types/engine/EngineStats';
import { useAppDispatch, useAppSelector, useAppStore } from '../../state/hooks';
import { connectEngineBridge } from '../../state/engineBridge';
import { comparePanelToggled } from '../../state/slices/compareSlice';
import Viewport from '../Viewport/Viewport';
import Hud from '../Hud/Hud';
import ComparePanel from '../ComparePanel/ComparePanel';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import styles from './App.module.css';

const NO_STATS: EngineStats = { stars: 0, dust: 0 };

function App(): ReactNode {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const compareOpen = useAppSelector((state) => state.compare.open);

  const [engine, setEngine] = useState<GalaxyEngineHandle | null>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState<EngineStats>(NO_STATS);
  const disconnectRef = useRef<(() => void) | null>(null);

  const handleEngine = (next: GalaxyEngineHandle | null): void => {
    disconnectRef.current?.();
    disconnectRef.current = next ? connectEngineBridge(store, next) : null;
    setEngine(next);
  };

  return (
    <div className={styles.root}>
      <Viewport onEngine={handleEngine} onFps={setFps} onStats={setStats} />
      <Hud fps={fps} stars={stats.stars} dust={stats.dust} />
      <button
        type="button"
        className={cx(styles.compareToggle, compareOpen && styles.compareToggleActive)}
        onClick={() => dispatch(comparePanelToggled())}
      >
        <span aria-hidden>◧</span> {compareOpen ? 'Hide reference' : 'Compare vs. real'}
      </button>
      {compareOpen && <ComparePanel engine={engine} />}
      <ControlsPanel />
    </div>
  );
}

export default App;
