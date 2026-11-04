/**
 * The install's CA and the server's leaf certificate, kept in `certDir`. Tablets trust the CA once
 * (via /ca.crt), so it is made once per install and kept while it and its key are sound; the leaf
 * is reissued when the machine's names change or it nears expiry, which never breaks that trust.
 */
import { randomBytes, X509Certificate } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { generate } from 'selfsigned';
import type { LanCertificate } from '../@types/LanCertificate.js';
import type { LanNames } from '../@types/LanNames.js';
import type { PemPair } from '../@types/PemPair.js';
import { isSignedByCa } from '../utils/isSignedByCa.js';
import { keyMatchesCert } from '../utils/keyMatchesCert.js';
import { readJsonFile } from '../utils/readJsonFile.js';
import { writeFileAtomically } from '../utils/writeFileAtomically.js';

const DAY_MS = 86_400_000;
const CA_DAYS = 20 * 365;
// Apple refuses TLS leaves valid for more than 398 days.
const LEAF_DAYS = 397;
const LEAF_RENEW_DAYS = 30;

export async function ensureLanCertificate(
  certDir: string,
  names: LanNames,
): Promise<LanCertificate> {
  await mkdir(certDir, { recursive: true });
  const caPath = join(certDir, 'ca.json');
  const leafPath = join(certDir, 'leaf.json');
  let ca = await readJsonFile<PemPair>(caPath);
  // A corrupt CA means a new one: tablets trust it again once, rather than the app never starting.
  if (ca === null || !keyMatchesCert(ca) || !isSignedByCa(ca.cert, ca.cert)) {
    ca = await issueCa();
    await writeFileAtomically(caPath, JSON.stringify(ca));
  }
  let leaf = await readJsonFile<PemPair>(leafPath);
  if (leaf === null || !keyMatchesCert(leaf) || !isCurrentLeaf(leaf.cert, ca.cert, names)) {
    leaf = await issueLeaf(ca, names);
    await writeFileAtomically(leafPath, JSON.stringify(leaf));
  }
  return { key: leaf.key, cert: leaf.cert, ca: ca.cert };
}

function isCurrentLeaf(certPem: string, caPem: string, names: LanNames): boolean {
  if (!isSignedByCa(certPem, caPem)) return false;
  const cert = new X509Certificate(certPem);
  const stored = (cert.subjectAltName ?? '').split(', ').sort();
  const wanted = sanEntries(names).sort();
  const renewAt = Date.parse(cert.validTo) - LEAF_RENEW_DAYS * DAY_MS;
  return stored.join() === wanted.join() && Date.now() < renewAt;
}

/** In the form X509Certificate.subjectAltName prints them. */
function sanEntries(names: LanNames): string[] {
  return [...names.hostnames.map((h) => `DNS:${h}`), ...names.ips.map((ip) => `IP Address:${ip}`)];
}

async function issueCa(): Promise<PemPair> {
  // A per-install suffix tells two installs' CAs apart on a tablet that trusts both.
  const commonName = `Skymap local CA ${randomBytes(4).toString('hex')}`;
  const pems = await generate([{ name: 'commonName', value: commonName }], {
    ...validFor(CA_DAYS),
    keyType: 'ec',
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}

async function issueLeaf(ca: PemPair, names: LanNames): Promise<PemPair> {
  const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
    ...validFor(LEAF_DAYS),
    keyType: 'ec',
    algorithm: 'sha256',
    ca,
    extensions: [
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          ...names.hostnames.map((value) => ({ type: 2 as const, value })),
          ...names.ips.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}

// Back-dated a day so a tablet whose clock runs slow still accepts a fresh certificate.
function validFor(days: number) {
  const now = Date.now();
  return { notBeforeDate: new Date(now - DAY_MS), notAfterDate: new Date(now + days * DAY_MS) };
}
