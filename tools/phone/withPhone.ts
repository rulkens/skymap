import type { CdpClient } from './@types/CdpClient';
import { connectCdp } from './connectCdp';
import { withDevtoolsForward } from './withDevtoolsForward';

/** Run `fn` against the phone browser's DevTools socket, closing it however `fn` ends. */
export async function withPhone<T>(fn: (client: CdpClient) => Promise<T>): Promise<T> {
  return withDevtoolsForward(async (port) => {
    const client = await connectCdp(port);
    try {
      return await fn(client);
    } finally {
      client.close();
    }
  });
}
