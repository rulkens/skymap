/**
 * One row of the Command-line tools page: one `npm run` script, or a family
 * of them that do the same thing to different inputs. `manual` is the file of
 * the repository that documents it, as a path from the repository's root.
 * A long family is printed as its pattern, `family` (`fetch-<source>`), with
 * the part each script puts in the brackets listed where `does` says `<sources>`.
 */
export type DocsCommand = {
  scripts: readonly string[];
  family?: string;
  does: string;
  manual: string;
};
