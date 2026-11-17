import type { RoomCode } from '../../../../../../src/@types/remote/RoomCode';
import { TABLET_SETUP_PORT } from '../../../data/tabletSetupPort';

/** What the pairing QR opens: the setup page on the pairing host, the code after # so HTTP never carries it. */
export function tabletSetupUrl(origin: string, code: RoomCode): string {
  return `http://${new URL(origin).hostname}:${TABLET_SETUP_PORT}/#${code}`;
}
