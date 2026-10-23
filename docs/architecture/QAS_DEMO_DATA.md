# Reference data in QAS

The client requested the example catalogue from `https://cdr-example.pages.dev/` in the
current QAS site, `https://pim-qas.casadelruliman.com/`. The 25 reference files were compared
with the designer folder on 2026-10-22; their contents match.

The QAS dataset combines the existing source-backed workbook manifest (97 products and
52 templates) with eight explicitly labelled illustrative products. The workbook stays
unchanged. Missing source values stay missing, and prototype lifecycle labels do not
approve or publish products. Uploaded files are not fabricated from prototype filenames,
placeholder images or broken spreadsheet cells.

## Execution

Use the **QAS demo data** GitHub Actions workflow on `main`:

1. Run with `mode=dry-run` and inspect the table counts and warnings.
2. Run the same commit with `mode=apply` to insert the dataset.
3. Run `dry-run` again to check that no more records are needed.

The workflow builds a separate `qas-seed` Docker target, publishes it under
`cdr-pim-api:qas-demo-<commit SHA>`, and resolves that tag to an immutable digest. Serving
images keep both the fixture data and the seed command excluded. PRD is not a supported
target: the task requires `APP_ENV=qas`, TLS and the database CA bundle.

The deployed IAM role permits task execution in the existing QAS migration family. The
one-off Fargate task therefore uses a temporary revision of that family with the database
secret reference, network, execution roles and original migration command preserved. Only
that execution receives a seed command override. The workflow restores the original image
and command afterward, including on errors, and avoids replacing any newer external revision.
The maintenance image also contains the migrator and SQL files: an interrupted restoration
cannot make a later default task seed data. No service is updated. Its concurrency group is
shared with QAS promotions. Database credentials remain in Secrets Manager and are never printed.

## Preservation and evidence

The seed uses a transaction and an advisory lock. Existing records are preserved with
insert-only conflict handling; compatible natural keys are resolved to their existing IDs.
Incompatible schema collisions abort the transaction. Repeating an apply does not reset
manual edits, reactivate rows or delete legacy data. The existing local/test upgrade seed
retains its original environment restriction and behavior.

The dry run exercises the same constraints and rolls back its transaction. No fake vectors
or external AI jobs are created. The workflow retains counts, warnings and inserted IDs
for 14 days in its result artifact; it does not export product attribute values or secrets.
Keep the apply result with the release record. Inserted IDs identify the affected rows for
any separately reviewed cleanup; do not blindly delete them after users start editing.

Validate the dashboard, catalogue, a source-backed product, the illustrative `6205-2RS1`
product, categories, templates, applications and equivalences. Empty binary asset panels
remain expected because the prototype does not supply valid product photos or PDFs.
