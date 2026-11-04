/** The control window's page: one render function per panel, all state held by the main process. */
import type { RelayRoom } from '../../../../src/@types/remote/RelayRoom';
import { pairingUrl } from '../../../../src/utils/remote/pairingUrl';
import { qrModules } from '../../../../src/utils/remote/qrModules';
import type { ControlBridge } from '../@types/ControlBridge';
import type { ControlStatus } from '../@types/ControlStatus';
import type { InstallSetup } from '../@types/InstallSetup';
import type { SyncProgress } from '../@types/SyncProgress';
import { CONTROL_SHORTCUT } from '../data/controlShortcut';

const bridge = (window as unknown as { skymapControl: ControlBridge }).skymapControl;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const radios = (name: string) =>
  Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));

const gigabytes = (bytes: number): string => `${(bytes / 1e9).toFixed(1)} GB`;
const isMac = navigator.userAgent.includes('Mac');
$('shortcut').textContent = CONTROL_SHORTCUT.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');

let setup: InstallSetup;

function statusText(status: ControlStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'No update running';
    case 'syncing':
      return 'Updating data';
    case 'ready':
      return 'New data ready · Restart sky';
    case 'offline':
      return status.hasData
        ? 'No connection. The sky uses the saved data.'
        : 'Skymap needs the internet once to download its data.';
    case 'failed':
      return status.hasData
        ? 'The update stopped. The sky uses the saved data.'
        : 'The download stopped. Skymap needs the internet once to finish it.';
    case 'diskFull':
      return `Not enough disk space: needs ${gigabytes(status.neededBytes)}, ${gigabytes(status.freeBytes)} free. Free some space, then retry.`;
  }
}

function renderStatus(status: ControlStatus): void {
  const syncing = status.kind === 'syncing';
  const stuck =
    status.kind === 'diskFull' ||
    (status.kind !== 'idle' &&
      status.kind !== 'syncing' &&
      status.kind !== 'ready' &&
      !status.hasData);
  $('sync-text').textContent = statusText(status);
  $('sync-progress').hidden = !syncing;
  $('sync-detail').hidden = !syncing;
  $('update-now').textContent = stuck ? 'Retry' : 'Update now';
  ($('update-now') as HTMLButtonElement).disabled = syncing;
  ($('restart-sky') as HTMLButtonElement).disabled = syncing;
}

function renderProgress({ doneBytes, totalBytes, group }: SyncProgress): void {
  const bar = $<HTMLProgressElement>('sync-progress');
  bar.max = Math.max(totalBytes, 1);
  bar.value = doneBytes;
  const percent = Math.round((doneBytes / Math.max(totalBytes, 1)) * 100);
  $('sync-detail').textContent =
    `${group} · ${gigabytes(doneBytes)} of ${gigabytes(totalBytes)} · ${percent}%`;
}

function drawQr(text: string): void {
  const modules = qrModules(text);
  const canvas = $<HTMLCanvasElement>('qr');
  canvas.width = canvas.height = modules.length;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      ctx.fillStyle = dark ? '#000' : '#fff';
      ctx.fillRect(x, y, 1, 1);
    }),
  );
}

function renderPairing(room: RelayRoom): void {
  const url = pairingUrl(room.origin, room.code);
  drawQr(url);
  $('code').textContent = room.code;
  $('pairing-url').textContent = url;
  $('ca-hint').textContent =
    `Tablets: open ${room.origin}/ca.crt once to trust this computer's certificate.`;
  $('pairing').hidden = false;
  $('pairing-empty').hidden = true;
}

function fillSelect(
  id: string,
  entries: { value: string; label: string }[],
  selected: string,
): void {
  const select = $<HTMLSelectElement>(id);
  select.replaceChildren(
    ...entries.map(({ value, label }) => new Option(label, value, false, value === selected)),
  );
}

function renderSetup(): void {
  radios('mode').forEach((r) => (r.checked = r.value === setup.mode));
  radios('updates').forEach((r) => (r.checked = r.value === setup.dataUpdates.kind));
  $<HTMLInputElement>('autostart').checked = setup.autostart;
  const daily = setup.dataUpdates.kind === 'daily';
  $<HTMLInputElement>('daily-at').value =
    setup.dataUpdates.kind === 'daily' ? setup.dataUpdates.at : '03:00';
  $<HTMLInputElement>('daily-at').disabled = !daily;
}

async function save(next: InstallSetup): Promise<void> {
  setup = next;
  renderSetup();
  const saved = $('setup-saved');
  saved.textContent = 'Saving';
  await bridge.saveSetup(next);
  saved.textContent = 'Saved';
}

function readSetupFromForm(): InstallSetup {
  const checked = (name: string) => radios(name).find((r) => r.checked)?.value;
  const displayId = $<HTMLSelectElement>('display').value;
  const picked = displayList.find((d) => String(d.id) === displayId);
  const kind = checked('updates');
  const at = $<HTMLInputElement>('daily-at').value;
  return {
    mode: checked('mode') === 'dome' ? 'dome' : 'kiosk',
    display:
      picked === undefined ? null : { id: picked.id, width: picked.width, height: picked.height },
    network: $<HTMLSelectElement>('network').value || null,
    autostart: $<HTMLInputElement>('autostart').checked,
    dataUpdates:
      kind === 'daily' && at
        ? { kind: 'daily', at }
        : kind === 'manual'
          ? { kind: 'manual' }
          : { kind: 'atLaunch' },
  };
}

let displayList: Awaited<ReturnType<ControlBridge['listDisplays']>> = [];

async function init(): Promise<void> {
  // Before any await: main pushes the current status and room as soon as the page has loaded.
  bridge.onStatus(renderStatus);
  bridge.onSync(renderProgress);
  bridge.onPairing(renderPairing);
  setup = await bridge.getSetup();
  displayList = await bridge.listDisplays();
  const networks = await bridge.listNetworks();
  fillSelect(
    'display',
    [
      { value: '', label: 'Primary display' },
      ...displayList.map((d, i) => ({
        value: String(d.id),
        label: `Display ${i + 1} · ${d.width}×${d.height}${d.primary ? ' · primary' : ''}`,
      })),
    ],
    setup.display === null ? '' : String(setup.display.id),
  );
  fillSelect(
    'network',
    [
      { value: '', label: 'First available' },
      ...networks.map((n) => ({ value: n.name, label: `${n.name} · ${n.address}` })),
    ],
    setup.network ?? '',
  );
  renderSetup();

  for (const id of ['display', 'network', 'autostart', 'daily-at']) {
    $(id).addEventListener('change', () => void save(readSetupFromForm()));
  }
  for (const radio of [...radios('mode'), ...radios('updates')]) {
    radio.addEventListener('change', () => {
      if (radio.name === 'mode') {
        $<HTMLInputElement>('test-grid').checked = false;
        bridge.showTestGrid(false);
      }
      void save(readSetupFromForm());
    });
  }
  $<HTMLInputElement>('test-grid').addEventListener('change', (e) =>
    bridge.showTestGrid((e.target as HTMLInputElement).checked),
  );
  $('update-now').addEventListener('click', () => bridge.updateNow());
  $('restart-sky').addEventListener('click', () => bridge.restartSky());
  $('rotate').addEventListener('click', () => bridge.rotateCode());
  $('quit').addEventListener('click', () => bridge.quit());
}

void init();
