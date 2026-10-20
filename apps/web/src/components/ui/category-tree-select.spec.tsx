import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCategoryTree,
  CategoryTreeSelect,
  type CategoryTreeSelectOption,
} from '@/components/ui/category-tree-select';

const options: CategoryTreeSelectOption[] = [
  {
    value: 'rigido',
    label: 'Rodamiento rígido',
    path: 'Motor > Rodamientos > Rodamiento rígido',
    keywords: ['22.1'],
  },
  {
    value: 'conico',
    label: 'Rodamiento cónico',
    path: 'Motor > Rodamientos > Rodamiento cónico',
  },
  {
    value: 'pastilla',
    label: 'Pastillas',
    path: 'Frenos > Pastillas',
  },
];

afterEach(cleanup);

describe('CategoryTreeSelect', () => {
  it('builds real display branches and deduplicates template variants by category value', () => {
    const tree = buildCategoryTree([
      ...options,
      { ...options[0], keywords: ['otra variante'] } as CategoryTreeSelectOption,
    ]);

    expect(tree.map((node) => node.label)).toEqual(['Frenos', 'Motor']);
    expect(tree[1]?.children[0]?.children).toHaveLength(2);
  });

  it('folds branches and reveals ancestors while searching a descendant', () => {
    render(
      <CategoryTreeSelect
        label="Línea / categoría"
        value=""
        options={options}
        placeholder="Todas las categorías"
        onValueChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Línea / categoría' });
    fireEvent.focus(input);
    expect(screen.getByText('Motor')).toBeVisible();
    expect(screen.queryByText('Rodamiento cónico')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expandir Rodamientos' }));
    expect(screen.getByText('Rodamiento cónico')).toBeVisible();

    fireEvent.change(input, { target: { value: 'cónico' } });
    expect(screen.getByText('Motor')).toBeVisible();
    expect(screen.getByText('Rodamientos')).toBeVisible();
    expect(screen.getByText('Rodamiento cónico')).toBeVisible();
    expect(screen.queryByText('Pastillas')).not.toBeInTheDocument();
  });

  it('selects the persisted category value rather than a display path', () => {
    const onValueChange = vi.fn();
    render(
      <CategoryTreeSelect
        label="Categoría"
        value=""
        options={options}
        placeholder="Todas"
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Categoría' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '22.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rodamiento rígido' }));

    expect(onValueChange).toHaveBeenCalledWith('rigido');
  });

  it('supports keyboard entry, result selection and tree traversal', async () => {
    const onValueChange = vi.fn();
    render(
      <CategoryTreeSelect
        label="Categoría"
        value=""
        options={options}
        placeholder="Todas"
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Categoría' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Todas' })).toHaveFocus());

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Contraer Frenos' })).toHaveFocus();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '22.1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).toHaveBeenLastCalledWith('rigido');
  });
});
