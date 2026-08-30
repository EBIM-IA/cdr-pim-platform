#!/bin/sh
# Runs once, when the postgres volume is first created.
#
# Creates the separate database used by `pnpm test:integration`. Keeping integration tests
# off the development database means a developer can truncate tables freely without losing
# the data they were working with.
set -e

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE cdr_pim_test OWNER $POSTGRES_USER;
EOSQL

for database in "$POSTGRES_DB" cdr_pim_test; do
  psql --username "$POSTGRES_USER" --dbname "$database" -c 'CREATE EXTENSION IF NOT EXISTS vector;'
done
