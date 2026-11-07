import type { TitleLine } from './TitleLine';

/** One group of the cartouche title: a shared style and the ways its text may break into lines. */
export type TitleGroup = {
  readonly style: Omit<TitleLine, 'text'>;
  readonly breaks: readonly (readonly string[])[];
};
