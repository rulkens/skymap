import type { AntiqueTitleLine } from './AntiqueTitleLine';

/** One group of a cartouche title: a shared style and the ways its text may break into lines. */
export type AntiqueTitleGroup = {
  readonly style: Omit<AntiqueTitleLine, 'text'>;
  readonly breaks: readonly (readonly string[])[];
};
