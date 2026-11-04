import type { InstallSetup } from '../../../@types/InstallSetup';
import { DEFAULT_INSTALL_SETUP } from '../data/defaultInstallSetup';

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDisplay(value: unknown): InstallSetup['display'] {
  if (!isRecord(value)) return null;
  const { id, width, height } = value;
  return typeof id === 'number' && typeof width === 'number' && typeof height === 'number'
    ? { id, width, height }
    : null;
}

function parseDataUpdates(value: unknown): InstallSetup['dataUpdates'] {
  if (!isRecord(value)) return DEFAULT_INSTALL_SETUP.dataUpdates;
  if (value.kind === 'manual') return { kind: 'manual' };
  if (value.kind === 'atLaunch') return { kind: 'atLaunch' };
  if (value.kind === 'daily' && typeof value.at === 'string' && CLOCK_TIME.test(value.at)) {
    return { kind: 'daily', at: value.at };
  }
  return DEFAULT_INSTALL_SETUP.dataUpdates;
}

/** Whatever setup.json held (or didn't), field by field: a bad field costs only itself. */
export function parseInstallSetup(raw: unknown): InstallSetup {
  const file = isRecord(raw) ? raw : {};
  return {
    mode: file.mode === 'dome' || file.mode === 'kiosk' ? file.mode : DEFAULT_INSTALL_SETUP.mode,
    display: parseDisplay(file.display),
    network: typeof file.network === 'string' ? file.network : null,
    autostart: typeof file.autostart === 'boolean' ? file.autostart : false,
    dataUpdates: parseDataUpdates(file.dataUpdates),
  };
}
