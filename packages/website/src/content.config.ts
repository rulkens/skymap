/*
 * The docs collection: one MDX file per docs page, at the page's path under
 * `/docs/`. A file's front matter holds its title, description and job; the
 * page's group and place in the order are its row in data/docsTree.ts. `facts`
 * names fact rows a page rests on without printing them through `<Fact>`; the
 * printed ones are found in the text.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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
  job: z.string(),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: pageFields.extend({ facts: z.array(z.string()).default([]) }),
});

export const collections = { docs };
