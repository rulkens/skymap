/*
 * The docs collection: one MDX file per docs page, at the page's path under
 * `/docs/`. Its title, group and place in the order are those of its row in
 * data/docsTree.ts and are written nowhere else. `facts` names fact rows a
 * page rests on without printing them through `<Fact>`; the printed ones are
 * found in the text.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: z.object({
    description: z.string(),
    facts: z.array(z.string()).default([]),
  }),
});

export const collections = { docs };
