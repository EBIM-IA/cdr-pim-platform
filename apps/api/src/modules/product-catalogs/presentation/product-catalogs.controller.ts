import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type ProductCatalogCreateInput,
  type ProductCatalogUpdateInput,
  type ProductCatalogVersionInput,
  type ProductCatalogListQuery,
  type ProductCatalogListDto,
  type ProductCatalogDto,
  type ProductCatalogDetailDto,
  type ProductCatalogGeneratedShareDto,
  type ProductCatalogShareDto,
  type ProductCatalogShareCreateInput,
  type ProductCatalogSharedViewDto,
  PRODUCT_CATALOG_MAX_BYTES,
  productCatalogCreateSchema,
  productCatalogUpdateSchema,
  productCatalogVersionSchema,
  productCatalogListQuerySchema,
  productCatalogShareCreateSchema,
  productCatalogSharedRequestSchema,
} from '@cdr/contracts';
import { type Clock, NotFoundError } from '@cdr/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CLOCK } from '../../../shared/tokens';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { Public } from '../../../shared/http/public.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { projectCatalogShare, projectProductCatalog } from '../application/catalog-projection';
import {
  ChangeProductCatalogDeletionUseCase,
  CreateProductCatalogShareUseCase,
  CreateProductCatalogUseCase,
  DownloadProductCatalogUseCase,
  GetProductCatalogUseCase,
  ListProductCatalogsUseCase,
  ResolveSharedProductCatalogUseCase,
  RevokeProductCatalogShareUseCase,
  UpdateProductCatalogUseCase,
  type CatalogUpload,
} from '../application/manage-product-catalogs.use-cases';

import { CatalogShareAuthGuard } from './guards/catalog-share-auth.guard';

interface UploadedPdf {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
}
const uploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: PRODUCT_CATALOG_MAX_BYTES, files: 1, fields: 5, fieldSize: 4096 },
});
const dispositionSchema = z.enum(['inline', 'attachment']).default('attachment');
@Controller('product-catalogs')
@RequireCapabilities(Capability.ProductCatalogsRead)
export class ProductCatalogsController {
  constructor(
    private readonly listing: ListProductCatalogsUseCase,
    private readonly detail: GetProductCatalogUseCase,
    private readonly creating: CreateProductCatalogUseCase,
    private readonly updating: UpdateProductCatalogUseCase,
    private readonly deletion: ChangeProductCatalogDeletionUseCase,
    private readonly sharing: CreateProductCatalogShareUseCase,
    private readonly revoking: RevokeProductCatalogShareUseCase,
    private readonly downloading: DownloadProductCatalogUseCase,
    private readonly resolving: ResolveSharedProductCatalogUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  @Post('shared/resolve')
  @Public()
  @UseGuards(CatalogShareAuthGuard)
  @HttpCode(200)
  async resolve(@Body() body: unknown): Promise<ProductCatalogSharedViewDto> {
    const result = await this.resolving.execute(publicToken(body), false),
      c = result.catalog;
    return {
      title: c.title,
      description: c.description,
      fileName: c.fileName,
      fileSize: c.fileSize,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      expiresAt: result.expiresAt?.toISOString() ?? null,
    };
  }
  @Post('shared/file')
  @Public()
  @UseGuards(CatalogShareAuthGuard)
  @HttpCode(200)
  async sharedFile(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.resolving.execute(publicToken(body), true);
    return streamPdf(response, result.catalog.fileName, result.content!, 'attachment');
  }
  @Get()
  list(
    @Query(new ZodValidationPipe(productCatalogListQuerySchema)) query: ProductCatalogListQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogListDto> {
    return this.listing.execute(query, actor);
  }
  @Post()
  @RequireCapabilities(Capability.ProductCatalogsWrite)
  @UseInterceptors(uploadInterceptor)
  async create(
    @Body(new ZodValidationPipe(productCatalogCreateSchema)) body: ProductCatalogCreateInput,
    @UploadedFile() file: UploadedPdf | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogDto> {
    return projectProductCatalog(
      await this.creating.execute(body, upload(file), actor),
      this.clock.now(),
    );
  }
  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogDetailDto> {
    const record = await this.detail.execute(id, actor),
      now = this.clock.now();
    return {
      catalog: projectProductCatalog(record, now),
      shares: record.shares.map((share) => projectCatalogShare(share, record.catalog, now)),
      audit: record.audit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorId: entry.actorId,
        occurredAt: entry.occurredAt.toISOString(),
        changes: { ...entry.changes },
      })),
    };
  }
  @Post(':id')
  @HttpCode(200)
  @RequireCapabilities(Capability.ProductCatalogsWrite)
  @UseInterceptors(uploadInterceptor)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productCatalogUpdateSchema)) body: ProductCatalogUpdateInput,
    @UploadedFile() file: UploadedPdf | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogDto> {
    return projectProductCatalog(
      await this.updating.execute(id, body, upload(file), actor),
      this.clock.now(),
    );
  }
  @Get(':id/file')
  async file(
    @Param('id') id: string,
    @Query('disposition', new ZodValidationPipe(dispositionSchema))
    disposition: 'inline' | 'attachment',
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloading.execute(id);
    return streamPdf(response, result.catalog.fileName, result.content, disposition);
  }
  @Delete(':id')
  @RequireCapabilities(Capability.ProductCatalogsWrite)
  async remove(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productCatalogVersionSchema)) body: ProductCatalogVersionInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogDto> {
    return projectProductCatalog(
      await this.deletion.execute(id, body.expectedUpdatedAt, false, actor),
      this.clock.now(),
    );
  }
  @Post(':id/restore')
  @HttpCode(200)
  @RequireCapabilities(Capability.ProductCatalogsWrite)
  async restore(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productCatalogVersionSchema)) body: ProductCatalogVersionInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogDto> {
    return projectProductCatalog(
      await this.deletion.execute(id, body.expectedUpdatedAt, true, actor),
      this.clock.now(),
    );
  }
  @Post(':id/shares')
  @RequireCapabilities(Capability.ProductCatalogsShare)
  async share(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productCatalogShareCreateSchema))
    body: ProductCatalogShareCreateInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogGeneratedShareDto> {
    const result = await this.sharing.execute(id, body, actor);
    return {
      share: projectCatalogShare(result.share, result.record.catalog, this.clock.now()),
      token: result.token,
    };
  }
  @Post(':id/shares/:shareId/revoke')
  @HttpCode(200)
  @RequireCapabilities(Capability.ProductCatalogsShare)
  async revoke(
    @Param('id') id: string,
    @Param('shareId') shareId: string,
    @Body(new ZodValidationPipe(productCatalogVersionSchema)) body: ProductCatalogVersionInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductCatalogShareDto> {
    const record = await this.revoking.execute(id, shareId, body.expectedUpdatedAt, actor);
    return projectCatalogShare(
      record.shares.find((share) => share.id === shareId)!,
      record.catalog,
      this.clock.now(),
    );
  }
}
function publicToken(body: unknown): string {
  const parsed = productCatalogSharedRequestSchema.safeParse(body);
  if (!parsed.success) throw new NotFoundError('SharedCatalog', 'unavailable');
  return parsed.data.token;
}
function upload(file: UploadedPdf | undefined): CatalogUpload | undefined {
  return file
    ? { filename: file.originalname, mimeType: file.mimetype, content: file.buffer }
    : undefined;
}
function streamPdf(
  response: Response,
  filename: string,
  bytes: Uint8Array,
  disposition: 'inline' | 'attachment',
): StreamableFile {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Length', String(bytes.byteLength));
  response.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${filename.replace(/[^A-Za-z0-9._-]/gu, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  return new StreamableFile(Buffer.from(bytes));
}
