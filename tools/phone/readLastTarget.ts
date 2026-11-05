import { existsSync, readFileSync } from 'node:fs';
import { PHONE_PATHS } from './PHONE_PATHS';

export function readLastTarget(): string | undefined {
  if (!existsSync(PHONE_PATHS.target)) return undefined;
  const id = readFileSync(PHONE_PATHS.target, 'utf8').trim();
  return id === '' ? undefined : id;
}
