import { setTimeout as delay } from 'node:timers/promises';
import { DOWNLOAD_IDLE_MS } from '../data/downloadIdleMs';
import { DOWNLOAD_RETRIES } from '../data/downloadRetries';
import { DOWNLOAD_RETRY_BACKOFF_MS } from '../data/downloadRetryBackoffMs';
import { UpstreamChangedError } from '../UpstreamChangedError';
import { downloadVerified } from './downloadVerified';

/**
 * downloadVerified, tried again after a network or server error or a refused rename (Windows
 * antivirus holds new files for a moment). A failed try takes its bytes back through `onBytes`, so progress never
 * counts a file twice.
 */
export async function downloadWithRetries(
  url: string,
  dest: string,
  sha256: string,
  onBytes: (n: number) => void,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    let bytes = 0;
    try {
      return await downloadVerified(url, dest, sha256, DOWNLOAD_IDLE_MS, (n) => {
        bytes += n;
        onBytes(n);
      });
    } catch (error) {
      onBytes(-bytes);
      if (error instanceof UpstreamChangedError || attempt > DOWNLOAD_RETRIES) throw error;
      await delay(DOWNLOAD_RETRY_BACKOFF_MS * attempt);
    }
  }
}
