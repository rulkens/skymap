import { MAX_PARTICLES } from '../../gpu/renderers/flowFieldConstants';
import type { FlowFieldStore } from '../../../@types/engine/data/FlowFieldStore';

/**
 * createFlowFieldStore — factory for the flow-field layer's status + param store.
 *
 * Same factory + closure shape as the other per-type stores: closure `let`
 * scalars behind getters, one mutation seam per field, the whole object frozen.
 * Unlike the status-only stores this also carries the look/motion tunables,
 * because the flow layer has no separate `settings.flow` slice — its single
 * "enabled" bit and its sliders are owned here (see `FlowFieldStore`).
 *
 * The tunable defaults (`mode` / `trail` / `flowSpeed` / `densityBias` /
 * `wander`) are pinned to the spike's hand-dialled advect look, lifted from
 * `tools/cosmic-flow/src/state/slices/flowSlice.ts` (`defaultFlowSlice.advect`).
 * They are the look — do not "tidy" them.
 */

export function createFlowFieldStore(): FlowFieldStore {
  let loaded = false;
  let enabled = false;
  let mode: FlowFieldStore['mode'] = 'advect';
  let intensity = 0.7;
  let count = MAX_PARTICLES;
  // Spike advect defaults (flowSlice.ts defaultFlowSlice.advect).
  let trail = 0.003;
  let flowSpeed = 0.06;
  let densityBias = 1;
  let wander = 0.15;

  const clamp = (v: number, lo: number, hi: number): number =>
    v < lo ? lo : v > hi ? hi : v;

  return Object.freeze({
    get loaded(): boolean {
      return loaded;
    },
    get enabled(): boolean {
      return enabled;
    },
    get mode(): FlowFieldStore['mode'] {
      return mode;
    },
    get intensity(): number {
      return intensity;
    },
    get count(): number {
      return count;
    },
    get trail(): number {
      return trail;
    },
    get flowSpeed(): number {
      return flowSpeed;
    },
    get densityBias(): number {
      return densityBias;
    },
    get wander(): number {
      return wander;
    },

    setLoaded(): void {
      loaded = true;
    },
    setEnabled(v: boolean): void {
      enabled = v;
    },
    setMode(v: FlowFieldStore['mode']): void {
      mode = v;
    },
    setIntensity(v: number): void {
      intensity = clamp(v, 0, 1);
    },
    setCount(v: number): void {
      count = clamp(v, 0, MAX_PARTICLES);
    },
    setTrail(v: number): void {
      trail = v;
    },
    setFlowSpeed(v: number): void {
      flowSpeed = v;
    },
    setDensityBias(v: number): void {
      densityBias = v;
    },
    setWander(v: number): void {
      wander = v;
    },
  });
}
