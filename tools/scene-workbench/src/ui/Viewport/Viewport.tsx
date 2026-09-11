/**
 * Viewport — owns the <canvas>, the WebGPU device, the input rig, and the rAF
 * frame driver. The scene itself lives in `resources` (`RenderResources`),
 * created here and handed to the loading sagas via `registerSagaContext`: they
 * own every write to it, this component only reads it each frame. The camera
 * uniform and renderer set are device-lifetime — built once after `initGpu`
 * resolves, disposed only on unmount, never rebuilt on a group switch. The
 * driver reads the store directly, never `useAppSelector`: a frame must not
 * be a render.
 */
import { useEffect, useRef, type ReactNode } from 'react';

import { initGpu, resizeCanvasToDisplay } from '../../../../../src/services/gpu/device';
import { createSceneInput } from '../../input/createSceneInput';
import { createLidarPointRenderer, type LidarPointRenderer } from '../../render/lidarPointRenderer';
import {
  createRenderResources,
  disposeScene,
  type GpuAsset,
  type RenderResources,
} from '../../render/renderResources';
import { createSceneCameraUniform, type SceneCameraUniform } from '../../render/sceneCameraUniform';
import { sceneCameraView } from '../../render/sceneCameraView';
import { createSplatRenderer, type SplatRenderer } from '../../render/splatRenderer';
import { deviceLost } from '../../state/view/viewSlice';
import type { RegisterSagaContext, SceneStore } from '../../store/types';
import styles from './Viewport.module.css';

export type ViewportProps = {
  readonly store: SceneStore;
  readonly registerSagaContext: RegisterSagaContext;
};

/** The depth buffer follows the drawable size; a stale one would clip the frame
 *  to the old canvas. Owned by `RenderResources`, so a dispose frees it. */
function depthViewFor(
  device: GPUDevice,
  resources: RenderResources,
  width: number,
  height: number,
): GPUTextureView {
  const existing = resources.depthTexture;
  if (existing && existing.width === width && existing.height === height) {
    return existing.createView();
  }
  existing?.destroy();
  const texture = device.createTexture({
    label: 'scene-workbench-depth',
    size: [width, height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  resources.depthTexture = texture;
  return texture.createView();
}

function visibleAssetsOfKind<K extends GpuAsset['kind']>(
  resources: RenderResources,
  kind: K,
  hiddenAssetIds: readonly string[],
): Extract<GpuAsset, { kind: K }>[] {
  const drawn: Extract<GpuAsset, { kind: K }>[] = [];
  for (const [id, asset] of resources.gpuAssets) {
    if (asset.kind === kind && !hiddenAssetIds.includes(id)) {
      drawn.push(asset as Extract<GpuAsset, { kind: K }>);
    }
  }
  return drawn;
}

function Viewport({ store, registerSagaContext }: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // Re-typed (not just narrowed) so the closures below don't re-check
    // nullability — TS drops a `const` narrowing across a function boundary.
    const canvas: HTMLCanvasElement = canvasEl;

    const resources = createRenderResources();
    let cameraUniform: SceneCameraUniform | null = null;
    let lidar: LidarPointRenderer | null = null;
    let splat: SplatRenderer | null = null;
    let disposed = false;
    let rafHandle = 0;
    // Starts true so the first frame after the device lands always draws.
    let dirty = true;

    const input = createSceneInput({
      canvas,
      store,
      markDirty: () => {
        dirty = true;
      },
    });

    const frame = (): void => {
      if (disposed) return;
      const state = store.getState();
      if (state.view.deviceLost) return; // stop for good — the device is gone
      rafHandle = requestAnimationFrame(frame);
      const { gpu } = resources;
      if (!gpu || !cameraUniform || !lidar || !splat) return;

      // Ahead of the dirty gate: draining is what turns a gesture into one.
      input.drain();
      // The DOM read runs every tick, idle or not: a pure window resize is the
      // one change no store write would ever announce.
      if (resizeCanvasToDisplay(canvas)) dirty = true;
      if (!dirty) return;
      dirty = false;

      const view = sceneCameraView(input.getCameraPose(), [canvas.width, canvas.height]);
      cameraUniform.write(
        view,
        state.view.display.pointCloud.pointSizePx,
        state.view.display.gaussianSplat.splatScale,
        state.view.display.gaussianSplat.opacityScale,
      );

      const encoder = gpu.device.createCommandEncoder({ label: 'scene-workbench-frame' });
      const pass = encoder.beginRenderPass({
        label: 'scene-workbench-pass',
        colorAttachments: [
          {
            view: gpu.context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depthViewFor(gpu.device, resources, canvas.width, canvas.height),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      // Opaque lidar first (writes depth), then splats blended over it.
      pass.setBindGroup(0, cameraUniform.bindGroup);
      const hidden = state.view.hiddenAssetIds;
      lidar.draw(pass, visibleAssetsOfKind(resources, 'pointCloud', hidden));
      splat.draw(pass, visibleAssetsOfKind(resources, 'gaussianSplat', hidden));
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    };

    // Every store write in this tool moves something a frame reads (asset
    // statuses, visibility, camera), including the ones that ride a
    // `disposeScene` — so `resources.epoch` needs no separate seat here.
    const unsubscribe = store.subscribe(() => {
      dirty = true;
    });

    // A 6 M-splat bake is 168 MB of core records in ONE storage binding, past
    // the 128 MiB default; initGpu clamps the ask to the adapter's maximum.
    void initGpu(canvas, {
      requiredLimits: { maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER },
    })
      .then((gpu) => {
        if (disposed) return;
        resources.gpu = gpu;
        cameraUniform = createSceneCameraUniform(gpu.device);
        lidar = createLidarPointRenderer(gpu, gpu.format, cameraUniform.layout);
        splat = createSplatRenderer(gpu, gpu.format, cameraUniform.layout);
        void gpu.device.lost.then((info) => {
          // 'destroyed' is our own teardown, not a failure.
          if (disposed || info.reason === 'destroyed') return;
          console.error(`scene-workbench: GPU device lost (${info.reason}) — reload the page`);
          store.dispatch(deviceLost());
        });
        registerSagaContext({ resources });
        rafHandle = requestAnimationFrame(frame);
      })
      .catch((err: unknown) => {
        console.error('scene-workbench: WebGPU init failed', err);
      });

    return () => {
      disposed = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      unsubscribe();
      input.destroy();
      cameraUniform?.dispose();
      disposeScene(resources);
    };
  }, [store, registerSagaContext]);

  return <canvas ref={canvasRef} className={styles.root} />;
}

export default Viewport;
