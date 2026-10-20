'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  readonly value: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export interface SearchableSelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SearchableSelectOption[];
  readonly placeholder: string;
  readonly onValueChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly className?: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
}

/** Compact single-select combobox used by catalog filters with long ERP-derived lists. */
export function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  onValueChange,
  disabled = false,
  title,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const visible = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return [...options];
    return options.filter((option) =>
      [option.label, ...(option.keywords ?? [])].some((candidate) =>
        normalize(candidate).includes(term),
      ),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <label
      className={cn('grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground', className)}
      title={title}
    >
      <span>{label}</span>
      <div ref={rootRef} className="relative min-w-0">
        <span className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={label}
            aria-controls={listboxId}
            aria-expanded={open}
            aria-autocomplete="list"
            disabled={disabled}
            value={open ? query : (selected?.label ?? '')}
            placeholder={placeholder}
            onFocus={() => {
              setQuery('');
              setOpen(true);
            }}
            onClick={() => {
              setQuery('');
              setOpen(true);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-16 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-1 disabled:opacity-50"
          />
          {value && !disabled ? (
            <button
              type="button"
              aria-label={`Limpiar ${label}`}
              onClick={(event) => {
                event.preventDefault();
                onValueChange('');
                setQuery('');
                setOpen(false);
              }}
              className="absolute right-8 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded hover:bg-slate-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2"
          />
        </span>

        {open && !disabled ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={`Opciones de ${label}`}
            className="absolute z-40 mt-1 max-h-64 w-full min-w-52 overflow-y-auto rounded-lg border bg-white p-1 shadow-xl"
          >
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onValueChange('');
                setQuery('');
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-normal hover:bg-slate-50"
            >
              <span className="w-4">{value === '' ? <Check className="size-3.5" /> : null}</span>
              {placeholder}
            </button>
            {visible.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onValueChange(option.value);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-normal hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="w-4">
                  {value === option.value ? <Check className="size-3.5 text-primary" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            ))}
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs font-normal text-muted-foreground">
                Sin opciones coincidentes.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </label>
  );
}
