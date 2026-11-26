// constants.wesl's HISTOGRAM_BASE is a `const` (not `override`) — fixed at build time, never a
// per-run knob — so one host-side mirror is enough; HistogramPlot's "(log <base>)" readout
// quotes this rather than restating 10 a second time.
export const HISTOGRAM_BASE = 10;
