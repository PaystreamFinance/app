import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StrategyFilterType = "all" | "spot-perp" | "funding-rate-farming";

interface StrategyFiltersProps {
  filter: StrategyFilterType;
  onFilterChange: (filter: StrategyFilterType) => void;
}

export function StrategyFilters({
  filter,
  onFilterChange,
}: StrategyFiltersProps) {
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        className={cn(
          "h-8 cursor-pointer rounded-none rounded-l-sm border-r-0 border-[#0D1E31] bg-[#000D1E] px-4 text-base font-normal text-[#7192A5] hover:bg-[#0D1E31] hover:text-[#7192A5]",
          {
            "bg-[#0D1E31]": filter === "all",
          },
        )}
        onClick={() => onFilterChange("all")}
      >
        All
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "h-8 cursor-pointer rounded-none border-r-0 border-[#0D1E31] bg-[#000D1E] px-4 text-base font-normal text-[#7192A5] hover:bg-[#0D1E31] hover:text-[#7192A5]",
          {
            "bg-[#0D1E31]": filter === "spot-perp",
          },
        )}
        onClick={() => onFilterChange("spot-perp")}
      >
        Spot Perp
      </Button>
      <Button
        variant="ghost"
        className={cn(
          "h-8 cursor-pointer rounded-none rounded-r-sm border-r border-[#0D1E31] bg-[#000D1E] px-4 text-base font-normal text-[#7192A5] hover:bg-[#0D1E31] hover:text-[#7192A5]",
          {
            "bg-[#0D1E31]": filter === "funding-rate-farming",
          },
        )}
        onClick={() => onFilterChange("funding-rate-farming")}
      >
        Funding Rate Farming
      </Button>
    </div>
  );
}
