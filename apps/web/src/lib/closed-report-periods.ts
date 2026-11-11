import { closedReportPeriodSchema } from '@cdr/contracts';
const months = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];
const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
/** Reads the approved client layout: MES, ITEMS ACT 2024, ITEMS ACT 2025, ... */
export function parseClosedReportPeriods(
  rows: readonly (readonly unknown[])[],
): { year: number; month: number; total: number }[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'MES'));
  if (headerIndex < 0)
    throw new Error('El archivo debe tener la columna MES y columnas ITEMS ACT AAAA.');
  const header = rows[headerIndex]!;
  const monthIndex = header.findIndex((cell) => normalize(cell) === 'MES');
  const years = header.flatMap((cell, index) => {
    const match = /^ITEMS?\s+ACT\s+(\d{4})$/u.exec(normalize(cell));
    return match ? [{ index, year: Number(match[1]) }] : [];
  });
  if (!years.length) throw new Error('No hay columnas ITEMS ACT AAAA reconocibles.');
  const result: { year: number; month: number; total: number }[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const month = months.indexOf(normalize(row[monthIndex])) + 1;
    if (!month) continue; // Totals and averages are derived, never imported as another month.
    for (const { index, year } of years) {
      const raw = row[index];
      if (raw == null || String(raw).trim() === '') continue;
      if (!/^[0-9]+$/u.test(String(raw).trim()))
        throw new Error(
          `Valor mensual inválido en ${months[month - 1]} ${year}. Debe ser un entero sin separadores.`,
        );
      result.push(closedReportPeriodSchema.parse({ year, month, total: Number(raw) }));
    }
  }
  if (!result.length) throw new Error('El archivo no contiene meses con resultados.');
  if (new Set(result.map((period) => `${period.year}:${period.month}`)).size !== result.length)
    throw new Error('El archivo contiene meses repetidos.');
  return result;
}
