import type { ShotLink } from '../../shot/@types/ShotLink';
import type { PhoneCommand } from './PhoneCommand';
import type { Point } from './Point';
import type { TapTarget } from './TapTarget';

export type PhoneArgs = {
  readonly command: PhoneCommand;
  readonly link: ShotLink | undefined;
  readonly url: string | undefined; // server origin, trailing slashes stripped
  readonly build: boolean;
  readonly port: number;
  readonly waitMs: number | undefined; // undefined: the command's own default
  readonly out: string | undefined;
  readonly forMs: number | undefined; // undefined: the command's own default
  readonly target: TapTarget | undefined; // tap target, or swipe start
  readonly to: Point | undefined; // swipe end
  readonly ms: number | undefined; // swipe duration
};
