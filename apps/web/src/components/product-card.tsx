import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { ProductArtwork } from '@/components/product-artwork';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Product } from '@/lib/types';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${encodeURIComponent(product.id)}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-2"
      aria-label={`Abrir producto ${product.sku}: ${product.name}`}
    >
      <Card className="h-full overflow-hidden transition duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-lg">
        <ProductArtwork
          category={product.category}
          name={product.name}
          className="rounded-none border-b"
        />
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <span className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              {product.sku}
            </span>
            <StatusBadge tone={statusTone(product.status)} className="shrink-0">
              {statusLabel(product.status)}
            </StatusBadge>
          </div>
          <h2 className="line-clamp-2 min-h-11 text-base font-semibold leading-snug text-cdr-ink group-hover:text-primary">
            {product.name}
          </h2>
          <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 text-xs">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Marca</dt>
              <dd className="mt-0.5 truncate font-semibold" title={product.brand}>
                {product.brand}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Aplicación</dt>
              <dd className="mt-0.5 truncate font-semibold" title={product.application}>
                {product.application}
              </dd>
            </div>
            <div className="col-span-2 min-w-0">
              <dt className="text-muted-foreground">Línea</dt>
              <dd className="mt-0.5 truncate font-semibold" title={product.category}>
                {product.category}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Calidad</span>
              <strong className="tabular-nums">
                {product.completeness === null ? 'Regla pendiente' : `${product.completeness}%`}
              </strong>
            </div>
            {product.completeness === null ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                El contrato todavía no publica un puntaje aprobado.
              </p>
            ) : (
              <Progress value={product.completeness} label={`Completitud de ${product.sku}`} />
            )}
          </div>
          <span className="mt-5 flex items-center justify-between border-t pt-4 text-xs font-semibold text-primary">
            Ver detalle
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        </div>
      </Card>
    </Link>
  );
}
