import type { CdpClient } from './@types/CdpClient';
import { connectCdp } from './connectCdp';
import { forwardDevtools } from './forwardDevtools';

/** Run `fn` against the phone browser's DevTools socket, closing it however `fn` ends. */
export async function withPhone<T>(fn: (client: CdpClient) => Promise<T>): Promise<T> {
  const client = await connectCdp(forwardDevtools());
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}
