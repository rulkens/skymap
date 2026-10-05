export type ShotOutcome = {
  readonly path: string | null; // absolute; null when no image could be taken
  readonly timedOut: boolean;
  readonly error: string | null; // a boot or navigation failure
  readonly pageErrors: readonly string[];
};
