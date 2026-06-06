/**
 * Viewport — owns the <canvas>, boots the Engine, and bridges orbit input.
 *
 * On mount it creates the WebGPU Engine against the canvas and starts the loop;
 * on unmount it disposes the engine. Orbit input is bridged into the STORE
 * rather than mutating the engine's camera directly (the engine reads the
 * camera slice each frame): drag dispatches setCameraYawPitch, wheel dispatches
 * setCameraDistance. This keeps the store the single source of truth and avoids
 * sharing a mutable camera object across the React/engine boundary.
 *
 * createEngine is async; if it rejects (no WebGPU adapter, field fetch failure)
 * we surface it rather than leaving a silently dead canvas.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { Store } from '../../../@types/state/Store';
import type { AppState } from '../../../@types/state/AppState';
import type { Engine } from '../../../@types/engine/Engine';
import { createEngine } from '../../engine/createEngine';
import { setCameraDistance, setCameraYawPitch } from '../../state/slices/cameraSlice';
import styles from './Viewport.module.css';

const DRAG_SPEED = 0.005; // radians per pixel (spike)
const ZOOM_STEP = 0.025; // fractional distance change per wheel notch (spike)

export type ViewportProps = {
  readonly store: Store<AppState>;
};

function Viewport({ store }: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: Engine | null = null;
    let disposed = false;
    createEngine(canvas, store)
      .then((e) => {
        if (disposed) {
          e.dispose();
          return;
        }
        engine = e;
        e.start();
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('cosmic-flow: engine failed to start', err);
      });

    // ── Orbit input → store ────────────────────────────────────────────────
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (): void => {
      dragging = false;
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      store.setState((s) =>
        ({
          ...s,
          camera: setCameraYawPitch(
            s.camera,
            s.camera.yaw + dx * DRAG_SPEED,
            s.camera.pitch + dy * DRAG_SPEED,
          ),
        }),
      );
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      store.setState((s) => ({
        ...s,
        camera: setCameraDistance(s.camera, s.camera.distance * (1 + Math.sign(e.deltaY) * ZOOM_STEP)),
      }));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      disposed = true;
      engine?.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [store]);

  return <canvas ref={canvasRef} className={styles.canvas} />;
}

export default Viewport;
