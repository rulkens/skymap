/*
 * SourceLink — `<Source id="gaia">Gaia</Source>` on a docs page: a source's
 * name as a link to its data page, by its entry id in ATTRIBUTIONS.md. The
 * address comes from the pages' own table, so a mention cannot point at a
 * page that is not there; with no words inside, it prints the page's title.
 */
import type { ReactNode } from 'react';

import { dataEntry } from '../../data/dataPages.ts';
import { sitePath } from '../../utils/sitePath.ts';

type SourceLinkProps = { id: string; children?: ReactNode };

function SourceLink({ id, children }: SourceLinkProps) {
  const entry = dataEntry(id);
  return <a href={sitePath(entry.href)}>{children ?? entry.title}</a>;
}

export default SourceLink;
