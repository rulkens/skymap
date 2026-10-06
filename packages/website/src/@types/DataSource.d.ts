/**
 * One row of the Science page's data table. `release` is the version the code
 * reads, not the newest one published. `rows` is the size of the file or query
 * we read and `drawn` the objects in the largest published data size; each is
 * left out where neither the build nor the catalogue's own record gives it.
 * `href` is the primary source and `evidence` the repository file the row was
 * checked against. `ask` is the acknowledgement the source requires or
 * requests, quoted from `askHref`.
 */
export type DataSource = {
  id: string;
  group: string;
  name: string;
  gives: string;
  release: string;
  rows?: string;
  drawn?: string;
  licence: string;
  href: string;
  evidence: string;
  ask?: string;
  askHref?: string;
};
