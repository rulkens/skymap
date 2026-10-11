import type { ShotLink } from '../../shot/@types/ShotLink';
import type { PhoneCommand } from './PhoneCommand';

export type PhoneArgs = {
  readonly command: PhoneCommand;
  readonly link: ShotLink | undefined;
  readonly url: string | undefined; // server origin, trailing slashes stripped
  readonly build: boolean;
  readonly port: number;
  readonly waitMs: number | undefined; // undefined: the command's own default
  readonly out: string | undefined;
  readonly forMs: number | undefined; // undefined: the command's own default
};
