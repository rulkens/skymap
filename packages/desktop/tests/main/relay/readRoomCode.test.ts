import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRoomCode } from '../../../src/main/relay/readRoomCode';

let userData: string;
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'room-code-'));
});
afterEach(() => rmSync(userData, { recursive: true, force: true }));

describe('readRoomCode', () => {
  it('creates and stores a code on first read', async () => {
    const code = await readRoomCode(userData);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(JSON.parse(readFileSync(join(userData, 'remote-room.json'), 'utf8'))).toBe(code);
  });

  it('returns the same code on the next read', async () => {
    const code = await readRoomCode(userData);
    expect(await readRoomCode(userData)).toBe(code);
  });

  it('replaces a stored value that is not a code', async () => {
    writeFileSync(join(userData, 'remote-room.json'), '{"code":1}');
    expect(await readRoomCode(userData)).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});
