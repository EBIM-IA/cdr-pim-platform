import { Inject, Injectable } from '@nestjs/common';
import {
  ECOMMERCE_PHOTO_MAX_BYTES,
  type EcommerceImageDto,
  type EcommerceImageErrorDto,
  type EcommerceImageHistoryDto,
  type EcommerceImageImportRequest,
  type EcommerceImageImportResponseDto,
  type EcommerceImageLookupItemDto,
  type EcommerceImageLookupRequest,
  type EcommerceImageLookupResponseDto,
  type EcommerceImageStatusDto,
  type EcommerceImageTarget,
} from '@cdr/contracts';
import {
  type Clock,
  ValidationError,
  assertUuid,
  getCorrelationId,
  isDomainError,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { buildProductAssetKey, validateAssetFile } from '../domain/entities/product-asset';
import {
  ECOMMERCE_IMAGE_SOURCE,
  EcommerceImageSourceError,
  type EcommerceImage,
  type EcommerceImageSourcePort,
} from '../domain/ports/ecommerce-image-source.port';
import {
  ECOMMERCE_PHOTO_REPOSITORY,
  type EcommercePhotoRepositoryPort,
} from '../domain/ports/ecommerce-photo-repository.port';
import {
  ASSET_BINARY_STORAGE,
  type AssetBinaryStoragePort,
} from '../domain/ports/product-asset-repository.port';

const PIM_SKU_NOT_FOUND = {
  code: 'PIM_SKU_NOT_FOUND',
  message: 'El SKU de destino ya no existe en el PIM.',
};

@Injectable()
export class EcommerceImagesUseCase {
  constructor(
    @Inject(ECOMMERCE_IMAGE_SOURCE) private readonly source: EcommerceImageSourcePort | null,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(ECOMMERCE_PHOTO_REPOSITORY) private readonly photos: EcommercePhotoRepositoryPort,
    @Inject(ASSET_BINARY_STORAGE) private readonly storage: AssetBinaryStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  status(): EcommerceImageStatusDto {
    return { configured: this.source !== null };
  }

  async health(): Promise<EcommerceImageStatusDto> {
    await this.configuredSource().health();
    return { configured: true };
  }

  async history(): Promise<EcommerceImageHistoryDto> {
    const photos = await this.photos.listRecentEcommercePhotos();
    return {
      items: photos.map((photo) => ({ ...photo, importedAt: photo.importedAt.toISOString() })),
    };
  }

  async lookup(input: EcommerceImageLookupRequest): Promise<EcommerceImageLookupResponseDto> {
    const source = this.configuredSource();
    const targets = await Promise.all(input.targets.map((target) => this.resolveTarget(target)));
    const activeTargets = targets.flatMap((target, index) =>
      target.pimSku && target.ecommerceSku ? [{ index, sku: target.ecommerceSku }] : [],
    );
    const items: EcommerceImageLookupItemDto[] = targets.map((target) => ({
      ...target,
      status: 'error',
      error: PIM_SKU_NOT_FOUND,
    }));
    if (!activeTargets.length) return { items };

    try {
      const [firstTarget] = activeTargets;
      if (activeTargets.length === 1 && firstTarget) {
        const { index, sku } = firstTarget;
        const result = await source.lookup(sku, input.mode);
        items[index] = { ...targets[index]!, status: 'found', images: listImages(result.images) };
        return { items };
      }
      const results = await source.lookupBatch(
        activeTargets.map(({ sku }) => sku),
        input.mode,
      );
      for (const item of results) {
        const { index } = activeTargets[item.index]!;
        const target = targets[index]!;
        items[index] =
          'data' in item
            ? { ...target, status: 'found', images: listImages(item.data.images) }
            : {
                ...target,
                status: 'error',
                error: remoteIssue(item.status, item.error.correlationId),
              };
      }
    } catch (err) {
      if (!(err instanceof EcommerceImageSourceError)) throw err;
      for (const { index } of activeTargets) {
        items[index] = { ...targets[index]!, status: 'error', error: fromSourceError(err) };
      }
    }
    return { items };
  }

  async importPhoto(
    input: EcommerceImageImportRequest,
    actor: AuthenticatedActor,
  ): Promise<EcommerceImageImportResponseDto> {
    const source = this.configuredSource();
    const target = await this.resolveTarget(input.target);
    const { assetId, checksumSha256 } = input.assets[0]!;
    const failure = (
      error: EcommerceImageErrorDto,
      filename: string | null = null,
    ): EcommerceImageImportResponseDto => ({
      ...target,
      items: [{ assetId, filename, status: 'error', error }],
    });
    if (!target.pimSku || !target.ecommerceSku) return failure(PIM_SKU_NOT_FOUND);

    let image: EcommerceImage | undefined;
    try {
      const gallery = await source.lookup(target.ecommerceSku, input.mode);
      image = gallery.images.find((photo) => photo.assetId === assetId);
      if (!image || image.checksumSha256.toLowerCase() !== checksumSha256.toLowerCase()) {
        return failure(remoteIssue(412), image?.filename);
      }
      if (!canImportPhoto(image)) {
        return failure(
          {
            code: 'UNSUPPORTED_PHOTO',
            message: 'El PIM admite fotos JPEG, PNG o WebP de hasta 30 MB.',
          },
          image.filename,
        );
      }

      const { productId, pimSku, ecommerceSku } = target;
      // The storage adapters represent SHA-256 as base64; Narviz supplies the same digest in hex.
      const checksum = Buffer.from(image.checksumSha256, 'hex').toString('base64');
      const existing = await this.photos.findActivePhotoByChecksum(productId, checksum);
      if (existing) {
        return {
          ...target,
          items: [
            { assetId, filename: image.filename, status: 'existing', productAssetId: existing },
          ],
        };
      }

      const content = await source.download(image);
      const file = validateAssetFile(
        {
          filename: image.filename,
          declaredMimeType: image.mimeType,
          content,
          type: 'FOTO',
        },
        ECOMMERCE_PHOTO_MAX_BYTES,
      );
      const id = newUuid();
      const key = buildProductAssetKey({
        productId,
        assetId: id,
        type: 'FOTO',
        extension: file.extension,
      });
      const stored = await this.storage.put({
        key,
        content: file.content,
        mimeType: file.mimeType,
        metadata: { productId, sku: pimSku, type: 'FOTO', source: 'narviz' },
      });
      const now = this.clock.now();
      const correlationId = getCorrelationId() ?? newUuid();
      const remotePhoto = image;
      const saved = await this.photos.appendEcommercePhoto({
        photo: {
          id,
          productId,
          sku: pimSku,
          type: 'FOTO',
          filename: file.filename,
          mimeType: stored.mimeType,
          objectKey: stored.key,
          bucket: stored.bucket,
          size: stored.size,
          checksum: stored.checksum,
          storageVersionId: stored.versionId ?? null,
          source: 'narviz',
          uploadedBy: actor.id,
          uploadedAt: now,
          replacesAssetId: null,
        },
        ecommerceSku,
        assertObjectAvailable: async () => {
          if (!(await this.storage.exists(stored.key))) {
            throw new ValidationError(
              'La imagen ya no está disponible en el almacenamiento del PIM.',
            );
          }
        },
        audit: (photo) =>
          createAuditEntry({
            resourceType: 'product_asset',
            resourceId: photo.toSnapshot().id,
            action: AuditAction.Created,
            actorId: actor.id,
            source: 'api:narviz',
            correlationId,
            occurredAt: now,
            changes: {
              productId: { after: productId },
              sku: { after: pimSku },
              ecommerceSku: { after: ecommerceSku },
              ecommerceAssetId: { after: remotePhoto.assetId },
              ecommercePosition: { after: remotePhoto.position },
              ecommerceCover: { after: remotePhoto.cover },
              filename: { after: file.filename },
              position: { after: photo.toSnapshot().position },
              checksum: { after: checksum },
            },
          }),
      });
      return {
        ...target,
        items: [
          {
            assetId,
            filename: file.filename,
            status: saved.inserted ? 'imported' : 'existing',
            productAssetId: saved.assetId,
          },
        ],
      };
    } catch (err) {
      if (err instanceof EcommerceImageSourceError)
        return failure(fromSourceError(err), image?.filename);
      if (isDomainError(err))
        return failure({ code: err.code, message: err.message }, image?.filename);
      throw err;
    }
  }

  private configuredSource(): EcommerceImageSourcePort {
    if (!this.source) {
      throw new ValidationError('El servicio de imágenes del ecommerce aún no está configurado.');
    }
    return this.source;
  }

  private async resolveTarget(target: EcommerceImageTarget) {
    const productId = assertUuid(target.productId);
    const product = await this.products.findById(productId);
    return {
      productId,
      pimSku: product?.sku ?? null,
      ecommerceSku: target.ecommerceSku ?? product?.sku ?? null,
    };
  }
}

function fromSourceError(err: EcommerceImageSourceError): EcommerceImageErrorDto {
  if (err.upstreamCode === 'INVALID_DOWNLOAD') {
    return {
      code: 'ECOMMERCE_DOWNLOAD_INVALID',
      message:
        'No se pudo verificar la descarga. Consulta de nuevo la imagen antes de incorporarla.',
      ...(err.correlationId ? { correlationId: err.correlationId } : {}),
    };
  }
  return remoteIssue(err.status, err.correlationId, err.retryAfterSeconds);
}

function remoteIssue(
  status?: number,
  correlationId?: string,
  retryAfterSeconds?: number,
): EcommerceImageErrorDto {
  const issue = (code: string, message: string): EcommerceImageErrorDto => ({
    code,
    message,
    ...(correlationId ? { correlationId } : {}),
  });
  switch (status) {
    case 400:
      return issue(
        'ECOMMERCE_INVALID_REQUEST',
        'Narviz rechazó la consulta. Revisa el SKU y el modo.',
      );
    case 401:
    case 403:
      return issue(
        'ECOMMERCE_AUTH',
        'Narviz rechazó la credencial. Revisa la configuración del servicio.',
      );
    case 404:
      return issue('ECOMMERCE_NOT_FOUND', 'El SKU o la imagen no está disponible en el ecommerce.');
    case 409:
      return issue('ECOMMERCE_AMBIGUOUS_SKU', 'Narviz encontró más de un producto para ese SKU.');
    case 412:
      return issue(
        'ECOMMERCE_PHOTO_CHANGED',
        'La imagen cambió. Consulta el SKU nuevamente antes de incorporarla.',
      );
    case 429:
      return issue(
        'ECOMMERCE_RATE_LIMIT',
        retryAfterSeconds
          ? `La cuota de Narviz se agotó. Vuelve a intentar en ${retryAfterSeconds} segundos.`
          : 'La cuota de Narviz se agotó. Espera un momento y vuelve a intentar.',
      );
    default:
      return issue(
        'ECOMMERCE_UNAVAILABLE',
        'No se pudo obtener la información solicitada del servicio de imágenes.',
      );
  }
}

function listImages(images: readonly EcommerceImage[]): EcommerceImageDto[] {
  return [...images]
    .sort(
      (left, right) => Number(right.cover) - Number(left.cover) || left.position - right.position,
    )
    .map(({ assetId, position, cover, filename, mimeType, sizeBytes, checksumSha256 }) => ({
      assetId,
      position,
      cover,
      filename,
      mimeType,
      sizeBytes,
      checksumSha256,
      canImport: canImportPhoto({ mimeType, sizeBytes }),
    }));
}

function canImportPhoto({
  mimeType,
  sizeBytes,
}: Pick<EcommerceImage, 'mimeType' | 'sizeBytes'>): boolean {
  return (
    sizeBytes <= ECOMMERCE_PHOTO_MAX_BYTES &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
  );
}
