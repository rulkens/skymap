import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureLanCertificate } from '../../src/main/ensureLanCertificate';
import { isSignedByCa } from '../../src/utils/isSignedByCa';

const names = { hostnames: ['localhost', 'dome.local'], ips: ['192.168.1.20', '10.0.0.5'] };

let certDir: string;
beforeEach(() => {
  certDir = mkdtempSync(join(tmpdir(), 'lan-cert-'));
});
afterEach(() => rmSync(certDir, { recursive: true, force: true }));

describe('ensureLanCertificate', () => {
  it('creates a CA once and reuses it', async () => {
    const first = await ensureLanCertificate(certDir, names);
    const second = await ensureLanCertificate(certDir, names);
    expect(new X509Certificate(first.ca).ca).toBe(true);
    expect(second.ca).toBe(first.ca);
    expect(second.cert).toBe(first.cert);
    expect(isSignedByCa(first.cert, first.ca)).toBe(true);
  });

  it('the leaf names localhost, the .local name and every ip', async () => {
    const { cert } = await ensureLanCertificate(certDir, names);
    const leaf = new X509Certificate(cert);
    expect(leaf.ca).toBe(false);
    expect(leaf.checkHost('localhost')).toBe('localhost');
    expect(leaf.checkHost('dome.local')).toBe('dome.local');
    expect(leaf.checkIP('192.168.1.20')).toBe('192.168.1.20');
    expect(leaf.checkIP('10.0.0.5')).toBe('10.0.0.5');
    expect(leaf.checkIP('10.0.0.6')).toBeUndefined();
  });

  it('reissues the leaf, not the CA, when the ips change', async () => {
    const first = await ensureLanCertificate(certDir, names);
    const reordered = { ...names, ips: [...names.ips].reverse() };
    expect((await ensureLanCertificate(certDir, reordered)).cert).toBe(first.cert);
    const moved = await ensureLanCertificate(certDir, { ...names, ips: ['192.168.1.21'] });
    expect(moved.ca).toBe(first.ca);
    expect(moved.cert).not.toBe(first.cert);
    expect(new X509Certificate(moved.cert).checkIP('192.168.1.21')).toBe('192.168.1.21');
    expect(isSignedByCa(moved.cert, first.ca)).toBe(true);
  });

  it('reissues the leaf when its stored key is garbage, keeping the CA', async () => {
    const first = await ensureLanCertificate(certDir, names);
    corruptKey('leaf.json');
    const second = await ensureLanCertificate(certDir, names);
    expect(second.ca).toBe(first.ca);
    expect(second.cert).not.toBe(first.cert);
  });

  it('makes a new CA when its stored key is garbage', async () => {
    const first = await ensureLanCertificate(certDir, names);
    corruptKey('ca.json');
    const second = await ensureLanCertificate(certDir, names);
    expect(second.ca).not.toBe(first.ca);
    expect(isSignedByCa(second.cert, second.ca)).toBe(true);
  });

  it('stores keys owner-only', async () => {
    await ensureLanCertificate(certDir, names);
    expect(statSync(join(certDir, 'ca.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(certDir, 'leaf.json')).mode & 0o777).toBe(0o600);
  });
});

function corruptKey(file: string) {
  const pair = JSON.parse(readFileSync(join(certDir, file), 'utf8'));
  writeFileSync(join(certDir, file), JSON.stringify({ ...pair, key: 'KEY' }));
}
