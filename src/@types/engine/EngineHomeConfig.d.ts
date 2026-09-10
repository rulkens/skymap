import type { HomeFocusTarget } from './HomeFocusTarget';

/**
 * EngineHomeConfig — a composition's boot-time home, read by `wireInput`.
 */
export type EngineHomeConfig = {
  /** The home target: framed by the boot pose AND seeded into the focus slot. `null` = no home. */
  readonly focus: HomeFocusTarget | null;
  /** Whether the home target is also seeded into the SELECT slot (ring + InfoCard). */
  readonly seedSelection: boolean;
};
