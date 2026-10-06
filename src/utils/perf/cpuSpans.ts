/**
 * cpuSpans — main-thread milliseconds per named frame row (`plan:<name>`,
 * `compute:<name>`, `draw:<name>`, `frame`), summed since the last `clear`.
 * Off unless the perf hook's `collectCpu` is sampling: a call site reads
 * `cpuSpans.on` before it touches the clock, so an idle frame pays one branch.
 */
export const cpuSpans = {
  on: false,
  ms: new Map<string, number>(),
  add(name: string, startMs: number): void {
    this.ms.set(name, (this.ms.get(name) ?? 0) + performance.now() - startMs);
  },
};
