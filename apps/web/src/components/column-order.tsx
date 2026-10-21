'use client';

import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import {
  createContext,
  type DragEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

const ColumnOrderUserContext = createContext('guest');
const DRAG_DATA_TYPE = 'application/x-cdr-column-key';

export function ColumnOrderUserProvider({
  userId,
  children,
}: {
  readonly userId: string;
  readonly children: ReactNode;
}) {
  return (
    <ColumnOrderUserContext.Provider value={userId}>{children}</ColumnOrderUserContext.Provider>
  );
}

export function reconcileColumnOrder<Key extends string>(
  saved: readonly string[],
  available: readonly Key[],
): Key[] {
  const valid = new Set<string>(available);
  const seen = new Set<string>();
  const restored = saved.filter((key): key is Key => {
    if (!valid.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...restored, ...available.filter((key) => !seen.has(key))];
}

export function moveColumnInOrder<Key extends string>(
  order: readonly Key[],
  source: Key,
  target: Key,
): Key[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return [...order];
  const next = order.filter((key) => key !== source);
  const targetIndex = next.indexOf(target);
  const sourceIndex = order.indexOf(source);
  const insertAt = sourceIndex < order.indexOf(target) ? targetIndex + 1 : targetIndex;
  next.splice(insertAt, 0, source);
  return next;
}

export function columnOrderStorageKey(userId: string, screenKey: string): string {
  return `cdr:column-order:${encodeURIComponent(userId)}:${screenKey}`;
}

export interface ColumnOrderControl<Key extends string> {
  readonly columnKey: Key;
  readonly label: string;
  readonly canMoveLeft: boolean;
  readonly canMoveRight: boolean;
  readonly dragging: boolean;
  readonly onMoveLeft: () => void;
  readonly onMoveRight: () => void;
  readonly onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDragEnd: () => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}

export function usePersistentColumnOrder<Key extends string>({
  screenKey,
  columnKeys,
}: {
  readonly screenKey: string;
  readonly columnKeys: readonly Key[];
}) {
  const userId = useContext(ColumnOrderUserContext);
  const availableSignature = columnKeys.join('\u001f');
  const available = useMemo(
    () => availableSignature.split('\u001f').filter(Boolean) as Key[],
    [availableSignature],
  );
  const storageKey = useMemo(() => columnOrderStorageKey(userId, screenKey), [screenKey, userId]);
  const [orderedColumnKeys, setOrderedColumnKeys] = useState<Key[]>(available);
  const [draggingKey, setDraggingKey] = useState<Key | null>(null);

  useEffect(() => {
    let restored = available;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')) {
        restored = reconcileColumnOrder(parsed, available);
      }
    } catch {
      // Storage is optional in hardened/private modes; the default order remains usable.
    }
    setOrderedColumnKeys(restored);
  }, [available, storageKey]);

  const persist = useCallback(
    (next: Key[]) => {
      setOrderedColumnKeys(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Reordering still works for this visit when storage is unavailable.
      }
    },
    [storageKey],
  );

  const move = useCallback(
    (source: Key, target: Key) => {
      persist(moveColumnInOrder(orderedColumnKeys, source, target));
    },
    [orderedColumnKeys, persist],
  );

  const moveBy = useCallback(
    (key: Key, offset: -1 | 1) => {
      const index = orderedColumnKeys.indexOf(key);
      const target = orderedColumnKeys[index + offset];
      if (index < 0 || !target) return;
      const next = [...orderedColumnKeys];
      [next[index], next[index + offset]] = [next[index + offset] as Key, next[index] as Key];
      persist(next);
    },
    [orderedColumnKeys, persist],
  );

  const resetOrder = useCallback(() => {
    setOrderedColumnKeys(available);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // The in-memory reset already succeeded.
    }
  }, [available, storageKey]);

  const isDefaultOrder =
    orderedColumnKeys.length === available.length &&
    orderedColumnKeys.every((key, index) => key === available[index]);

  const getColumnControl = useCallback(
    (columnKey: Key, label: string): ColumnOrderControl<Key> => {
      const index = orderedColumnKeys.indexOf(columnKey);
      return {
        columnKey,
        label,
        canMoveLeft: index > 0,
        canMoveRight: index >= 0 && index < orderedColumnKeys.length - 1,
        dragging: draggingKey === columnKey,
        onMoveLeft: () => moveBy(columnKey, -1),
        onMoveRight: () => moveBy(columnKey, 1),
        onDragStart: (event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(DRAG_DATA_TYPE, columnKey);
          setDraggingKey(columnKey);
        },
        onDragEnd: () => setDraggingKey(null),
        onDragOver: (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        },
        onDrop: (event) => {
          event.preventDefault();
          const source = event.dataTransfer.getData(DRAG_DATA_TYPE) as Key;
          if (source) move(source, columnKey);
          setDraggingKey(null);
        },
      };
    },
    [draggingKey, move, moveBy, orderedColumnKeys],
  );

  return {
    orderedColumnKeys,
    getColumnControl,
    resetOrder,
    isDefaultOrder,
  };
}

export function ReorderableColumnLabel<Key extends string>({
  control,
  className,
}: {
  readonly control: ColumnOrderControl<Key>;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-max items-center gap-1 rounded-md transition-colors',
        control.dragging && 'bg-orange-100 text-primary',
        className,
      )}
      onDragOver={control.onDragOver}
      onDrop={control.onDrop}
    >
      <button
        type="button"
        draggable
        onDragStart={control.onDragStart}
        onDragEnd={control.onDragEnd}
        aria-label={`Arrastrar columna ${control.label}`}
        title={`Arrastra para mover ${control.label}`}
        className="grid size-6 cursor-grab place-items-center rounded text-muted-foreground hover:bg-orange-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink active:cursor-grabbing"
      >
        <GripVertical aria-hidden="true" className="size-3.5" />
      </button>
      <span>{control.label}</span>
      <span className="ml-1 inline-flex items-center gap-0.5 normal-case tracking-normal">
        <button
          type="button"
          disabled={!control.canMoveLeft}
          onClick={control.onMoveLeft}
          aria-label={`Mover columna ${control.label} a la izquierda`}
          title="Mover a la izquierda"
          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-orange-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft aria-hidden="true" className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!control.canMoveRight}
          onClick={control.onMoveRight}
          aria-label={`Mover columna ${control.label} a la derecha`}
          title="Mover a la derecha"
          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-orange-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </button>
      </span>
    </span>
  );
}
