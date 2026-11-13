#!/usr/bin/env node
/** `npm run live-publish-list -- <id>`: writes publish.json, the upload job's whole instruction set. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_ROOT } from '../utils/io/projectRoot';
import { writePublishList } from './writePublishList';

const id = process.argv[2];
if (!id) throw new Error('usage: live-publish-list <id>');
writeFileSync(
  join(PROJECT_ROOT, 'publish.json'),
  JSON.stringify(writePublishList(id, join(PROJECT_ROOT, 'public/data')), null, 2),
);
