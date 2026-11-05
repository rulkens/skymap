/**
 * True in a browser tab on an iPhone or iPad. Only iOS WebKit defines `navigator.standalone`: false
 * in a tab, true in a Home Screen app, absent elsewhere, so a falsy test would match every browser.
 */
export function isIosBrowserTab(): boolean {
  return Reflect.get(navigator, 'standalone') === false;
}
