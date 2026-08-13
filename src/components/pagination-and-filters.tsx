/* eslint-disable @next/next/no-img-element */
import React from "react";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

interface PaginationAndFiltersProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  canChangeRowsPerPage?: boolean;
  onRowsPerPageChange?: (rows: number) => void;
  hideSetRowsPerPage?: boolean;
  rowsPerPageOptions?: number[];
  currentRowsPerPage?: number;
}

const PaginationAndFilters: React.FC<PaginationAndFiltersProps> = ({
  totalPages,
  currentPage,
  onPageChange,
  totalItems,
  canChangeRowsPerPage = false,
  onRowsPerPageChange,
  hideSetRowsPerPage,
  rowsPerPageOptions = [10, 25, 50, 100],
  currentRowsPerPage,
}) => {
  const MAX_VISIBLE_PAGES = 5;

  const getPageNumbers = () => {
    if (totalPages <= MAX_VISIBLE_PAGES) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    const halfVisible = Math.floor(MAX_VISIBLE_PAGES / 2);

    if (currentPage <= halfVisible + 1) {
      for (let i = 1; i <= MAX_VISIBLE_PAGES - 1; i++) {
        pages.push(i);
      }
      pages.push("ellipsis-end");
      pages.push(totalPages);
    } else if (currentPage >= totalPages - halfVisible) {
      pages.push(1);
      pages.push("ellipsis-start");
      for (let i = totalPages - (MAX_VISIBLE_PAGES - 2); i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      pages.push("ellipsis-start");
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        pages.push(i);
      }
      pages.push("ellipsis-end");
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="mb-4 flex w-full items-center justify-between">
      <p className="text-sm font-normal tracking-[-1%] text-nowrap text-[#7192A5]">
        {totalPages === Infinity ? (
          "Loading..."
        ) : (
          <>
            Page {currentPage} of {totalPages}
          </>
        )}
      </p>

      <Pagination className="">
        <PaginationContent className="gap-0">
          <PaginationItem className="rounded-l-sm border-l">
            <Button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex h-9 w-14 cursor-pointer items-center justify-center rounded-l-sm rounded-r-none border-y border-l border-[#0F1F30] bg-[#000D1E] text-sm font-normal tracking-[-1%] text-[#7092A5]"
            >
              <img
                src="/icons/left-chevron.svg"
                alt="left-chevron.svg"
                className="h-[12px] w-[6px]"
              />
            </Button>
          </PaginationItem>

          {pageNumbers.map((page, index) => {
            if (typeof page === "string") {
              return (
                <PaginationItem
                  key={page}
                  className="border-r border-[#0F1F30]"
                >
                  <div className="flex h-9 items-end justify-center border-y border-[#0F1F30] bg-[#000D1E] px-1">
                    <PaginationEllipsis className="h-[24px] text-[#7092A5]" />
                  </div>
                </PaginationItem>
              );
            }

            return (
              <PaginationItem key={page}>
                <Button
                  onClick={() => onPageChange(page)}
                  className={cn(
                    "flex h-9 w-12 cursor-pointer items-center justify-center rounded-none border-y border-r border-[#0F1F30] bg-[#000D1E] px-0 text-sm font-normal tracking-[-1%] text-[#7092A5]",
                    {
                      "bg-[#0F1F30] text-[#BCEAFF] italic hover:bg-[#0F1F30]":
                        currentPage === page,
                      "border-l": index === 0,
                    },
                  )}
                >
                  {page}
                </Button>
              </PaginationItem>
            );
          })}

          <PaginationItem className="rounded-r-sm border-r">
            <Button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={totalPages === currentPage || totalPages === Infinity}
              className="flex h-9 w-14 cursor-pointer items-center justify-center rounded-l-none rounded-r-sm border-y border-r border-[#0F1F30] bg-[#000D1E] text-sm font-normal tracking-[-1%] text-[#7092A5]"
            >
              <img
                src="/icons/right-chevron.svg"
                alt="left-chevron.svg"
                className="h-[12px] w-[6px]"
              />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {!hideSetRowsPerPage && (
        <div className="flex justify-between gap-3">
          <Select
            value={
              currentRowsPerPage?.toString() ||
              rowsPerPageOptions[0]?.toString() ||
              "10"
            }
            onValueChange={(value) =>
              canChangeRowsPerPage &&
              onRowsPerPageChange &&
              onRowsPerPageChange(parseInt(value))
            }
            disabled={!canChangeRowsPerPage}
          >
            <SelectTrigger
              disabled={!canChangeRowsPerPage}
              className={cn(
                "w-fit cursor-pointer gap-1 border-none bg-transparent text-[#7192A5]",
                {
                  "pointer-events-none cursor-not-allowed opacity-50":
                    !canChangeRowsPerPage,
                },
              )}
            >
              {currentRowsPerPage || rowsPerPageOptions[0] || 10}/page
            </SelectTrigger>
            <SelectContent side="top" className="z-[60] w-fit border border-[#0F1F30] bg-[#000D1E] text-[#BCEAFF]">
              {rowsPerPageOptions.map((option) => (
                <SelectItem
                  key={option}
                  value={option.toString()}
                  className="cursor-pointer hover:bg-[#BCEAFF]/10"
                >
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export default PaginationAndFilters;
