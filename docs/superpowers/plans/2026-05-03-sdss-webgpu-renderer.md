# SDSS WebGPU Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript + WebGPU 3D renderer for Sloan Digital Sky Survey (SDSS) point-cloud data, viewable in a browser with orbit-camera controls.

**Architecture:** A Vite-bundled single-page app initializes a WebGPU device on a canvas, uploads a static point cloud (synthetic data first, then SDSS-derived xyz+attributes from a preprocessed `.bin` file) to a single vertex buffer, and renders it as instanced billboards with a custom WGSL shader. An orbit camera provides view/projection matrices via uniform buffer. Coordinate conversion (RA/Dec/redshift → Cartesian Mpc) and the binary file format live in pure TS modules with unit tests.

**Tech Stack:**
- TypeScript 5.x, Vite 5.x
- WebGPU (via `@webgpu/types`)
- `gl-matrix` for camera math
- `vitest` for unit tests
- Node 20+ for tooling

**Browser support:** Chrome 113+ / Edge 113+ on desktop. Safari/Firefox WebGPU support is partial — out of scope for v1.

---

## File Structure

Files this plan will create:

```
.
├── index.html                          # canvas + module entry
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── .gitignore
├── README.md
├── src/
│   ├── main.ts                         # bootstrap: device, camera, renderer, loop
│   ├── gpu/
│   │   ├── device.ts                   # requestAdapter / requestDevice / configure context
│   │   ├── pointRenderer.ts            # render pipeline + draw call for point cloud
│   │   └── shaders/
│   │       └── points.wgsl             # vertex + fragment shader (billboarded points)
│   ├── camera/
│   │   ├── orbitCamera.ts              # state + matrices (pure)
│   │   └── orbitControls.ts            # mouse/wheel → camera updates
│   ├── data/
│   │   ├── synthetic.ts                # generate Nx{xyz,mag,colorIdx} test cloud
│   │   ├── coords.ts                   # RA/Dec/z → xyz (Mpc), pure functions
│   │   └── pointCloudFormat.ts         # binary .bin reader/writer (header + Float32 stream)
│   └── types.ts                        # PointCloud / CloudPoint shared types
├── tools/
│   └── csvToBin.ts                     # node script: SDSS CSV → .bin
├── tests/
│   ├── coords.test.ts
│   ├── pointCloudFormat.test.ts
│   └── orbitCamera.test.ts
└── docs/superpowers/plans/             # (this file lives here)
```

**File responsibilities (one each):**
- `gpu/device.ts` — adapter/device acquisition only
- `gpu/pointRenderer.ts` — pipeline state, vertex buffer upload, draw — knows nothing about camera math
- `camera/orbitCamera.ts` — pure state → matrices, no DOM
- `camera/orbitControls.ts` — DOM events → camera state mutations
- `data/coords.ts` — RA/Dec/redshift → Cartesian, pure
- `data/pointCloudFormat.ts` — binary serialization, pure
- `data/synthetic.ts` — test data generator

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `index.html`, `src/main.ts`, `README.md`

- [ ] **Step 1: Initialize git and create `.gitignore`**

```bash
cd /Users/rulkens/Development/js/skymap
git init
```

Create `.gitignore`:

```
node_modules/
dist/
.DS_Store
*.log
.vite/
data/*.bin
data/*.csv
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "skymap",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@webgpu/types": "^0.1.40",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0"
  },
  "dependencies": {
    "gl-matrix": "^3.4.3"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@webgpu/types", "vite/client"]
  },
  "include": ["src", "tests", "tools"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  assetsInclude: ['**/*.wgsl'],
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Skymap — SDSS WebGPU</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      #c { display: block; width: 100vw; height: 100vh; }
      #status { position: fixed; top: 8px; left: 8px; color: #ccc;
        font: 12px/1.4 ui-monospace, monospace; }
    </style>
  </head>
  <body>
    <canvas id="c"></canvas>
    <div id="status">initializing…</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create stub `src/main.ts`**

```ts
const status = document.getElementById('status')!;
status.textContent = 'hello, skymap';
```

- [ ] **Step 8: Install and verify**

```bash
npm install
npm run typecheck
npm run dev
```

Expected: typecheck passes, Vite serves at http://localhost:5173 showing "hello, skymap" on a black page. Stop the dev server (Ctrl+C) before continuing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + webgpu types"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
/** A point cloud in renderer-ready layout. */
export interface PointCloud {
  /** Number of points. */
  count: number;
  /** Interleaved xyz (Float32) — length === count * 3. Coordinates in Mpc. */
  positions: Float32Array;
  /** Apparent magnitude per point — length === count. */
  magnitudes: Float32Array;
  /** Color index (e.g. SDSS u-g) per point — length === count. */
  colorIndex: Float32Array;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add PointCloud type"
```

---

## Task 3: Coordinate conversion (TDD)

Convert SDSS sky coordinates (RA in degrees, Dec in degrees, redshift z) to Cartesian Mpc using simple Hubble's law: `d = c * z / H0` with `H0 = 70 km/s/Mpc`, `c = 299792.458 km/s` ⇒ `d_Mpc ≈ 4282.75 * z`. Galactic-axis convention here is right-handed: x toward (RA=0, Dec=0), y toward (RA=90°, Dec=0), z toward Dec=+90°.

**Files:**
- Create: `src/data/coords.ts`, `tests/coords.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/coords.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { redshiftToDistanceMpc, raDecZToCartesian } from '../src/data/coords';

const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

describe('redshiftToDistanceMpc', () => {
  it('returns 0 at z=0', () => {
    expect(redshiftToDistanceMpc(0)).toBe(0);
  });
  it('returns ~4282.75 Mpc at z=1', () => {
    expect(close(redshiftToDistanceMpc(1), 4282.749, 0.01)).toBe(true);
  });
});

describe('raDecZToCartesian', () => {
  it('places (RA=0, Dec=0, z=1) on +x axis', () => {
    const [x, y, z] = raDecZToCartesian(0, 0, 1);
    expect(close(x, 4282.749, 0.01)).toBe(true);
    expect(close(y, 0)).toBe(true);
    expect(close(z, 0)).toBe(true);
  });
  it('places (RA=90, Dec=0, z=1) on +y axis', () => {
    const [x, y, z] = raDecZToCartesian(90, 0, 1);
    expect(close(x, 0, 1e-6)).toBe(true);
    expect(close(y, 4282.749, 0.01)).toBe(true);
    expect(close(z, 0, 1e-6)).toBe(true);
  });
  it('places (RA=*, Dec=90, z=1) on +z axis', () => {
    const [x, y, z] = raDecZToCartesian(123, 90, 1);
    expect(close(x, 0, 1e-6)).toBe(true);
    expect(close(y, 0, 1e-6)).toBe(true);
    expect(close(z, 4282.749, 0.01)).toBe(true);
  });
  it('returns origin at z=0', () => {
    const [x, y, z] = raDecZToCartesian(45, 30, 0);
    expect([x, y, z]).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — module `../src/data/coords` not found.

- [ ] **Step 3: Implement `src/data/coords.ts`**

```ts
const C_KM_S = 299792.458;
const H0_KM_S_MPC = 70;
const HUBBLE_DISTANCE_MPC = C_KM_S / H0_KM_S_MPC;

export function redshiftToDistanceMpc(z: number): number {
  return HUBBLE_DISTANCE_MPC * z;
}

export function raDecZToCartesian(
  raDeg: number,
  decDeg: number,
  z: number
): [number, number, number] {
  const d = redshiftToDistanceMpc(z);
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  return [d * cosDec * Math.cos(ra), d * cosDec * Math.sin(ra), d * Math.sin(dec)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/data/coords.ts tests/coords.test.ts
git commit -m "feat: add RA/Dec/redshift → Cartesian Mpc conversion"
```

---

## Task 4: Binary point cloud format (TDD)

A simple little-endian binary format: 16-byte header (`magic: 4 bytes "SKMP"`, `version: u32 = 1`, `count: u32`, `reserved: u32 = 0`), followed by `count * 5` Float32 values (x, y, z, magnitude, colorIndex), interleaved per point.

**Files:**
- Create: `src/data/pointCloudFormat.ts`, `tests/pointCloudFormat.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/pointCloudFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/types';

function makeCloud(): PointCloud {
  return {
    count: 2,
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    magnitudes: new Float32Array([17.5, 18.2]),
    colorIndex: new Float32Array([0.5, 1.1]),
  };
}

describe('point cloud binary format', () => {
  it('round-trips a small cloud', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    const decoded = decodePointCloud(buf);
    expect(decoded.count).toBe(2);
    expect(Array.from(decoded.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(decoded.magnitudes)).toEqual([17.5, 18.2]);
    expect(Array.from(decoded.colorIndex)).toEqual([0.5, 1.1]);
  });

  it('rejects wrong magic', () => {
    const buf = new ArrayBuffer(16);
    expect(() => decodePointCloud(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version', () => {
    const original = makeCloud();
    const buf = encodePointCloud(original);
    new DataView(buf).setUint32(4, 99, true);
    expect(() => decodePointCloud(buf)).toThrow(/version/);
  });

  it('encoded byte length matches header + 5 * count * 4', () => {
    const buf = encodePointCloud(makeCloud());
    expect(buf.byteLength).toBe(16 + 2 * 5 * 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/data/pointCloudFormat.ts`**

```ts
import type { PointCloud } from '../types';

const MAGIC = 0x504d4b53; // "SKMP" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const FLOATS_PER_POINT = 5;

export function encodePointCloud(cloud: PointCloud): ArrayBuffer {
  const { count, positions, magnitudes, colorIndex } = cloud;
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magnitudes.length !== count) throw new Error('magnitudes length mismatch');
  if (colorIndex.length !== count) throw new Error('colorIndex length mismatch');

  const buf = new ArrayBuffer(HEADER_BYTES + count * FLOATS_PER_POINT * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true);

  const floats = new Float32Array(buf, HEADER_BYTES, count * FLOATS_PER_POINT);
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_POINT;
    floats[o + 0] = positions[i * 3 + 0]!;
    floats[o + 1] = positions[i * 3 + 1]!;
    floats[o + 2] = positions[i * 3 + 2]!;
    floats[o + 3] = magnitudes[i]!;
    floats[o + 4] = colorIndex[i]!;
  }
  return buf;
}

export function decodePointCloud(buf: ArrayBuffer): PointCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic');
  const version = dv.getUint32(4, true);
  if (version !== VERSION) throw new Error(`unsupported version: ${version}`);
  const count = dv.getUint32(8, true);

  const floats = new Float32Array(buf, HEADER_BYTES, count * FLOATS_PER_POINT);
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_POINT;
    positions[i * 3 + 0] = floats[o + 0]!;
    positions[i * 3 + 1] = floats[o + 1]!;
    positions[i * 3 + 2] = floats[o + 2]!;
    magnitudes[i] = floats[o + 3]!;
    colorIndex[i] = floats[o + 4]!;
  }
  return { count, positions, magnitudes, colorIndex };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/data/pointCloudFormat.ts tests/pointCloudFormat.test.ts
git commit -m "feat: add binary point cloud format encode/decode"
```

---

## Task 5: Synthetic point cloud generator

100k points distributed inside a sphere of radius 1000 Mpc, with random magnitudes/colors. Used as a stand-in until real SDSS data is loaded.

**Files:**
- Create: `src/data/synthetic.ts`

- [ ] **Step 1: Implement `src/data/synthetic.ts`**

```ts
import type { PointCloud } from '../types';

/** Deterministic PRNG (mulberry32) so visuals are reproducible. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSyntheticCloud(count: number, seed = 42): PointCloud {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  const radius = 1000;

  for (let i = 0; i < count; i++) {
    // Uniform in a sphere via rejection.
    let x: number, y: number, z: number, r2: number;
    do {
      x = rand() * 2 - 1;
      y = rand() * 2 - 1;
      z = rand() * 2 - 1;
      r2 = x * x + y * y + z * z;
    } while (r2 > 1);
    positions[i * 3 + 0] = x * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z * radius;
    magnitudes[i] = 14 + rand() * 8; // ~14..22
    colorIndex[i] = rand() * 2;       // ~0..2 (u-g-ish)
  }
  return { count, positions, magnitudes, colorIndex };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/data/synthetic.ts
git commit -m "feat: add synthetic point cloud generator"
```

---

## Task 6: WebGPU device initialization

**Files:**
- Create: `src/gpu/device.ts`

- [ ] **Step 1: Implement `src/gpu/device.ts`**

```ts
export interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}

export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuContext> {
  if (!navigator.gpu) throw new Error('WebGPU not supported in this browser.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter available.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not get webgpu context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  return { device, context, format, canvas };
}

/** Resize backing store to CSS size * devicePixelRatio. Returns true if changed. */
export function resizeCanvasToDisplay(canvas: HTMLCanvasElement): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Wire a smoke test in `src/main.ts`**

Replace `src/main.ts` with:

```ts
import { initGpu, resizeCanvasToDisplay } from './gpu/device';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('status')!;

async function main() {
  resizeCanvasToDisplay(canvas);
  const { device, context, format } = await initGpu(canvas);
  status.textContent = `WebGPU OK · ${format}`;

  function frame() {
    resizeCanvasToDisplay(canvas);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  status.textContent = `ERROR: ${err.message}`;
  console.error(err);
});
```

- [ ] **Step 3: Run dev server and verify visually**

```bash
npm run dev
```

Open http://localhost:5173 in Chrome. Expected: dark navy canvas filling the window; status bar shows "WebGPU OK · bgra8unorm" (or similar). No console errors. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/gpu/device.ts src/main.ts
git commit -m "feat: initialize WebGPU device with clear pass"
```

---

## Task 7: Orbit camera (TDD where possible)

Pure state → matrices. Inputs: target (vec3), distance, yaw, pitch, fov, aspect, near, far. Output: viewProj mat4. We test by checking the projected position of known points.

**Files:**
- Create: `src/camera/orbitCamera.ts`, `tests/orbitCamera.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/orbitCamera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { vec3, vec4 } from 'gl-matrix';
import { createOrbitCamera, computeViewProj } from '../src/camera/orbitCamera';

describe('orbit camera', () => {
  it('places the camera at +z when yaw=0 pitch=0', () => {
    const cam = createOrbitCamera({
      target: [0, 0, 0], distance: 10, yaw: 0, pitch: 0,
      fovYRad: Math.PI / 4, aspect: 1, near: 0.1, far: 100,
    });
    expect(cam.position[2]).toBeCloseTo(10, 5);
    expect(cam.position[0]).toBeCloseTo(0, 5);
    expect(cam.position[1]).toBeCloseTo(0, 5);
  });

  it('projects target near clip-space origin', () => {
    const cam = createOrbitCamera({
      target: [0, 0, 0], distance: 10, yaw: 0, pitch: 0,
      fovYRad: Math.PI / 4, aspect: 1, near: 0.1, far: 100,
    });
    const vp = computeViewProj(cam);
    const p = vec4.fromValues(0, 0, 0, 1);
    vec4.transformMat4(p, p, vp);
    // After perspective divide, x/y should be ~0 at the target.
    expect(Math.abs(p[0] / p[3])).toBeLessThan(1e-5);
    expect(Math.abs(p[1] / p[3])).toBeLessThan(1e-5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/camera/orbitCamera.ts`**

```ts
import { mat4, vec3 } from 'gl-matrix';

export interface OrbitCameraInit {
  target: [number, number, number];
  distance: number;
  yaw: number;   // radians, around world +Z
  pitch: number; // radians, clamped to (-π/2 + ε, π/2 - ε)
  fovYRad: number;
  aspect: number;
  near: number;
  far: number;
}

export interface OrbitCamera extends OrbitCameraInit {
  position: vec3;
}

export function createOrbitCamera(init: OrbitCameraInit): OrbitCamera {
  const cam: OrbitCamera = { ...init, position: vec3.create() };
  updatePosition(cam);
  return cam;
}

export function updatePosition(cam: OrbitCamera): void {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // yaw=0, pitch=0 → +z
  const dir = vec3.fromValues(cp * sy, sp, cp * cy);
  vec3.scaleAndAdd(cam.position, cam.target as vec3, dir, cam.distance);
}

export function computeViewProj(cam: OrbitCamera): mat4 {
  const view = mat4.create();
  mat4.lookAt(view, cam.position, cam.target as vec3, [0, 1, 0]);
  const proj = mat4.create();
  mat4.perspectiveZO(proj, cam.fovYRad, cam.aspect, cam.near, cam.far);
  const vp = mat4.create();
  mat4.multiply(vp, proj, view);
  return vp;
}
```

Note: `perspectiveZO` produces a clip-space depth range of [0, 1], which matches WebGPU's convention.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/camera/orbitCamera.ts tests/orbitCamera.test.ts
git commit -m "feat: add orbit camera with view/projection matrices"
```

---

## Task 8: Orbit controls (mouse + wheel)

Maps DOM input events to mutations of an `OrbitCamera`. No tests — DOM-event-driven; verified visually in the next task.

**Files:**
- Create: `src/camera/orbitControls.ts`

- [ ] **Step 1: Implement `src/camera/orbitControls.ts`**

```ts
import { OrbitCamera, updatePosition } from './orbitCamera';

const PITCH_LIMIT = Math.PI / 2 - 0.01;

export function attachOrbitControls(
  canvas: HTMLCanvasElement,
  cam: OrbitCamera,
): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    cam.yaw -= dx * 0.005;
    cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dy * 0.005));
    updatePosition(cam);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    cam.distance = Math.max(0.01, cam.distance * factor);
    updatePosition(cam);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('wheel', onWheel);
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/camera/orbitControls.ts
git commit -m "feat: add mouse/wheel orbit controls"
```

---

## Task 9: WGSL shader for billboarded points

Each point is drawn as a 2-triangle quad (6 vertices, instance per point). Vertex shader places the quad in clip space at the point's projected position with a fixed pixel size; fragment shader applies a soft circular falloff and color from a simple blue→yellow→red ramp on `colorIndex`.

**Files:**
- Create: `src/gpu/shaders/points.wgsl`

- [ ] **Step 1: Implement `src/gpu/shaders/points.wgsl`**

```wgsl
struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  pointSizePx: f32,
  brightness: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct PerVertex {
  @location(0) position: vec3<f32>,
  @location(1) magnitude: f32,
  @location(2) colorIndex: f32,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec3<f32>,
  @location(2) intensity: f32,
};

const QUAD = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
  vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
);

fn ramp(t: f32) -> vec3<f32> {
  // 0 → blue, 1 → white-yellow, 2 → red
  let s = clamp(t * 0.5, 0.0, 1.0);
  let blueWhite = mix(vec3<f32>(0.4, 0.6, 1.0), vec3<f32>(1.0, 0.95, 0.8), s);
  let whiteRed  = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.5, 0.3), s);
  return select(blueWhite, whiteRed, t > 1.0);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, p: PerVertex) -> VSOut {
  let center = u.viewProj * vec4<f32>(p.position, 1.0);
  let corner = QUAD[vi];
  let pxToClip = vec2<f32>(2.0 / u.viewport.x, 2.0 / u.viewport.y);
  let offset = corner * u.pointSizePx * pxToClip * center.w;
  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);
  out.uv = corner;
  out.tint = ramp(p.colorIndex);
  // Brighter for lower (i.e. smaller magnitude number) magnitudes; clamp.
  out.intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0) * u.brightness;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let alpha = exp(-r2 * 4.0);
  let rgb = in.tint * in.intensity;
  return vec4<f32>(rgb * alpha, alpha);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/gpu/shaders/points.wgsl
git commit -m "feat: add point billboard WGSL shader"
```

---

## Task 10: Point renderer

Owns the render pipeline, uniform buffer, and vertex buffer; exposes `upload(cloud)` and `draw(viewProj, viewport)`.

**Files:**
- Create: `src/gpu/pointRenderer.ts`

- [ ] **Step 1: Implement `src/gpu/pointRenderer.ts`**

```ts
import { mat4 } from 'gl-matrix';
import type { PointCloud } from '../types';
import shaderSrc from './shaders/points.wgsl?raw';

const FLOATS_PER_POINT = 5;
const POINT_STRIDE = FLOATS_PER_POINT * 4;
const UNIFORM_BYTES = 16 * 4 + 4 * 4; // mat4 + vec4 (viewport, pointSize, brightness)

export class PointRenderer {
  private pipeline: GPURenderPipeline;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer | null = null;
  private count = 0;

  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
  ) {
    const module = device.createShaderModule({ code: shaderSrc });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: POINT_STRIDE,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
              { shaderLocation: 1, offset: 12, format: 'float32'   }, // magnitude
              { shaderLocation: 2, offset: 16, format: 'float32'   }, // colorIndex
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  upload(cloud: PointCloud): void {
    const interleaved = new Float32Array(cloud.count * FLOATS_PER_POINT);
    for (let i = 0; i < cloud.count; i++) {
      const o = i * FLOATS_PER_POINT;
      interleaved[o + 0] = cloud.positions[i * 3 + 0]!;
      interleaved[o + 1] = cloud.positions[i * 3 + 1]!;
      interleaved[o + 2] = cloud.positions[i * 3 + 2]!;
      interleaved[o + 3] = cloud.magnitudes[i]!;
      interleaved[o + 4] = cloud.colorIndex[i]!;
    }
    this.vertexBuffer?.destroy();
    this.vertexBuffer = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, interleaved);
    this.count = cloud.count;
  }

  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    pointSizePx = 2.5,
    brightness = 1.0,
  ): void {
    if (!this.vertexBuffer || this.count === 0) return;

    const uniformData = new Float32Array(UNIFORM_BYTES / 4);
    uniformData.set(viewProj, 0);
    uniformData[16] = viewportPx[0];
    uniformData[17] = viewportPx[1];
    uniformData[18] = pointSizePx;
    uniformData[19] = brightness;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(6, this.count);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/gpu/pointRenderer.ts
git commit -m "feat: add point renderer with instanced billboards"
```

---

## Task 11: Wire it all together — synthetic cloud rendered with orbit camera

**Files:**
- Modify: `src/main.ts` (full replacement)

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { initGpu, resizeCanvasToDisplay } from './gpu/device';
import { PointRenderer } from './gpu/pointRenderer';
import { createOrbitCamera, computeViewProj, updatePosition } from './camera/orbitCamera';
import { attachOrbitControls } from './camera/orbitControls';
import { generateSyntheticCloud } from './data/synthetic';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('status')!;

async function main() {
  resizeCanvasToDisplay(canvas);
  const { device, context, format } = await initGpu(canvas);

  const renderer = new PointRenderer(device, format);
  const cloud = generateSyntheticCloud(100_000);
  renderer.upload(cloud);

  const cam = createOrbitCamera({
    target: [0, 0, 0],
    distance: 2500,
    yaw: 0,
    pitch: 0.3,
    fovYRad: (Math.PI / 180) * 60,
    aspect: canvas.width / canvas.height,
    near: 1,
    far: 20000,
  });
  attachOrbitControls(canvas, cam);

  status.textContent = `WebGPU OK · ${cloud.count.toLocaleString()} synthetic points · drag to orbit, wheel to zoom`;

  function frame() {
    if (resizeCanvasToDisplay(canvas)) {
      cam.aspect = canvas.width / canvas.height;
      updatePosition(cam);
    }
    const vp = computeViewProj(cam);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    renderer.draw(pass, vp, [canvas.width, canvas.height]);
    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  status.textContent = `ERROR: ${err.message}`;
  console.error(err);
});
```

- [ ] **Step 2: Run dev server and verify visually**

```bash
npm run dev
```

Open http://localhost:5173. Expected:
- A dense cloud of small bright dots resembling a sphere, colored from blue through yellowish to red
- Drag to orbit → cloud rotates smoothly
- Mouse wheel → zoom in/out
- No console errors, ~60fps in Chrome devtools performance tab
- Status bar shows "WebGPU OK · 100,000 synthetic points · drag to orbit, wheel to zoom"

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: render 100k synthetic points with orbit camera"
```

---

## Task 12: SDSS CSV → .bin tool

A Node script that reads a CSV with columns `ra,dec,z,modelMag_g,modelMag_u` (typical SkyServer SQL output) and writes a `.bin` file using our format. Skips rows where `z <= 0` or `z` is missing.

**Files:**
- Create: `tools/csvToBin.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Implement `tools/csvToBin.ts`**

```ts
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { raDecZToCartesian } from '../src/data/coords';
import { encodePointCloud } from '../src/data/pointCloudFormat';
import type { PointCloud } from '../src/types';

interface Row {
  ra: number; dec: number; z: number; magG: number; magU: number;
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0]!.split(',').map((s) => s.trim().toLowerCase());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`missing column: ${name}`);
    return i;
  };
  const iRa = idx('ra'), iDec = idx('dec'), iZ = idx('z');
  const iG = idx('modelmag_g'), iU = idx('modelmag_u');
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',');
    const z = parseFloat(cells[iZ]!);
    if (!Number.isFinite(z) || z <= 0) continue;
    const ra = parseFloat(cells[iRa]!);
    const dec = parseFloat(cells[iDec]!);
    const magG = parseFloat(cells[iG]!);
    const magU = parseFloat(cells[iU]!);
    if (![ra, dec, magG, magU].every(Number.isFinite)) continue;
    out.push({ ra, dec, z, magG, magU });
  }
  return out;
}

function buildCloud(rows: Row[]): PointCloud {
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const { ra, dec, z, magG, magU } = rows[i]!;
    const [x, y, zc] = raDecZToCartesian(ra, dec, z);
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = zc;
    magnitudes[i] = magG;
    colorIndex[i] = magU - magG; // u-g color
  }
  return { count, positions, magnitudes, colorIndex };
}

function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error('usage: csvToBin <input.csv> <output.bin>');
    process.exit(1);
  }
  const text = readFileSync(inPath, 'utf8');
  const rows = parseCsv(text);
  const cloud = buildCloud(rows);
  const buf = encodePointCloud(cloud);
  writeFileSync(outPath, Buffer.from(buf));
  console.log(`wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength} bytes)`);
}

main();
```

- [ ] **Step 2: Add tsx dev dependency and script**

```bash
npm install --save-dev tsx
```

Edit `package.json` `scripts` to add:

```json
"csv-to-bin": "tsx tools/csvToBin.ts"
```

- [ ] **Step 3: Smoke-test with a tiny CSV**

```bash
mkdir -p data
cat > data/sample.csv <<'EOF'
ra,dec,z,modelMag_g,modelMag_u
180.0,0.0,0.1,18.5,19.2
90.0,30.0,0.2,17.1,17.8
0.0,-30.0,0.05,19.3,20.0
EOF
npm run csv-to-bin -- data/sample.csv data/sample.bin
```

Expected: prints "wrote 3 points to data/sample.bin (76 bytes)" (16 header + 3 × 20).

- [ ] **Step 4: Commit**

```bash
git add tools/csvToBin.ts package.json package-lock.json
git commit -m "feat: add SDSS csv → bin conversion tool"
```

---

## Task 13: Load `.bin` at runtime, fall back to synthetic

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `src/main.ts` to fetch `data/sdss.bin` on startup**

Replace the section that creates the cloud with:

```ts
async function loadCloud() {
  try {
    const res = await fetch('/data/sdss.bin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const { decodePointCloud } = await import('./data/pointCloudFormat');
    return { cloud: decodePointCloud(buf), source: 'sdss.bin' as const };
  } catch {
    return { cloud: generateSyntheticCloud(100_000), source: 'synthetic' as const };
  }
}

const { cloud, source } = await loadCloud();
renderer.upload(cloud);
```

And update the status line:

```ts
status.textContent = `WebGPU OK · ${cloud.count.toLocaleString()} points (${source}) · drag to orbit, wheel to zoom`;
```

The `/data` directory is served by Vite from the project root via `publicDir`. Move `data/` into `public/` so Vite serves it:

```bash
mkdir -p public
mv data public/data
```

Update `.gitignore`:

```
public/data/*.bin
public/data/*.csv
```

And update the csv-to-bin smoke test path expectations: it now writes to `public/data/`. Update the script invocation in the README accordingly.

- [ ] **Step 2: Run dev server**

```bash
npm run dev
```

Expected without a real `sdss.bin`: status reads "100,000 points (synthetic)".

If `public/data/sdss.bin` exists (e.g., from running `csv-to-bin`), expected: status reads "(sdss.bin)" with that file's point count.

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: load SDSS .bin at runtime with synthetic fallback"
```

---

## Task 14: README with quickstart and SDSS data instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# skymap

WebGPU 3D renderer for Sloan Digital Sky Survey (SDSS) point-cloud data.

## Requirements

- Node 20+
- A WebGPU-capable browser (Chrome 113+ or Edge 113+ on desktop)

## Quickstart (synthetic data)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — drag to orbit, scroll to zoom. With no SDSS data file present, you'll see 100,000 synthetic points in a sphere.

## Real SDSS data

1. Get a CSV from [SDSS SkyServer SQL Search](http://skyserver.sdss.org/dr18/SearchTools/sql) with at least these columns:

   ```sql
   SELECT TOP 500000 ra, dec, z, modelMag_g, modelMag_u
   FROM SpecObj
   WHERE z > 0 AND zWarning = 0 AND class = 'GALAXY'
   ```

2. Save the result as `your-query.csv`.

3. Convert it to our binary format:

   ```bash
   npm run csv-to-bin -- your-query.csv public/data/sdss.bin
   ```

4. Reload the page. The status bar should now read `(sdss.bin)`.

## Tests

```bash
npm test
```

## Architecture

See `docs/superpowers/plans/2026-05-03-sdss-webgpu-renderer.md`.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with SDSS data quickstart"
```

---

## Out of scope (deferred)

These are intentionally not in v1. Listed so future-you knows what was deliberately skipped:

- **Proper comoving distance** integrating ΛCDM cosmology (currently linear Hubble's law).
- **LOD / streaming / tiling** for >5M points.
- **Depth buffer.** Additive blending without depth is correct for point-cloud galaxies (overlap = brighter), but if opaque objects are added later, a depth attachment is needed.
- **Picking / hover info.** Requires a separate ID-buffer pass.
- **Proper galactic coordinate axes** (currently equatorial-aligned right-handed). Switching to galactic l/b only changes the matrix — easy follow-up.
- **HUD / overlay UI** beyond the status div.
- **Galaxy color from real SDSS bands beyond u-g.**

---

## Self-review notes

- Spec coverage: scaffold ✓, WebGPU init ✓, camera ✓, controls ✓, point rendering ✓, coord conversion ✓, binary format ✓, real data loading ✓, tooling ✓, docs ✓.
- Type consistency: `PointCloud` shape used identically in `synthetic.ts`, `pointCloudFormat.ts`, `pointRenderer.ts`, `csvToBin.ts`. Camera function names (`createOrbitCamera`, `updatePosition`, `computeViewProj`) are consistent across `orbitCamera.ts`, `orbitControls.ts`, `main.ts`.
- No placeholders. Every code step shows the actual code. Every test step shows the actual assertions.
````