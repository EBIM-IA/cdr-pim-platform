import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerApiClient } from '@/lib/api-client';

/** Reads the catalog through the shared contract. Deliberately minimal: this is a probe,
 *  not the product grid the PIM will eventually need. */
export async function ProductList() {
  const client = createServerApiClient();

  try {
    const page = await client.listProducts(1, 5);

    return (
      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
          <CardDescription>
            {page.total === 0
              ? 'Aún no hay productos. Crea uno con POST /api/v1/products.'
              : `${page.total} producto(s) en el catálogo`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {page.items.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                </span>
                <Badge variant="outline">{product.status}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  } catch {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
          <CardDescription>No fue posible leer el catálogo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
}
