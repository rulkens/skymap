/**
 * hasWebGpuAdapter — whether a page in this browser gets a WebGPU adapter.
 * False on a GPU-less machine (a cloud container) unless the browser was
 * launched with a software adapter.
 */
import type { Browser } from '@playwright/test';

export async function hasWebGpuAdapter(browser: Browser): Promise<boolean> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async () => (await navigator.gpu?.requestAdapter()) != null);
  } finally {
    await page.close();
  }
}
