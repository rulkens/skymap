import { X509Certificate } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from 'selfsigned';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LanCertificate } from '../../../../src/main/certificates/@types/LanCertificate';
import { ensureLanCertificate } from '../../../../src/main/certificates/ensureLanCertificate';
import { isSignedByCa } from '../../../../src/main/certificates/utils/isSignedByCa';

const names = { hostnames: ['localhost'], ips: [] };
const dirs = [mkdtempSync(join(tmpdir(), 'ca-a-')), mkdtempSync(join(tmpdir(), 'ca-b-'))];
let ours: LanCertificate;
let theirs: LanCertificate;

beforeAll(async () => {
  ours = await ensureLanCertificate(dirs[0]!, names);
  theirs = await ensureLanCertificate(dirs[1]!, names);
});
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('isSignedByCa', () => {
  it("true for a leaf the install's CA issued", () => {
    expect(isSignedByCa(ours.cert, ours.ca)).toBe(true);
  });

  it('false for a leaf another CA issued', () => {
    expect(isSignedByCa(theirs.cert, ours.ca)).toBe(false);
    expect(isSignedByCa('not a certificate', ours.ca)).toBe(false);
  });

  it("false for a leaf from an impostor CA with the install CA's name", async () => {
    const commonName = new X509Certificate(ours.ca).subject.replace(/^CN=/, '');
    const extensions = [{ name: 'basicConstraints' as const, cA: true }];
    const impostor = await generate([{ name: 'commonName', value: commonName }], { extensions });
    const leaf = await generate([{ name: 'commonName', value: 'localhost' }], {
      ca: { key: impostor.private, cert: impostor.cert },
    });
    expect(isSignedByCa(leaf.cert, ours.ca)).toBe(false);
  });
});
