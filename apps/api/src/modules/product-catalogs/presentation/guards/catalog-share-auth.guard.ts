import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { productCatalogSharedRequestSchema } from '@cdr/contracts';
import { NotFoundError } from '@cdr/shared';

import { ResolveSharedProductCatalogUseCase } from '../../application/manage-product-catalogs.use-cases';

/** Authenticates the private grant; this never records a visit or fetches PDF bytes. */
@Injectable()
export class CatalogShareAuthGuard implements CanActivate {
  constructor(private readonly sharedCatalog: ResolveSharedProductCatalogUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();
    const parsed = productCatalogSharedRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new NotFoundError('SharedCatalog', 'unavailable');
    await this.sharedCatalog.verify(parsed.data.token);
    return true;
  }
}
