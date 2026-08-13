"use client";

import * as React from "react";
import type { SortingState } from "@tanstack/react-table";

/**
 * Lift sort state out of the table and apply it to the FULL dataset before
 * pagination. Drop-in replacement for the common "filter → paginate" pattern
 * used by the screener pages — without this hook, clicking a header only
 * orders the rows on the visible page (TanStack `getSortedRowModel` runs on
 * whatever data prop you pass, which has already been sliced).
 *
 * Usage:
 *   const { sorting, sortedRows, onSortingChange } = useSortedRows(filtered);
 *   const paginated = sortedRows.slice(start, end);
 *   <Table data={paginated} manualSorting onSortingChange={onSortingChange} />
 *
 * `onPageReset` is invoked when the sort changes so the page jumps back to 1
 * — otherwise the user would land on a deep page of the previous order.
 *
 * The comparator is numeric-aware: any string that parses as a finite number
 * (with optional trailing "%") is sorted numerically, so funding-rate cells
 * like "0.0015%" don't fall back to lexicographic order ("0.1%" < "0.05%").
 * Null / undefined / NaN sink to the bottom of every sort, matching the
 * default TanStack behaviour.
 */
export function useSortedRows<T extends object>(
  rows: readonly T[],
  options: { onPageReset?: () => void } = {},
) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const { onPageReset } = options;

  const onSortingChange = React.useCallback(
    (next: SortingState) => {
      setSorting(next);
      onPageReset?.();
    },
    [onPageReset],
  );

  const sortedRows = React.useMemo(() => {
    if (sorting.length === 0) return rows as T[];
    const config = sorting[0];
    if (!config) return rows as T[];
    const { id, desc } = config;
    const arr = [...rows];
    arr.sort((a, b) => compareSortValues(getSortValue(a, id), getSortValue(b, id), desc));
    return arr;
  }, [rows, sorting]);

  return { sorting, sortedRows, onSortingChange };
}

/**
 * Extract a comparable value for a row at a given column id. Funding-rate
 * style strings ("0.0015%") are normalised to numbers; everything else is
 * returned as-is for the comparator to handle.
 */
function getSortValue(row: object, columnId: string): unknown {
  const v = (row as Record<string, unknown>)[columnId];
  if (typeof v === "string" && v.length > 0) {
    const cleaned = v.endsWith("%") ? v.slice(0, -1).trim() : v.trim();
    const n = Number(cleaned);
    if (Number.isFinite(n) && cleaned.length > 0) return n;
  }
  return v;
}

function compareSortValues(av: unknown, bv: unknown, desc: boolean): number {
  // Sink null/undefined/NaN to the bottom of any sort direction so an empty
  // cell never beats a real value.
  const aBad =
    av === undefined || av === null || (typeof av === "number" && Number.isNaN(av));
  const bBad =
    bv === undefined || bv === null || (typeof bv === "number" && Number.isNaN(bv));
  if (aBad && bBad) return 0;
  if (aBad) return 1;
  if (bBad) return -1;
  if (typeof av === "number" && typeof bv === "number") {
    return desc ? bv - av : av - bv;
  }
  const as = String(av);
  const bs = String(bv);
  return desc ? bs.localeCompare(as) : as.localeCompare(bs);
}
