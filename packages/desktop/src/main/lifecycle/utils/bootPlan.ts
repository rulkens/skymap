import type { BootFacts } from '../@types/BootFacts';
import type { BootPlan } from '../@types/BootPlan';

/** Only an every-launch policy syncs before a complete set loads; dev never syncs. */
export function bootPlan({ firstRun, dev, hasData, dataUpdates }: BootFacts): BootPlan {
  const loadNow = dev || (hasData && dataUpdates.kind !== 'atLaunch');
  return { showControl: firstRun || !hasData, start: loadNow ? 'load' : 'sync' };
}
