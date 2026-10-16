/* RepoLink — `<Repo path="docs/DATA.md">the notes</Repo>` on a docs page: a link to a file or folder of the repository, whose address is written once (data/siteIdentity.ts). With no words inside, it prints the path as code. */
import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { REPO_BLOB } from '../../data/siteIdentity.ts';
import styles from './RepoLink.module.css';

type RepoLinkProps = { path: string; children?: ReactNode };

function RepoLink({ path, children }: RepoLinkProps) {
  // A printed path breaks after a slash and nowhere else, so a hyphen at a line's end is never mistaken for part of a name.
  const parts = path.split('/');
  return (
    <a className={styles.root} href={[REPO_BLOB, path].join('/')}>
      {children ?? (
        <code>
          {parts.map((part, i) => (
            <Fragment key={i}>
              <span className={styles.part}>{part + (i < parts.length - 1 ? '/' : '')}</span>
              {i < parts.length - 1 && <wbr />}
            </Fragment>
          ))}
        </code>
      )}
    </a>
  );
}

export default RepoLink;
