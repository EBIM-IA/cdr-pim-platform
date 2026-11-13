'use client';

import type {
  CatalogWorkbookProductDto,
  ExternalHomologDto,
  GroupApplicationDto,
  GroupOemCodeDto,
  ProductAssetDto,
  ProductAttributeSheetDto,
  ProductExperienceDto,
  ProductSalesVariantDto,
} from '@cdr/contracts';
import { ArrowLeft, Copy, Download, Eye, FileText, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProductGallery } from '@/components/product-gallery';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { StickyProductNavigation } from '@/components/sticky-product-navigation';
import { TechnicalSheetPreview } from '@/components/technical-sheet-preview';
import { Button } from '@/components/ui/button';
import { fetchProductTechnicalSheet } from '@/lib/dynamic-catalog-api';
import { technicalAttributesFromSheet } from '@/lib/product-detail-data';
import { listProductAssets, productAssetDownloadUrl } from '@/lib/product-assets-api';
import {
  downloadTechnicalSheetPdf,
  technicalSheetBrand,
  technicalSheetDocument,
  technicalSheetLogo,
  technicalSheetMedia,
} from '@/lib/technical-sheet-export';
import type { Product } from '@/lib/types';
import { fetchUnifiedMembers } from '@/lib/unified-products';
import { displayMeasurement } from '@/lib/units';
import styles from './sales-product-detail.module.css';

export function vehicleMatches(application: GroupApplicationDto, query: string): boolean {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es');
  const year = query.match(/\b(?:19|20)\d{2}\b/u)?.[0];
  const tokens = normalize(query.replace(/\b(?:19|20)\d{2}\b/u, ''))
    .split(/\s+/u)
    .filter(Boolean);
  const text = normalize(
    [application.make, application.model, application.engine, application.area, application.subarea]
      .filter(Boolean)
      .join(' '),
  );
  return (
    tokens.every((token) => text.includes(token)) &&
    (!year ||
      (application.yearFrom !== null &&
        Number(year) >= application.yearFrom &&
        Number(year) <= (application.yearTo ?? application.yearFrom)))
  );
}
function SheetActions({ id, sku, product }: { id: string; sku: string; product: Product }) {
  const [preview, setPreview] = useState<{
    sheet: ProductAttributeSheetDto;
    assets: ProductAssetDto[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async (download: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const [sheet, assets] = await Promise.all([
        fetchProductTechnicalSheet(id),
        listProductAssets({ productId: id }),
      ]);
      if (download) {
        const [cdrLogo, media, brand] = await Promise.all([
          technicalSheetLogo(),
          technicalSheetMedia(assets),
          technicalSheetBrand(sheet.product.brand),
        ]);
        await downloadTechnicalSheetPdf({
          ...technicalSheetDocument(sheet, 'metric'),
          cdrLogo,
          media,
          ...brand,
        });
      } else setPreview({ sheet, assets });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'No fue posible abrir la ficha técnica.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className={styles.sheetActions}>
        <span>Ficha técnica</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Ver ficha técnica de ${sku}`}
          disabled={busy}
          onClick={() => void open(false)}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Descargar ficha técnica de ${sku}`}
          disabled={busy}
          onClick={() => void open(true)}
        >
          <Download className="size-4" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {preview ? (
        <TechnicalSheetPreview
          open
          product={{
            ...product,
            id,
            sku,
            name: preview.sheet.product.name,
            brand: preview.sheet.product.brand ?? 'Sin marca',
          }}
          sheet={preview.sheet}
          assets={preview.assets}
          unitSystem="metric"
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
export function SalesProductDetail({
  product,
  sheet,
  experience,
  assets,
  applications,
  homologs,
  oemCodes,
  selected,
  onPick,
  dataError,
  categoryPath,
}: {
  product: Product;
  sheet: ProductAttributeSheetDto | null;
  experience: ProductExperienceDto | null;
  assets: ProductAssetDto[];
  applications: GroupApplicationDto[];
  homologs: ExternalHomologDto[];
  oemCodes: GroupOemCodeDto[];
  selected?: ProductSalesVariantDto;
  onPick: (variant: ProductSalesVariantDto | null) => void;
  dataError?: string | null;
  categoryPath?: string;
}) {
  const [members, setMembers] = useState<CatalogWorkbookProductDto[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('sales-characteristics');
  const code = product.unifiedCode ?? experience?.variants[0]?.codigoUnificador;
  const attributes = sheet
    ? technicalAttributesFromSheet(sheet).filter(
        (attribute) =>
          attribute.authority !== 'erp' &&
          attribute.value !== null &&
          String(attribute.value).trim() !== '',
      )
    : [];
  const columns = new Map(sheet?.schema.columns.map((column) => [column.key, column]) ?? []);
  const measurements = attributes.filter(
    (attribute) =>
      columns.get(attribute.key)?.dataType === 'measurement' || /^\([^)]+\)/u.test(attribute.label),
  );
  const files = attributes.filter((attribute) =>
    /fotograf|plano|documento|certificad|ficha.*(?:t[eé]cnica|seguridad)|hoja.*seguridad/iu.test(
      attribute.label,
    ),
  );
  const characteristics = attributes.filter(
    (attribute) => !measurements.includes(attribute) && !files.includes(attribute),
  );
  const variants = experience?.variants.filter((variant) => variant.productId === product.id) ?? [];
  const variant = selected ?? variants[0];
  const commercial = variant?.descripcionEcommerce;
  const name =
    commercial?.titulo ?? variant?.nombreAmigable ?? experience?.nombreGeneral ?? product.name;
  const description =
    commercial?.descripcion ??
    product.description ??
    characteristics
      .slice(0, 4)
      .map(
        (attribute) =>
          `${attribute.label}: ${typeof attribute.value === 'boolean' ? (attribute.value ? 'Sí' : 'No') : String(attribute.value)}${attribute.unit ? ` ${attribute.unit}` : ''}`,
      )
      .join('. ');
  const memberHref = (id: string) => {
    const query = variant?.aplicacion
      ? `?aplicacion=${encodeURIComponent(variant.aplicacion.id)}`
      : variant
        ? `?uso=${variant.tipo}`
        : '';
    return `/products/${encodeURIComponent(id)}${query}`;
  };
  const verified = applications.filter(
    (application) => application.active && application.verificationStatus === 'verified',
  );
  const vehicles = verified.filter((application) => vehicleMatches(application, vehicleQuery));
  const compatible = [
    ...homologs
      .filter((row) => row.active && row.approvalStatus === 'approved')
      .map((row) => ({ id: row.id, brand: row.externalBrand, code: row.externalCode })),
    ...oemCodes
      .filter((row) => row.active && row.approvalStatus === 'approved')
      .map((row) => ({ id: row.id, brand: row.brands.join(' · '), code: row.oemCode })),
  ];
  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    setMembersLoading(true);
    setMembersError(null);
    void fetchUnifiedMembers(code, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setMembers(rows);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setMembersError(
            failure instanceof Error ? failure.message : 'No fue posible cargar las equivalencias.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setMembersLoading(false);
      });
    return () => controller.abort();
  }, [code]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = 'sales-characteristics';
        for (const id of [
          'sales-characteristics',
          'sales-vehicles',
          'sales-documents',
          ...(window.innerWidth <= 1280 ? ['sales-equivalences'] : []),
        ]) {
          const section = document.getElementById(id);
          if (section && section.getBoundingClientRect().top <= 150) current = id;
        }
        setActiveSection(current);
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copiado al portapapeles.');
    } catch {
      setNotice('No fue posible copiar. Selecciona el texto y cópialo.');
    }
  };
  const current = {
    id: product.id,
    sku: product.sku,
    brand: product.brand,
    providerCode: product.providerCode,
  };
  const equivalents = members.length ? members : [current];
  return (
    <div className={styles.page} data-column-resize="off">
      <Link href="/products" className={styles.back}>
        <ArrowLeft className="size-4" /> Volver a todos los artículos
      </Link>
      <StickyProductNavigation
        anchorId="sales-identity"
        title={code ?? product.sku}
        subtitle={`${product.brand} · ${product.sku}`}
        thumbnail={<ProductThumbnail product={product} assets={assets} />}
      >
        {[
          ['sales-characteristics', 'Características'],
          ...(verified.length ? [['sales-vehicles', 'Vehículos']] : []),
          ['sales-equivalences', 'Equivalencias'],
          ['sales-documents', 'Documentos'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            data-sales-section={id}
            aria-current={activeSection === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </StickyProductNavigation>
      <div className={styles.body}>
        <div className={styles.main}>
          <section className={styles.hero} aria-label="Ficha del producto">
            <div className={styles.gallery}>
              <ProductGallery
                type="ALL"
                name={product.name}
                category={product.category}
                productId={product.id}
                assets={assets}
                attributes={attributes}
              />
            </div>
            <div className={styles.heroContent}>
              <div className={styles.category}>
                <strong>Código unificador</strong>
                <span>{categoryPath ?? sheet?.schema.category.name ?? product.category}</span>
              </div>
              <div className={styles.code} id="sales-identity">
                <h1>{code ?? 'Sin código unificador'}</h1>
                {code ? (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Copiar código unificador"
                    onClick={() => void copy(code)}
                  >
                    <Copy className="size-4" />
                  </Button>
                ) : null}
              </div>
              <p className={styles.kind}>
                {sheet?.schema.template.name ?? product.category}
                {product.dimensions ? ` · ${product.dimensions}` : ''}
              </p>
              <div className={styles.customer}>
                <div className={styles.customerHead}>
                  <h2>Para el cliente</h2>
                  <small>
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {commercial
                      ? 'Descripción comercial aprobada'
                      : 'Resumen con los datos de esta ficha'}
                  </small>
                </div>
                <div className={styles.chips}>
                  <span>Marca</span>
                  <div>
                    {equivalents.map((member) =>
                      member.id === product.id ? (
                        <span className={styles.selected} key={member.id}>
                          {member.brand}
                        </span>
                      ) : (
                        <Link key={member.id} href={memberHref(member.id)}>
                          {member.brand}
                        </Link>
                      ),
                    )}
                  </div>
                </div>
                {variants.length ? (
                  <div className={styles.chips}>
                    <span>Aplicación</span>
                    <div>
                      {variants.map((option) => (
                        <button
                          type="button"
                          key={option.aplicacion?.id ?? option.tipo}
                          aria-pressed={option === variant}
                          className={option === variant ? styles.selected : ''}
                          onClick={() => onPick(option)}
                        >
                          {option.aplicacion
                            ? [
                                option.aplicacion.marcaVehiculo,
                                option.aplicacion.modelo,
                                [option.aplicacion.anioDesde, option.aplicacion.anioHasta]
                                  .filter(Boolean)
                                  .join('–'),
                              ]
                                .filter(Boolean)
                                .join(' ')
                            : option.tipo === 'industrial'
                              ? 'Uso industrial'
                              : 'Uso automotriz'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <h3>{name}</h3>
                {description ? <p>{description}</p> : null}
                <button
                  type="button"
                  className={styles.copy}
                  onClick={() => void copy([name, description].filter(Boolean).join('\n\n'))}
                >
                  <Copy className="size-3.5" />
                  Copiar texto
                </button>
              </div>
            </div>
          </section>
          {dataError ? (
            <p
              role="alert"
              className="my-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              {dataError}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="my-2 text-sm text-primary">
              {notice}
            </p>
          ) : null}
          <section className={styles.card} id="sales-characteristics">
            <h2>Características técnicas</h2>
            <div className={styles.specifications}>
              <div>
                <h3>Medidas y equivalencias</h3>
                <div className={styles.scroll}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Medida</th>
                        <th scope="col">Métrico</th>
                        <th scope="col">Imperial</th>
                        <th scope="col">Abrev.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.map((attribute) => {
                        const symbol = /^\(\s*([^)]+)\)\s*(.*)/u.exec(attribute.label);
                        const hint = {
                          unit: attribute.unit ?? undefined,
                          attributeKey: attribute.key,
                        };
                        return (
                          <tr key={attribute.key}>
                            <th scope="row">
                              {(symbol?.[2] ?? attribute.label)
                                .replace(/\s*\[[^\]]+\]\s*:?\s*$/u, '')
                                .replace(/\s*:\s*$/u, '')}
                            </th>
                            <td>
                              {displayMeasurement(attribute.value!, hint, 'metric')?.primary.text ??
                                String(attribute.value)}
                            </td>
                            <td>
                              {displayMeasurement(attribute.value!, hint, 'imperial')?.primary
                                .text ?? '—'}
                            </td>
                            <td>{symbol?.[1] ?? ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!measurements.length ? (
                  <p className={styles.muted}>Sin medidas registradas.</p>
                ) : null}
              </div>
              <div>
                <h3>Características</h3>
                <dl className={styles.kv}>
                  {characteristics.map((attribute) => (
                    <div key={attribute.key}>
                      <dt>{attribute.label}</dt>
                      <dd>
                        {typeof attribute.value === 'boolean'
                          ? attribute.value
                            ? 'Sí'
                            : 'No'
                          : String(attribute.value)}
                        {attribute.unit && typeof attribute.value === 'number'
                          ? ` ${attribute.unit}`
                          : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
                {!characteristics.length ? (
                  <p className={styles.muted}>Sin características registradas.</p>
                ) : null}
              </div>
            </div>
          </section>
          {verified.length ? (
            <section className={styles.card} id="sales-vehicles">
              <div className={styles.vehicleHead}>
                <div>
                  <h2>¿En qué vehículo va?</h2>
                  {variants.some((option) => option.tipo === 'industrial') ? (
                    <p className={styles.muted}>También de uso industrial</p>
                  ) : null}
                </div>
                <label>
                  Filtrar vehículo
                  <input
                    type="search"
                    placeholder="Marca, modelo o año"
                    value={vehicleQuery}
                    onChange={(event) => setVehicleQuery(event.target.value)}
                  />
                </label>
              </div>
              <p className="px-5 pb-2 text-xs text-muted-foreground" aria-live="polite">
                {vehicles.length} aplicaciones verificadas
              </p>
              <div className={styles.scroll}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Vehículo</th>
                      <th scope="col">Años</th>
                      <th scope="col">Motor</th>
                      <th scope="col">Dónde va</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((application) => (
                      <tr key={application.id}>
                        <th scope="row">
                          {[application.make, application.model, application.bodyStyle]
                            .filter(Boolean)
                            .join(' · ')}
                        </th>
                        <td>
                          {[application.yearFrom, application.yearTo].filter(Boolean).join(' – ') ||
                            '—'}
                        </td>
                        <td>
                          {[application.engine, application.fuel].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td>
                          {[application.area, application.subarea].filter(Boolean).join(' › ') ||
                            '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!vehicles.length ? (
                <p className={styles.muted}>No hay vehículos verificados para estos criterios.</p>
              ) : null}
            </section>
          ) : null}
          <section className={styles.card} id="sales-documents">
            <h2>Documentos y certificados</h2>
            <ul className={styles.documents}>
              {assets
                .filter((asset) => asset.type !== 'FOTO')
                .map((asset) => (
                  <li key={asset.id}>
                    <FileText className="size-4 shrink-0" />
                    <span>{asset.filename}</span>
                    <a
                      href={productAssetDownloadUrl(asset.id)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Ver ${asset.filename}`}
                    >
                      Ver
                    </a>
                    <a
                      href={productAssetDownloadUrl(asset.id)}
                      download={asset.filename}
                      aria-label={`Descargar ${asset.filename}`}
                    >
                      Descargar
                    </a>
                  </li>
                ))}
            </ul>
            {!assets.some((asset) => asset.type !== 'FOTO') ? (
              <p className={styles.muted}>Sin documentos disponibles para tu perfil.</p>
            ) : null}
            {files.length ? (
              <dl className={styles.kv}>
                {files.map((attribute) => (
                  <div key={attribute.key}>
                    <dt>{attribute.label}</dt>
                    <dd>{String(attribute.value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        </div>
        <aside className={styles.aside} aria-label="Equivalencias del código unificador">
          <section className={styles.card} id="sales-equivalences">
            <h2>
              Equivalencias <small>{membersLoading ? '…' : equivalents.length}</small>
            </h2>
            <p className={styles.muted}>Mismas características y misma aplicación</p>
            {membersError ? (
              <p role="alert" className="p-4 text-xs text-destructive">
                {membersError}
              </p>
            ) : null}
            <ul className={styles.equivalents}>
              {equivalents.map((member) => (
                <li key={member.id} className={member.id === product.id ? styles.own : ''}>
                  <div className={styles.equivalentTop}>
                    <Link href={memberHref(member.id)}>
                      <ProductThumbnail
                        product={{
                          ...product,
                          id: member.id,
                          sku: member.sku,
                          brand: member.brand ?? 'Sin marca',
                        }}
                        assets={member.id === product.id ? assets : []}
                      />
                      <span>
                        <small>Código de Artículo - CDR</small>
                        <strong>{member.sku}</strong>
                        <span>
                          {member.brand}
                          {member.providerCode ? ` · Prov. ${member.providerCode}` : ''}
                        </span>
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Copiar código ${member.sku}`}
                      onClick={() => void copy(member.sku)}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                  <SheetActions id={member.id} sku={member.sku} product={product} />
                </li>
              ))}
            </ul>
            <div className={styles.compatible}>
              <h3>Productos Compatibles</h3>
              <p className={styles.muted}>Referencias externas del código unificador.</p>
              <ul>
                {compatible.map((reference) => (
                  <li key={reference.id}>
                    <strong>{reference.brand}</strong> – {reference.code}
                  </li>
                ))}
              </ul>
              {!compatible.length ? (
                <p className={styles.muted}>Sin referencias activas y aprobadas.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
