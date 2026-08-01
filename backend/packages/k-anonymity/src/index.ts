/** Appendix I.8 — k-anonymity suppression (k = 5). */

export const K_THRESHOLD = 5;

export type AggregateCell = {
  row: string;
  col: string;
  count: number;
};

export type PublishedCell = {
  row: string;
  col: string;
  count: number | null;
  suppressed: boolean;
  label?: string;
};

export type SuppressResult = {
  cells: PublishedCell[];
  row_totals: Record<string, number | null>;
  col_totals: Record<string, number | null>;
  grand_total: number;
  footnote: string;
};

/** I.8.2 Koch worked example input. */
export const KOCH_FIXTURE: AggregateCell[] = [
  { row: 'Rubkona', col: 'Female', count: 412 },
  { row: 'Rubkona', col: 'Male', count: 388 },
  { row: 'Guit', col: 'Female', count: 96 },
  { row: 'Guit', col: 'Male', count: 104 },
  { row: 'Koch', col: 'Female', count: 3 },
  { row: 'Koch', col: 'Male', count: 61 },
  { row: 'Mayendit', col: 'Female', count: 44 },
  { row: 'Mayendit', col: 'Male', count: 39 },
];

export function suppressAggregate(
  cells: AggregateCell[],
  k = K_THRESHOLD,
): SuppressResult {
  const map = new Map<string, PublishedCell>();
  const key = (r: string, c: string) => `${r}\0${c}`;

  for (const cell of cells) {
    const suppressed = cell.count > 0 && cell.count < k;
    map.set(key(cell.row, cell.col), {
      row: cell.row,
      col: cell.col,
      count: suppressed ? null : cell.count,
      suppressed,
      label: suppressed ? `fewer than ${k}` : undefined,
    });
  }

  const rows = [...new Set(cells.map((c) => c.row))];
  const cols = [...new Set(cells.map((c) => c.col))];

  // Complementary suppression (I.8.1 / Koch example): when exactly one cell in a
  // row is suppressed, suppress the next-smallest sibling so the row total cannot
  // recover the primary cell. Then suppress that row's total. Column totals are
  // recomputed from remaining published cells only (no cascade into other rows).
  for (const row of rows) {
    const rowCells = cols.map((col) => map.get(key(row, col))!).filter(Boolean);
    const suppressedCount = rowCells.filter((c) => c.suppressed).length;
    if (suppressedCount === 1) {
      const candidates = rowCells
        .filter((c) => !c.suppressed && c.count != null && c.count > 0)
        .sort((a, b) => (a.count ?? 0) - (b.count ?? 0));
      const next = candidates[0];
      if (next) {
        next.suppressed = true;
        next.count = null;
        next.label = 'suppressed';
      }
    }
  }

  const row_totals: Record<string, number | null> = {};
  for (const row of rows) {
    const rowCells = cols.map((col) => map.get(key(row, col))!);
    if (rowCells.some((c) => c.suppressed)) {
      row_totals[row] = null;
    } else {
      row_totals[row] = rowCells.reduce((s, c) => s + (c.count ?? 0), 0);
    }
  }

  const col_totals: Record<string, number | null> = {};
  for (const col of cols) {
    col_totals[col] = rows.reduce((s, row) => {
      const cell = map.get(key(row, col))!;
      return cell.suppressed ? s : s + (cell.count ?? 0);
    }, 0);
  }

  const published = [...map.values()];
  const grand_total = published
    .filter((c) => !c.suppressed)
    .reduce((s, c) => s + (c.count ?? 0), 0);

  return {
    cells: published,
    row_totals,
    col_totals,
    grand_total,
    footnote: 'Totals exclude suppressed cells (k-anonymity).',
  };
}
