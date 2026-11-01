/**
 * installSoftwareCanvas — page init script for software WebGPU (SwiftShader).
 *
 * Headless Chromium on a GPU-less Linux box (cloud containers) loses the device
 * the first time a WebGPU canvas presents, so the app renders nothing. This hands
 * the app a stand-in 'webgpu' context that renders into a plain texture and never
 * presents, with rAF held while a frame is on the GPU (the backpressure presenting
 * gave). `window.__softwareCanvasGrab()` copies the last frame into a 2D canvas laid
 * over the app's, before a screenshot. Serialized by Playwright: no imports/closures.
 */
export function installSoftwareCanvas(): void {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const contexts = new WeakMap<HTMLCanvasElement, object>();
  const grabs: (() => Promise<void>)[] = [];

  // Without this the app queues frames faster than SwiftShader draws them, and a
  // readback waits out the whole backlog (tens of seconds, growing).
  let gpuBusy = false;
  let nextId = 1;
  const pending = new Map<number, number>();
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    const tick = (time: number): void => {
      if (gpuBusy) return void pending.set(id, raf(tick));
      pending.delete(id);
      callback(time);
    };
    pending.set(id, raf(tick));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const inner = pending.get(id);
    if (inner !== undefined) caf(inner);
    pending.delete(id);
  };

  function softwareContext(canvas: HTMLCanvasElement): object {
    let config: GPUCanvasConfiguration | null = null;
    let texture: GPUTexture | null = null;
    // A sibling, not the app's canvas: the app's resizes would clear its pixels.
    const overlay = document.createElement('canvas');
    overlay.dataset.softwareCanvas = '';
    const flat = (getContext as (id: '2d') => CanvasRenderingContext2D | null).call(overlay, '2d')!;

    grabs.push(async () => {
      if (!config || !texture) return;
      const { device, format } = config;
      const { width, height } = texture;
      const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      const buffer = device.createBuffer({
        size: bytesPerRow * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buffer.getMappedRange());
      const rgba = new Uint8ClampedArray(width * height * 4);
      const [r, b] = format.startsWith('bgra') ? [2, 0] : [0, 2];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * bytesPerRow + x * 4;
          const o = (y * width + x) * 4;
          rgba[o] = src[i + r]!;
          rgba[o + 1] = src[i + 1]!;
          rgba[o + 2] = src[i + b]!;
          rgba[o + 3] = 255;
        }
      }
      buffer.destroy();
      if (!overlay.isConnected) canvas.after(overlay);
      Object.assign(overlay, { width, height });
      Object.assign(overlay.style, {
        position: 'absolute',
        left: `${canvas.offsetLeft}px`,
        top: `${canvas.offsetTop}px`,
        width: `${canvas.clientWidth}px`,
        height: `${canvas.clientHeight}px`,
        zIndex: getComputedStyle(canvas).zIndex,
        pointerEvents: 'none',
      });
      flat.putImageData(new ImageData(rgba, width, height), 0, 0);
    });

    return {
      canvas,
      configure(next: GPUCanvasConfiguration) {
        config = next;
        texture?.destroy();
        texture = null;
      },
      unconfigure() {
        config = null;
      },
      getConfiguration: () => config,
      getCurrentTexture(): GPUTexture {
        if (!config) throw new Error('software canvas: getCurrentTexture before configure');
        if (!gpuBusy) {
          gpuBusy = true;
          const { queue } = config.device;
          // After this task, so the frame's own submits are in the queue.
          setTimeout(() => void queue.onSubmittedWorkDone().finally(() => (gpuBusy = false)));
        }
        const width = Math.max(1, canvas.width);
        const height = Math.max(1, canvas.height);
        if (!texture || texture.width !== width || texture.height !== height) {
          texture?.destroy();
          texture = config.device.createTexture({
            size: [width, height],
            format: config.format,
            usage:
              (config.usage ?? 0) | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
          });
        }
        return texture;
      },
    };
  }

  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    kind: string,
    ...rest: unknown[]
  ) {
    if (kind !== 'webgpu')
      return (getContext as (...a: unknown[]) => unknown).call(this, kind, ...rest);
    let context = contexts.get(this);
    if (!context) contexts.set(this, (context = softwareContext(this)));
    return context;
  } as typeof getContext;

  (window as unknown as { __softwareCanvasGrab: () => Promise<void> }).__softwareCanvasGrab =
    async () => {
      await Promise.all(grabs.map((grab) => grab()));
    };
}
