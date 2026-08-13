"use client";

import { cn } from "@/lib/utils";

interface PortfolioSubTabsProps {
  activeSubTab: "positions";
  onSubTabChange: (tab: "positions") => void;
}

const PortfolioSubTabs: React.FC<PortfolioSubTabsProps> = ({
  activeSubTab,
  onSubTabChange,
}) => {
  return (
    <div className="flex items-center gap-4">
      <button
        className={cn(
          "cursor-pointer text-xl font-medium transition-colors",
          activeSubTab === "positions"
            ? "text-white"
            : "text-[#7192A5] hover:text-white/70",
        )}
        onClick={() => onSubTabChange("positions")}
      >
        Positions
      </button>
    </div>
  );
};

export default PortfolioSubTabs;
