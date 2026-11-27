// DOME-TEST (temporary, never commit): forwards common open ports to the dev
// server on 5173, for a Wi-Fi that blocks other ports between its devices.
import { connect, createServer } from 'node:net';

for (const port of [443, 8443, 8080]) {
  const server = createServer((client) => {
    const upstream = connect(5173, '127.0.0.1');
    client.pipe(upstream).pipe(client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', close);
    upstream.on('error', close);
  });
  server.on('error', (error) => console.log(`port ${port}: ${error.code}`));
  server.listen(port, '0.0.0.0', () => console.log(`port ${port} -> 5173`));
}
