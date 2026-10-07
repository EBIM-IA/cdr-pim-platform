import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PRODUCT_ASSET_MAX_BYTES,
  PRODUCT_ASSET_ZIP_MAX_BYTES,
  type DeleteProductAssetResultDto,
  type ProductAssetBulkMode,
  type ProductAssetBulkResultDto,
  type ProductAssetDto,
  type ProductAssetListDto,
  type ProductAssetSelector,
  type ProductAssetUploadMetadata,
  productAssetBulkModeSchema,
  productAssetSelectorSchema,
  productAssetUploadMetadataSchema,
} from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';
import type { Response } from 'express';
import { z } from 'zod';

import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  DeleteProductAssetUseCase,
  DownloadProductAssetUseCase,
  ListProductAssetsUseCase,
  ProcessProductAssetArchiveUseCase,
  UploadProductAssetUseCase,
} from '../application/manage-product-assets.use-cases';
import { toProductAssetBulkResultDto, toProductAssetDto } from './product-asset.presenter';

interface UploadedFileValue {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
}

const bulkBodySchema = z.object({ mode: productAssetBulkModeSchema });

@ApiTags('product-assets')
@Controller('assets')
@RequireCapabilities(Capability.CatalogRead)
export class ProductAssetsController {
  constructor(
    private readonly listAssets: ListProductAssetsUseCase,
    private readonly uploadAsset: UploadProductAssetUseCase,
    private readonly downloadAsset: DownloadProductAssetUseCase,
    private readonly deleteAsset: DeleteProductAssetUseCase,
    private readonly processArchive: ProcessProductAssetArchiveUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active images and documents for a product or SKU' })
  async list(
    @Query(new ZodValidationPipe(productAssetSelectorSchema)) query: ProductAssetSelector,
  ): Promise<ProductAssetListDto> {
    return (await this.listAssets.execute(query)).map(toProductAssetDto);
  }

  @Post()
  @HttpCode(201)
  @RequireCapabilities(Capability.CatalogWrite)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRODUCT_ASSET_MAX_BYTES, files: 1, fields: 4, fieldSize: 512 },
    }),
  )
  async upload(
    @Body(new ZodValidationPipe(productAssetUploadMetadataSchema))
    body: ProductAssetUploadMetadata,
    @UploadedFile() file: UploadedFileValue | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductAssetDto> {
    if (!file) throw new ValidationError('A file is required');
    return toProductAssetDto(
      await this.uploadAsset.execute(
        {
          selector: selectorFromBody(body),
          type: body.type,
          filename: file.originalname,
          declaredMimeType: file.mimetype,
          content: file.buffer,
        },
        actor,
      ),
    );
  }

  @Post('bulk')
  @HttpCode(200)
  @RequireCapabilities(Capability.CatalogWrite)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRODUCT_ASSET_ZIP_MAX_BYTES, files: 1, fields: 2, fieldSize: 32 },
    }),
  )
  async bulk(
    @Body(new ZodValidationPipe(bulkBodySchema)) body: { mode: ProductAssetBulkMode },
    @UploadedFile() file: UploadedFileValue | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductAssetBulkResultDto> {
    if (!file) throw new ValidationError('A ZIP file is required');
    if (
      file.mimetype &&
      !['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(
        file.mimetype.toLowerCase(),
      )
    ) {
      throw new ValidationError('Bulk assets must be uploaded as a ZIP file');
    }
    return toProductAssetBulkResultDto(
      await this.processArchive.execute({
        archiveName: file.originalname,
        content: file.buffer,
        mode: body.mode,
        actor,
      }),
    );
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download one private product asset through the authenticated API' })
  async download(
    @Param('id') id: string,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { asset, content } = await this.downloadAsset.execute(id);
    const snapshot = asset.toSnapshot();
    response.setHeader('Content-Type', snapshot.mimeType);
    response.setHeader('Content-Length', String(content.byteLength));
    response.setHeader(
      'Content-Disposition',
      contentDisposition(snapshot.filename, inline === 'true' ? 'inline' : 'attachment'),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(content));
  }

  @Delete(':id')
  @RequireCapabilities(Capability.CatalogWrite)
  async remove(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<DeleteProductAssetResultDto> {
    const deleted = await this.deleteAsset.execute(id, actor);
    return { id: deleted.toSnapshot().id, deleted: true };
  }
}

function selectorFromBody(body: ProductAssetUploadMetadata): ProductAssetSelector {
  return body.productId ? { productId: body.productId } : { sku: body.sku as string };
}

function contentDisposition(filename: string, disposition: 'inline' | 'attachment'): string {
  const ascii = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
