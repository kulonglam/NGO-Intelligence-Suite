/** Lightweight CSV / SpreadsheetML XLSX / minimal PDF text builders (no heavy deps). */

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

/** Office Open XML spreadsheet (single sheet) — opens in Excel/LibreOffice. */
export function rowsToXlsx(sheetName: string, headers: string[], rows: string[][]): Buffer {
  const xmlEscape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cell = (ref: string, value: string) =>
    `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  const colLetter = (i: number) => {
    let n = i;
    let s = '';
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };
  const all = [headers, ...rows];
  const sheetRows = all
    .map((row, ri) => {
      const cells = row.map((v, ci) => cell(`${colLetter(ci)}${ri + 1}`, v)).join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
  // Minimal valid XLSX is a ZIP; for zero-deps we emit SpreadsheetML 2003 XML which Excel opens.
  const ssml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${xmlEscape(sheetName.slice(0, 31))}">
  <Table>
   ${all
     .map(
       (row) =>
         `<Row>${row.map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`).join('')}</Row>`,
     )
     .join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;
  void sheetXml;
  return Buffer.from(ssml, 'utf8');
}

/** Minimal single-page PDF with Helvetica text lines. */
export function linesToPdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const contentLines = [`BT /F1 14 Tf 50 780 Td (${esc(title)}) Tj`, `0 -24 Td /F1 10 Tf`];
  let yOff = 0;
  for (const line of lines.slice(0, 60)) {
    contentLines.push(`0 -14 Td (${esc(line.slice(0, 90))}) Tj`);
    yOff += 14;
  }
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const objs: string[] = [];
  objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objs.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
  objs.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
  );
  objs.push(`4 0 obj<< /Length ${Buffer.byteLength(stream)} >>stream\n${stream}\nendstream endobj`);
  objs.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += o + '\n';
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  void yOff;
  return Buffer.from(pdf, 'utf8');
}
