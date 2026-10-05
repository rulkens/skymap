import type { ChildProcess } from 'node:child_process';

export type PreviewHandle = {
  proc: ChildProcess;
  /** The URL vite actually bound — see parsePreviewUrl for why this can't be assumed. */
  url: string;
};
