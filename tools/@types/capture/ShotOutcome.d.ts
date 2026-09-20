/** What one `captureScene` attempt produced — the caller tallies, it never throws. */
export type ShotOutcome =
  | { status: 'captured'; label: string; bytes: number }
  | { status: 'failed'; label: string; reason: string };
