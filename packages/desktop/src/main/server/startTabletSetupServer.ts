import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { TABLET_SETUP_PORT } from '../../data/tabletSetupPort';
import { fillTabletSetupPage } from './utils/fillTabletSetupPage';
import { serveTabletSetupRequest } from './utils/serveTabletSetupRequest';

/**
 * The tablet setup page on plain HTTP, every interface. It never takes the app down: a missing page or
 * a port in use is logged, and tablets can still fetch /ca.crt from the HTTPS server past its warning.
 */
export async function startTabletSetupServer(caPem: string): Promise<void> {
  const page = await readFile(join(app.getAppPath(), 'assets', 'tablet-setup.html'), 'utf8')
    .then(fillTabletSetupPage)
    .catch((error: unknown) => void console.error('tablet setup page:', error));
  if (page === undefined) return;
  const server = createServer((request, response) =>
    serveTabletSetupRequest(request, response, page, caPem),
  );
  server.on('error', (error) => console.error('tablet setup server:', error));
  server.listen(TABLET_SETUP_PORT, '0.0.0.0');
}
