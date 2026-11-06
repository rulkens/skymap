import { app } from 'electron';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { TABLET_SETUP_PORT } from '../../data/tabletSetupPort';
import { fillTabletSetupPage } from './utils/fillTabletSetupPage';
import { serveTabletSetupRequest } from './utils/serveTabletSetupRequest';
import { tabletGuideDir } from './tabletGuideDir';

/**
 * The tablet setup page on plain HTTP, every interface, with the step pictures from
 * tabletGuideDir(). It never takes the app down: a missing page or a port in use is logged, and
 * tablets can still fetch /ca.crt from the HTTPS server past its warning; missing pictures only
 * leave the steps as text.
 */
export async function startTabletSetupServer(caPem: string): Promise<void> {
  const assets = join(app.getAppPath(), 'assets');
  const page = await readFile(join(assets, 'tablet-setup.html'), 'utf8')
    .then(fillTabletSetupPage)
    .catch((error: unknown) => void console.error('tablet setup page:', error));
  if (page === undefined) return;
  const guide = new Map<string, Buffer>();
  const dir = tabletGuideDir();
  for (const name of await readdir(dir).catch(() => [])) {
    if (name.endsWith('.webp')) guide.set(`/guide/${name}`, await readFile(join(dir, name)));
  }
  const server = createServer((request, response) =>
    serveTabletSetupRequest(request, response, page, caPem, guide),
  );
  server.on('error', (error) => console.error('tablet setup server:', error));
  server.listen(TABLET_SETUP_PORT, '0.0.0.0');
}
