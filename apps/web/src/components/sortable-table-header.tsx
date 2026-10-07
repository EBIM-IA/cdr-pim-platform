'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

interface SortableTableHeaderProps {
  readonly label: string;
  readonly active: boolean;
  readonly direction: SortDirection;
  readonly onToggle: () => void;
  readonly className?: string;
}

export function SortableTableHeader({
  label,
  active,
  direction,
  onToggle,
  className,
}: SortableTableHeaderProps) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" className={cn('px-4 py-3 font-semibold', className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
        onClick={onToggle}
        aria-label={`${label}: ordenar ${active && direction === 'asc' ? 'descendente' : 'ascendente'}`}
      >
        {label}
        <Icon aria-hidden="true" className={cn('size-3.5', !active && 'opacity-45')} />
      </button>
    </th>
  );
}

export function nextSortDirection(active: boolean, direction: SortDirection): SortDirection {
  return active && direction === 'asc' ? 'desc' : 'asc';
}

export function sortTableRows<T>(
  rows: readonly T[],
  direction: SortDirection,
  getValue: (row: T) => string | number | boolean | null | undefined,
): T[] {
  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((left, right) => {
      if (left.value === null || left.value === undefined || left.value === '') {
        return right.value === null || right.value === undefined || right.value === '' ? 0 : 1;
      }
      if (right.value === null || right.value === undefined || right.value === '') return -1;
      const comparison =
        typeof left.value === 'number' && typeof right.value === 'number'
          ? left.value - right.value
          : collator.compare(String(left.value), String(right.value));
      return comparison === 0
        ? left.index - right.index
        : direction === 'asc'
          ? comparison
          : -comparison;
    })
    .map(({ row }) => row);
}
