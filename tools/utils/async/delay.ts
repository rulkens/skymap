/**
 * delay — sleep for `ms` milliseconds, then resolve.
 *
 * Why this lives in tools/utils/async and not src/utils: it is used only
 * by Node-side pipeline scripts (rate-limiting outbound HTTP). The browser
 * has nothing equivalent in the bundle that benefits from sharing it.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
