import type { NetworkProfile } from './@types/NetworkProfile';

/**
 * Throttling presets. `slow-4g` is Lighthouse's mobile default; `3g` sits
 * between Chrome DevTools' "Slow 3G" and "Fast 3G"; `none` is the control.
 */
export const NETWORK_PROFILES = {
  '3g': { latencyMs: 300, downKbps: 750, upKbps: 250, cpuRate: 4 },
  'slow-4g': { latencyMs: 150, downKbps: 1600, upKbps: 750, cpuRate: 4 },
  'fast-4g': { latencyMs: 60, downKbps: 9000, upKbps: 3000, cpuRate: 4 },
  none: { latencyMs: 0, downKbps: 0, upKbps: 0, cpuRate: 1 },
} as const satisfies Record<string, NetworkProfile>;
