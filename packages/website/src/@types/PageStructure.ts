import type { PageSection } from './PageSection';

/** What `<page>.structure.yaml` holds: the page's job and the job of each section, in page order. */
export type PageStructure = { job: string; sections: PageSection[] };
