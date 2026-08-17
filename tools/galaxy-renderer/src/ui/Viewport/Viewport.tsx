/**
 * Viewport — owns the <canvas>, boots the galaxy engine, and reports the
 * live handle to its parent.
 *
 * On mount it creates the engine, seeds it with the tool's boot defaults,
 * and only then reports the handle via `onEngine` — a caller that reaches
 * for it earlier would find nothing drawn yet. `createGalaxyEngine` is
 * async and can still be in flight when this component unmounts; the
 * `disposed` flag guards that race by disposing the just-resolved handle
 * rather than handing it to a parent that already stopped listening.
 *
 * Camera input is engine-internal, so this component adds none of its own.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GalaxyEngineHandle } from '../../../@types/engine/GalaxyEngineHandle';
import type { EngineStats } from '../../../@types/engine/EngineStats';
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import type { PerfReport } from '../../../@types/engine/PerfReport';
import { createGalaxyEngine } from '../../engine/createGalaxyEngine';
import { DEFAULT_GALAXY_PARAMS } from '../../data/defaultGalaxyParams';
import { DEFAULT_RENDER_SETTINGS } from '../../data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../../data/defaultLodSettings';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import styles from './Viewport.module.css';

/** `?probeReadback`-gated bridge so `probeGpuErrors.ts` (a page.evaluate, no React tree) can reach the live engine handle — see `createIsmMapReadbacks.ts`'s `requestRingMeans`. */
type ProbeReadbackWindow = { __probeEngine?: GalaxyEngineHandle };

export type ViewportProps = {
  readonly onEngine?: (engine: GalaxyEngineHandle | null) => void;
  readonly onPerf?: (report: PerfReport) => void;
  readonly onStats?: (stats: EngineStats) => void;
  readonly onFade?: (readout: MilkyWayFadeReadout) => void;
  readonly onOrientationDiagnostics?: (diagnostics: OrientationDiagnostics) => void;
};

// `createGalaxyEngine` throws these two bare messages;
// anything else is an unexpected failure and gets shown verbatim.
type BootStatus = 'loading' | 'live' | 'no-webgpu' | 'no-adapter' | 'error';

function statusFromError(err: unknown): BootStatus {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'no-webgpu' || message === 'no-adapter') return message;
  return 'error';
}

function Viewport({
  onEngine,
  onPerf,
  onStats,
  onFade,
  onOrientationDiagnostics,
}: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<BootStatus>('loading');
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let handle: GalaxyEngineHandle | null = null;

    createGalaxyEngine(canvas, { autoRotate: true, onPerf, onStats, onFade, onOrientationDiagnostics })
      .then(async (engine) => {
        if (disposed) {
          engine.dispose();
          return;
        }
        engine.setRender({ ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS });
        await engine.setParams(DEFAULT_GALAXY_PARAMS);
        if (disposed) {
          engine.dispose();
          return;
        }
        handle = engine;
        setStatus('live');
        onEngine?.(engine);
        // Debug-only: a normal session never puts engine internals on
        // `window` — only a run navigated with `?probeReadback` does.
        if (hasUrlGate('probeReadback')) {
          (window as unknown as ProbeReadbackWindow).__probeEngine = engine;
        }
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setErrorDetail(err instanceof Error ? err.message : String(err));
        setStatus(statusFromError(err));
      });

    return () => {
      disposed = true;
      handle?.dispose();
      onEngine?.(null);
      delete (window as unknown as ProbeReadbackWindow).__probeEngine;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot-once effect: onEngine/onPerf/onStats/onFade/onOrientationDiagnostics are read only inside the one-time engine construction above; listing them would re-run the boot on every new inline callback from the parent
  }, []);

  const showFallback = status === 'no-webgpu' || status === 'no-adapter' || status === 'error';

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.canvas} />
      {status === 'loading' && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingLabel}>Initializing WebGPU · generating stars…</div>
        </div>
      )}
      {showFallback && (
        <div className={styles.fallback}>
          <div className={styles.fallbackCard}>
            <div className={styles.fallbackGlyph}>✦</div>
            <div className={styles.fallbackTitle}>WebGPU is required</div>
            <div className={styles.fallbackBody}>
              This renderer draws hundreds of thousands of stars on the GPU and needs a browser with
              WebGPU enabled.
            </div>
            <ul className={styles.fallbackHints}>
              <li>Use Chrome or Edge 113+ (desktop), or Safari 18+.</li>
              <li>
                Firefox: enable <code>dom.webgpu.enabled</code> in about:config.
              </li>
              <li>On a laptop, make sure hardware acceleration is on.</li>
            </ul>
            <div className={styles.fallbackDetail}>
              {status === 'no-webgpu'
                ? 'WebGPU not available'
                : status === 'no-adapter'
                  ? 'No compatible GPU adapter found'
                  : errorDetail}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Viewport;
