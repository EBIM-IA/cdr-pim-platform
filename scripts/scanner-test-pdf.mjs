// Harmless standard test data, never real malware or an executable test action.
// Source: https://www.eicar.org/download-anti-malware-testfile/
export const SCANNER_TEST_EICAR = Buffer.from(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
);

function stream(dictionary, content) {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${content.length} >>\nstream\n`),
    content,
    Buffer.from('\nendstream'),
  ]);
}

/**
 * Deterministic PDF1.7 with a visible page and an optional uncompressed EmbeddedFile.
 * Pass null for a genuine clean PDF. The default attaches the exact standard68-byte EICAR.
 * The optional EmbeddedFile Subtype is intentionally omitted: this layout was verified with
 * real ClamAV1.5.4, while an application/octet-stream Subtype variant was not detected.
 * No launch action, JavaScript, executable code or external document dependency is included.
 */
export function buildScannerTestPdf(content = SCANNER_TEST_EICAR) {
  const attachment = content === null ? null : Buffer.from(content);
  const text = attachment
    ? 'Contains a standard 68-byte EICAR test attachment.'
    : 'Clean control document. No attachment.';
  const page = Buffer.from(
    'BT /F1 18 Tf 60 750 Td (Harmless antimalware validation fixture) Tj ' +
      `/F1 12 Tf 0 -32 Td (${text}) Tj ` +
      '0 -24 Td (For authorized test use only. No executable actions or JavaScript.) Tj ET',
  );
  const objects = [
    Buffer.from(
      '<< /Type /Catalog /Pages 2 0 R' +
        (attachment
          ? ' /Names << /EmbeddedFiles << /Names [(eicar.com) 6 0 R] >> >> /AF [6 0 R]'
          : '') +
        ' >>',
    ),
    Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
        '/Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    ),
    stream('', page),
    attachment ? stream('/Type /EmbeddedFile', attachment) : Buffer.from('null'),
    Buffer.from(
      attachment
        ? '<< /Type /Filespec /F (eicar.com) /UF (eicar.com) ' +
            '/Desc (Harmless standard EICAR antivirus test file) /EF << /F 5 0 R >> ' +
            '/AFRelationship /Data >>'
        : 'null',
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  const chunks = [Buffer.from('%PDF-1.7\n'), Buffer.from([37, 226, 227, 207, 211, 10])];
  let offset = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(offset);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ]);
    chunks.push(chunk);
    offset += chunk.length;
  }
  const xref = offset;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const objectOffset of offsets.slice(1)) {
    chunks.push(Buffer.from(`${String(objectOffset).padStart(10, '0')} 00000 n \n`));
  }
  chunks.push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
