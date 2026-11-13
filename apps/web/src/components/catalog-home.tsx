'use client';

import type { CatalogHomeSettingsDto } from '@cdr/contracts';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Package, Settings2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CatalogSearch } from '@/components/catalog-search';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { listCatalogParameters } from '@/lib/catalog-parameters-api';
import { catalogHomeSettings } from '@/lib/catalog-home-api';
import { fetchCatalogCategories, fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import styles from './catalog-home.module.css';

type Entry = CatalogHomeSettingsDto['config']['brands'][number];
type Category = { id: string; name: string; slug: string };
const brandDefaults = [
  ['BOSCH', 'bosch'],
  ['CHALLENGE', 'challenge'],
  ['CYCLO', 'cyclo'],
  ['DJF', 'djf'],
  ['FORCELUBE', 'forcelube'],
  ['GMB', 'gmb'],
  ['GOODYEAR', 'goodyear'],
  ['JASON INDUSTRIAL', 'jason-industrial'],
  ['KOYO', 'koyo-jtekt'],
  ['MRK', 'mrk'],
  ['NSK', 'nsk'],
  ['OKAMI', 'okami'],
  ['SCHAEFFLER', 'schaeffler-luk-ina-fag'],
  ['SEPCO', 'sepco'],
  ['SNR', 'snr'],
  ['STANLEY', 'stanley'],
  ['STP', 'stp'],
  ['TIMKEN', 'timken'],
  ['VDC', 'vdc'],
  ['WD-40', 'wd-40'],
];
const categoryImages: Record<string, string> = {
  filtros: 'filtros.svg',
  lubricantes: 'lubricantes.svg',
  'rodamientos-y-afines': 'rodamientos-y-afines.jpg',
  'sistema-de-frenado-y-sus-partes': 'sistema-de-frenado.jpg',
};
export function homeCategoryRoots(
  categories: { id: string; name: string; slug: string; ancestors?: Category[] }[],
): Category[] {
  return [
    ...new Map(
      categories.map((category) => {
        const root = category.ancestors?.[0] ?? category;
        return [root.id, { id: root.id, name: root.name, slug: root.slug }];
      }),
    ).values(),
  ];
}
function defaults(categories: Category[], brands: string[]): CatalogHomeSettingsDto['config'] {
  const entries: Entry[] = brandDefaults.map(([key, file]) => ({
    key: key!,
    image: `/home/marcas/${file}.png`,
    visible: true,
    text: '',
  }));
  for (const brand of brands)
    if (!entries.some((entry) => entry.key === brand.toUpperCase()))
      entries.push({ key: brand, visible: false, image: null, text: '' });
  return {
    brands: entries,
    categories: categories
      .map((category) => ({
        key: category.id,
        visible: true,
        image: categoryImages[category.slug]
          ? `/home/categorias/${categoryImages[category.slug]}`
          : null,
        text: '',
      }))
      .sort((a, b) => Number(!!b.image) - Number(!!a.image)),
  };
}
function categoryLabel(name: string): string {
  return name === name.toLocaleUpperCase('es')
    ? name.charAt(0) + name.slice(1).toLocaleLowerCase('es')
    : name;
}
export function mergeHomeEntries(saved: Entry[], baseline: Entry[]): Entry[] {
  return [
    ...saved.filter((entry) => baseline.some((candidate) => candidate.key === entry.key)),
    ...baseline.filter((entry) => !saved.some((candidate) => candidate.key === entry.key)),
  ];
}
async function readHomeImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024)
    throw new Error('Elige PNG, JPG o WEBP de hasta 3 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No fue posible preparar la imagen.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}

export function CatalogHome({ canConfigure = false }: { canConfigure?: boolean }) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<CatalogHomeSettingsDto | null>(null);
  const [config, setConfig] = useState<CatalogHomeSettingsDto['config']>({
    brands: [],
    categories: [],
  });
  const [editor, setEditor] = useState<'brands' | 'categories' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [imagesLoading, setImagesLoading] = useState(0);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [carousel, setCarousel] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () =>
      setCarousel({
        previous: element.scrollLeft > 2,
        next: element.scrollLeft < element.scrollWidth - element.clientWidth - 2,
      });
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [settings, config.categories]);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setSettings(null);
    const configure = new URLSearchParams(window.location.search).get('configure');
    if (canConfigure && (configure === 'brands' || configure === 'categories'))
      setEditor(configure);
    void Promise.all([
      fetchCatalogCategories(controller.signal),
      fetchCatalogWorkbook({ page: 1, pageSize: 1, filter: [] }, controller.signal),
      catalogHomeSettings(undefined, controller.signal),
      listCatalogParameters('brand', controller.signal),
    ])
      .then(([items, workbook, stored, brandParameters]) => {
        if (controller.signal.aborted) return;
        const roots = homeCategoryRoots(items);
        const baseline = defaults(roots, [
          ...new Set([
            ...workbook.facets.brands,
            ...brandParameters.filter((brand) => brand.active).map((brand) => brand.value),
          ]),
        ]);
        setCategories(roots);
        setSettings(stored);
        setConfig({
          brands: mergeHomeEntries(stored.config.brands, baseline.brands),
          categories: mergeHomeEntries(stored.config.categories, baseline.categories),
        });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'No fue posible cargar el Inicio.');
      });
    return () => controller.abort();
  }, [revision, canConfigure]);
  const search = (q: string, filter?: { categoryId?: string; brand?: string }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filter?.categoryId) params.set('category', filter.categoryId);
    if (filter?.brand) params.set('brand', filter.brand);
    router.push(`/products${params.size ? `?${params}` : ''}`);
  };
  const change = (kind: 'brands' | 'categories', key: string, patch: Partial<Entry>) =>
    setConfig((current) => ({
      ...current,
      [kind]: current[kind].map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
    }));
  const move = (kind: 'brands' | 'categories', index: number, delta: number) =>
    setConfig((current) => {
      const entries = [...current[kind]];
      const to = index + delta;
      if (to < 0 || to >= entries.length) return current;
      [entries[index], entries[to]] = [entries[to]!, entries[index]!];
      return { ...current, [kind]: entries };
    });
  const save = async () => {
    if (!settings || imagesLoading) return;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await catalogHomeSettings({ version: settings.version, config });
      setSettings(saved);
      setNotice('Inicio guardado. Los cambios están disponibles para todos los perfiles.');
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : 'No fue posible guardar.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.home}>
      <div className={styles.content}>
        <h1>¿Qué necesita el cliente?</h1>
        <div className={styles.search}>
          <CatalogSearch value={query} onChange={setQuery} onSearch={search} appearance="home" />
        </div>
        {error ? (
          <StatePanel
            variant="error"
            title="No pudimos cargar el Inicio"
            description={error}
            actionLabel="Reintentar"
            onAction={() => setRevision((value) => value + 1)}
          />
        ) : !settings ? (
          <p role="status" className="py-8 text-center text-muted-foreground">
            Cargando categorías y marcas…
          </p>
        ) : (
          <>
            <section
              aria-label="Categorías"
              className={styles.carousel}
              data-overflow={carousel.previous || carousel.next}
            >
              <button
                type="button"
                aria-label="Ver categorías anteriores"
                disabled={!carousel.previous}
                onClick={() =>
                  track.current?.scrollBy({
                    left: -(track.current.clientWidth * 0.8),
                    behavior: 'smooth',
                  })
                }
              >
                <ChevronLeft className="size-5" />
              </button>
              <div ref={track} className={styles.track}>
                {config.categories
                  .filter((entry) => entry.visible)
                  .map((entry) => {
                    const category = categories.find((category) => category.id === entry.key);
                    if (!category) return null;
                    return (
                      <button
                        type="button"
                        className={styles.category}
                        key={entry.key}
                        onClick={() => search('', { categoryId: entry.key })}
                      >
                        {entry.image ? (
                          <Image src={entry.image} alt="" width={52} height={52} unoptimized />
                        ) : (
                          <Package className="size-9 shrink-0 text-muted-foreground" />
                        )}
                        <span>
                          <strong>{categoryLabel(category.name)}</strong>
                          {entry.text ? <small>{entry.text}</small> : null}
                        </span>
                      </button>
                    );
                  })}
              </div>
              <button
                type="button"
                aria-label="Ver más categorías"
                disabled={!carousel.next}
                onClick={() =>
                  track.current?.scrollBy({
                    left: track.current.clientWidth * 0.8,
                    behavior: 'smooth',
                  })
                }
              >
                <ChevronRight className="size-5" />
              </button>
            </section>
            <section className={styles.brands} aria-labelledby="winning-parts">
              <h2 id="winning-parts">Repuestos Ganadores</h2>
              <ul>
                {config.brands
                  .filter((entry) => entry.visible)
                  .map((entry) => (
                    <li key={entry.key}>
                      <button
                        type="button"
                        aria-label={`Buscar productos ${entry.key}`}
                        onClick={() => search('', { brand: entry.key })}
                      >
                        {entry.image ? (
                          <Image
                            src={entry.image}
                            alt={entry.key}
                            width={160}
                            height={65}
                            unoptimized
                          />
                        ) : (
                          <strong>{entry.key}</strong>
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
            {canConfigure ? (
              <div className={styles.configLinks}>
                <button
                  type="button"
                  onClick={() => setEditor(editor === 'categories' ? null : 'categories')}
                >
                  <Settings2 className="size-3.5" />
                  Configurar categorías
                </button>
                <button
                  type="button"
                  onClick={() => setEditor(editor === 'brands' ? null : 'brands')}
                >
                  <Settings2 className="size-3.5" />
                  Configurar marcas
                </button>
                <Link href="/?view=dashboard">Resumen operativo</Link>
              </div>
            ) : null}
            {canConfigure && editor ? (
              <section
                id="home-config"
                className={styles.editor}
                aria-label="Configuración del Inicio"
              >
                <h2>{editor === 'brands' ? 'Marcas en el Inicio' : 'Categorías en el Inicio'}</h2>
                <p className="my-2 text-xs text-muted-foreground">
                  Activa las entradas y ordena las imágenes que verán los usuarios. PNG, JPG o WEBP
                  de hasta 3 MB.
                </p>
                <div className="max-h-96 overflow-auto">
                  {config[editor].map((entry, index) => (
                    <div
                      key={entry.key}
                      className={styles.editorRow}
                      onDragOver={(event) => {
                        if (draggedKey && !saving) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (saving || !draggedKey || draggedKey === entry.key) return;
                        setConfig((current) => {
                          const entries = [...current[editor]];
                          const from = entries.findIndex((item) => item.key === draggedKey);
                          if (from < 0) return current;
                          const [moved] = entries.splice(from, 1);
                          entries.splice(
                            entries.findIndex((item) => item.key === entry.key),
                            0,
                            moved!,
                          );
                          return { ...current, [editor]: entries };
                        });
                        setDraggedKey(null);
                      }}
                    >
                      <button
                        type="button"
                        disabled={saving}
                        draggable={!saving}
                        aria-label={`Mover ${entry.key}`}
                        title="Arrastra para ordenar o usa las flechas del teclado"
                        onDragStart={(event) => {
                          setDraggedKey(entry.key);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', entry.key);
                        }}
                        onDragEnd={() => setDraggedKey(null)}
                        onKeyDown={(event) => {
                          if (
                            ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.key)
                          ) {
                            event.preventDefault();
                            move(
                              editor,
                              index,
                              event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1,
                            );
                          }
                        }}
                        className="cursor-grab rounded border px-2 py-1 text-muted-foreground"
                      >
                        ↕
                      </button>
                      <label>
                        <input
                          type="checkbox"
                          disabled={saving}
                          checked={entry.visible}
                          onChange={(event) =>
                            change(editor, entry.key, { visible: event.target.checked })
                          }
                        />{' '}
                        {editor === 'brands'
                          ? entry.key
                          : categories.find((category) => category.id === entry.key)?.name}
                      </label>
                      {entry.image ? (
                        <Image src={entry.image} alt="" width={55} height={40} unoptimized />
                      ) : (
                        <small>Sin imagen</small>
                      )}
                      <label className="text-xs">
                        Imagen
                        <input
                          disabled={saving}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            const kind = editor;
                            if (file) {
                              setImagesLoading((count) => count + 1);
                              void readHomeImage(file)
                                .then((image) => change(kind, entry.key, { image }))
                                .catch((failure) =>
                                  setNotice(
                                    failure instanceof Error
                                      ? failure.message
                                      : 'Imagen no válida.',
                                  ),
                                )
                                .finally(() => setImagesLoading((count) => count - 1));
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving || !entry.image}
                        onClick={() => change(editor, entry.key, { image: null })}
                      >
                        Quitar imagen
                      </Button>
                      {editor === 'categories' ? (
                        <input
                          aria-label={`Texto de ${categories.find((category) => category.id === entry.key)?.name}`}
                          maxLength={90}
                          value={entry.text}
                          disabled={saving}
                          onChange={(event) =>
                            change(editor, entry.key, { text: event.target.value })
                          }
                          className="rounded border p-1"
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving || index === 0}
                        aria-label={`Subir ${entry.key}`}
                        onClick={() => move(editor, index, -1)}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving || index === config[editor].length - 1}
                        aria-label={`Bajar ${entry.key}`}
                        onClick={() => move(editor, index, 1)}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    disabled={saving || imagesLoading > 0}
                    onClick={() => void save()}
                  >
                    {saving ? 'Guardando…' : 'Guardar Inicio'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => {
                      setEditor(null);
                      setRevision((value) => value + 1);
                    }}
                  >
                    Cerrar y recargar
                  </Button>
                </div>
              </section>
            ) : null}
          </>
        )}
        {notice ? (
          <p role="status" className="my-3 rounded border bg-white p-3 text-sm">
            {notice}
          </p>
        ) : null}
        <footer className={styles.footer}>
          <Link href="/products">Ver todos los artículos →</Link>
          <Image src="/brand/cdr-logo.png" width={180} height={55} alt="Casa del Rulimán" />
        </footer>
      </div>
    </div>
  );
}
