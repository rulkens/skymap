/**
 * createFieldHostSlot — the lazily held field host: nothing exists until the
 * field part first turns on, and turning it off frees every field GPU
 * resource, so the default `'v1'` renderer pays nothing. Switching back on
 * re-bakes the noise volumes, an accepted cost for a debug switch (spec §11).
 */
import type { FieldHostSlot } from '../@types/FieldHostSlot';
import type { FieldHostSlotDeps } from '../@types/FieldHostSlotDeps';
import type { GalaxyFieldHost } from '../@types/GalaxyFieldHost';

export function createFieldHostSlot(deps: FieldHostSlotDeps): FieldHostSlot {
  let host: GalaxyFieldHost | null = null;

  function release(): void {
    host?.destroy();
    host = null;
  }

  return {
    sync(field, dust) {
      if (!field) {
        release();
        return null;
      }
      host ??= deps.create();
      host.setTuning(deps.tuningFor(dust));
      host.ensureFresh();
      return host;
    },
    destroy: release,
  };
}
