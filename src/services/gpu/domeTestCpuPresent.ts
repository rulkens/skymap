/**
 * DOME-TEST (temporary, never commit): `?present=cpu` shows the frame through
 * the CPU. WebGPU draws into an off-page surface; each frame is read back and
 * uploaded to a WebGL context on the page canvas. On a desktop the NVIDIA
 * driver spreads over two cards, a WebGPU (D3D12) texture exists on one card
 * only, so the other card's projectors draw it empty; WebGL (D3D11) arrives.
 */

const READBACKS_IN_FLIGHT = 3;

type Presenter = {
  beforeFrame: () => void;
  afterFrame: () => void;
};

let presenter: Presenter | null = null;
let rendered = 0;
let renderedSince = performance.now();
let shown = 0;
let logTicks = 0;
let readoutBox: HTMLElement | null = null;
/** `&fps` in the address shows the readout; the log line is written either way. */
const SHOW_READOUT = new URLSearchParams(window.location.search).has('fps');
// A hot update leaves the previous module's readout on the page: hide it.
if (!SHOW_READOUT) {
  for (const element of Array.from(document.body.children)) {
    if (element instanceof HTMLElement && element.style.zIndex === '9999') element.hidden = true;
  }
}

/** A frame-rate readout in the middle of the page (the dome disc is centred there). */
function readout(): HTMLElement {
  if (readoutBox === null) {
    readoutBox = document.createElement('div');
    readoutBox.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;' +
      'padding:4px 12px;background:#000a;color:#fff;font:600 20px system-ui,sans-serif;pointer-events:none';
    document.body.append(readoutBox);
  }
  return readoutBox;
}

export const domeTestCpuPresent = {
  /** The off-page surface WebGPU should draw into instead of `canvas`. */
  install(canvas: HTMLCanvasElement, device: GPUDevice, format: GPUTextureFormat): GPUCanvasContext {
    const surface = new OffscreenCanvas(canvas.width, canvas.height);
    const context = surface.getContext('webgpu') as unknown as GPUCanvasContext;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false })!;

    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(
      program,
      compile(
        gl.VERTEX_SHADER,
        `#version 300 es
        out vec2 uv;
        void main() {
          vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
          uv = vec2(corner.x, 1.0 - corner.y); // WebGPU rows run top-down
          gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
        }`,
      ),
    );
    const swizzle = format === 'bgra8unorm' ? 'bgr' : 'rgb';
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;
        in vec2 uv;
        uniform sampler2D frame;
        out vec4 colour;
        void main() { colour = vec4(texture(frame, uv).${swizzle}, 1.0); }`,
      ),
    );
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    let width = 0;
    let height = 0;
    let bytesPerRow = 0;
    let generation = 0;
    let free: GPUBuffer[] = [];
    let frames = 0;
    let since = performance.now();

    const allocate = (w: number, h: number): void => {
      generation += 1;
      for (const buffer of free) buffer.destroy();
      width = w;
      height = h;
      bytesPerRow = Math.ceil((w * 4) / 256) * 256;
      free = Array.from({ length: READBACKS_IN_FLIGHT }, () =>
        device.createBuffer({
          size: bytesPerRow * h,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
      );
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, bytesPerRow / 4);
    };

    presenter = {
      beforeFrame() {
        if (surface.width !== canvas.width || surface.height !== canvas.height) {
          surface.width = canvas.width;
          surface.height = canvas.height;
        }
      },
      afterFrame() {
        const texture = context.getCurrentTexture();
        if (texture.width !== width || texture.height !== height) {
          allocate(texture.width, texture.height);
        }
        const buffer = free.pop();
        if (buffer === undefined) return;
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height]);
        device.queue.submit([encoder.finish()]);
        const mine = generation;
        void buffer.mapAsync(GPUMapMode.READ).then(() => {
          if (mine !== generation) {
            buffer.destroy();
            return;
          }
          gl.viewport(0, 0, width, height);
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            width,
            height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array(buffer.getMappedRange()),
          );
          buffer.unmap();
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          free.push(buffer);
          shown += 1;
          frames += 1;
          const elapsed = performance.now() - since;
          if (elapsed > 5000) {
            console.warn(
              `DOME-TEST cpu present ${width}x${height}: ${(frames / (elapsed / 1000)).toFixed(1)} frames/s`,
            );
            frames = 0;
            since = performance.now();
          }
        });
      },
    };
    return context;
  },
  beforeFrame(): void {
    presenter?.beforeFrame();
  },
  afterFrame(): void {
    presenter?.afterFrame();
    rendered += 1;
    const elapsed = performance.now() - renderedSince;
    if (elapsed > 1000) {
      const seconds = elapsed / 1000;
      const text = presenter
        ? `drawn ${(rendered / seconds).toFixed(0)} · shown ${(shown / seconds).toFixed(0)} frames/s`
        : `${(rendered / seconds).toFixed(0)} frames/s (direct)`;
      if (SHOW_READOUT) readout().textContent = text;
      logTicks += 1;
      if (logTicks % 5 === 0) console.warn(`DOME-TEST ${text}`);
      rendered = 0;
      shown = 0;
      renderedSince = performance.now();
    }
  },
};
