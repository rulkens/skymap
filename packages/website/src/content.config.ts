/*
 * The written pages: `docs` is one MDX file per docs page, at the page's path
 * under `/docs/`, with its group and place in the order in data/docsTree.ts;
 * `pages` is one folder per landing page (id = the folder name) holding
 * its MDX, which its route in src/pages renders, and its `<page>.structure.yaml` (collection `pageStructures`)
 * holding the page's job and the job of each section. Front matter holds a page's title and description, and
 * a docs page's job. `facts`
 * names fact rows a docs page rests on without printing them through `<Fact>`;
 * the printed ones are found in the text.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import type { PageSection } from './@types/PageSection';
import { SITE_SHOTS } from './data/siteShots';

// One object for every written page, so each collection means the same by each field.
const pageFields = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  image: z
    .string()
    .refine(
      (id) => SITE_SHOTS.some((shot) => shot.id === id && shot.widths.length > 0),
      'not a shot id with files in data/siteShots.ts',
    )
    .optional(),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: pageFields.extend({ job: z.string(), facts: z.array(z.string()).default([]) }),
});

const pages = defineCollection({
  loader: glob({
    pattern: '*/*.mdx',
    base: './src/content/pages',
    generateId: ({ entry }) => entry.split('/')[0]!,
  }),
  schema: pageFields,
});

// A section's parts are its h3s, so the schema nests; `PageStructure` (@types) is what it parses to.
const section: z.ZodType<PageSection> = z.lazy(() =>
  z.object({
    heading: z.string().min(1),
    job: z.string().min(1),
    parts: z.array(section).optional(),
  }),
);

const pageStructures = defineCollection({
  loader: glob({
    pattern: '*/*.structure.yaml',
    base: './src/content/pages',
    generateId: ({ entry }) => entry.split('/')[0]!,
  }),
  schema: z.object({ job: z.string().min(1), sections: z.array(section) }),
});

export const collections = { docs, pages, pageStructures };
