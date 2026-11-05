import type { ShotFormat } from './ShotFormat';
import type { ShotLink } from './ShotLink';

export type ShotOptions = {
  readonly links: readonly ShotLink[];
  readonly url: string | undefined; // trailing slashes stripped
  readonly build: boolean;
  readonly out: string | undefined;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly hideUi: boolean;
  readonly hideLabels: boolean;
  readonly timeoutMs: number;
  readonly format: ShotFormat;
};
