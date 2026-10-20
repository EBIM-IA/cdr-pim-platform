'use client';

import { Download, FileSpreadsheet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  downloadCsv,
  downloadXlsx,
  type TabularCell,
  type TabularData,
} from '@/lib/tabular-export';

interface TableExportButtonsProps {
  readonly filename: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly TabularCell[])[];
  readonly sheetName?: string;
  readonly disabled?: boolean;
}

export function TableExportButtons({
  filename,
  headers,
  rows,
  sheetName,
  disabled = false,
}: TableExportButtonsProps) {
  const data: TabularData = { headers, rows, sheetName };
  const unavailable = disabled || rows.length === 0;
  const visibleRows = `${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}`;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={unavailable}
        onClick={() => downloadCsv(data, filename)}
      >
        <Download aria-hidden="true" className="size-4" />
        CSV · {visibleRows}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={unavailable}
        onClick={() => downloadXlsx(data, filename)}
      >
        <FileSpreadsheet aria-hidden="true" className="size-4" />
        XLSX · {visibleRows}
      </Button>
    </div>
  );
}
