/**
 * main.ts — DOM bootstrap for the pillars spike. Owns the control panel
 * (built programmatically so each slider's label/range/default lives next
 * to the setting it drives) and delegates everything GPU to
 * createPillarsEngine.
 */
import type { PillarsSettings } from '../@types/PillarsSettings';

import { createPillarsEngine } from './engine/createPillarsEngine';

type SliderSpec = {
  key: keyof PillarsSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
};

// The volumetric + display knobs surfaced in the panel. Defaults mirror
// the engine's DEFAULT_SETTINGS — the engine is the source of truth; these
// are just the UI's starting positions.
const SLIDERS: readonly SliderSpec[] = [
  { key: 'exposure', label: 'exposure', min: 0.1, max: 3, step: 0.01, value: 1.05 },
  { key: 'bloom', label: 'bloom', min: 0, max: 1.5, step: 0.01, value: 0.55 },
  { key: 'densityMul', label: 'density', min: 0.2, max: 2.5, step: 0.01, value: 1.0 },
  { key: 'emissionMul', label: 'rim glow', min: 0, max: 20, step: 0.1, value: 6.0 },
  { key: 'scatterMul', label: 'starlight', min: 0, max: 8, step: 0.05, value: 2.5 },
  { key: 'ambientMul', label: 'ambient', min: 0, max: 4, step: 0.05, value: 0.8 },
  { key: 'starBrightness', label: 'stars', min: 0, max: 3, step: 0.05, value: 1.0 },
  { key: 'phaseG', label: 'anisotropy', min: 0, max: 0.85, step: 0.01, value: 0.45 },
];

async function boot(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const fatal = document.getElementById('fatal') as HTMLDivElement;

  // ?vol=tiny drops the bake volumes to a fraction of the default — the
  // escape hatch for software WebGPU (SwiftShader CI/smoke runs) where
  // full-res bakes take minutes of CPU. Visual quality drops accordingly;
  // it exists for machine verification, not for humans.
  const volPreset = new URLSearchParams(location.search).get('vol');
  const volumeDims = volPreset === 'tiny' ? ([56, 80, 56] as const) : undefined;

  let engine: Awaited<ReturnType<typeof createPillarsEngine>>;
  try {
    engine = await createPillarsEngine(canvas, {
      volumeDims,
      onFps: (fps) => {
        const el = document.getElementById('fps');
        if (el) el.textContent = `${fps} fps`;
      },
    });
  } catch (err) {
    fatal.style.display = 'grid';
    fatal.textContent =
      err instanceof Error && (err.message === 'no-webgpu' || err.message === 'no-adapter')
        ? 'WebGPU is unavailable in this browser. Chrome/Edge 113+, Safari 18+, or Firefox with WebGPU enabled.'
        : `Failed to start: ${String(err)}`;
    return;
  }

  const slidersHost = document.getElementById('sliders')!;
  for (const spec of SLIDERS) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = spec.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = spec.value.toFixed(2);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = v.toFixed(2);
      engine.setSettings({ [spec.key]: v });
    });
    row.append(name, input, val);
    slidersHost.append(row);
  }

  (document.getElementById('tonemap') as HTMLSelectElement).addEventListener('change', (e) => {
    engine.setSettings({ tonemap: Number((e.target as HTMLSelectElement).value) });
  });
  (document.getElementById('quality') as HTMLSelectElement).addEventListener('change', (e) => {
    engine.setSettings({ renderScale: Number((e.target as HTMLSelectElement).value) });
  });
  (document.getElementById('rotate') as HTMLInputElement).addEventListener('change', (e) => {
    engine.setAutoRotate((e.target as HTMLInputElement).checked);
  });
  let seed = 1;
  document.getElementById('reseed')!.addEventListener('click', () => {
    seed += 1;
    engine.regenerate(seed);
  });

  // Dev hook for headless smoke tests (grab() readback) and console
  // experimentation — a spike tool's window is its debug API.
  (window as unknown as { __pillars: unknown }).__pillars = engine;
}

void boot();
