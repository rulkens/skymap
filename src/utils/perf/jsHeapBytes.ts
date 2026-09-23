/** Chrome's non-standard `performance.memory.usedJSHeapSize` — `null` on
 *  every other engine (Firefox/Safari expose no per-tab heap reading at all). */
export function jsHeapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize : null;
}
