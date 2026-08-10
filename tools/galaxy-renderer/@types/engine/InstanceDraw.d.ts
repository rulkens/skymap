/**
 * InstanceDraw — one instanced billboard draw: a record buffer, and how many of
 * its records to instance. Which vertex slot it binds to is the pass's business.
 *
 * The star and dust passes each draw the central galaxy followed by every
 * extra, off buffers that are reallocated on `setParams`/`setExtras`. Projecting
 * that to one list at the call site keeps the reallocation hazard there: the
 * list is rebuilt per frame, so no pass module can capture a stale buffer.
 */

export type InstanceDraw = {
  readonly buf: GPUBuffer;
  readonly count: number;
};
