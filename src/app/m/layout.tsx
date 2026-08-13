import { Toaster } from "@/components/ui/sonner";
import MobileNavbar from "./_components/mobile-navbar";

/**
 * Mobile Layout - Providers (TRPCReactProvider, PrivyProvider) are already provided by root layout
 * This layout only adds mobile-specific UI components and modals
 * Note: FirstVisitTnC is rendered once in root layout (outside desktop/mobile divs)
 */
export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Toaster position="bottom-center" />
      <div className="flex min-h-screen flex-col bg-[#000C1D]">
        <MobileNavbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
