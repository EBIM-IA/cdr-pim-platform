import { type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FixedClock, newUuid } from '@cdr/shared';
import { productCatalogSchema, productCatalogSharedViewSchema } from '@cdr/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../../shared/http/all-exceptions.filter';
import { CLOCK } from '../../../shared/tokens';
import { Role } from '../../identity/domain/entities/role';
import { RolesGuard } from '../../identity/presentation/guards/roles.guard';
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
} from '../application/manage-product-catalogs.use-cases';
import type { CatalogWithShares } from '../domain/entities/product-catalog';
import { ProductCatalogsController } from './product-catalogs.controller';
const now = new Date('2026-10-23T12:00:00Z');
const actor = { id: 'buyer-1', email: 'buyer@example.test' };
const record: CatalogWithShares = {
  catalog: {
    id: newUuid(),
    code: 'CAT-0001',
    title: 'PDF',
    description: '',
    validFrom: '2026-01-01',
    validUntil: null,
    fileName: 'Catalogo.pdf',
    fileSize: 8,
    objectKey: 'private/catalog.pdf',
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
  },
  shares: [],
};
const executeCreate = vi.fn(async () => record),
  resolve = vi.fn(async () => ({
    catalog: record.catalog,
    expiresAt: null,
    content: new TextEncoder().encode('%PDF-1.7'),
  }));
describe('catalog HTTP boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductCatalogsController],
      providers: [
        { provide: CLOCK, useValue: new FixedClock(now) },
        ...[
          ChangeProductCatalogDeletionUseCase,
          CreateProductCatalogShareUseCase,
          DownloadProductCatalogUseCase,
          GetProductCatalogUseCase,
          ListProductCatalogsUseCase,
          RevokeProductCatalogShareUseCase,
          UpdateProductCatalogUseCase,
        ].map((provide) => ({
          provide,
          useValue: {
            execute: vi.fn(async () =>
              provide === GetProductCatalogUseCase ? { ...record, audit: [] } : record,
            ),
          },
        })),
        { provide: CreateProductCatalogUseCase, useValue: { execute: executeCreate } },
        {
          provide: ResolveSharedProductCatalogUseCase,
          useValue: { execute: resolve, verify: vi.fn(async () => undefined) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (
        req: { headers: Record<string, string | undefined>; actor?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers.authorization)
          req.actor = {
            ...actor,
            roles: [
              req.headers.authorization === 'sales'
                ? Role.Sales
                : req.headers.authorization === 'admin'
                  ? Role.Administrator
                  : Role.Purchasing,
            ],
          };
        next();
      },
    );
    app.useGlobalGuards(new RolesGuard(new Reflector()));
    app.useGlobalFilters(
      new AllExceptionsFilter({ warn: vi.fn(), error: vi.fn() } as unknown as ConstructorParameters<
        typeof AllExceptionsFilter
      >[0]),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('denies consultation profile writes but accepts administrator uploads and exposes no object keys', async () => {
    for (const profile of ['sales', 'buyer'])
      await request(app.getHttpServer())
        .post('/product-catalogs')
        .set('Authorization', profile)
        .expect(403);
    const response = await request(app.getHttpServer())
      .post('/product-catalogs')
      .set('Authorization', 'admin')
      .field('title', 'PDF')
      .field('validFrom', '2026-01-01')
      .field('validUntil', '')
      .attach('file', Buffer.from('%PDF-1.7'), {
        filename: 'Catalogo.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(productCatalogSchema.parse(response.body).code).toBe('CAT-0001');
    expect(JSON.stringify(response.body)).not.toContain('private/');
    expect(executeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ validUntil: null }),
      expect.objectContaining({ filename: 'Catalogo.pdf' }),
      expect.objectContaining({ roles: [Role.Administrator] }),
    );
  });
  it('rejects invalid dates before invoking the use case', async () => {
    const count = executeCreate.mock.calls.length;
    await request(app.getHttpServer())
      .post('/product-catalogs')
      .set('Authorization', 'admin')
      .field('title', 'PDF')
      .field('validFrom', '2026-02-30')
      .field('validUntil', '')
      .expect(400);
    expect(executeCreate).toHaveBeenCalledTimes(count);
  });
  it('requires read policy for private metadata and reserves restore and sharing for administration', async () => {
    await request(app.getHttpServer()).get(`/product-catalogs/${record.catalog.id}`).expect(403);
    await request(app.getHttpServer())
      .post(`/product-catalogs/${record.catalog.id}/restore`)
      .set('Authorization', 'sales')
      .send({ expectedUpdatedAt: now.toISOString() })
      .expect(403);
    for (const profile of ['sales', 'buyer']) {
      await request(app.getHttpServer())
        .get(`/product-catalogs/${record.catalog.id}`)
        .set('Authorization', profile)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/product-catalogs/${record.catalog.id}/shares`)
        .set('Authorization', profile)
        .send({})
        .expect(403);
    }
    const reflector = new Reflector();
    const { REQUIRED_CAPABILITIES } = await import('../../../shared/http/capability.decorator');
    expect(reflector.get(REQUIRED_CAPABILITIES, ProductCatalogsController.prototype.share)).toEqual(
      ['product-catalogs:share'],
    );
    expect(
      reflector.get(REQUIRED_CAPABILITIES, ProductCatalogsController.prototype.revoke),
    ).toEqual(['product-catalogs:share']);
  });
  it('has only two public endpoints using JSON body tokens and generic malformed-link responses', async () => {
    const token = 'A'.repeat(43),
      response = await request(app.getHttpServer())
        .post('/product-catalogs/shared/resolve')
        .send({ token })
        .expect(200);
    expect(productCatalogSharedViewSchema.parse(response.body).title).toBe('PDF');
    expect(JSON.stringify(response.body)).not.toContain(token);
    const pdf = await request(app.getHttpServer())
      .post('/product-catalogs/shared/file')
      .send({ token })
      .expect(200);
    expect(pdf.headers['content-type']).toMatch(/^application\/pdf/u);
    expect(pdf.headers['cache-control']).toContain('no-store');
    expect(pdf.headers['content-disposition']).toMatch(/^attachment/u);
    const invalid = await request(app.getHttpServer())
      .post('/product-catalogs/shared/resolve')
      .send({ token: 'not-a-token' })
      .expect(404);
    expect(JSON.stringify(invalid.body)).not.toContain('not-a-token');
    const { PUBLIC_ROUTE } = await import('../../../shared/http/public.decorator');
    const publicMethods = Object.getOwnPropertyNames(ProductCatalogsController.prototype).filter(
      (key) =>
        new Reflector().get(
          PUBLIC_ROUTE,
          Object.getOwnPropertyDescriptor(ProductCatalogsController.prototype, key)?.value,
        ),
    );
    expect(publicMethods.sort()).toEqual(['resolve', 'sharedFile']);
  });
});
