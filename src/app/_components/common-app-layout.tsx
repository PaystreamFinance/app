import React from "react";

import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import { cn } from "@/lib/utils";

interface CommonAppLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const CommonAppLayout: React.FC<CommonAppLayoutProps> = ({
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        // "w-full bg-[url('/bg-gradient.svg')] bg-cover bg-fixed bg-center",
        "flex min-h-screen w-full flex-col",
        className,
      )}
    >
      <Navbar />
      {children}
      <Footer />
    </div>
  );
};

export default CommonAppLayout;
