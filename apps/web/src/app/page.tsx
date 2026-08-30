import { Suspense } from 'react';

import { ProductList } from '@/components/product-list';
import { SystemStatus } from '@/components/system-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// The PIM is edited continuously; a cached dashboard would be misleading.
export const dynamic = 'force-dynamic';

function Skeleton({ label }: { label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>Cargando…</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Foundation · recorrido vertical</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta página demuestra el walking skeleton completo: Next.js → cliente API → NestJS → caso
          de uso → puerto → adapter Drizzle → PostgreSQL.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<Skeleton label="Estado del sistema" />}>
          <SystemStatus />
        </Suspense>
        <Suspense fallback={<Skeleton label="Productos" />}>
          <ProductList />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Siguiente paso</CardTitle>
          <CardDescription>
            La foundation no incluye pantallas del PIM. Las funcionalidades se construyen sobre esta
            base siguiendo <code className="font-mono text-xs">CLAUDE.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            · API y documentación OpenAPI:{' '}
            <code className="font-mono text-xs">http://localhost:3001/api/v1/docs</code>
          </p>
          <p>
            · Prueba asíncrona:{' '}
            <code className="font-mono text-xs">
              POST http://localhost:3001/api/v1/imports/skeleton-ping
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
