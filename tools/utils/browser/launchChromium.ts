/**
 * launchChromium — shared browser bootstrap for every Playwright harness
 * (perf, record, capture, shot). The 'chromium' channel (full build) runs WebGPU
 * with no flags. Two fallbacks keep the harnesses working in a cloud container:
 * a Chromium preinstalled at CONTAINER_CHROMIUM when Playwright's pinned build is
 * missing, and SwiftShader with `installSoftwareCanvas` on every new context when
 * the machine has no GPU (no adapter); there each page.screenshot() first grabs the
 * frame (a raw CDP capture, as `record` uses, sees none). `--enable-precise-memory-info`
 * un-quantizes `performance.memory`, which the perf harness reads.
 */
import { existsSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';
import { hasWebGpuAdapter } from './hasWebGpuAdapter';
import { installSoftwareCanvas } from './installSoftwareCanvas';

const BASE_ARGS = ['--enable-precise-memory-info'];
const SOFTWARE_GPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];
/** Where Claude Code's cloud containers keep their own Chromium. */
const CONTAINER_CHROMIUM = '/opt/pw-browsers/chromium';

async function launchInstalled(extraArgs: readonly string[]): Promise<Browser> {
  const args = [...BASE_ARGS, ...extraArgs];
  try {
    return await chromium.launch({ channel: 'chromium', args });
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    if (existsSync(CONTAINER_CHROMIUM)) {
      console.warn(`chromium channel launch failed (${reason}); using ${CONTAINER_CHROMIUM}`);
      return chromium.launch({ executablePath: CONTAINER_CHROMIUM, args });
    }
    console.warn(
      `chromium channel launch failed (${reason}); falling back to the headless shell with ` +
        "'--enable-unsafe-webgpu --use-angle=metal'; prefer 'npx playwright install chromium'",
    );
    return chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal', ...args] });
  }
}

export async function launchChromium(): Promise<Browser> {
  const browser = await launchInstalled([]);
  if (await hasWebGpuAdapter(browser)) return browser;
  await browser.close();
  console.warn(
    'no WebGPU adapter (no GPU?): rendering on SwiftShader — slow, and GPU timings mean nothing',
  );
  const software = await launchInstalled(SOFTWARE_GPU_ARGS);
  // tsx wraps named functions in a Node-only `__name` helper, so the page
  // gets an identity stand-in. Browser.newPage() goes through newContext().
  const content = `var __name = (f) => f; (${installSoftwareCanvas.toString()})();`;
  const newContext = software.newContext.bind(software);
  software.newContext = async (options) => {
    const context = await newContext(options);
    await context.addInitScript({ content });
    context.on('page', (page) => {
      const screenshot = page.screenshot.bind(page);
      page.screenshot = async (shotOptions) => {
        await page.evaluate(() =>
          (window as { __softwareCanvasGrab?: () => Promise<void> }).__softwareCanvasGrab?.(),
        );
        return screenshot(shotOptions);
      };
    });
    return context;
  };
  return software;
}
