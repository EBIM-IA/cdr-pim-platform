'use client';

import type {
  CatalogWorkbookResultDto,
  ProductExperienceDto,
  ProductNameConfig,
  ProductNameSettingsDto,
  ProductNameToken,
} from '@cdr/contracts';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import {
  fetchProductNameSettings,
  previewProductName,
  saveProductNameSettings,
} from '@/lib/product-experience-api';

const formatOptions = [
  ['auto', 'Automático'],
  ['original', 'Tal como está'],
  ['lower', 'minúsculas'],
  ['title', 'Tipo Título'],
  ['upper', 'MAYÚSCULAS'],
] as const;
const inputClass = 'h-8 w-full min-w-0 rounded border bg-white px-2 text-xs';

export function ProductNameSettings() {
  const [saved, setSaved] = useState<ProductNameSettingsDto | null>(null);
  const [config, setConfig] = useState<ProductNameConfig | null>(null);
  const [samples, setSamples] = useState<CatalogWorkbookResultDto | null>(null);
  const [productId, setProductId] = useState('');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<ProductExperienceDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void fetchProductNameSettings(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSaved(result);
          setConfig(result.config);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No fue posible cargar las fórmulas.');
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchCatalogWorkbook(
        { q: query || undefined, page: 1, pageSize: 20, filter: [] },
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          setSamples(result);
          setProductId((current) =>
            result.items.some((item) => item.id === current)
              ? current
              : (result.items[0]?.id ?? ''),
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSamples(null);
            setProductId('');
            setPreviewError('No fue posible consultar los SKU de muestra.');
          }
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retry]);
  useEffect(() => {
    setPreview(null);
    if (!config || !productId) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = window.setTimeout(() => {
      void previewProductName(productId, config, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setPreview(result);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setPreviewError(
              cause instanceof Error ? cause.message : 'No fue posible calcular la vista previa.',
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [config, productId]);

  if (!config || !saved)
    return (
      <Card className="p-5">
        <p role={error ? 'alert' : 'status'}>{error ?? 'Cargando nombre amigable…'}</p>
        {error ? (
          <Button onClick={() => setRetry((value) => value + 1)} className="mt-3">
            Reintentar
          </Button>
        ) : null}
      </Card>
    );
  const dirty = JSON.stringify(config) !== JSON.stringify(saved.config);
  const fields = [
    ...new Map([
      ...(preview?.fields ?? []).map((field) => [field.field, field] as const),
      ...(samples?.columns ?? []).map(
        (column) =>
          [
            `${column.sourceAuthority === 'erp' ? 'erp' : 'attribute'}:${column.key}`,
            {
              field: `${column.sourceAuthority === 'erp' ? 'erp' : 'attribute'}:${column.key}`,
              label: column.label,
              group: column.sourceAuthority === 'erp' ? 'Datos base ERP' : 'Atributos de plantilla',
            },
          ] as const,
      ),
    ]).values(),
  ];
  const changeToken = (
    rule: 'automotive' | 'industrial',
    index: number,
    update: Partial<ProductNameToken>,
  ) =>
    setConfig({
      ...config,
      [rule]: config[rule].map((tk, i) => (i === index ? { ...tk, ...update } : tk)),
    });
  const move = (rule: 'automotive' | 'industrial', index: number, delta: number) => {
    const tokens = [...config[rule]],
      other = index + delta;
    if (other < 0 || other >= tokens.length) return;
    [tokens[index], tokens[other]] = [tokens[other]!, tokens[index]!];
    setConfig({ ...config, [rule]: tokens });
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice('');
    try {
      const result = await saveProductNameSettings({ config, version: saved.version });
      setSaved(result);
      setConfig(result.config);
      setNotice(
        'Fórmulas guardadas. Los nombres de las fichas y del buscador ya usan esta configuración.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="min-w-0 space-y-4">
      <Card className="p-5">
        <h2 className="text-base font-semibold">Nombre amigable del producto</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Configura los campos en orden para la ficha, las variantes del buscador y el contrato de
          consumo. Los campos vacíos omiten también su texto antes y después.
        </p>
        <fieldset disabled={saving} className="mt-4 grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
            />
            Mostrar nombre amigable en la ficha y el buscador
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              SKU Automotriz e industrial
              <select
                className={`${inputClass} mt-1`}
                value={config.mixedMode}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    mixedMode: event.target.value as ProductNameConfig['mixedMode'],
                  })
                }
              >
                <option value="applications">
                  Automotriz si tiene aplicaciones; si no, Industrial
                </option>
                <option value="automotive">Siempre Automotriz</option>
                <option value="industrial">Siempre Industrial</option>
              </select>
            </label>
            <label className="text-xs">
              Aplicaciones en el nombre general
              <input
                type="number"
                min={1}
                max={10}
                value={config.maxApplications}
                className={`${inputClass} mt-1`}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    maxApplications: Math.max(1, Math.min(10, Number(event.target.value))),
                  })
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={config.moreApplications}
              onChange={(event) => setConfig({ ...config, moreApplications: event.target.checked })}
            />
            Indicar cuántos modelos adicionales tiene el SKU
          </label>
          {(
            [
              ['automotive', 'Automotriz'],
              ['industrial', 'Industrial'],
            ] as const
          ).map(([rule, title]) => (
            <section
              key={rule}
              aria-label={`Fórmula ${title}`}
              className="min-w-0 overflow-hidden rounded-lg border"
            >
              <h3 className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
                Fórmula {title}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead>
                    <tr>
                      <th className="p-2">Orden</th>
                      <th className="p-2">Campo</th>
                      <th className="p-2">Antes</th>
                      <th className="p-2">Después</th>
                      <th className="p-2">Formato</th>
                      <th className="p-2">
                        <span className="sr-only">Acción</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {config[rule].map((tk, index) => (
                      <tr key={index} className="border-t">
                        <td className="whitespace-nowrap p-2">
                          <span className="mr-1">{index + 1}</span>
                          <button
                            type="button"
                            aria-label={`Subir campo ${index + 1} de ${title}`}
                            disabled={index === 0}
                            onClick={() => move(rule, index, -1)}
                            className="rounded p-1 disabled:opacity-30"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Bajar campo ${index + 1} de ${title}`}
                            disabled={index === config[rule].length - 1}
                            onClick={() => move(rule, index, 1)}
                            className="rounded p-1 disabled:opacity-30"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                        </td>
                        <td className="min-w-48 p-2">
                          <select
                            aria-label={`Campo ${index + 1} de ${title}`}
                            className={inputClass}
                            value={tk.field}
                            onChange={(event) =>
                              changeToken(rule, index, { field: event.target.value })
                            }
                          >
                            {!fields.some((field) => field.field === tk.field) ? (
                              <option value={tk.field}>{tk.field}</option>
                            ) : null}
                            {[...new Set(fields.map((field) => field.group))].map((group) => (
                              <optgroup key={group} label={group}>
                                {fields
                                  .filter(
                                    (field) =>
                                      field.group === group &&
                                      (rule === 'automotive' ||
                                        !field.field.startsWith('application:')),
                                  )
                                  .map((field) => (
                                    <option key={field.field} value={field.field}>
                                      {field.label}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            aria-label={`Antes del campo ${index + 1} de ${title}`}
                            maxLength={100}
                            className={inputClass}
                            value={tk.before}
                            onChange={(event) =>
                              changeToken(rule, index, { before: event.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <input
                            aria-label={`Después del campo ${index + 1} de ${title}`}
                            maxLength={100}
                            className={inputClass}
                            value={tk.after}
                            onChange={(event) =>
                              changeToken(rule, index, { after: event.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <select
                            aria-label={`Formato del campo ${index + 1} de ${title}`}
                            className={inputClass}
                            value={tk.format}
                            onChange={(event) =>
                              changeToken(rule, index, {
                                format: event.target.value as ProductNameToken['format'],
                              })
                            }
                          >
                            {formatOptions.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            aria-label={`Eliminar campo ${index + 1} de ${title}`}
                            disabled={config[rule].length === 1}
                            onClick={() =>
                              setConfig({
                                ...config,
                                [rule]: config[rule].filter((_tk, i) => i !== index),
                              })
                            }
                            className="p-1 text-red-700 disabled:opacity-30"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="m-2"
                disabled={config[rule].length >= 40}
                onClick={() =>
                  setConfig({
                    ...config,
                    [rule]: [
                      ...config[rule],
                      { field: 'category:name', before: '', after: '', format: 'auto' },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" />
                Agregar campo
              </Button>
            </section>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-3 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => {
              setConfig(saved.config);
              setError(null);
            }}
          >
            Descartar cambios
          </Button>
          <Button disabled={!dirty || saving} onClick={() => void save()}>
            <Save className="size-4" />
            {saving ? 'Guardando…' : 'Guardar fórmulas'}
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Vista previa con SKU del catálogo</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Buscar SKU de muestra
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`${inputClass} mt-1`}
              placeholder="Código, marca o categoría"
            />
          </label>
          <label className="text-xs">
            SKU de muestra
            <select
              className={`${inputClass} mt-1`}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              {!samples?.items.length ? (
                <option value="">Sin resultados</option>
              ) : (
                samples.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.brand}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        {previewLoading && productId ? (
          <p role="status" className="mt-3 text-xs">
            Calculando vista previa…
          </p>
        ) : null}
        {previewError ? (
          <p role="alert" className="mt-3 text-xs text-red-700">
            {previewError}
          </p>
        ) : null}
        {preview ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Nombre general</p>
            <p className="mt-1 font-semibold">{preview.nombreGeneral}</p>
            <p className="mb-2 mt-4 text-xs text-muted-foreground">
              Opciones del buscador: una por variante de venta
            </p>
            <ul className="divide-y rounded border">
              {preview.variants.map((variant) => (
                <li key={variant.ficha} className="flex items-start gap-2 p-3 text-xs">
                  <span className="rounded bg-orange-50 px-2 py-1 capitalize text-orange-800">
                    {variant.tipo}
                  </span>
                  <span>{variant.nombreAmigable}</span>
                </li>
              ))}
            </ul>
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer font-semibold">
                Contrato de consumo para e-commerce (JSON)
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-950 p-4 text-slate-100">
                {JSON.stringify(preview.variants, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
