/** What one `captureScene` attempt produced — the caller tallies, it never throws. */
export type CaptureOutcome =
  | { status: 'captured'; label: string; bytes: number }
  | { status: 'failed'; label: string; reason: string };
