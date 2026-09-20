/**
 * launchChromium — shared browser bootstrap for every Playwright harness
 * (perf, record, capture). The 'chromium' channel (full build) runs WebGPU
 * with no flags; Playwright's default headless shell needs the two flags
 * below and is only a fallback for a machine missing the channel install.
 */
import { chromium, type Browser } from '@playwright/test';

export async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chromium' });
  } catch (err) {
    console.warn(
      `chromium channel launch failed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`,
    );
    console.warn(
      "falling back to the headless shell with '--enable-unsafe-webgpu --use-angle=metal'; " +
        "prefer 'npx playwright install chromium' for the proven full-build path",
    );
    return chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
  }
}
