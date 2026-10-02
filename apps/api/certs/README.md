# Database certificate authorities

`rds-global-bundle.pem` is the Amazon RDS global CA bundle, published by AWS at
<https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem>
(see "Using SSL/TLS to encrypt a connection to a DB instance" in the RDS user guide).

These are public CA certificates, not secrets. The API image copies the file to
`/app/certs/rds-global-bundle.pem` and sets `DATABASE_SSL_CA_FILE` to that path, so the
API and the migration task verify the RDS server certificate (`verify-full`: chain and
hostname) against exactly this bundle.

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| SHA-256 | `fe45bbebf92ad3e27a583bbb2ddd1553c521ed4d49af5514dc0a40372ea5395c` |
| Fetched | 2026-10-02                                                         |

To refresh it, download the file again from the URL above, review the change, and update
the hash here and in `src/database/database-tls.spec.ts` in the same commit.
