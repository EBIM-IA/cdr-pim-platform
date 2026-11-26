'use client';

import {
  DEFAULT_PDF_DESIGN,
  COMPACT_PDF_DESIGN,
  pdfDesignConfigSchema,
  type PdfDesign,
  type PdfDesignConfig,
  type PdfDesignSettingsDto,
  type AdminTemplateDto,
  type CatalogParameterDto,
  type CatalogWorkbookProductDto,
  type ProductAttributeSheetDto,
} from '@cdr/contracts';
import { Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { PdfDocumentPages } from '@/components/pdf-document-pages';
import { fetchPdfDesignSettings, savePdfDesignSettings } from '@/lib/pdf-design-api';
import { getAdminTemplate, listAdminTemplates } from '@/lib/catalog-admin-api';
import { listCatalogParameters, saveCatalogParameter } from '@/lib/catalog-parameters-api';
import { fetchCatalogWorkbook, fetchProductTechnicalSheet } from '@/lib/dynamic-catalog-api';
import { listProductAssets } from '@/lib/product-assets-api';
import {
  technicalSheetDocument,
  technicalSheetDesign,
  technicalSheetMedia,
  technicalSheetBrand,
  technicalSheetLogo,
  technicalSheetCopy,
} from '@/lib/technical-sheet-export';
import { createTechnicalSheetPdf } from '@/lib/technical-sheet-pdf';
import {
  PDF_FONTS,
  pdfImageDataUrl,
  matchLogoFilename,
  normalizeLogoBrand,
  resolvePdfBrandLogo,
  suggestedLogoFilename,
} from '@/lib/pdf-designs';
import { downloadCsv } from '@/lib/tabular-export';
import { downloadBinary, technicalSheetFilename } from '@/lib/zip-export';
import styles from './pdf-design-workspace.module.css';

type Field = {
  path: string;
  label: string;
  kind?: 'number' | 'color' | 'check' | 'area' | 'font';
  min?: number;
  max?: number;
  step?: number;
  options?: readonly (readonly [string, string])[];
};
const casing = [
  ['none', 'Tal cual'],
  ['upper', 'MAYÚSCULAS'],
  ['title', 'Tipo Título'],
  ['lower', 'minúsculas'],
] as const;
const n = (path: string, label: string, min: number, max: number, step = 1): Field => ({
  path,
  label,
  min,
  max,
  step,
  kind: 'number',
});
const check = (path: string, label: string): Field => ({ path, label, kind: 'check' });
const groups: { name: string; fields: Field[] }[] = [
  {
    name: 'Página y tipografía',
    fields: [
      {
        path: 'page.size',
        label: 'Tamaño de hoja',
        options: [
          ['A4', 'A4 · 210 × 297 mm'],
          ['Carta', 'Carta · 216 × 279 mm'],
        ],
      },
      n('page.margin', 'Margen (mm)', 5, 30),
      { path: 'fonts.head', label: 'Fuente de títulos', kind: 'font' },
      { path: 'fonts.body', label: 'Fuente del texto', kind: 'font' },
      n('title.size', 'Título (pt)', 10, 48, 0.5),
      n('title.subSize', 'Subtítulo (pt)', 7, 30, 0.5),
      n('sections.titleSize', 'Título de sección (pt)', 7, 26, 0.5),
      n('sections.labelSize', 'Etiquetas (pt)', 6, 18, 0.5),
      n('sections.valueSize', 'Valores (pt)', 6, 18, 0.5),
      n('desc.size', 'Descripción (pt)', 6, 16, 0.5),
      n('index.size', 'Índice (pt)', 7, 20, 0.5),
      n('footer.size', 'Pie (pt)', 5, 14, 0.5),
    ],
  },
  {
    name: 'Colores',
    fields: Object.entries({
      primary: 'Principal · bandas, bordes e índice',
      title: 'Título y subtítulo',
      text: 'Descripción',
      label: 'Etiquetas',
      value: 'Valores',
      line: 'Líneas entre filas',
      bandText: 'Texto de la banda',
      footerBg: 'Fondo del pie',
      footerText: 'Texto del pie',
    }).map(([key, label]) => ({ path: `colors.${key}`, label, kind: 'color' })),
  },
  {
    name: 'Encabezado y título',
    fields: [
      check('header.cdr', 'Logotipo Casa del Rulimán'),
      check('header.brand', 'Logotipo de la marca'),
      n('header.logoH', 'Alto del logotipo CDR (pt)', 20, 110),
      n('header.brandScale', 'Alto de marca (% del anterior)', 30, 100),
      n('header.brandW', 'Ancho máximo de marca (%)', 15, 50),
      n('header.gap', 'Espacio bajo logotipos (pt)', 0, 80),
      check('header.swap', 'Marca a la izquierda y CDR a la derecha'),
      check('header.repeat', 'Repetir logotipo y código en hojas siguientes'),
      {
        path: 'title.source',
        label: 'Título',
        options: [
          ['supplier', 'Código de proveedor (ejemplos)'],
          ['code', 'Código de artículo (SKU)'],
          ['name', 'Nombre del producto'],
          ['friendly', 'Nombre amigable'],
          ['codeName', 'Código de artículo · nombre'],
        ],
      },
      { path: 'title.case', label: 'Formato del título', options: casing },
      {
        path: 'title.sub',
        label: 'Subtítulo',
        options: [
          ['template', 'Plantilla (tipo de producto)'],
          ['category', 'Categoría final'],
          ['name', 'Nombre del producto'],
          ['brand', 'Marca'],
          ['none', 'Sin subtítulo'],
        ],
      },
      { path: 'title.subCase', label: 'Formato del subtítulo', options: casing },
      check('title.rule', 'Línea de acento bajo el título'),
      n('title.ruleW', 'Largo de la línea (pt)', 20, 600, 5),
      n('title.ruleT', 'Grosor de línea (pt)', 0.3, 4, 0.1),
    ],
  },
  {
    name: 'Descripción',
    fields: [
      check('desc.show', 'Mostrar descripción'),
      {
        path: 'desc.source',
        label: 'Texto',
        options: [
          ['auto', 'Comercial aprobada; si no hay, resumen técnico'],
          ['tech', 'Resumen técnico de la plantilla'],
        ],
      },
      { path: 'desc.label', label: 'Rótulo (vacío = sin rótulo)' },
      check('desc.justify', 'Texto justificado'),
      n('desc.maxLines', 'Máximo de líneas', 1, 40),
    ],
  },
  {
    name: 'Fotografía y plano',
    fields: [
      check('media.photo', 'Fotografía'),
      check('media.plano', 'Plano'),
      check('media.hideEmpty', 'Ocultar recuadro si no hay imagen'),
      n('media.h', 'Alto de fotografía (pt)', 80, 340, 5),
      n('media.radius', 'Radio de esquinas (pt)', 0, 40),
      n('media.border', 'Grosor de borde (pt; 0 = sin borde)', 0, 4, 0.25),
      check('media.grid', 'Fondo cuadriculado en el plano'),
    ],
  },
  {
    name: 'Secciones',
    fields: [
      check('index.show', 'Índice de secciones bajo las imágenes'),
      { path: 'index.case', label: 'Formato del índice', options: casing },
      {
        path: 'sections.style',
        label: 'Estilo',
        options: [
          ['card', 'Tarjeta con banda (ejemplos)'],
          ['band', 'Banda sin borde'],
          ['line', 'Título con línea (sobrio)'],
        ],
      },
      {
        path: 'sections.align',
        label: 'Título en la banda',
        options: [
          ['center', 'Centrado'],
          ['left', 'A la izquierda'],
        ],
      },
      { path: 'sections.case', label: 'Formato de título de sección', options: casing },
      check('sections.numbered', 'Numerar secciones (1., 2., …)'),
      n('sections.radius', 'Radio de tarjeta (pt)', 0, 40),
      n('sections.border', 'Borde de tarjeta (pt)', 0, 4, 0.25),
      n('sections.split', 'Columna de etiquetas (%)', 25, 85),
      n('sections.inset', 'Sangría de filas (pt)', 0, 120),
      n('sections.rowPad', 'Aire por fila (pt)', 1, 20, 0.5),
      n('sections.gap', 'Espacio entre secciones (pt)', 0, 80),
      check('sections.labelBold', 'Etiquetas en negrita'),
      check('sections.valueBold', 'Valores en negrita'),
      check('sections.symbols', 'Símbolo antes de etiqueta (d · Diámetro…)'),
      check('sections.zebra', 'Filas alternas sombreadas'),
      check('sections.lines', 'Líneas entre filas'),
      check('sections.keep', 'Conservar las secciones juntas cuando quepan'),
    ],
  },
  {
    name: 'Pie de página',
    fields: [
      check('footer.band', 'Banda de color'),
      check('footer.qr', 'Código QR'),
      {
        path: 'footer.qrMode',
        label: 'El QR abre',
        options: [
          ['web', 'El sitio web'],
          ['product', 'La página del producto'],
        ],
      },
      { path: 'footer.qrUrl', label: 'Sitio web' },
      { path: 'footer.productUrl', label: 'Página del producto ({codigo} = SKU)' },
      n('footer.qrSize', 'Tamaño del QR (pt)', 24, 120),
      { path: 'footer.lines', label: 'Líneas de contacto (una por renglón)', kind: 'area' },
      {
        path: 'footer.align',
        label: 'Alineación del pie',
        options: [
          ['center', 'Centrado'],
          ['left', 'Izquierda'],
          ['right', 'Derecha'],
        ],
      },
      check('footer.pageNum', 'Número de página'),
      check('footer.note', 'Nota «Generada desde CDR PIM…»'),
    ],
  },
];
function readPath(value: PdfDesign, path: string): string | number | boolean {
  return path
    .split('.')
    .reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value) as
    string | number | boolean;
}
function changePath(design: PdfDesign, path: string, value: string | number | boolean): PdfDesign {
  const copy = structuredClone(design),
    [group, key] = path.split('.');
  (copy[group as keyof PdfDesign] as Record<string, unknown>)[key!] = value;
  if (path === 'colors.primary' && design.colors.footerBg === design.colors.primary)
    copy.colors.footerBg = String(value);
  return copy;
}
type PendingLogo = { id: string; file: File; dataUrl: string; brand: string };

export function PdfDesignWorkspace({
  canManage = false,
  downloadActionTarget = null,
}: {
  canManage?: boolean;
  downloadActionTarget?: HTMLElement | null;
}) {
  const [effectiveLogos, setEffectiveLogos] = useState<
    Record<string, Awaited<ReturnType<typeof technicalSheetBrand>>>
  >({});
  const [settings, setSettings] = useState<PdfDesignSettingsDto | null>(null),
    [config, setConfig] = useState<PdfDesignConfig | null>(null),
    [selected, setSelected] = useState(''),
    [templates, setTemplates] = useState<AdminTemplateDto[]>([]),
    [templateDetails, setTemplateDetails] = useState<AdminTemplateDto | null>(null),
    [templateNotice, setTemplateNotice] = useState(''),
    [brands, setBrands] = useState<CatalogParameterDto[]>([]),
    [catalogBrandNames, setCatalogBrandNames] = useState<string[] | 'unavailable' | null>(null),
    [samples, setSamples] = useState<CatalogWorkbookProductDto[]>([]),
    [query, setQuery] = useState(''),
    [skuId, setSkuId] = useState(''),
    [templateId, setTemplateId] = useState(''),
    [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null),
    [bytes, setBytes] = useState<Uint8Array | null>(null),
    [error, setError] = useState(''),
    [previewError, setPreviewError] = useState(''),
    [notice, setNotice] = useState(''),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [retry, setRetry] = useState(0),
    [logoFilter, setLogoFilter] = useState('all'),
    [pending, setPending] = useState<PendingLogo[]>([]),
    [logoBusy, setLogoBusy] = useState(false);
  const templateRequest = useRef<AbortController | null>(null);
  useEffect(() => () => templateRequest.current?.abort(), []);
  const current = useRef(config);
  current.current = config;
  const brandsRef = useRef(brands);
  brandsRef.current = brands;
  const productBrandNames = Array.isArray(catalogBrandNames) ? catalogBrandNames : null;
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void Promise.all([
      fetchPdfDesignSettings(controller.signal),
      canManage ? listAdminTemplates() : Promise.resolve([]),
      listCatalogParameters('brand', controller.signal),
    ])
      .then(([result, templateList, brandList]) => {
        if (controller.signal.aborted) return;
        setSettings(result);
        setConfig(result.config);
        setSelected(result.config.defaultDesignId);
        setTemplates(templateList);
        setBrands(brandList);
        setDirty(false);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'No se pudo cargar la configuración.',
          );
      });
    return () => controller.abort();
  }, [retry, canManage]);
  useEffect(() => {
    const controller = new AbortController(),
      timer = window.setTimeout(() => {
        void fetchCatalogWorkbook(
          { q: query || undefined, page: 1, pageSize: 30, filter: [] },
          controller.signal,
        )
          .then((result) => {
            if (controller.signal.aborted) return;
            setCatalogBrandNames(result.facets.brands);
            setSamples(result.items);
            setSkuId((previous) => previous || result.items[0]?.id || '');
          })
          .catch((failure: unknown) => {
            if (!controller.signal.aborted) {
              setCatalogBrandNames((previous) => previous ?? 'unavailable');
              setPreviewError(
                failure instanceof Error ? failure.message : 'No se pudieron consultar productos.',
              );
            }
          });
      }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    if (!canManage || !dirty || !config || !settings || saving || error) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      const validated = pdfDesignConfigSchema.safeParse(config);
      if (!validated.success) {
        setError(validated.error.issues[0]?.message ?? 'Revisa la configuración.');
        setSaving(false);
        return;
      }
      void savePdfDesignSettings({ config: validated.data, updatedAt: settings.updatedAt })
        .then((result) => {
          setSettings(result);
          if (current.current === config) setDirty(false);
          setNotice('Cambios guardados');
        })
        .catch((failure: unknown) =>
          setError(
            failure instanceof Error ? failure.message : 'No se pudieron guardar los cambios.',
          ),
        )
        .finally(() => setSaving(false));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [config, dirty, settings, saving, error, canManage]);
  const selectedDesign =
    config?.designs.find((design) => design.id === selected) ?? config?.designs[0];
  useEffect(() => {
    if (!config || !selectedDesign || !skuId) {
      setBytes(null);
      return;
    }
    setPreviewError('');
    setBytes(null);
    const controller = new AbortController(),
      timer = window.setTimeout(() => {
        void (async () => {
          const [currentSheet, assets, logo] = await Promise.all([
            fetchProductTechnicalSheet(skuId, controller.signal),
            listProductAssets({ productId: skuId }, controller.signal),
            technicalSheetLogo(controller.signal),
          ]);
          const [media, brand, copy] = await Promise.all([
            technicalSheetMedia(assets, controller.signal),
            technicalSheetBrand(currentSheet.product.brand, controller.signal),
            technicalSheetCopy(currentSheet, controller.signal),
          ]);
          const result = await createTechnicalSheetPdf({
            ...technicalSheetDocument(currentSheet, 'metric'),
            cdrLogo: logo,
            media,
            ...brand,
            ...technicalSheetDesign(currentSheet, config),
            ...copy,
            design: selectedDesign,
          });
          if (!controller.signal.aborted) {
            setSheet(currentSheet);
            setTemplateId(currentSheet.schema.template.id);
            setBytes(result);
          }
        })().catch((failure: unknown) => {
          if (!controller.signal.aborted)
            setPreviewError(
              failure instanceof Error ? failure.message : 'No se pudo generar la vista previa.',
            );
        });
      }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [config, selectedDesign, skuId, brands]);
  useEffect(() => {
    const controller = new AbortController();
    const names = [
      ...new Set([
        ...brands.filter((brand) => brand.active).map((brand) => brand.value),
        ...samples.map((product) => product.brand ?? '').filter(Boolean),
        'SCHAEFFLER',
      ]),
    ];
    let index = 0;
    const run = async () => {
      while (index < names.length && !controller.signal.aborted) {
        const brand = names[index++]!;
        try {
          const logo = await technicalSheetBrand(brand, controller.signal, brands);
          if (!controller.signal.aborted)
            setEffectiveLogos((previous) => ({ ...previous, [brand]: logo }));
        } catch {
          /* The preview reports missing files; keep the logo row honest. */
        }
      }
    };
    void Promise.all([run(), run(), run()]);
    return () => controller.abort();
  }, [brands, samples]);
  useEffect(() => {
    if (!canManage || !templateId) return;
    let cancelled = false;
    setTemplateDetails(null);
    void getAdminTemplate(templateId)
      .then((template) => {
        if (!cancelled) setTemplateDetails(template);
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setTemplateNotice(
            failure instanceof Error
              ? failure.message
              : 'No se pudieron consultar los atributos de la plantilla.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [templateId, canManage]);
  const chooseTemplate = async (id: string) => {
    templateRequest.current?.abort();
    const controller = new AbortController();
    templateRequest.current = controller;
    setTemplateId(id);
    setTemplateNotice('Buscando un SKU de esta plantilla…');
    setSkuId('');
    setSheet(null);
    setBytes(null);
    const selectedTemplate = templates.find((template) => template.id === id);
    const cached = samples.find((product) => product.template?.id === id);
    if (cached) {
      setSkuId(cached.id);
      setTemplateNotice('');
      return;
    }
    if (!selectedTemplate) {
      setTemplateNotice('No hay una plantilla disponible para esta muestra.');
      return;
    }
    try {
      let page = 1,
        received = 0;
      while (!controller.signal.aborted) {
        const result = await fetchCatalogWorkbook(
          { categoryId: selectedTemplate.categoryId, page, pageSize: 100, filter: [] },
          controller.signal,
        );
        received += result.items.length;
        const sample = result.items.find((product) => product.template?.id === id);
        if (sample) {
          setSamples((previous) => [
            sample,
            ...previous.filter((product) => product.id !== sample.id),
          ]);
          setSkuId(sample.id);
          setTemplateNotice('');
          return;
        }
        if (!result.items.length || received >= result.total) break;
        page++;
      }
      if (!controller.signal.aborted)
        setTemplateNotice(
          'Esta plantilla todavía no tiene un SKU para mostrar. Puedes configurar su diseño y sus secciones.',
        );
    } catch (failure) {
      if (!controller.signal.aborted)
        setTemplateNotice(
          failure instanceof Error
            ? failure.message
            : 'No se pudo consultar un SKU de esta plantilla.',
        );
    }
  };
  const update = (change: (draft: PdfDesignConfig) => void) => {
    if (!config || !canManage) return;
    const draft = structuredClone(config);
    change(draft);
    setConfig(draft);
    setDirty(true);
    setError('');
    setNotice('');
  };
  const updateDesign = (path: string, value: string | number | boolean) =>
    update((draft) => {
      const at = draft.designs.findIndex((design) => design.id === selectedDesign?.id);
      if (at >= 0) draft.designs[at] = changePath(draft.designs[at]!, path, value);
    });
  if (!config || !selectedDesign)
    return (
      <div className={styles.loading}>
        <p role={error ? 'alert' : 'status'}>{error || 'Cargando diseños de ficha PDF…'}</p>
        {error ? <Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button> : null}
      </div>
    );
  const design = selectedDesign,
    fontOptions = [
      ...PDF_FONTS.map(([id, name]) => [id, name] as const),
      ...config.fonts.map((font) => [font.id, `${font.name} · fuente propia`] as const),
    ],
    chosenTemplate =
      templateDetails?.id === templateId
        ? templateDetails
        : templates.find((template) => template.id === templateId),
    rule = config.templateRules.find((rule) => rule.templateId === templateId),
    sections =
      chosenTemplate?.sections ??
      (sheet?.schema.template.id === templateId ? (sheet.schema.sections ?? []) : []),
    sectionAttributes =
      chosenTemplate?.attributes ??
      (sheet?.schema.template.id === templateId ? sheet.schema.columns : []);
  const changeRule = (change: (rule: PdfDesignConfig['templateRules'][number]) => void) =>
    update((draft) => {
      let target = draft.templateRules.find((rule) => rule.templateId === templateId);
      if (!target) {
        target = {
          templateId,
          designId: draft.defaultDesignId,
          hiddenSections: ['ident', 'docs'],
          sectionTitles: { car: 'Especificaciones' },
        };
        draft.templateRules.push(target);
      }
      change(target);
    });
  const listedBrandNames = [
    ...new Set([
      ...brands.filter((brand) => brand.active).map((brand) => brand.value),
      ...config.brandLogos.map((logo) => logo.brand),
      ...samples.map((product) => product.brand ?? '').filter(Boolean),
      'SCHAEFFLER',
    ]),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  const brandNames = [...new Set([...listedBrandNames, ...(productBrandNames ?? [])])].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  const downloadBrandNames = () =>
    downloadCsv(
      {
        headers: ['Marca', 'Archivo sugerido'],
        rows: brandNames.map((brand) => {
          const filename = suggestedLogoFilename(brand);
          return [brand, matchLogoFilename(filename, brandNames) === brand ? filename : null];
        }),
      },
      'marcas_logotipos',
    );
  const canonicalLogos = {
    ...config,
    brandLogos: brands
      .filter((brand) => brand.active && brand.logoDataUrl)
      .map((brand) => ({ brand: brand.value, dataUrl: brand.logoDataUrl! })),
  };
  const logoRows = listedBrandNames
    .map((brand) => ({
      brand,
      own: brands.find((row) => normalizeLogoBrand(row.value) === normalizeLogoBrand(brand))
        ?.logoDataUrl,
      resolved: resolvePdfBrandLogo(canonicalLogos, brand),
      base:
        effectiveLogos[brand]?.brandLogo ??
        brands.find((row) => normalizeLogoBrand(row.value) === normalizeLogoBrand(brand))
          ?.logoDataUrl,
    }))
    .filter((row) =>
      logoFilter === 'none' ? !row.resolved && !row.base : logoFilter === 'noown' ? !row.own : true,
    );
  const saveCanonicalLogo = async (brand: string, dataUrl: string | null) => {
    const existing = brandsRef.current.find(
      (row) => normalizeLogoBrand(row.value) === normalizeLogoBrand(brand),
    );
    const result = await saveCatalogParameter({
      ...(existing ? { id: existing.id } : {}),
      kind: 'brand',
      value: existing?.value ?? brand,
      description: existing?.description ?? '',
      target: null,
      logoDataUrl: dataUrl,
      active: existing?.active ?? true,
      expectedVersion: existing?.version ?? 0,
    });
    const next = [...brandsRef.current.filter((row) => row.id !== result.id), result];
    brandsRef.current = next;
    setBrands(next);
    setEffectiveLogos((previous) => {
      const copy = { ...previous };
      delete copy[brand];
      return copy;
    });
    setNotice(`Logotipo de ${brand} guardado en Catálogos`);
  };
  const setLogo = async (brand: string, file: File) => {
    try {
      await saveCanonicalLogo(brand, await pdfImageDataUrl(file));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar el logotipo.');
    }
  };
  const applyLogos = async () => {
    setLogoBusy(true);
    const latest = new Map(
      pending.filter((item) => item.brand).map((item) => [normalizeLogoBrand(item.brand), item]),
    );
    let count = 0;
    try {
      for (const item of latest.values()) {
        await saveCanonicalLogo(item.brand, item.dataUrl);
        count++;
      }
      setPending([]);
      setNotice(`${count} logotipos guardados en Catálogos`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar la carga.');
      setNotice(`${count} logotipos guardados antes del error`);
    } finally {
      setLogoBusy(false);
    }
  };
  const collectLogos = async (files: readonly File[]) => {
    if (!canManage) return;
    setLogoBusy(true);
    const items: File[] = [],
      skipped: string[] = [];
    try {
      for (const file of files) {
        if (/\.zip$/iu.test(file.name)) {
          if (file.size > 25 * 1024 * 1024) throw new Error('El ZIP supera 25 MB.');
          const { unzipSync } = await import('fflate');
          let total = 0,
            count = 0;
          const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
            filter: (entry) => {
              if (
                !/\.(png|jpe?g|svg|webp)$/iu.test(entry.name) ||
                /(^|\/)\.|__MACOSX/u.test(entry.name)
              )
                return false;
              total += entry.originalSize;
              count++;
              if (entry.originalSize > 5 * 1024 * 1024 || total > 25 * 1024 * 1024 || count > 250)
                throw new Error(
                  'El ZIP contiene demasiadas imágenes o archivos demasiado grandes.',
                );
              return true;
            },
          });
          for (const [name, data] of Object.entries(entries)) {
            const buffer = new ArrayBuffer(data.length);
            new Uint8Array(buffer).set(data);
            const type = /\.svg$/iu.test(name)
              ? 'image/svg+xml'
              : /\.png$/iu.test(name)
                ? 'image/png'
                : /\.webp$/iu.test(name)
                  ? 'image/webp'
                  : 'image/jpeg';
            items.push(new File([buffer], name.split('/').at(-1) ?? name, { type }));
          }
        } else items.push(file);
      }
      const next: PendingLogo[] = [];
      for (const file of items) {
        try {
          next.push({
            id: crypto.randomUUID(),
            file,
            dataUrl: await pdfImageDataUrl(file),
            brand: matchLogoFilename(file.name, brandNames),
          });
        } catch {
          skipped.push(file.name);
        }
      }
      setPending((previous) => [...previous, ...next]);
      setNotice(
        skipped.length
          ? `No se tomaron en cuenta: ${skipped.join(', ')}`
          : `${next.length} imágenes listas para revisar.`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo leer el archivo.');
    } finally {
      setLogoBusy(false);
    }
  };
  const uploadFont = async (form: HTMLFormElement) => {
    const values = new FormData(form),
      regular = values.get('regular'),
      bold = values.get('bold'),
      name = String(values.get('name') || '').trim();
    if (!name || !(regular instanceof File) || !regular.size) {
      setError('Indica el nombre y el archivo TTF normal.');
      return;
    }
    try {
      const read = async (file: File) => {
        if (!/\.ttf$/iu.test(file.name) || file.size > 3_000_000)
          throw new Error('Las fuentes deben ser TTF de hasta 3 MB.');
        const bytes = new Uint8Array(await file.arrayBuffer()),
          fontkit = (await import('@pdf-lib/fontkit')).default,
          { PDFDocument } = await import('pdf-lib'),
          pdf = await PDFDocument.create();
        pdf.registerFontkit(fontkit);
        const font = await pdf.embedFont(bytes, { subset: true });
        font.widthOfTextAtSize('ÁÉÍÓÚ ñ 0123', 12);
        await pdf.save();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(String(reader.result).replace(/^data:[^;]*;/u, 'data:font/ttf;'));
          reader.onerror = () => reject(new Error('No se pudo leer la fuente.'));
          reader.readAsDataURL(file);
        });
      };
      const [regularDataUrl, boldDataUrl] = await Promise.all([
        read(regular),
        bold instanceof File && bold.size ? read(bold) : Promise.resolve(undefined),
      ]);
      update((draft) =>
        draft.fonts.push({
          id: `font-${crypto.randomUUID()}`,
          name,
          regularDataUrl,
          ...(boldDataUrl ? { boldDataUrl } : {}),
        }),
      );
      form.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'La fuente no es válida.');
    }
  };
  const downloadAction = (
    <Button
      size="sm"
      variant="outline"
      disabled={!bytes}
      onClick={() =>
        bytes &&
        downloadBinary(
          bytes,
          technicalSheetFilename(sheet?.product.sku ?? 'muestra'),
          'application/pdf',
        )
      }
    >
      <Download className="size-4" />
      Descargar muestra
    </Button>
  );
  return (
    <div className={styles.workspace}>
      <section className={styles.top} aria-label="Diseño en edición">
        <label className={styles.field}>
          Diseño en edición
          <select value={design.id} onChange={(event) => setSelected(event.target.value)}>
            {config.designs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.id === config.defaultDesignId ? ' · predeterminado' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Nombre
          <input
            value={design.name}
            disabled={!canManage}
            onChange={(event) =>
              update((draft) => {
                draft.designs.find((item) => item.id === design.id)!.name = event.target.value;
              })
            }
          />
        </label>
        <div className={styles.actions}>
          {canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const id = `design-${crypto.randomUUID()}`;
                  update((draft) =>
                    draft.designs.push({
                      ...structuredClone(design),
                      id,
                      name: `${design.name} (copia)`,
                    }),
                  );
                  setSelected(id);
                }}
              >
                <Plus className="size-4" />
                Duplicar
              </Button>
              {design.id !== config.defaultDesignId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((draft) => {
                      draft.defaultDesignId = design.id;
                    })
                  }
                >
                  Usar como predeterminado
                </Button>
              ) : null}
              {['cdr', 'compacta'].includes(design.id) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update((draft) => {
                      draft.designs = draft.designs.map((item) =>
                        item.id === design.id
                          ? structuredClone(
                              design.id === 'cdr' ? DEFAULT_PDF_DESIGN : COMPACT_PDF_DESIGN,
                            )
                          : item,
                      );
                    })
                  }
                >
                  Restablecer
                </Button>
              ) : null}
              {config.designs.length > 1 && design.id !== config.defaultDesignId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    update((draft) => {
                      draft.designs = draft.designs.filter((item) => item.id !== design.id);
                      for (const rule of draft.templateRules)
                        if (rule.designId === design.id) rule.designId = draft.defaultDesignId;
                    });
                    setSelected(config.defaultDesignId);
                  }}
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </Button>
              ) : null}
            </>
          ) : null}
          {downloadActionTarget
            ? createPortal(downloadAction, downloadActionTarget)
            : downloadAction}
        </div>
        <p className={styles.note}>
          {canManage
            ? 'Cada cambio se guarda automáticamente y queda en Auditoría.'
            : 'Tu perfil solo consulta. El diseño lo configura Administración.'}{' '}
          <span role="status">
            {saving
              ? 'Guardando…'
              : dirty
                ? 'Cambios pendientes'
                : notice || (settings?.updatedAt ? 'Configuración guardada' : '')}
          </span>
        </p>
      </section>
      {error ? (
        <div role="alert" className={styles.error}>
          {error}{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError('');
              setDirty(true);
            }}
          >
            Reintentar guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRetry((value) => value + 1)}>
            Recargar datos guardados
          </Button>
        </div>
      ) : null}
      <div className={styles.grid}>
        <form
          className={styles.form}
          aria-label="Opciones del diseño PDF"
          onSubmit={(event) => event.preventDefault()}
        >
          {groups.map((group, index) => (
            <details
              className={styles.group}
              key={group.name}
              open={index === 0 ? true : undefined}
            >
              <summary>{group.name}</summary>
              <div className={styles.fields}>
                {group.fields.map((field) => {
                  const value = readPath(design, field.path),
                    options = field.kind === 'font' ? fontOptions : field.options;
                  return (
                    <label
                      className={`${styles.field} ${field.kind === 'check' ? styles.checkbox : ''} ${field.kind === 'area' || field.kind === 'font' ? styles.wide : ''}`}
                      key={field.path}
                    >
                      {field.kind === 'check' ? (
                        <>
                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            disabled={!canManage}
                            onChange={(event) => updateDesign(field.path, event.target.checked)}
                          />
                          <span>{field.label}</span>
                        </>
                      ) : (
                        <>
                          {field.label}
                          {options ? (
                            <select
                              value={String(value)}
                              disabled={!canManage}
                              onChange={(event) => updateDesign(field.path, event.target.value)}
                            >
                              {options.map(([id, label]) => (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : field.kind === 'area' ? (
                            <textarea
                              rows={4}
                              value={String(value)}
                              disabled={!canManage}
                              onChange={(event) => updateDesign(field.path, event.target.value)}
                            />
                          ) : (
                            <span className={field.kind === 'color' ? styles.color : undefined}>
                              <input
                                type={
                                  field.kind === 'color'
                                    ? 'color'
                                    : field.kind === 'number'
                                      ? 'number'
                                      : 'text'
                                }
                                value={String(value)}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                disabled={!canManage}
                                onChange={(event) =>
                                  updateDesign(
                                    field.path,
                                    field.kind === 'number'
                                      ? Number(event.target.value)
                                      : event.target.value,
                                  )
                                }
                              />
                              {field.kind === 'color' ? (
                                <code>{String(value).toUpperCase()}</code>
                              ) : null}
                            </span>
                          )}
                        </>
                      )}
                    </label>
                  );
                })}
              </div>
            </details>
          ))}
        </form>
        <aside className={styles.preview} aria-label="Vista previa del PDF">
          <label className={styles.field}>
            Buscar SKU para la muestra
            <input
              type="search"
              value={query}
              placeholder="Código, nombre o marca"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            Vista previa con
            <select value={skuId} onChange={(event) => setSkuId(event.target.value)}>
              {skuId && !samples.some((product) => product.id === skuId) ? (
                <option value={skuId}>{sheet?.product.sku ?? 'SKU seleccionado'}</option>
              ) : null}
              {samples.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.note}>
            Diseño «{design.name}»{sheet ? ` · plantilla ${sheet.schema.template.name}` : ''}. La
            muestra usa datos del catálogo.
          </p>
          {previewError ? (
            <p role="alert" className={styles.error}>
              {previewError}
            </p>
          ) : null}
          {!skuId && !previewError ? (
            <p className={styles.note}>No hay productos para esta búsqueda.</p>
          ) : (
            <PdfDocumentPages bytes={bytes} />
          )}
        </aside>
      </div>
      <section className={styles.card}>
        <h2>Logotipos</h2>
        <div className={styles.cdr}>
          <div className={styles.logo}>
            <img
              src={config.cdrLogoDataUrl ?? '/brand/cdr-logo-color.png'}
              alt="Logotipo Casa del Rulimán para las fichas"
            />
          </div>
          <div>
            <b>Logotipo de Casa del Rulimán</b>
            <p className={styles.note}>
              Un logotipo para todas las fichas. El menú y la plataforma conservan su identidad.
            </p>
          </div>
          {canManage ? (
            <div className={styles.actions}>
              <label className={styles.upload}>
                <Upload className="size-4" />
                {config.cdrLogoDataUrl ? 'Cambiar' : 'Cargar logotipo propio'}
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file)
                      void pdfImageDataUrl(file)
                        .then((dataUrl) =>
                          update((draft) => {
                            draft.cdrLogoDataUrl = dataUrl;
                          }),
                        )
                        .catch((failure: unknown) =>
                          setError(
                            failure instanceof Error ? failure.message : 'Logotipo no válido.',
                          ),
                        );
                    event.target.value = '';
                  }}
                />
              </label>
              {config.cdrLogoDataUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update((draft) => {
                      draft.cdrLogoDataUrl = null;
                    })
                  }
                >
                  Volver al original
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <h3>Logotipos de las marcas</h3>
        <p className={styles.note}>
          Son los mismos logotipos de Catálogos · Marcas. Una marca sin logotipo propio utiliza el
          de su marca principal (FAG, INA y LUK → SCHAEFFLER) o el del Inicio.
        </p>
        {canManage ? (
          <div
            className={styles.drop}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void collectLogos([...event.dataTransfer.files]);
            }}
          >
            <div>
              <b>Carga masiva</b>
              <p className={styles.note}>
                Arrastra imágenes o un ZIP. El nombre del archivo indica la marca: SKF.png, OKAMI
                FRENOS.jpg. Revisa las coincidencias antes de cargar y asigna manualmente las marcas
                sin archivo sugerido en el CSV.
              </p>
              {catalogBrandNames === 'unavailable' ? (
                <p className={styles.note} role="status">
                  El CSV incluye las marcas de Catálogos y del diseñador. La consulta de marcas de
                  los SKU está temporalmente indisponible.
                </p>
              ) : null}
            </div>
            <div className={styles.actions}>
              <label className={styles.upload}>
                <Upload className="size-4" />
                {logoBusy ? 'Leyendo…' : 'Elegir imágenes o ZIP'}
                <input
                  disabled={logoBusy}
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.svg,.webp,.zip"
                  onChange={(event) => {
                    void collectLogos([...(event.target.files ?? [])]);
                    event.target.value = '';
                  }}
                />
              </label>
              <label className={styles.upload}>
                Elegir carpeta
                <input
                  ref={(input) => {
                    input?.setAttribute('webkitdirectory', '');
                  }}
                  disabled={logoBusy}
                  type="file"
                  multiple
                  onChange={(event) => {
                    void collectLogos([...(event.target.files ?? [])]);
                    event.target.value = '';
                  }}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!catalogBrandNames}
                onClick={downloadBrandNames}
              >
                <Download className="size-4" />
                Lista de marcas (CSV)
              </Button>
            </div>
          </div>
        ) : null}
        {pending.length ? (
          <div className={styles.bulk}>
            <h3>Revisa antes de cargar · {pending.length} archivos</h3>
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>Imagen</th>
                    <th>Archivo</th>
                    <th>Marca asignada</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <img className={styles.thumb} src={item.dataUrl} alt="" />
                      </td>
                      <td>{item.file.name}</td>
                      <td>
                        <select
                          aria-label={`Marca de ${item.file.name}`}
                          value={item.brand}
                          onChange={(event) =>
                            setPending((previous) =>
                              previous.map((row) =>
                                row.id === item.id ? { ...row, brand: event.target.value } : row,
                              ),
                            )
                          }
                        >
                          <option value="">— No cargar —</option>
                          {brandNames.map((brand) => (
                            <option key={brand} value={brand}>
                              {brand}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{item.brand ? 'Asignado' : 'Sin coincidencia'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setPending([])}>
                Descartar
              </Button>
              <Button
                disabled={logoBusy || !pending.some((item) => item.brand)}
                onClick={() => void applyLogos()}
              >
                Cargar logotipos asignados
              </Button>
            </div>
          </div>
        ) : null}
        <div className={styles.brandbar}>
          <p className={styles.note}>
            {brands.filter((brand) => brand.active && brand.logoDataUrl).length} logotipos propios ·{' '}
            {listedBrandNames.length} marcas
          </p>
          <label className={styles.field}>
            Mostrar
            <select value={logoFilter} onChange={(event) => setLogoFilter(event.target.value)}>
              <option value="all">Todas las marcas</option>
              <option value="noown">Sin logotipo propio</option>
              <option value="none">Sin ningún logotipo</option>
            </select>
          </label>
        </div>
        <div className={`${styles.scroll} ${styles.logotable}`}>
          <table>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Logotipo en la ficha</th>
                <th>Origen</th>
                {canManage ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {logoRows.map((row) => (
                <tr key={row.brand}>
                  <td>
                    <b>{row.brand}</b>
                  </td>
                  <td>
                    {row.resolved?.dataUrl || row.base ? (
                      <img
                        className={styles.brandlogo}
                        src={row.resolved?.dataUrl ?? row.base ?? ''}
                        alt={`Logotipo de ${row.brand}`}
                      />
                    ) : (
                      <span className={styles.note}>Sin logotipo</span>
                    )}
                  </td>
                  <td>
                    {row.resolved
                      ? `${row.resolved.source}${row.resolved.source === 'Heredado' ? ` · ${row.resolved.via}` : ''}`
                      : row.base
                        ? `${effectiveLogos[row.brand]?.brandLogoSource ?? 'Catálogos'}${effectiveLogos[row.brand]?.brandLogoVia ? ` · ${effectiveLogos[row.brand]?.brandLogoVia}` : ''}`
                        : 'Sin logotipo'}
                  </td>
                  {canManage ? (
                    <td>
                      <div className={styles.actions}>
                        <label className={styles.upload}>
                          {row.own ? 'Cambiar' : 'Cargar'}
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.svg,.webp"
                            aria-label={`Logotipo de ${row.brand}`}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void setLogo(row.brand, file);
                              event.target.value = '';
                            }}
                          />
                        </label>
                        {row.own ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void saveCanonicalLogo(row.brand, null).catch((failure: unknown) =>
                                setError(
                                  failure instanceof Error
                                    ? failure.message
                                    : 'No se pudo quitar el logotipo.',
                                ),
                              )
                            }
                          >
                            Quitar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={styles.card}>
        <h2>Diseño y secciones por plantilla</h2>
        {templateNotice ? (
          <p className={styles.note} role="status">
            {templateNotice}
          </p>
        ) : null}
        <p className={styles.note}>
          El orden y los atributos se configuran en Plantillas. Aquí eliges el diseño, las secciones
          y su título en el PDF.
        </p>
        <div className={styles.brandbar}>
          <label className={styles.field}>
            Plantilla
            <select
              value={templateId}
              onChange={(event) => void chooseTemplate(event.target.value)}
            >
              {templates.length ? (
                templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))
              ) : sheet ? (
                <option value={sheet.schema.template.id}>{sheet.schema.template.name}</option>
              ) : null}
            </select>
          </label>
          <label className={styles.field}>
            Diseño de esta plantilla
            <select
              value={rule?.designId ?? config.defaultDesignId}
              disabled={!canManage || !templateId}
              onChange={(event) =>
                changeRule((rule) => {
                  rule.designId = event.target.value;
                })
              }
            >
              {config.designs.map((design) => (
                <option key={design.id} value={design.id}>
                  {design.name}
                </option>
              ))}
            </select>
          </label>
          {canManage && rule ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update((draft) => {
                  draft.templateRules = draft.templateRules.filter(
                    (rule) => rule.templateId !== templateId,
                  );
                })
              }
            >
              Volver a lo inicial
            </Button>
          ) : null}
        </div>
        <div className={styles.scroll}>
          <table>
            <thead>
              <tr>
                <th>En el PDF</th>
                <th>Sección de la plantilla</th>
                <th>Título en el PDF</th>
                <th>Atributos</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Mostrar ${section.label} en el PDF`}
                      checked={!(rule?.hiddenSections ?? ['ident', 'docs']).includes(section.key)}
                      disabled={!canManage}
                      onChange={(event) =>
                        changeRule((rule) => {
                          rule.hiddenSections = rule.hiddenSections.filter(
                            (key) => key !== section.key,
                          );
                          if (!event.target.checked) rule.hiddenSections.push(section.key);
                        })
                      }
                    />
                  </td>
                  <td>{section.label}</td>
                  <td>
                    <input
                      aria-label={`Título PDF de ${section.label}`}
                      value={
                        rule?.sectionTitles[section.key] ??
                        (section.key === 'car' ? 'Especificaciones' : '')
                      }
                      placeholder={section.label}
                      disabled={!canManage}
                      onChange={(event) =>
                        changeRule((rule) => {
                          rule.sectionTitles[section.key] = event.target.value;
                        })
                      }
                    />
                  </td>
                  <td>
                    <small>
                      {
                        sectionAttributes.filter(
                          (attribute) =>
                            attribute.sectionKey === section.key &&
                            (!('active' in attribute) || attribute.active) &&
                            attribute.includeInTechnicalSheet,
                        ).length
                      }{' '}
                      exportables de{' '}
                      {
                        sectionAttributes.filter(
                          (attribute) =>
                            attribute.sectionKey === section.key &&
                            (!('active' in attribute) || attribute.active),
                        ).length
                      }
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sections.length ? (
            <p className={styles.note}>Esta plantilla todavía no tiene secciones configuradas.</p>
          ) : null}
        </div>
        <p className={styles.note}>
          {config.designs
            .map(
              (design) =>
                `${templates.filter((template) => (config.templateRules.find((rule) => rule.templateId === template.id)?.designId ?? config.defaultDesignId) === design.id).length} plantillas con «${design.name}»`,
            )
            .join(' · ')}
        </p>
      </section>
      <section className={styles.card}>
        <h2>Fuentes propias</h2>
        <p className={styles.note}>
          Rogan es una fuente comercial. Puedes cargar tu archivo autorizado TTF; Saira es la
          alternativa incluida. La fuente se incrusta en el PDF.
        </p>
        {config.fonts.map((font) => (
          <div className={styles.fontrow} key={font.id}>
            <b>{font.name}</b>
            <span className={styles.note}>
              {font.boldDataUrl ? 'Normal y negrita' : 'Solo normal (negrita simulada)'}
            </span>
            {canManage ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  update((draft) => {
                    draft.fonts = draft.fonts.filter((row) => row.id !== font.id);
                    for (const design of draft.designs)
                      for (const key of ['head', 'body'] as const)
                        if (design.fonts[key] === font.id) design.fonts[key] = 'saira';
                  })
                }
              >
                Quitar
              </Button>
            ) : null}
          </div>
        ))}
        {canManage ? (
          <form
            className={styles.fontupload}
            onSubmit={(event) => {
              event.preventDefault();
              void uploadFont(event.currentTarget);
            }}
          >
            <label className={styles.field}>
              Nombre de la fuente
              <input name="name" required maxLength={120} placeholder="Rogan" />
            </label>
            <label className={styles.field}>
              Normal (.ttf)
              <input name="regular" type="file" required accept=".ttf" />
            </label>
            <label className={styles.field}>
              Negrita (.ttf, opcional)
              <input name="bold" type="file" accept=".ttf" />
            </label>
            <Button variant="outline" type="submit">
              <Plus className="size-4" />
              Agregar fuente
            </Button>
          </form>
        ) : null}
      </section>
      {canManage && dirty ? (
        <div className={styles.savebar}>
          <span>{saving ? 'Guardando configuración…' : 'Cambios pendientes de guardar'}</span>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => {
              setError('');
              setConfig(structuredClone(config));
            }}
          >
            <Save className="size-4" />
            Reintentar guardar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
