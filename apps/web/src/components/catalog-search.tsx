'use client';

import type { CatalogWorkbookResultDto } from '@cdr/contracts';
import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { cn } from '@/lib/utils';

type SearchChoice = {
  kind: 'query' | 'category' | 'brand' | 'sku';
  value: string;
  label: string;
  detail: string;
};

/** Suggestions come from the same authorized, paginated projection as the catalog. */
export function CatalogSearch({
  value,
  onChange,
  onSearch,
  showDescription = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string, filter?: { categoryId?: string; brand?: string }) => void;
  showDescription?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; data: CatalogWorkbookResultDto } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const query = value.trim();

  useEffect(() => {
    if (!open || query.length < 2) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetchCatalogWorkbook({ q: query, filter: [], page: 1, pageSize: 6 }, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setResult({ query, data });
            setActive(-1);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const data = result?.query === query ? result.data : null;
  const choices: SearchChoice[] = [
    {
      kind: 'query',
      value: query,
      label: `Buscar «${query}»`,
      detail: data ? `${data.total} productos` : 'Buscar en el catálogo',
    },
  ];
  if (data) {
    const categories = new Map(
      data.items.flatMap((item) =>
        item.category ? [[item.category.id, item.category.name] as const] : [],
      ),
    );
    for (const [categoryId, name] of [...categories].slice(0, 3)) {
      choices.push({
        kind: 'category',
        value: categoryId,
        label: name,
        detail: 'Categoría · filtrar resultados',
      });
    }
    for (const brand of [
      ...new Set(data.items.flatMap((item) => (item.brand ? [item.brand] : []))),
    ].slice(0, 3)) {
      choices.push({
        kind: 'brand',
        value: brand,
        label: brand,
        detail: 'Marca · filtrar resultados',
      });
    }
    for (const item of data.items) {
      choices.push({
        kind: 'sku',
        value: item.sku,
        label: item.sku,
        detail: [showDescription ? item.name : '', item.brand].filter(Boolean).join(' · '),
      });
    }
  }
  const choose = (choice: SearchChoice) => {
    onSearch(
      choice.kind === 'sku' ? choice.value : query,
      choice.kind === 'category'
        ? { categoryId: choice.value }
        : choice.kind === 'brand'
          ? { brand: choice.value }
          : undefined,
    );
    setOpen(false);
    setActive(-1);
  };
  const expanded = open && query.length >= 2;
  useEffect(() => {
    if (expanded && active >= 0)
      document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, expanded, id]);

  return (
    <div
      ref={root}
      className="flex min-w-0 flex-[1_1_320px] gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Buscar en el catálogo"
          aria-expanded={expanded}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined}
          value={value}
          autoComplete="off"
          maxLength={300}
          placeholder="Código, marca, categoría, medida o aplicación…"
          className="h-9 w-full rounded-md border bg-slate-50 pl-9 pr-9 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:appearance-none"
          onChange={(event) => {
            onChange(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
              event.stopPropagation();
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActive((current) =>
                current < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : choices.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
                    choices.length,
              );
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              choose(expanded && active >= 0 ? (choices[active] ?? choices[0]!) : choices[0]!);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            className="absolute right-1 top-1 grid size-7 place-items-center rounded hover:bg-slate-100"
            onClick={() => {
              onChange('');
              onSearch('');
              setOpen(false);
              input.current?.focus();
            }}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
        {expanded ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-auto rounded-md border bg-white shadow-lg">
            <p className="border-b px-3 py-2 text-[11px] text-muted-foreground" role="status">
              {loading ? 'Buscando sugerencias…' : 'Sugerencias del catálogo · todas las palabras'}
            </p>
            <div id={`${id}-options`} role="listbox" aria-label="Sugerencias de búsqueda">
              {choices.map((choice, index) => (
                <button
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={active === index}
                  id={`${id}-${index}`}
                  key={`${choice.kind}:${choice.value}`}
                  className={cn(
                    'block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-orange-50',
                    active === index && 'bg-orange-50',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(choice)}
                >
                  <strong className="block text-xs">{choice.label}</strong>
                  <span className="block text-[11px] text-muted-foreground">{choice.detail}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <Button type="button" size="sm" onClick={() => choose(choices[0]!)}>
        <Search aria-hidden="true" className="size-3.5" />
        Buscar
      </Button>
    </div>
  );
}
