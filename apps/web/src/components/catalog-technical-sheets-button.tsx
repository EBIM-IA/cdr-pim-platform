'use client';

import type { CatalogWorkbookQuery, ProductAssetDto } from '@cdr/contracts';
import { FileArchive, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { listProductAssetsBatch } from '@/lib/product-assets-api';
import {
  downloadTechnicalSheetsZip,
  MAX_TECHNICAL_SHEETS_PER_ZIP,
} from '@/lib/technical-sheet-export';

/** Uses the same server filters as the catalogue, across every page and every group member. */
export function CatalogTechnicalSheetsButton({
  query,
  compact = false,
}: {
  query: Omit<CatalogWorkbookQuery, 'page' | 'pageSize'>;
  compact?: boolean;
}) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  const download = async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setNotice('');
    setProgress('Preparando fichas…');
    try {
      const selected = new Map<string, { id: string; sku: string }>();
      let page = 1;
      let received = 0;
      while (true) {
        const result = await fetchCatalogWorkbook(
          { ...query, page, pageSize: 100 },
          request.signal,
        );
        received += result.items.length;
        for (const product of result.items)
          for (const member of product.groupMembers ?? [product]) selected.set(member.id, member);
        if (selected.size > MAX_TECHNICAL_SHEETS_PER_ZIP)
          throw new Error(
            `Filtra hasta ${MAX_TECHNICAL_SHEETS_PER_ZIP} artículos para descargar sus fichas.`,
          );
        if (received >= result.total) break;
        if (!result.items.length)
          throw new Error('La consulta cambió. Actualiza el catálogo e inténtalo nuevamente.');
        page += 1;
      }
      const products = [...selected.values()];
      if (!products.length) throw new Error('No hay artículos para los filtros actuales.');
      const assets: Record<string, ProductAssetDto[]> = {};
      for (let index = 0; index < products.length; index += 100) {
        const batch = await listProductAssetsBatch(
          products.slice(index, index + 100).map((product) => product.id),
          request.signal,
        );
        for (const item of batch) assets[item.productId] = item.assets;
      }
      const count = await downloadTechnicalSheetsZip(products, assets, {
        signal: request.signal,
        onProgress: (complete, total) => setProgress(`Generando ${complete}/${total}…`),
      });
      setNotice(
        `${count} ${count === 1 ? 'ficha técnica descargada' : 'fichas técnicas descargadas'}.`,
      );
    } catch (failure) {
      if (!request.signal.aborted)
        setNotice(
          failure instanceof Error ? failure.message : 'No fue posible generar las fichas.',
        );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void download()}
        aria-label={busy ? progress : 'Fichas técnicas PDF (ZIP)'}
        title={
          busy ? progress : 'Fichas técnicas (PDF): un archivo por SKU de los filtros actuales'
        }
      >
        <FileArchive className="size-4" aria-hidden="true" />
        <span className={compact ? 'sr-only' : undefined}>
          {busy ? progress : 'Fichas técnicas (PDF)'}
        </span>
      </Button>
      {busy ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancelar generación de fichas"
          onClick={() => controller.current?.abort()}
        >
          <X className="size-4" />
        </Button>
      ) : null}
      {notice ? (
        <span role="status" className="max-w-64 text-[11px] text-muted-foreground">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
