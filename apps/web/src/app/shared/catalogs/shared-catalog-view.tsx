'use client';

import {
  PRODUCT_CATALOG_MAX_BYTES,
  productCatalogSharedRequestSchema,
  productCatalogSharedViewSchema,
  type ProductCatalogSharedViewDto,
} from '@cdr/contracts';
import { CalendarDays, Download, ExternalLink, FileText, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { StatePanel } from '@/components/state-panel';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function catalogDate(value: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
    ? body.message
    : fallback;
}

/** The share credential stays in the fragment and memory; requests never use a URL token. */
export function SharedCatalogView() {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<ProductCatalogSharedViewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const objectUrl = useRef<string | null>(null);
  const fileRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    let metadataRequest: AbortController | null = null;
    const load = async () => {
      metadataRequest?.abort();
      fileRequest.current?.abort();
      fileRequest.current = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
      setPdfUrl(null);
      setCatalog(null);
      setFileError(null);
      setDownloading(false);
      setLoading(true);
      const input = productCatalogSharedRequestSchema.safeParse({
        token: window.location.hash.slice(1),
      });
      token.current = input.success ? input.data.token : null;
      if (!input.success) {
        setError('El enlace está incompleto o no es válido. Solicita un nuevo enlace de catálogo.');
        setLoading(false);
        return;
      }
      setError(null);
      const controller = new AbortController();
      metadataRequest = controller;
      try {
        const response = await fetch('/api/shared/catalogs/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input.data),
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            await responseMessage(response, 'El enlace no está disponible o ha vencido.'),
          );
        }
        const body: unknown = await response.json();
        const result = productCatalogSharedViewSchema.safeParse(body);
        if (!result.success) throw new Error('La información del catálogo no es válida.');
        if (!controller.signal.aborted) setCatalog(result.data);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : 'No fue posible consultar el catálogo.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    window.addEventListener('hashchange', load);
    return () => {
      window.removeEventListener('hashchange', load);
      metadataRequest?.abort();
      fileRequest.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const requestPdf = async () => {
    if (!token.current || !catalog || fileRequest.current) return;
    const controller = new AbortController();
    fileRequest.current = controller;
    setDownloading(true);
    setFileError(null);
    try {
      const response = await fetch('/api/shared/catalogs/file', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token.current }),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          await responseMessage(response, 'El catálogo ya no está disponible para descargar.'),
        );
      }
      if (response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/pdf') {
        throw new Error('El archivo recibido no tiene el formato PDF esperado.');
      }
      const blob = await response.blob();
      if (!blob.size || blob.size > PRODUCT_CATALOG_MAX_BYTES) {
        throw new Error('El archivo del catálogo no tiene un tamaño válido.');
      }
      if (controller.signal.aborted) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const url = URL.createObjectURL(blob);
      objectUrl.current = url;
      setPdfUrl(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = catalog.fileName;
      anchor.rel = 'noopener noreferrer';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setFileError(cause instanceof Error ? cause.message : 'No fue posible descargar el PDF.');
      }
    } finally {
      if (fileRequest.current === controller) {
        fileRequest.current = null;
        setDownloading(false);
      }
    }
  };

  if (loading) {
    return (
      <Card className="flex min-h-64 items-center justify-center gap-3 p-8" role="status">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        Consultando catálogo compartido…
      </Card>
    );
  }
  if (error || !catalog) {
    return (
      <StatePanel
        variant="error"
        title="Catálogo no disponible"
        description={error ?? 'No fue posible consultar este enlace de catálogo.'}
      />
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-white p-6 sm:p-8">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-primary">
          <FileText className="size-3.5" aria-hidden="true" /> Catálogo PDF
        </span>
        <h1 className="break-words text-2xl font-semibold tracking-tight">{catalog.title}</h1>
        {catalog.description ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {catalog.description}
          </p>
        ) : null}
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" /> Vigencia del catálogo
            </dt>
            <dd className="mt-1 font-medium">
              Desde {catalogDate(catalog.validFrom)}
              {catalog.validUntil
                ? ` hasta ${catalogDate(catalog.validUntil)}`
                : ' · Sin fecha de fin'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vigencia del enlace</dt>
            <dd className="mt-1 font-medium">
              {catalog.expiresAt
                ? new Intl.DateTimeFormat('es-EC', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  }).format(new Date(catalog.expiresAt))
                : 'Sin vencimiento'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="space-y-4 bg-slate-50 p-6 sm:p-8">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="size-8 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{catalog.fileName}</p>
            <p className="text-xs text-muted-foreground">
              PDF ·{' '}
              {(catalog.fileSize / 1024 / 1024).toLocaleString('es-EC', {
                maximumFractionDigits: 2,
              })}{' '}
              MB
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {pdfUrl ? (
            <>
              <a className={buttonVariants()} href={pdfUrl} download={catalog.fileName}>
                <Download className="size-4" aria-hidden="true" /> Descargar PDF
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden="true" /> Abrir PDF
              </a>
            </>
          ) : (
            <Button disabled={downloading} onClick={() => void requestPdf()}>
              {downloading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {downloading ? 'Preparando PDF…' : 'Descargar PDF'}
            </Button>
          )}
        </div>
        {pdfUrl ? (
          <p className="text-xs text-muted-foreground" role="status">
            PDF listo para descargar o abrir.
          </p>
        ) : null}
        {fileError ? (
          <p className="text-sm text-red-700" role="alert">
            {fileError}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
