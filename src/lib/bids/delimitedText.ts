/**
 * Reading comma-separated tables and writing them as BIDS TSV.
 *
 * BIDS tables are tab-separated. Tables made in Excel or similar are
 * usually saved as CSV: commas (or semicolons, in locales where the comma
 * is the decimal mark), quoted cells, CRLF line endings, sometimes a byte
 * order mark. NeuroGate converts them to TSV on export instead of
 * renaming them, which would leave a .tsv full of commas that every BIDS
 * tool reads as one column.
 */

/** The delimiter of a CSV: semicolon when the header has more semicolons than commas. */
export function detectCsvDelimiter(text: string): ',' | ';' {
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => header.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/**
 * Parse delimited text into rows of cells (RFC 4180: quoted cells may
 * contain the delimiter, newlines, and "" for a quote). Blank lines are
 * dropped and cells are trimmed.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.some(c => c.length > 0)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) endCell();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length > 0 || row.length > 0) endRow();
  return rows;
}

/** Rows of a table file: tab-separated for .tsv, CSV (delimiter detected) for .csv. */
export function readTableRows(text: string, fileName: string): string[][] {
  if (/\.csv$/i.test(fileName)) return parseDelimited(text, detectCsvDelimiter(text));
  return text.replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter(l => l.trim().length > 0)
    .map(l => l.split('\t').map(c => c.trim()));
}

/**
 * CSV text as BIDS TSV: tab-separated, "\n" line endings, a final
 * newline, every row padded to the header's width. Tabs and line breaks
 * inside a cell become spaces, since TSV has no quoting.
 */
export function csvToTsv(text: string): string {
  const rows = parseDelimited(text, detectCsvDelimiter(text));
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map(r => r.length));
  return rows
    .map(r => Array.from({ length: width }, (_, i) => (r[i] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'))
    .join('\n') + '\n';
}
