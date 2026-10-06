/*
 * The docs collection: one MDX file per docs page, at the page's path under
 * `/docs/`. Title, group and order repeat the page's row in data/docsTree.ts,
 * the list everything navigates by; tests/packages/website/docsTree.test.ts
 * fails when the two disagree. `facts` names fact rows a page rests on without
 * printing them through `<Fact>`; the printed ones are found in the text.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import { DOCS_GROUP_NAMES } from './data/docsGroupNames';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.enum(DOCS_GROUP_NAMES),
    order: z.number().int().positive(),
    facts: z.array(z.string()).default([]),
  }),
});

export const collections = { docs };
