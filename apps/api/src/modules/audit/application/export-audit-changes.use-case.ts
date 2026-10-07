import { Injectable } from '@nestjs/common';
import type { AuditChangeDto, AuditChangeListQuery } from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';

import { ListAuditChangesUseCase } from './list-audit-changes.use-case';

const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;

const actionLabels: Record<AuditChangeDto['action'], string> = {
  created: 'Creación',
  updated: 'Actualización',
  deleted: 'Desactivación',
  published: 'Publicación',
  imported: 'Importación',
  ai_generated: 'Generación IA',
};

function csvCell(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  const firstVisibleCharacter = raw.trimStart().charAt(0);
  const text =
    typeof value === 'string' && '=+@-'.includes(firstVisibleCharacter) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(';');
}

/** Builds an Excel-compatible, locale-friendly export while keeping the bearer token server-side. */
@Injectable()
export class ExportAuditChangesUseCase {
  constructor(private readonly listAuditChanges: ListAuditChangesUseCase) {}

  async execute(query: AuditChangeListQuery): Promise<string> {
    // Freeze the upper edge so records written while the export is running do not
    // move the OFFSET windows and cause duplicated or skipped rows.
    const snapshotQuery: AuditChangeListQuery = {
      ...query,
      to: query.to ?? new Date().toISOString(),
    };
    const firstPage = await this.listAuditChanges.execute({
      ...snapshotQuery,
      page: 1,
      pageSize: EXPORT_PAGE_SIZE,
    });
    if (firstPage.total > MAX_EXPORT_ROWS) {
      throw new ValidationError(
        `The audit export exceeds the ${MAX_EXPORT_ROWS} row limit; narrow the filters`,
        { total: firstPage.total, max: MAX_EXPORT_ROWS },
      );
    }
    const items = [...firstPage.items];
    const totalPages = Math.ceil(firstPage.total / EXPORT_PAGE_SIZE);

    for (let page = 2; page <= totalPages; page += 1) {
      const result = await this.listAuditChanges.execute({
        ...snapshotQuery,
        page,
        pageSize: EXPORT_PAGE_SIZE,
      });
      items.push(...result.items);
    }

    const rows = [
      csvRow([
        'Fecha',
        'SKU / recurso',
        'Tipo de recurso',
        'Acción',
        'Campo',
        'Antes',
        'Después',
        'Fec. Modificación Anterior',
        'Actor',
        'Origen',
        'Correlación',
      ]),
      ...items.map((item) =>
        csvRow([
          item.occurredAt,
          item.sku ?? item.resourceId,
          item.resourceType,
          actionLabels[item.action],
          item.field,
          item.before,
          item.after,
          item.previousValueValidFrom ?? 'Primera modificación',
          item.actorId ?? 'Sistema',
          item.source,
          item.correlationId,
        ]),
      ),
    ];

    return `\uFEFF${rows.join('\r\n')}\r\n`;
  }
}
