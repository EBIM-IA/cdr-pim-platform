import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '@cdr/shared';

import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import type { ExternalHomologReferencePolicyPort } from '../domain/ports/external-homolog-reference-policy.port';

/** A homolog is an external reference, never a SKU already owned by the catalogue. */
@Injectable()
export class CatalogExternalHomologReferencePolicy implements ExternalHomologReferencePolicyPort {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort) {}

  async assertExternalReference(externalCode: string, externalBrand: string): Promise<void> {
    const code = externalCode.trim().toUpperCase();
    const product = await this.products.findBySku(code);
    if (product?.brand?.trim().toUpperCase() === externalBrand.trim().toUpperCase()) {
      throw new ValidationError(
        `«${externalCode.trim()}» es un SKU del catálogo de la misma marca: no se registra como homólogo`,
        {
          externalCode: externalCode.trim(),
          externalBrand: externalBrand.trim(),
          productId: product.id,
        },
      );
    }
  }
}
