import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EXCEL_NOT_APPLICABLE,
  ExcelTableFilterBar,
  ExcelTableHeader,
  type ExcelTableCell,
  type ExcelTableColumn,
  useExcelTableRows,
} from '@/components/excel-table-filter';

interface ExampleRow {
  id: string;
  brand: string | null;
  state: string;
  templateValue: ExcelTableCell;
}

type ExampleColumn = 'brand' | 'state' | 'templateValue';

const rows: ExampleRow[] = [
  { id: '3', brand: 'FAG', state: 'Inactivo', templateValue: EXCEL_NOT_APPLICABLE },
  { id: '2', brand: 'SKF', state: 'Activo', templateValue: 'Con valor' },
  { id: '1', brand: 'FAG', state: 'Activo', templateValue: null },
  { id: '4', brand: null, state: 'Activo', templateValue: 'Otro valor' },
];

const columns: readonly ExcelTableColumn<ExampleRow, ExampleColumn>[] = [
  { key: 'brand', label: 'Marca', getValue: (row) => row.brand },
  { key: 'state', label: 'Estado', getValue: (row) => row.state },
  { key: 'templateValue', label: 'Atributo', getValue: (row) => row.templateValue },
];

afterEach(cleanup);

function Harness() {
  const table = useExcelTableRows({ rows, columns });
  return (
    <div>
      <ExcelTableFilterBar
        filteredColumns={table.filteredColumnKeys.map(
          (key) => columns.find((column) => column.key === key)?.label ?? key,
        )}
        sort={
          table.sort
            ? {
                label: columns.find((column) => column.key === table.sort?.key)?.label ?? '',
                direction: table.sort.direction,
              }
            : undefined
        }
        visibleCount={table.visibleRows.length}
        totalCount={rows.length}
        onClear={table.clear}
      />
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <ExcelTableHeader
                key={column.key}
                columnKey={column.key}
                label={column.label}
                options={table.getValueOptions(column.key)}
                selectedValues={table.filters[column.key]}
                sortDirection={table.sort?.key === column.key ? table.sort.direction : undefined}
                onFilterChange={(values) => table.setColumnFilter(column.key, values)}
                onSort={(direction) => table.setSort(column.key, direction)}
              />
            ))}
          </tr>
        </thead>
        <tbody data-testid="rows">
          {table.visibleRows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.brand ?? 'sin marca'}</td>
              <td>{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function openFilter(label: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}: filtrar`, 'u') }));
  return screen.getByRole('dialog', { name: `Filtrar ${label}` });
}

describe('ExcelTableHeader', () => {
  it('lists searchable values with counts, blanks and not-applicable values', () => {
    render(<Harness />);

    const brandDialog = openFilter('Marca');
    expect(within(brandDialog).getByText('FAG')).toBeVisible();
    expect(within(brandDialog).getByText('2')).toBeVisible();
    expect(within(brandDialog).getByText('(Vacías)')).toBeVisible();

    fireEvent.change(within(brandDialog).getByPlaceholderText('Buscar valor…'), {
      target: { value: 'skf' },
    });
    expect(within(brandDialog).getByText('SKF')).toBeVisible();
    expect(within(brandDialog).queryByText('FAG')).not.toBeInTheDocument();

    fireEvent.click(within(brandDialog).getByRole('button', { name: 'Cancelar' }));
    const attributeDialog = openFilter('Atributo');
    expect(within(attributeDialog).getByText('(Vacías)')).toBeVisible();
    expect(within(attributeDialog).getByText('(No aplica)')).toBeVisible();
  });

  it('combines column filters and reports exactly the visible rows', () => {
    render(<Harness />);

    let dialog = openFilter('Marca');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Seleccionar todo/u }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^FAG/u }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(within(screen.getByTestId('rows')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText(/Filtro por columna:/u)).toHaveTextContent('Marca');
    expect(screen.getByRole('status')).toHaveTextContent('2 de 4 filas visibles');

    dialog = openFilter('Estado');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Seleccionar todo/u }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Activo/u }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(within(screen.getByTestId('rows')).getAllByRole('row')).toHaveLength(1);
    expect(screen.getByText(/Filtro por columna:/u)).toHaveTextContent('Marca, Estado');
    expect(screen.getByRole('status')).toHaveTextContent('1 de 4 filas visibles');
  });

  it('sorts in the requested direction and can clear column state', () => {
    render(<Harness />);

    const dialog = openFilter('Marca');
    fireEvent.click(within(dialog).getByRole('button', { name: /Z → A/u }));

    const renderedRows = within(screen.getByTestId('rows')).getAllByRole('row');
    expect(renderedRows[0]).toHaveTextContent('SKF');
    expect(screen.getByText(/Orden:/u)).toHaveTextContent('Marca Z→A');
    expect(screen.getByRole('button', { name: /^Marca: filtrar/u }).closest('th')).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros y orden de columna' }));
    expect(screen.getByText(/Sin filtros de columna/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Quitar filtros y orden de columna' })).toBeNull();
  });
});
