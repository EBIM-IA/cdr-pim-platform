'use client';

import { useEffect } from 'react';

export const COLUMN_PREFERENCES_RESET = 'cdr:reset-column-preferences';
const MIN_WIDTH = 48;
const MAX_WIDTH = 1_000;

export function columnWidthStorageKey(userId: string, tableKey: string): string {
  return `cdr:column-width:${encodeURIComponent(userId)}:${tableKey}`;
}

export function resetColumnPreferences(userId: string): void {
  try {
    const prefixes = ['column-order', 'column-width'].map(
      (kind) => `cdr:${kind}:${encodeURIComponent(userId)}:`,
    );
    Object.keys(window.localStorage)
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Reset the current view even when optional browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(COLUMN_PREFERENCES_RESET, { detail: userId }));
}

/** Resolve individual columns through grouped headings and row spans. */
export function tableColumnHeaders(table: HTMLTableElement): HTMLTableCellElement[] {
  const grid: HTMLTableCellElement[][] = [];
  Array.from(table.tHead?.rows ?? [])
    .filter(
      (row) =>
        !row.classList.contains('xf-row') &&
        !(row.querySelector('input') && !row.textContent?.trim()),
    )
    .forEach((row, rowIndex) => {
      grid[rowIndex] ??= [];
      let columnIndex = 0;
      Array.from(row.cells).forEach((cell) => {
        while (grid[rowIndex]?.[columnIndex]) columnIndex += 1;
        for (let y = rowIndex; y < rowIndex + cell.rowSpan; y += 1) {
          grid[y] ??= [];
          for (let x = columnIndex; x < columnIndex + cell.colSpan; x += 1) {
            grid[y]![x] = cell;
          }
        }
        columnIndex += cell.colSpan;
      });
    });
  return grid.at(-1) ?? [];
}

function columnIdentity(header: HTMLTableCellElement, index: number): string {
  return header.dataset.columnKey ?? header.textContent?.replace(/\s+/gu, ' ').trim() ?? `${index}`;
}

function readWidths(storageKey: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, width]) => typeof width === 'number' && width >= MIN_WIDTH && width <= MAX_WIDTH,
      ),
    );
  } catch {
    return {};
  }
}

function fitContent(table: HTMLTableElement, columnIndex: number): number {
  const sample = document.createElement('table');
  sample.className = table.className;
  Object.assign(sample.style, {
    position: 'fixed',
    left: '-10000px',
    width: 'max-content',
    minWidth: '0',
    tableLayout: 'auto',
    visibility: 'hidden',
  });
  const body = sample.createTBody();
  // Include headers and loaded rows; no new data request or hidden data is needed.
  Array.from(table.rows).forEach((row) => {
    let offset = 0;
    const cell = Array.from(row.cells).find((candidate) => {
      const current = offset;
      offset += candidate.colSpan;
      return current === columnIndex && candidate.colSpan === 1;
    });
    if (!cell) return;
    const clone = cell.cloneNode(true) as HTMLTableCellElement;
    clone.querySelectorAll('.cdr-column-resize').forEach((grip) => grip.remove());
    Object.assign(clone.style, {
      position: 'static',
      width: 'auto',
      minWidth: '0',
      maxWidth: 'none',
      whiteSpace: 'nowrap',
    });
    body.insertRow().append(clone);
  });
  table.parentElement?.append(sample);
  const width = sample.getBoundingClientRect().width;
  sample.remove();
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(width || MIN_WIDTH)));
}

/**
 * Enhances real table headings, including the many read-only operational tables. The
 * controller owns only its grips and colgroup; React keeps ownership of all data cells.
 */
export function TableColumnResizeController({
  userId,
  scopeKey,
}: {
  readonly userId: string;
  readonly scopeKey: string;
}) {
  useEffect(() => {
    const root = document.querySelector('.cdr-app');
    if (!root) return;
    const tables = new Map<HTMLTableElement, () => void>();
    const activeDrags = new Set<() => void>();
    let frame = 0;
    const scan = () => {
      tables.forEach((clean, table) => {
        if (root.contains(table)) return;
        clean();
        tables.delete(table);
      });
      const all = root.querySelectorAll<HTMLTableElement>('table');
      all.forEach((table, tableIndex) => {
        if (
          table.closest('[data-column-resize="off"]') ||
          table.tHead?.classList.contains('sr-only')
        )
          return;
        const headers = tableColumnHeaders(table);
        if (!headers.length) return;
        const name =
          table.dataset.columnResizeKey ||
          table.getAttribute('aria-label') ||
          table.caption?.textContent?.trim() ||
          `table-${tableIndex}`;
        const storageKey = columnWidthStorageKey(userId, `${scopeKey}:${name}`);
        const widths = readWidths(storageKey);
        const keys = headers.map(columnIdentity);
        const originalStyle =
          table.dataset.columnResizeOriginalStyle ?? table.getAttribute('style');
        if (!tables.has(table)) {
          const originalGroup = table.querySelector(':scope > colgroup');
          const originalColumnStyles = Array.from(originalGroup?.children ?? []).map((column) =>
            column.getAttribute('style'),
          );
          table.dataset.columnResizeOriginalStyle = originalStyle ?? '';
          tables.set(table, () => {
            const group = table.querySelector<HTMLElement>(':scope > colgroup[data-cdr-widths]');
            if (group && group === originalGroup) {
              delete group.dataset.cdrWidths;
              delete group.dataset.widths;
              Array.from(group.children).forEach((column, index) => {
                const style = originalColumnStyles[index];
                if (style) column.setAttribute('style', style);
                else column.removeAttribute('style');
              });
            } else group?.remove();
            table.querySelectorAll('.cdr-column-resize').forEach((grip) => grip.remove());
            table
              .querySelectorAll('.cdr-column-resize-relative')
              .forEach((header) => header.classList.remove('cdr-column-resize-relative'));
            table.classList.remove('cdr-columns-sized');
            if (originalStyle) table.setAttribute('style', originalStyle);
            else table.removeAttribute('style');
            delete table.dataset.columnResizeOriginalStyle;
          });
        }
        const apply = () => {
          if (!Object.keys(widths).length) return;
          let group = table.querySelector<HTMLTableColElement>(':scope > colgroup');
          if (!group) {
            group = document.createElement('colgroup');
            table.insertBefore(group, table.tHead);
          }
          group.dataset.cdrWidths = '';
          const values = headers.map((header, index) =>
            Math.max(MIN_WIDTH, widths[keys[index]!] ?? header.getBoundingClientRect().width),
          );
          const signature = values.join(',');
          if (group.dataset.widths !== signature) {
            if (group.children.length !== values.length) {
              group.replaceChildren(
                ...values.map(() => {
                  const column = document.createElement('col');
                  return column;
                }),
              );
            }
            Array.from(group.children).forEach((column, index) => {
              (column as HTMLElement).style.width = `${values[index]}px`;
            });
            group.dataset.widths = signature;
          }
          table.classList.add('cdr-columns-sized');
          table.style.width = `${values.reduce((total, width) => total + width, 0)}px`;
        };
        const save = (index: number, width: number) => {
          headers.forEach((header, position) => {
            widths[keys[position]!] ??= Math.max(MIN_WIDTH, header.getBoundingClientRect().width);
          });
          widths[keys[index]!] = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)));
          apply();
          headers[index]
            ?.querySelector('.cdr-column-resize')
            ?.setAttribute('aria-valuenow', String(widths[keys[index]!]));
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(widths));
          } catch {
            // The current table still resizes when optional storage is unavailable.
          }
        };
        headers.forEach((header, index) => {
          if (header.colSpan !== 1 || header.querySelector('input[type="checkbox"]')) return;
          header.classList.remove('cdr-column-resize-relative');
          if (
            !['relative', 'sticky', 'absolute', 'fixed'].includes(getComputedStyle(header).position)
          ) {
            header.classList.add('cdr-column-resize-relative');
          }
          let grip = header.querySelector<HTMLSpanElement>(':scope > .cdr-column-resize');
          if (!grip) {
            grip = document.createElement('span');
            grip.className = 'cdr-column-resize';
            grip.tabIndex = 0;
            grip.setAttribute('role', 'separator');
            grip.setAttribute('aria-orientation', 'vertical');
            grip.title =
              'Arrastra para cambiar el ancho · doble clic ajusta al contenido · flechas para ajustar';
            header.append(grip);
          }
          const label =
            header.dataset.columnLabel || header.textContent?.trim() || `columna ${index + 1}`;
          grip.setAttribute('aria-label', `Ancho de ${label}`);
          grip.setAttribute('aria-valuemin', String(MIN_WIDTH));
          grip.setAttribute('aria-valuemax', String(MAX_WIDTH));
          grip.setAttribute(
            'aria-valuenow',
            String(
              Math.round(
                widths[keys[index]!] ?? (header.getBoundingClientRect().width || MIN_WIDTH),
              ),
            ),
          );
          grip.onpointerdown = (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const start = event.clientX;
            const startWidth = header.getBoundingClientRect().width;
            document.documentElement.classList.add('cdr-resizing-column');
            const move = (moveEvent: PointerEvent) =>
              save(index, startWidth + moveEvent.clientX - start);
            const end = () => {
              document.documentElement.classList.remove('cdr-resizing-column');
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', end);
              window.removeEventListener('pointercancel', end);
              activeDrags.delete(end);
            };
            activeDrags.add(end);
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end, { once: true });
            window.addEventListener('pointercancel', end, { once: true });
          };
          grip.onclick = (event) => event.stopPropagation();
          grip.ondblclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            save(index, fitContent(table, index));
          };
          grip.onkeydown = (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            event.stopPropagation();
            const step = (event.altKey ? 1 : 10) * (event.key === 'ArrowLeft' ? -1 : 1);
            save(index, (widths[keys[index]!] ?? header.getBoundingClientRect().width) + step);
          };
        });
        apply();
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };
    const reset = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== userId) return;
      tables.forEach((clean) => clean());
      tables.clear();
      schedule();
    };
    scan();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener(COLUMN_PREFERENCES_RESET, reset);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      activeDrags.forEach((end) => end());
      window.removeEventListener(COLUMN_PREFERENCES_RESET, reset);
      document.documentElement.classList.remove('cdr-resizing-column');
      tables.forEach((clean) => clean());
    };
  }, [scopeKey, userId]);
  return null;
}
