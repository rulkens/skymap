/**
 * launchChromium — shared browser bootstrap for every Playwright harness
 * (perf, record, capture). The 'chromium' channel (full build) runs WebGPU
 * with no flags; Playwright's default headless shell needs the two flags
 * below and is only a fallback for a machine missing the channel install.
 * `--enable-precise-memory-info` un-quantizes `performance.memory` on both
 * paths, which the perf harness's JS-heap reading needs.
 */
import { chromium, type Browser } from '@playwright/test';

// `SKYMAP_CHROMIUM_ARGS` (space-separated) reaches the channel launch: a GPU-less
// container gets a WebGPU adapter only with
// '--enable-unsafe-webgpu --ignore-gpu-blocklist' (SwiftShader), flags a desktop
// must not carry by default.
const extraArgs = (process.env.SKYMAP_CHROMIUM_ARGS ?? '').split(' ').filter(Boolean);

export async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({
      channel: 'chromium',
      args: ['--enable-precise-memory-info', ...extraArgs],
    });
  } catch (err) {
    console.warn(
      `chromium channel launch failed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`,
    );
    console.warn(
      "falling back to the headless shell with '--enable-unsafe-webgpu --use-angle=metal'; " +
        "prefer 'npx playwright install chromium' for the proven full-build path",
    );
    return chromium.launch({
      args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-precise-memory-info'],
    });
  }
}
