'use client';

import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface CategoryTreeSelectOption {
  readonly value: string;
  readonly label: string;
  readonly path: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export interface CategoryTreeNode {
  readonly key: string;
  readonly label: string;
  readonly option?: CategoryTreeSelectOption;
  readonly children: readonly CategoryTreeNode[];
}

interface MutableCategoryTreeNode {
  key: string;
  label: string;
  option?: CategoryTreeSelectOption;
  children: Map<string, MutableCategoryTreeNode>;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
}

function pathSegments(option: CategoryTreeSelectOption): string[] {
  const rawPath = option.path.trim();
  const pathParts = rawPath.includes('>')
    ? rawPath.split(/\s*>\s*/u)
    : normalize(rawPath) === normalize(option.label)
      ? [rawPath]
      : rawPath.split(/\s*\/\s*/u);
  const segments = pathParts.map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0 || normalize(segments.at(-1) ?? '') !== normalize(option.label)) {
    segments.push(option.label);
  }
  return segments;
}

function freezeNode(node: MutableCategoryTreeNode): CategoryTreeNode {
  return {
    key: node.key,
    label: node.label,
    ...(node.option ? { option: node.option } : {}),
    children: [...node.children.values()]
      .sort((left, right) => left.label.localeCompare(right.label, 'es'))
      .map(freezeNode),
  };
}

/** Builds display-only branches from the persisted category path without inventing category IDs. */
export function buildCategoryTree(
  options: readonly CategoryTreeSelectOption[],
): CategoryTreeNode[] {
  const roots = new Map<string, MutableCategoryTreeNode>();
  const seenValues = new Set<string>();

  for (const option of options) {
    // A category may appear more than once when it has multiple active template variants. The
    // category filter is still category-scoped, so one selectable tree leaf is intentional.
    if (seenValues.has(option.value)) continue;
    seenValues.add(option.value);

    let siblings = roots;
    let prefix = '';
    const segments = pathSegments(option);
    segments.forEach((label, index) => {
      const segmentKey = normalize(label);
      prefix = prefix ? `${prefix}\u001f${segmentKey}` : segmentKey;
      let node = siblings.get(segmentKey);
      if (!node) {
        node = { key: prefix, label, children: new Map() };
        siblings.set(segmentKey, node);
      }
      if (index === segments.length - 1) node.option = option;
      siblings = node.children;
    });
  }

  return [...roots.values()]
    .sort((left, right) => left.label.localeCompare(right.label, 'es'))
    .map(freezeNode);
}

function filterTree(nodes: readonly CategoryTreeNode[], query: string): CategoryTreeNode[] {
  const term = normalize(query.trim());
  if (!term) return [...nodes];

  return nodes.flatMap((node) => {
    const candidates = [
      node.label,
      node.option?.label ?? '',
      node.option?.path ?? '',
      ...(node.option?.keywords ?? []),
    ];
    const directMatch = candidates.some((candidate) => normalize(candidate).includes(term));
    const children = directMatch ? [...node.children] : filterTree(node.children, query);
    if (!directMatch && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

function firstSelectableOption(
  nodes: readonly CategoryTreeNode[],
): CategoryTreeSelectOption | undefined {
  for (const node of nodes) {
    if (node.option && !node.option.disabled) return node.option;
    const child = firstSelectableOption(node.children);
    if (child) return child;
  }
  return undefined;
}

function TreeNodes({
  nodes,
  depth,
  selectedValue,
  expanded,
  searching,
  onToggle,
  onSelect,
}: {
  readonly nodes: readonly CategoryTreeNode[];
  readonly depth: number;
  readonly selectedValue: string;
  readonly expanded: ReadonlySet<string>;
  readonly searching: boolean;
  readonly onToggle: (key: string) => void;
  readonly onSelect: (option: CategoryTreeSelectOption) => void;
}) {
  return nodes.map((node) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = searching || expanded.has(node.key);
    const isSelected = node.option?.value === selectedValue;
    const rowClass = cn(
      'flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs hover:bg-orange-50',
      isSelected && 'bg-orange-50 text-orange-800',
    );

    return (
      <div
        key={node.key}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={node.option ? isSelected : undefined}
      >
        <div className={rowClass} style={{ paddingLeft: `${8 + depth * 18}px` }}>
          {hasChildren ? (
            <button
              type="button"
              aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${node.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onToggle(node.key)}
              className="grid size-6 shrink-0 place-items-center rounded text-slate-500 hover:bg-orange-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')}
              />
            </button>
          ) : (
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center">
              <span className="size-1.5 rounded-full bg-slate-300" />
            </span>
          )}

          {node.option ? (
            <button
              type="button"
              disabled={node.option.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(node.option as CategoryTreeSelectOption)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 font-medium disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              {isSelected ? <Check aria-hidden="true" className="size-3.5 text-primary" /> : null}
            </button>
          ) : (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onToggle(node.key)}
              className="min-w-0 flex-1 truncate py-1 font-semibold"
            >
              {node.label}
            </button>
          )}
        </div>

        {hasChildren && isExpanded ? (
          <div role="group">
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              selectedValue={selectedValue}
              expanded={expanded}
              searching={searching}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          </div>
        ) : null}
      </div>
    );
  });
}

/** Searchable category selector that preserves the persisted hierarchy as collapsible branches. */
export function CategoryTreeSelect({
  label,
  value,
  options,
  placeholder,
  onValueChange,
  disabled = false,
  title,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly CategoryTreeSelectOption[];
  readonly placeholder: string;
  readonly onValueChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initializedExpansion = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const treeId = useId();
  const tree = useMemo(() => buildCategoryTree(options), [options]);
  const visibleTree = useMemo(() => filterTree(tree, query), [query, tree]);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (initializedExpansion.current || tree.length === 0) return;
    setExpanded(new Set(tree.map((node) => node.key)));
    initializedExpansion.current = true;
  }, [tree]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setQuery('');
      inputRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const select = (option: CategoryTreeSelectOption) => {
    if (option.disabled) return;
    onValueChange(option.value);
    setQuery('');
    setOpen(false);
  };

  const focusTreeEdge = (edge: 'first' | 'last') => {
    window.setTimeout(() => {
      const buttons = treeRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const target =
        edge === 'first' ? buttons?.item(0) : buttons?.item((buttons?.length ?? 1) - 1);
      target?.focus();
    });
  };

  return (
    <div
      ref={rootRef}
      className={cn('grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground', className)}
      title={title}
    >
      <span id={labelId}>{label}</span>
      <div className="relative min-w-0">
        <span className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-labelledby={labelId}
            aria-controls={treeId}
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
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                focusTreeEdge(event.key === 'ArrowDown' ? 'first' : 'last');
                return;
              }
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const firstMatch = query.trim() ? firstSelectableOption(visibleTree) : undefined;
              if (firstMatch) select(firstMatch);
              else focusTreeEdge('first');
            }}
            className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-16 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-1 disabled:opacity-50"
          />
          {value && !disabled ? (
            <button
              type="button"
              aria-label={`Limpiar ${label}`}
              onClick={() => {
                onValueChange('');
                setQuery('');
                setOpen(false);
              }}
              className="absolute right-8 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded hover:bg-slate-100"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2"
          />
        </span>

        {open && !disabled ? (
          <div
            ref={treeRef}
            id={treeId}
            role="tree"
            aria-labelledby={labelId}
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              ];
              const current = buttons.indexOf(event.target as HTMLButtonElement);
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                setQuery('');
                inputRef.current?.focus();
                return;
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? buttons[0]
                  : event.key === 'End'
                    ? buttons.at(-1)
                    : event.key === 'ArrowDown'
                      ? buttons[Math.min(buttons.length - 1, Math.max(0, current + 1))]
                      : buttons[Math.max(0, current - 1)];
              next?.focus();
            }}
            className="absolute left-0 z-40 mt-1 max-h-72 w-full min-w-0 overflow-y-auto rounded-lg border bg-white p-1 shadow-xl sm:w-[min(32rem,calc(100vw-3rem))]"
          >
            <button
              type="button"
              role="treeitem"
              aria-selected={value === ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onValueChange('');
                setQuery('');
                setOpen(false);
              }}
              className="flex min-h-8 w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs font-normal hover:bg-slate-50"
            >
              <span className="w-4">{value === '' ? <Check className="size-3.5" /> : null}</span>
              {placeholder}
            </button>
            <TreeNodes
              nodes={visibleTree}
              depth={0}
              selectedValue={value}
              expanded={expanded}
              searching={Boolean(query.trim())}
              onToggle={(key) =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              onSelect={select}
            />
            {visibleTree.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs font-normal text-muted-foreground">
                Sin categorías coincidentes.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
