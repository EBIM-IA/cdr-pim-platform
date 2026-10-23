import type { TabularData } from '@/lib/tabular-export';

// A4 landscape table layout follows the designer's report export, including column bands.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const WINDOWS: Record<string, number> = {
  '€': 128,
  '…': 133,
  '•': 149,
  '–': 150,
  '—': 151,
  '‘': 145,
  '’': 146,
  '“': 147,
  '”': 148,
};
function win(value: unknown): string {
  return Array.from(String(value ?? '').replace(/[\r\n\t]+/gu, ' '), (character) => {
    const code = WINDOWS[character] ?? character.charCodeAt(0);
    return String.fromCharCode(code < 256 ? code : 63);
  }).join('');
}
function width(text: string, size: number, bold = false): number {
  return (
    ((Array.from(text).reduce((total, character) => {
      const code = character.normalize('NFD').charCodeAt(0);
      return total + (WIDTHS[code - 32] ?? 556);
    }, 0) *
      size) /
      1000) *
    (bold ? 1.06 : 1)
  );
}
function fit(value: unknown, maximum: number, size: number, bold = false): string {
  let text = win(value);
  if (width(text, size, bold) <= maximum) return text;
  while (text.length && width(`${text}\x85`, size, bold) > maximum) text = text.slice(0, -1);
  return `${text}\x85`;
}
const literal = (text: string) =>
  `(${text.replace(/\\/gu, '\\\\').replace(/\(/gu, '\\(').replace(/\)/gu, '\\)')})`;
function canvas() {
  let stream = '';
  return {
    text(x: number, y: number, text: string, size: number, bold = false, color = '0.12 0.13 0.15') {
      stream += `BT /${bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${literal(text)} Tj ET\n`;
    },
    rectangle(x: number, y: number, w: number, h: number, color: string) {
      stream += `${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
    },
    line(x: number, y: number, right: number, color: string, weight = 0.5) {
      stream += `${color} RG ${weight} w ${x.toFixed(2)} ${y.toFixed(2)} m ${right.toFixed(2)} ${y.toFixed(2)} l S\n`;
    },
    get: () => stream,
  };
}
export function createReportPdf(data: TabularData, title: string, subtitle = ''): Uint8Array {
  if (!data.headers.length) throw new Error('Selecciona al menos una columna para exportar.');
  const pageWidth = 842,
    pageHeight = 595,
    margin = 32,
    usable = pageWidth - margin * 2;
  const size = data.headers.length > 8 ? 7 : 8,
    rowHeight = size * 1.75,
    headHeight = rowHeight + 2;
  const top = pageHeight - margin - 34,
    bottom = margin + 18;
  const natural = data.headers.map((header, index) =>
    Math.min(
      230,
      Math.max(
        40,
        width(win(header), size, true),
        ...data.rows.slice(0, 200).map((row) => width(win(row[index]), size, index === 0)),
      ) + 8,
    ),
  );
  const bands: number[][] = [];
  let band = [0],
    bandWidth = natural[0] ?? 40;
  for (let index = 1; index < data.headers.length; index += 1) {
    const nextWidth = natural[index] ?? 40;
    if (bandWidth + nextWidth > usable && band.length > 1) {
      bands.push(band);
      band = [0, index];
      bandWidth = (natural[0] ?? 40) + nextWidth;
    } else {
      band.push(index);
      bandWidth += nextWidth;
    }
  }
  bands.push(band);
  const perPage = Math.max(1, Math.floor((top - headHeight - bottom) / rowHeight));
  const rowPages = Math.max(1, Math.ceil(data.rows.length / perPage));
  const streams: string[] = [];
  const stamp = new Date().toLocaleString('es-PE');
  for (const [bandIndex, columns] of bands.entries()) {
    const totalWidth = columns.reduce((total, index) => total + (natural[index] ?? 40), 0);
    const widths = columns.map((index) => ((natural[index] ?? 40) * usable) / totalWidth);
    for (let page = 0; page < rowPages; page += 1) {
      const drawing = canvas();
      drawing.text(margin, pageHeight - margin - 8, fit(title, usable, 14, true), 14, true);
      const context = [
        subtitle,
        bands.length > 1
          ? `Bloque de columnas ${bandIndex + 1} de ${bands.length} (identificador repetido)`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
      drawing.text(
        margin,
        pageHeight - margin - 22,
        fit(context, usable, 8),
        8,
        false,
        '0.42 0.45 0.49',
      );
      drawing.line(margin, top + 4, pageWidth - margin, '0.918 0.357 0.047', 1.2);
      let y = top - headHeight,
        x = margin;
      drawing.rectangle(margin, y, usable, headHeight, '0.96 0.965 0.97');
      columns.forEach((column, index) => {
        const cellWidth = widths[index] ?? 40;
        drawing.text(
          x + 4,
          y + headHeight / 2 - size / 2.8,
          fit(data.headers[column], cellWidth - 8, size, true),
          size,
          true,
        );
        x += cellWidth;
      });
      data.rows.slice(page * perPage, (page + 1) * perPage).forEach((row, rowIndex) => {
        y -= rowHeight;
        x = margin;
        if (rowIndex % 2) drawing.rectangle(margin, y, usable, rowHeight, '0.985 0.987 0.99');
        drawing.line(margin, y, pageWidth - margin, '0.93 0.935 0.94', 0.4);
        columns.forEach((column, index) => {
          const cellWidth = widths[index] ?? 40;
          drawing.text(
            x + 4,
            y + rowHeight / 2 - size / 2.8,
            fit(row[column], cellWidth - 8, size, index === 0),
            size,
            index === 0,
          );
          x += cellWidth;
        });
      });
      if (!data.rows.length)
        drawing.text(margin, y - rowHeight, win('Sin filas para los filtros aplicados.'), size);
      drawing.text(margin, margin, win(`CDR PIM · ${stamp}`), 7);
      const footer = win(`Página ${streams.length + 1} de ${bands.length * rowPages}`);
      drawing.text(pageWidth - margin - width(footer, 7), margin, footer, 7);
      streams.push(drawing.get());
    }
  }
  const objects: string[] = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  const children: string[] = [];
  streams.forEach((stream, index) => {
    const pageId = 5 + index * 2;
    children.push(`${pageId} 0 R`);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${children.join(' ')}] /Count ${children.length} >>`;
  let output = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [0];
  objects.slice(1).forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Producer (CDR PIM) /Title ${literal(win(title))} >> >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(output, (character) => character.charCodeAt(0) & 255);
}
export function downloadReportPdf(data: TabularData, title: string, subtitle: string): void {
  const bytes = createReportPdf(data, title, subtitle);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${title.replace(/[<>:"/\\|?*]/gu, '-')}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
