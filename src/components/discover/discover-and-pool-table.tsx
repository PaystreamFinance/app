"use client";

import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;
  onSortingChange?: (sorting: SortingState) => void;
  manualSorting?: boolean;
  isLoading?: boolean; // Show skeleton rows while loading
  noBorders?: boolean; // Strip outer borders & rounding, keep only action column left border
  rowDividers?: boolean; // Force horizontal-only row dividers (works alongside noBorders)
  stickyHeader?: boolean; // Pin thead at the top of the scroll container
  className?: string; // Additional classes for the outer wrapper (e.g. max-h for scroll)
  isMobile?: boolean; // Disable sticky columns so the whole table scrolls horizontally
  disableExpansion?: boolean; // Force parent rows to render without expandable sub-rows
  getRowId?: (row: TData) => string; // Stable row identity — prevents modal/state jumping on reorder
}

type DataTableProps<TData, TValue> = TableProps<TData, TValue>;

export function DiscoverAndPoolTable<TData, TValue>({
  columns,
  data,
  emptyMessage = "No pools found",
  onSortingChange,
  manualSorting = false,
  isLoading = false,
  noBorders = false,
  rowDividers = false,
  stickyHeader = false,
  className,
  isMobile = false,
  disableExpansion = false,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const handleTableSortingChange = React.useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const nextSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(nextSorting);
      onSortingChange?.(nextSorting);
    },
    [onSortingChange, sorting],
  );

  // Track how many sub-pools to show for each parent row (starts at 10, increments by 10)
  const [visibleSubPoolCounts, setVisibleSubPoolCounts] = React.useState<
    Record<string, number>
  >({});

  // Modify data to limit sub-pools based on visibleSubPoolCounts
  // NEW: Format sub-pools on-demand from rawPairs when rows expand
  const modifiedData = React.useMemo(() => {
    return data.map((row: any) => {
      const parentRowId = row.id;
      const visibleCount = visibleSubPoolCounts[parentRowId] || 10;

      const subPools = disableExpansion ? [] : row.subPools || [];

      const originalSubPoolCount = subPools.length;

      // Always apply the visible count limit if there are subpools
      if (originalSubPoolCount > 0) {
        const actualVisibleCount = Math.min(visibleCount, originalSubPoolCount);
        return {
          ...row,
          subPools: subPools.slice(0, actualVisibleCount),
          // Store original count for later reference
          __originalSubPoolCount: originalSubPoolCount,
        };
      }

      return {
        ...row,
        // Store original count even if no subpools
        __originalSubPoolCount: originalSubPoolCount,
      };
    });
  }, [data, disableExpansion, visibleSubPoolCounts]);

  const getSubRows = React.useCallback((row: any) => {
    if (disableExpansion) return undefined;
    return row.subPools;
  }, [disableExpansion]);

  React.useEffect(() => {
    if (!disableExpansion) return;
    setExpanded({});
    setVisibleSubPoolCounts({});
  }, [disableExpansion]);

  const table = useReactTable({
    data: modifiedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: handleTableSortingChange,
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    manualSorting: manualSorting,
    getExpandedRowModel: getExpandedRowModel(),
    onExpandedChange: setExpanded,
    getSubRows,
    getRowId,
    state: {
      sorting,
      expanded,
    },
  });

  React.useEffect(() => {
    table.setPageSize(1000);
  }, [table]);

  // Detect if this is a discover page table by checking for discover-specific columns
  // Also detect arbitrage screener tables (have symbol and action columns)
  const isDiscoverPageTable = React.useMemo(() => {
    const headerGroup = table.getHeaderGroups()[0];
    if (!headerGroup) return false;

    const columnIds = headerGroup.headers.map((h) => h.id);
    // Discover page tables have these columns: feeTvl, volume, feeVelocity, etc.
    // Arbitrage screener tables have symbol and action columns
    return (
      columnIds.includes("feeTvl") ||
      columnIds.includes("volume") ||
      columnIds.includes("feeVelocity") ||
      columnIds.includes("swapFreq") ||
      columnIds.includes("lincolnScore") ||
      (columnIds.includes("symbol") && columnIds.includes("action"))
    );
  }, [table]);

  // Find the Action column index
  const actionColumnIndex = React.useMemo(() => {
    return (
      table
        .getHeaderGroups()[0]
        ?.headers.findIndex((header) => header.id === "action") ?? -1
    );
  }, [table]);

  return (
    <div
      className={cn(
        "custom-scrollbar relative h-full w-full",
        stickyHeader ? "overflow-auto" : "overflow-x-auto",
        noBorders && "border border-[#0D1E31]",
        className,
      )}
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: "#BCEAFF40 #0F1F30",
      }}
    >
      <table
        className="font-body caption-bottom rounded-none text-sm"
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          width: "100%",
          minWidth: "100%",
        }}
      >
        <TableHeader className={cn(stickyHeader && "sticky top-0 z-20")}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              className={cn(
                "overflow-visible",
                stickyHeader ? "bg-[#0D1E31]" : "bg-transparent",
              )}
              key={headerGroup.id}
            >
              {headerGroup.headers.map((header, idx) => {
                const isActionColumn = header.id === "action";
                const isPoolsColumn = header.id === "pools";
                const isSymbolColumn = header.id === "symbol"; // For arbitrage tables
                const isFirstColumn = idx === 0;
                const isLastColumn = idx === headerGroup.headers.length - 1;
                const isStickyLeftColumn =
                  !isMobile &&
                  isDiscoverPageTable &&
                  (isPoolsColumn || isSymbolColumn);
                const isStickyRightColumn =
                  !isMobile && isDiscoverPageTable && isActionColumn;

                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      idx === 0 && "overflow-visible",
                      idx === headerGroup.headers.length - 1 &&
                        "overflow-visible",
                    )}
                    style={
                      isStickyRightColumn
                        ? {
                            position: "sticky",
                            right: 0,
                            zIndex: 10,
                            backgroundColor: "#000D1E",
                          }
                        : isStickyLeftColumn
                          ? {
                              position: "sticky",
                              left: 0,
                              zIndex: 10,
                              backgroundColor: "#0D1E31",
                            }
                          : undefined
                    }
                  >
                    <div
                      className={cn(
                        "flex h-full items-center justify-start bg-[#0D1E31] text-nowrap",
                        !noBorders && "border-y border-[#0F1F30]",
                        (idx === 0 || isPoolsColumn || isSymbolColumn) &&
                          "px-4",
                        (idx === 0 || isPoolsColumn || isSymbolColumn) &&
                          !noBorders &&
                          "border-l",
                        idx === headerGroup.headers.length - 1 && "px-4",
                        idx === headerGroup.headers.length - 1 &&
                          !noBorders &&
                          "border-r",
                        isDiscoverPageTable &&
                          isActionColumn &&
                          "border-l border-[#0F1F30]",
                        !noBorders &&
                          isDiscoverPageTable &&
                          (isPoolsColumn || isSymbolColumn) &&
                          !isActionColumn &&
                          "border-r",
                      )}
                    >
                      <span className="mr-3 text-center font-normal text-[#59646a] **:text-[15px]!">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </span>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            (() => {
              const rows: React.ReactNode[] = [];
              // Track parent rows and their sub-row counts
              const parentSubRowCounts = new Map<string, number>();

              // Single pass: render rows and identify when to show "See all"
              const allRows = table.getRowModel().rows;
              allRows.forEach((row, rowIdx) => {
                const isSubRow = row.depth > 0;
                const isExpanded = row.getIsExpanded();
                const parentRow = isSubRow ? row.getParentRow() : null;
                const parentRowId = parentRow?.id;

                // Get the actual data row ID from the original data, not the table row ID
                const actualParentDataId = parentRow
                  ? (parentRow.original as any)?.id
                  : null;
                const parentIdToUse =
                  actualParentDataId !== undefined
                    ? actualParentDataId
                    : parentRowId;

                const visibleCount = parentIdToUse
                  ? visibleSubPoolCounts[parentIdToUse] || 10
                  : 10;

                // Count sub-rows for this parent
                let subRowIndex = -1;
                if (isSubRow && parentIdToUse !== null) {
                  const currentCount =
                    parentSubRowCounts.get(parentIdToUse) || 0;
                  parentSubRowCounts.set(parentIdToUse, currentCount + 1);
                  subRowIndex = currentCount + 1; // 1-indexed (1, 2, 3, ..., visibleCount)
                }

                // Check if this is the last visible sub-row and we need to show "See more"
                // Get the original subpool count from the parent row's stored metadata
                const totalSubPoolsCount = parentRow
                  ? (parentRow.original as any)?.__originalSubPoolCount || 0
                  : 0;
                const subRowLabel =
                  parentRow && (parentRow.original as any)?.pairKind === "group"
                    ? "pairs"
                    : "pools";
                const hasMorePools = totalSubPoolsCount > visibleCount;
                const isLastVisibleSubRow =
                  isSubRow &&
                  parentIdToUse !== null &&
                  hasMorePools &&
                  subRowIndex === visibleCount; // This is the last visible row

                // Check if this is the last sub-row for this parent (all visible sub-pools are shown)
                const isLastSubRowForParent =
                  isSubRow &&
                  parentIdToUse !== null &&
                  !hasMorePools &&
                  subRowIndex === totalSubPoolsCount;

                const isLastRow =
                  rowIdx === allRows.length - 1 &&
                  !isLastVisibleSubRow &&
                  !isLastSubRowForParent;

                // Get pool URL for navigation
                const poolUrl = (row.original as any)?.pools?.poolUrl;
                const mobilePrefix = isMobile ? "/m" : "";
                const getPoolRouteFromUrl = (url?: string): string => {
                  if (!url) return "";
                  const parts = url.split("/").filter(Boolean);
                  if (parts.length === 0) return "";

                  if (parts.length >= 3 && parts[0] === "raydium") {
                    const poolType = parts[1];
                    const poolAddress = parts[2];
                    if (poolType === "clmm") {
                      return `${mobilePrefix}/pool/raydium/concentrated/${poolAddress}`;
                    } else if (poolType === "standard") {
                      return `${mobilePrefix}/pool/raydium/standard/${poolAddress}`;
                    }
                  }

                  if (parts.length >= 2) {
                    const poolType = parts[0];
                    const poolAddress = parts[1];
                    if (poolType === "dlmm") {
                      return `${mobilePrefix}/pool/meteora/dlmm/${poolAddress}`;
                    } else if (poolType === "damm") {
                      return `${mobilePrefix}/pool/meteora/damm/${poolAddress}`;
                    }
                  }

                  return "";
                };

                const handleRowClick = (e: React.MouseEvent) => {
                  // Don't navigate if clicking on action buttons or star button
                  const target = e.target as HTMLElement;
                  if (
                    target.closest("button") ||
                    target.closest("[role='button']") ||
                    target.closest("a")
                  ) {
                    return;
                  }

                  // Handle expansion for rows with sub-pools
                  if (hasMorePools && isLastVisibleSubRow) {
                    return; // Don't navigate on "See more" row
                  }

                  // Check if this row has sub-pools (can expand)
                  const canExpand = row.getCanExpand();
                  const hasSubPools =
                    canExpand ||
                    (row.original as any)?.hasSubPools ||
                    (row.original as any)?.subPoolsLengh > 0 ||
                    ((row.original as any)?.subPools &&
                      (row.original as any).subPools.length > 0);

                  // If row has sub-pools and this is the parent row (not a sub-row), toggle expansion instead of navigating
                  if (hasSubPools && !isSubRow && !isLastVisibleSubRow) {
                    row.toggleExpanded();
                    return;
                  }

                  // Navigate to pool page if poolUrl exists (parent rows and sub-rows, e.g. DLMM/DAMM sub-pools and Raydium rows)
                  if (poolUrl) {
                    const route = getPoolRouteFromUrl(poolUrl);
                    if (route) {
                      router.push(route as any);
                    }
                  }
                };

                rows.push(
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn("group cursor-pointer", {
                      "bg-[#000D1E]/50": isSubRow,
                    })}
                    onClick={handleRowClick}
                    aria-label={
                      poolUrl ? "View pool" : isExpanded ? "Collapse" : "Expand"
                    }
                  >
                    {row.getVisibleCells().map((cell, idx) => {
                      const isActionColumn = cell.column.id === "action";
                      const isPoolsColumn = cell.column.id === "pools";
                      const isSymbolColumn = cell.column.id === "symbol"; // For arbitrage tables
                      const isFirst = idx === 0;
                      const isLast = idx === row.getVisibleCells().length - 1;
                      const bgColor = isSubRow
                        ? "bg-[#041223]"
                        : noBorders
                          ? "bg-[#041223]"
                          : "bg-[#000D1E]";
                      const isStickyLeftColumn =
                        !isMobile &&
                        isDiscoverPageTable &&
                        (isPoolsColumn || isSymbolColumn);
                      const isStickyRightColumn =
                        !isMobile && isDiscoverPageTable && isActionColumn;

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn("relative p-0")}
                          style={
                            isStickyRightColumn
                              ? {
                                  position: "sticky",
                                  right: 0,
                                  zIndex: 10,
                                  backgroundColor:
                                    bgColor === "bg-[#041223]"
                                      ? "#041223"
                                      : "#000D1E",
                                }
                              : isStickyLeftColumn
                                ? {
                                    position: "sticky",
                                    left: 0,
                                    zIndex: 10,
                                    backgroundColor:
                                      bgColor === "bg-[#041223]"
                                        ? "#041223"
                                        : "#000D1E",
                                  }
                                : undefined
                          }
                        >
                          <div
                            className={cn(
                              "flex h-18 items-center text-nowrap",
                              !noBorders && "border-t border-[#0F1F30]",
                              rowDividers && "border-t border-[#1F3245]",
                              (!noBorders || rowDividers) &&
                                rowIdx === 0 &&
                                !isSubRow &&
                                "border-0",
                              isActionColumn
                                ? rowDividers
                                  ? "bg-[#041223]"
                                  : "bg-[#000D1E]"
                                : !isSubRow
                                  ? noBorders
                                    ? "bg-[#041223]"
                                    : "bg-[#000D1E]"
                                  : "bg-[#041223]",
                              !noBorders &&
                                isLastRow &&
                                isFirst &&
                                !isSubRow &&
                                "",
                              !noBorders &&
                                isLastRow &&
                                isLast &&
                                !isSubRow &&
                                "",
                              !noBorders && isLastRow && "border-b",
                              idx === 0 && "px-4",
                              idx === 0 && !noBorders && "border-l",
                              idx === row.getVisibleCells().length - 1 &&
                                "px-4",
                              idx === row.getVisibleCells().length - 1 &&
                                !noBorders &&
                                "border-r",
                              !isSubRow && "group-hover:bg-[#0D1929]/70",
                              isDiscoverPageTable &&
                                isActionColumn &&
                                "border-l border-[#0F1F30]",
                              !noBorders &&
                                isDiscoverPageTable &&
                                (isPoolsColumn || isSymbolColumn) &&
                                !isActionColumn &&
                                "border-r",
                            )}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>,
                );

                // Add "See more" button row after the last visible sub-row
                if (isLastVisibleSubRow && parentIdToUse !== null) {
                  // Use the totalSubPoolsCount we already calculated above
                  const remainingCount = totalSubPoolsCount - visibleCount;

                  rows.push(
                    <TableRow
                      key={`see-more-${parentIdToUse}-${visibleCount}`}
                      className="bg-[#041223]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TableCell
                        colSpan={columns.length}
                        className="relative p-0"
                      >
                        <div className="flex h-18 items-center justify-center gap-2 border-t border-[#0F1F30] bg-[#041223] px-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Increment visible count by 10
                              setVisibleSubPoolCounts((prev) => {
                                const currentCount = prev[parentIdToUse] || 10;
                                const newCount = Math.min(
                                  currentCount + 10,
                                  totalSubPoolsCount,
                                );
                                return {
                                  ...prev,
                                  [parentIdToUse]: newCount,
                                };
                              });
                            }}
                            className="cursor-pointer border border-[#0F1F30] bg-[#000D1E] px-4 py-2 text-sm font-normal text-[#7192A5] transition-colors hover:bg-[#0F1F30] hover:text-white"
                          >
                            See remaining {remainingCount} {subRowLabel}
                          </button>
                          {parentRow && totalSubPoolsCount > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Collapse the parent row and reset visible count
                                parentRow.toggleExpanded();
                                setVisibleSubPoolCounts((prev) => {
                                  const newState = { ...prev };
                                  delete newState[parentIdToUse];
                                  return newState;
                                });
                              }}
                              className="cursor-pointer border border-[#0F1F30] bg-[#000D1E] px-4 py-2 text-sm font-normal text-[#7192A5] transition-colors hover:bg-[#0F1F30] hover:text-white"
                            >
                              Collapse
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,
                  );
                }

                // Add collapse button after the last sub-row if all sub-pools are visible and parent is expanded
                // This happens when there are no more sub-pools to show (no "See remaining" button)
                // Only show collapse button if there's more than 1 subpool
                if (
                  isLastSubRowForParent &&
                  parentIdToUse !== null &&
                  parentRow &&
                  parentRow.getIsExpanded() &&
                  totalSubPoolsCount > 1
                ) {
                  rows.push(
                    <TableRow
                      key={`collapse-${parentIdToUse}`}
                      className="bg-[#041223]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TableCell
                        colSpan={columns.length}
                        className="relative p-0"
                      >
                        <div className="flex h-18 items-center justify-center border-t border-[#0F1F30] bg-[#041223] px-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Collapse the parent row and reset visible count
                              parentRow.toggleExpanded();
                              setVisibleSubPoolCounts((prev) => {
                                const newState = { ...prev };
                                delete newState[parentIdToUse];
                                return newState;
                              });
                            }}
                            className="cursor-pointer border border-[#0F1F30] bg-[#000D1E] px-4 py-2 text-sm font-normal text-[#7192A5] transition-colors hover:bg-[#0F1F30] hover:text-white"
                          >
                            Collapse
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>,
                  );
                }
              });
              return rows;
            })()
          ) : (
            <TableRow className="hover:bg-[#1E364B]">
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-white/80"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {/* Show skeleton rows while loading, even if we have cached data */}
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`} className="group">
                {columns.map((column, colIdx) => {
                  const isFirst = colIdx === 0;
                  const isLast = colIdx === columns.length - 1;
                  const columnId =
                    (column as any).accessorKey || (column as any).id || "";
                  const isPoolsColumn =
                    (columnId === "pools" || columnId.includes("pool")) &&
                    isFirst;
                  const isTrendColumn = columnId === "trend";
                  const isActionColumn = columnId === "action" || isLast;
                  const isNumericColumn =
                    columnId.includes("market") ||
                    columnId.includes("liquidity") ||
                    columnId.includes("fee") ||
                    columnId.includes("volume") ||
                    columnId.includes("velocity") ||
                    columnId.includes("freq");

                  return (
                    <TableCell className="relative p-0" key={colIdx}>
                      <div
                        className={cn(
                          "flex h-18 items-center text-nowrap",
                          isActionColumn
                            ? "bg-[#000D1E]"
                            : noBorders
                              ? "bg-[#041223]"
                              : "bg-[#000D1E]",
                          !noBorders && "border-t border-[#0F1F30]",
                          isFirst && "px-4",
                          isFirst && !noBorders && "border-l",
                          isLast && "px-4",
                          isLast && !noBorders && "border-r",
                          !isFirst && !isLast && "px-4",
                        )}
                      >
                        <div className="w-full py-3">
                          {isPoolsColumn ? (
                            <div className="flex items-center gap-4">
                              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                              <div className="flex flex-col gap-2.5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-3 w-20" />
                              </div>
                            </div>
                          ) : isTrendColumn ? (
                            <Skeleton className="h-12 w-32 rounded" />
                          ) : isActionColumn ? (
                            <Skeleton className="h-8 w-20 rounded-md" />
                          ) : isNumericColumn ? (
                            <Skeleton className="h-4 w-24" />
                          ) : (
                            <Skeleton className="h-4 w-16" />
                          )}
                        </div>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
        </TableBody>
      </table>
    </div>
  );
}
