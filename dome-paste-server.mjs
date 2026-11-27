// DOME-TEST (temporary, never commit): a two-way paste board between this
// machine and the dome computer. Pastes land in .claude/desk/from-dome.md;
// blocks in .claude/desk/to-dome.md (split on lines of `---`) show with Copy buttons.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';

const PORT = 5190;
const FROM_DOME = '.claude/desk/from-dome.md';
const TO_DOME = '.claude/desk/to-dome.md';
const MAX_BYTES = 2_000_000;

const PAGE = `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dome paste board</title>
<style>
  body { margin: 0 auto; max-width: 900px; padding: 16px; background: #111; color: #eee; font: 16px/1.4 system-ui, sans-serif; }
  h2 { font-size: 18px; margin: 24px 0 8px; }
  textarea { box-sizing: border-box; width: 100%; height: 220px; background: #000; color: #eee; border: 1px solid #555; padding: 8px; font: 13px/1.4 ui-monospace, Consolas, monospace; }
  button { font: inherit; padding: 8px 16px; margin: 8px 8px 0 0; background: #2a6; color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
  button.copy { background: #36c; margin: 0 0 6px; }
  pre { background: #000; border: 1px solid #333; padding: 8px; margin: 0 0 16px; white-space: pre-wrap; word-break: break-all; font: 13px/1.4 ui-monospace, Consolas, monospace; }
  #status { margin-left: 8px; }
</style>
<h2>Send to the other machine</h2>
<textarea id="text" placeholder="Paste here (Ctrl+V), then Send"></textarea>
<div><button id="send">Send</button><button id="pasteSend">Paste clipboard and send</button><span id="status"></span></div>
<h2>From the other machine</h2>
<div id="blocks"></div>
<script>
  const text = document.getElementById('text');
  const status = document.getElementById('status');
  const send = async () => {
    if (!text.value.trim()) return;
    const response = await fetch('/paste', { method: 'POST', body: text.value });
    status.textContent = response.ok ? 'Sent ' + text.value.length + ' characters' : 'Failed: ' + response.status;
    if (response.ok) text.value = '';
  };
  document.getElementById('send').onclick = send;
  document.getElementById('pasteSend').onclick = async () => {
    try { text.value = await navigator.clipboard.readText(); await send(); }
    catch { status.textContent = 'Clipboard blocked: paste with Ctrl+V, then Send'; }
  };
  const copy = async (value, button) => {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = Object.assign(document.createElement('textarea'), { value });
      document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
    button.textContent = 'Copied'; setTimeout(() => (button.textContent = 'Copy'), 1500);
  };
  let shown = '';
  const refresh = async () => {
    const body = await (await fetch('/blocks')).text();
    if (body === shown) return;
    shown = body;
    const blocks = document.getElementById('blocks');
    blocks.replaceChildren();
    for (const block of JSON.parse(body)) {
      const button = Object.assign(document.createElement('button'), { className: 'copy', textContent: 'Copy' });
      button.onclick = () => copy(block, button);
      blocks.append(button, Object.assign(document.createElement('pre'), { textContent: block }));
    }
  };
  refresh(); setInterval(refresh, 3000);
</script>`;

const blocks = () =>
  existsSync(TO_DOME)
    ? readFileSync(TO_DOME, 'utf8')
        .split(/^---\s*$/m)
        .map((block) => block.trim())
        .filter(Boolean)
    : [];

const server = createServer(
  { cert: readFileSync('.certs/dome.pem'), key: readFileSync('.certs/dome-key.pem') },
  (request, response) => {
    if (request.method === 'POST' && request.url === '/paste') {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) request.destroy();
        else chunks.push(chunk);
      });
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const stamp = new Date().toISOString();
        appendFileSync(FROM_DOME, `\n## ${stamp} (from ${request.socket.remoteAddress})\n\n~~~~text\n${body}\n~~~~\n`);
        console.log(`paste ${stamp} ${body.length} chars`);
        response.writeHead(204).end();
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/report') {
      const chunks = [];
      request.on('data', (chunk) => chunks.length < 64 && chunks.push(chunk));
      request.on('end', () => {
        console.log(`report ${Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ' ').slice(0, 600)}`);
        response.writeHead(204).end();
      });
      return;
    }
    if (request.url === '/blocks') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(blocks()));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  },
);
server.listen(PORT, () => console.log(`paste board on https://0.0.0.0:${PORT}/`));
