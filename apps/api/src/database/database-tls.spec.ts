import { X509Certificate, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { databaseSslOption } from './database-tls';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

const RDS_URL = 'postgres://app@cdr-pim-qas.abc123.us-east-1.rds.amazonaws.com:5432/cdr_pim';

describe('databaseSslOption', () => {
  it('connects in plaintext only when TLS is disabled', () => {
    expect(databaseSslOption({ ssl: false, caFile: undefined, url: RDS_URL })).toBe(false);
  });

  it('verifies chain and hostname against the system store when no bundle is given', () => {
    expect(databaseSslOption({ ssl: true, caFile: undefined, url: RDS_URL })).toEqual({
      host: 'cdr-pim-qas.abc123.us-east-1.rds.amazonaws.com',
      rejectUnauthorized: true,
    });
  });

  it('verifies against exactly the configured bundle', () => {
    const option = databaseSslOption(
      { ssl: true, caFile: '/certs/ca.pem', url: RDS_URL },
      () => PEM,
    );
    expect(option).toEqual({
      host: 'cdr-pim-qas.abc123.us-east-1.rds.amazonaws.com',
      ca: PEM,
      rejectUnauthorized: true,
    });
  });

  it.each([
    ['postgres://app@10.0.3.17:5432/db', '10.0.3.17'],
    ['postgres://app@[fd00::17]:5432/db', 'fd00::17'],
  ])('checks an IP host against the address dialled, not "localhost" (%s)', (url, host) => {
    expect(databaseSslOption({ ssl: true, caFile: undefined, url })).toMatchObject({ host });
  });

  it('never produces an option that skips verification', () => {
    for (const option of [
      databaseSslOption({ ssl: true, caFile: undefined, url: RDS_URL }),
      databaseSslOption({ ssl: true, caFile: '/certs/ca.pem', url: RDS_URL }, () => PEM),
    ]) {
      expect(option).toMatchObject({ rejectUnauthorized: true });
    }
  });

  it('fails closed when the bundle cannot be read', () => {
    const missing = () => {
      throw Object.assign(new Error('nope'), { code: 'ENOENT' });
    };
    expect(() =>
      databaseSslOption({ ssl: true, caFile: '/certs/missing.pem', url: RDS_URL }, missing),
    ).toThrow('DATABASE_SSL_CA_FILE /certs/missing.pem could not be read (ENOENT).');
  });

  it('fails closed when the bundle holds no certificate', () => {
    expect(() =>
      databaseSslOption({ ssl: true, caFile: '/certs/empty.pem', url: RDS_URL }, () => ''),
    ).toThrow(/contains no PEM certificate/);
  });
});

describe('shipped AWS RDS CA bundle', () => {
  // Downloaded from https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem.
  // A changed file must be a deliberate, reviewed update: refresh the hash with the bundle.
  const bundlePath = join(__dirname, '../../certs/rds-global-bundle.pem');
  const bundle = readFileSync(bundlePath, 'utf8');

  it('is the reviewed AWS global bundle', () => {
    expect(createHash('sha256').update(bundle).digest('hex')).toBe(
      'fe45bbebf92ad3e27a583bbb2ddd1553c521ed4d49af5514dc0a40372ea5395c',
    );
  });

  it('contains the us-east-1 roots used by the QAS and PRD databases', () => {
    const subjects = (
      bundle.match(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g) ?? []
    ).map((pem) => new X509Certificate(pem).subject);
    for (const root of ['RSA2048 G1', 'RSA4096 G1', 'ECC384 G1']) {
      expect(
        subjects.some((subject) => subject.includes(`CN=Amazon RDS us-east-1 Root CA ${root}`)),
      ).toBe(true);
    }
  });

  it('is accepted by the TLS option builder', () => {
    expect(databaseSslOption({ ssl: true, caFile: bundlePath, url: RDS_URL })).toMatchObject({
      ca: bundle,
      rejectUnauthorized: true,
    });
  });
});
