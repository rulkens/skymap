/**
 * Viewport — owns the <canvas>, boots the flow harness, and bridges orbit input.
 * On mount it creates the WebGPU flow harness against the canvas and starts the
 * loop; on unmount it disposes it. Orbit input is bridged into the STORE rather
 * than mutating the harness camera directly (the harness reads the camera slice
 * each frame): drag dispatches setCameraYawPitch, wheel dispatches
 * setCameraDistance — keeping the store the single source of truth. createFlowHarness
 * is async; if it rejects (no WebGPU adapter, field fetch failure) we surface it
 * rather than leaving a silently dead canvas.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { Store } from '../../../@types/state/Store';
import type { AppState } from '../../../@types/state/AppState';
import { orbitDragDelta } from '../../../../utils/camera/orbitDragDelta';
import { createFlowHarness, type FlowHarness } from '../../createFlowHarness';
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

    let harness: FlowHarness | null = null;
    let disposed = false;
    createFlowHarness(canvas, store)
      .then((h) => {
        if (disposed) {
          h.dispose();
          return;
        }
        harness = h;
        h.start();
      })
      .catch((err) => {
        console.error('flow-workbench: harness failed to start', err);
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
      const { dYaw, dPitch } = orbitDragDelta(e.clientX - lastX, e.clientY - lastY, DRAG_SPEED);
      lastX = e.clientX;
      lastY = e.clientY;
      store.setState((s) => ({
        ...s,
        camera: setCameraYawPitch(s.camera, s.camera.yaw + dYaw, s.camera.pitch + dPitch),
      }));
    };
    // Linear step, not exponentialZoomDistance's ratio — deliberately not adopted here (R8).
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      store.setState((s) => ({
        ...s,
        camera: setCameraDistance(
          s.camera,
          s.camera.distance * (1 + Math.sign(e.deltaY) * ZOOM_STEP),
        ),
      }));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      disposed = true;
      harness?.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [store]);

  return <canvas ref={canvasRef} className={styles.canvas} />;
}

export default Viewport;
