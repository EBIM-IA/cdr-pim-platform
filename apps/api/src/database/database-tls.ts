import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

/** The `ssl` option handed to postgres.js. */
export type DatabaseSslOption = false | ConnectionOptions;

export interface DatabaseTlsSettings {
  readonly ssl: boolean;
  /** PEM bundle the server certificate must chain to. */
  readonly caFile: string | undefined;
  /** The DATABASE_URL the connection is opened against. */
  readonly url: string;
}

const PEM_CERTIFICATE = '-----BEGIN CERTIFICATE-----';

/**
 * TLS settings for every PostgreSQL connection the API image opens (service and migrations).
 *
 * TLS is always verify-full: the certificate chain AND the server hostname are checked. The
 * RDS certificate authorities are not in Node's public trust store, so hosted environments
 * pass the AWS RDS bundle shipped in the image (DATABASE_SSL_CA_FILE). That bundle then
 * REPLACES the default store for these connections — the database is trusted only when RDS
 * itself vouches for it. There is no code path that disables verification.
 *
 * `host` is set explicitly because postgres.js omits `servername` for an IP literal, and
 * Node then checks the certificate against "localhost" instead of the host actually dialled.
 *
 * A missing or malformed bundle throws at startup: a task that cannot verify its database
 * must not start, rather than silently fall back to an unverified connection.
 */
export function databaseSslOption(
  settings: DatabaseTlsSettings,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): DatabaseSslOption {
  if (!settings.ssl) return false;

  // WHATWG URLs keep IPv6 literals in brackets; the identity check expects the bare address.
  const host = new URL(settings.url).hostname.replace(/^\[(.*)\]$/u, '$1');
  const verifyFull: ConnectionOptions = { host, rejectUnauthorized: true };
  if (!settings.caFile) return verifyFull;

  let ca: string;
  try {
    ca = readFile(settings.caFile);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code ?? 'unknown error';
    throw new Error(`DATABASE_SSL_CA_FILE ${settings.caFile} could not be read (${code}).`);
  }
  if (!ca.includes(PEM_CERTIFICATE)) {
    throw new Error(`DATABASE_SSL_CA_FILE ${settings.caFile} contains no PEM certificate.`);
  }

  return { ...verifyFull, ca };
}
