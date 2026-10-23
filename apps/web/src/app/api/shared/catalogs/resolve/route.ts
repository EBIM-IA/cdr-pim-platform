import {
  PRODUCT_CATALOG_MAX_BYTES,
  productCatalogSharedRequestSchema,
  productCatalogSharedViewSchema,
} from '@cdr/contracts';
import type { NextRequest } from 'next/server';

import { proxyPublicCatalog } from '@/lib/product-catalog-public-proxy';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return proxyPublicCatalog(request, {
    operation: 'resolve',
    inputSchema: productCatalogSharedRequestSchema,
    outputSchema: productCatalogSharedViewSchema,
    maxFileBytes: PRODUCT_CATALOG_MAX_BYTES,
  });
}
