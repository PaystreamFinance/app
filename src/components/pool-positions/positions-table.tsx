/* eslint-disable @next/next/no-img-element */
"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (
    row: TData,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => void;
  expandedRows?: Set<string>;
  renderExpandedContent?: (row: TData) => React.ReactNode;
  onToggleExpand?: (positionId: string) => void;
}

type DataTableProps<TData, TValue> = TableProps<TData, TValue>;

export function PositionsTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  expandedRows,
  renderExpandedContent,
  onToggleExpand,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  // Handle row click - expand/collapse
  const handleRowClick = (
    e: React.MouseEvent<HTMLTableRowElement>,
    rowOriginal: TData,
  ) => {
    const target = e.target as HTMLElement;

    // Check if the click originated from an interactive element
    // This includes buttons, links, and any element inside a button/link
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("[role='button']") ||
      target.closest("[role='menuitem']") ||
      target.closest(".dropdown-menu") ||
      target.closest("dialog") ||
      target.closest("[data-radix-dialog-trigger]") ||
      target.closest("[data-radix-dropdown-menu-trigger]") ||
      target.closest("[data-radix-popover-trigger]") ||
      target.closest("[data-radix-dialog-content]") ||
      target.closest("[data-radix-dialog-overlay]") ||
      target.closest("[data-radix-dialog-portal]") ||
      // Check if clicking on an img inside a button
      (target.tagName === "IMG" && target.closest("button")) ||
      // Check for any element with data-prevent-row-click attribute
      target.closest("[data-prevent-row-click]") ||
      // Check if the target itself has the attribute
      target.hasAttribute("data-prevent-row-click")
    ) {
      e.stopPropagation();
      return;
    }

    // If a custom row click handler is provided, use it
    if (onRowClick) {
      onRowClick(rowOriginal, e);
      return;
    }

    // Default: toggle expand/collapse for the row
    const position = rowOriginal as any;
    if ("id" in position && onToggleExpand) {
      onToggleExpand(position.id);
    }
  };

  return (
    <div className="w-full overflow-x-auto border border-[#0F1F30]">
      <Table className="font-body">
        <colgroup>
          {table.getAllColumns().map((col, idx) => (
            <col
              key={col.id}
              className={
                idx === table.getAllColumns().length - 1
                  ? "w-[72px]"
                  : undefined
              }
            />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="bg-transparent" key={headerGroup.id}>
              {headerGroup.headers.map((header, idx) => {
                const isLastCol = idx === headerGroup.headers.length - 1;
                return (
                  <TableHead key={header.id}>
                    <div
                      className={cn(
                        "flex h-full items-center px-4 py-3 text-nowrap",
                        isLastCol ? "bg-[#041223]" : "bg-[#041223]",
                        {
                          "border-l border-[#1A3A52]": isLastCol,
                        },
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row, rowIdx) => {
              const isExpanded =
                expandedRows?.has((row.original as any).id) ?? false;
              const isLastRow = rowIdx === table.getRowModel().rows.length - 1;

              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    onClick={(e) => handleRowClick(e, row.original as TData)}
                    onMouseDown={(e) => {
                      // Prevent row click if clicking on interactive elements
                      const target = e.target as HTMLElement;
                      if (
                        target.closest("button") ||
                        target.closest("a") ||
                        target.closest("[data-prevent-row-click]") ||
                        target.hasAttribute("data-prevent-row-click")
                      ) {
                        e.stopPropagation();
                      }
                    }}
                    className="group cursor-pointer transition-colors"
                  >
                    {row.getVisibleCells().map((cell, idx) => (
                      <TableCell key={cell.id} className="relative p-0">
                        <div
                          className={cn(
                            "flex h-18 items-center border-t border-[#0F1F30] px-4 text-nowrap transition-colors",
                            idx === row.getVisibleCells().length - 1
                              ? "bg-[#000D1E]"
                              : isExpanded
                                ? "bg-[#0D1E31]"
                                : "bg-[#000D1E] group-hover:bg-[#0D1929]/70",
                            {
                              "border-t-0": rowIdx === 0,
                              "border-l border-[#1A3A52]":
                                idx === row.getVisibleCells().length - 1,
                            },
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                  {isExpanded && renderExpandedContent && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length - 1}
                        className="border-t-0 p-0"
                      >
                        {renderExpandedContent(row.original)}
                      </TableCell>
                      <TableCell className="h-px border-t-0 p-0">
                        <div className="h-full border-l border-[#1A3A52] bg-[#000D1E]" />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="border-t-0 p-0">
                <div className="flex h-[400px] flex-col items-center justify-center bg-[#000D1E]">
                  <img
                    className=""
                    src="/pools/no-position-img.svg"
                    alt="no-positions"
                  />

                  <h1 className="font-ibm-plex-serif text-2xl font-medium text-[#ADE6FF] italic">
                    No positions found
                  </h1>

                  <p className="mt-1 text-center text-sm text-[#7092A5]">
                    Create your first liquidity position to <br /> get
                    started{" "}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
