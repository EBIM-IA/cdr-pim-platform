import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchableSelect } from '@/components/ui/searchable-select';

afterEach(cleanup);

describe('SearchableSelect', () => {
  it('searches labels and keywords before selecting one value', () => {
    const onValueChange = vi.fn();
    render(
      <SearchableSelect
        label="Categoría"
        value=""
        placeholder="Todas"
        onValueChange={onValueChange}
        options={[
          { value: 'one', label: 'Rodamiento rígido', keywords: ['Transmisión / Rodamientos'] },
          { value: 'two', label: 'Pastilla', keywords: ['Frenos'] },
        ]}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Categoría' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'transmision' } });

    expect(screen.getByRole('option', { name: 'Rodamiento rígido' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Pastilla' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Rodamiento rígido' }));
    expect(onValueChange).toHaveBeenCalledWith('one');
  });
});
