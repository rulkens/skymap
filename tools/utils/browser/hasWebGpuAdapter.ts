/**
 * hasWebGpuAdapter — whether a page in this browser gets a WebGPU adapter.
 * False on a GPU-less machine (a cloud container) unless the browser was
 * launched with a software adapter. `navigator.gpu` exists only in a secure
 * context and `about:blank` is not one, so the probe loads a routed https page.
 */
import type { Browser } from '@playwright/test';

const PROBE_URL = 'https://webgpu-adapter-probe.invalid/';

export async function hasWebGpuAdapter(browser: Browser): Promise<boolean> {
  const page = await browser.newPage();
  try {
    await page.route(PROBE_URL, (route) => route.fulfill({ contentType: 'text/html', body: '' }));
    await page.goto(PROBE_URL);
    return await page.evaluate(async () => (await navigator.gpu?.requestAdapter()) != null);
  } finally {
    await page.close();
  }
}
