import { GeistSans } from "geist/font/sans";
import { Darker_Grotesque } from "next/font/google";
import { type Metadata } from "next";

import { TRPCReactProvider } from "@/trpc/react";
import { Toaster } from "@/components/ui/sonner";
import Providers from "@/components/providers";
import FirstVisitTnC from "@/components/first-visit-tnc";
import FirstVisitCarousel from "@/components/first-visit-carousel";
import { DisableDevTools } from "@/components/disable-dev-tools";
import ResponsiveRedirect from "@/components/responsive-redirect";
import { WithdrawConfirmProvider } from "@/components/withdraw-toast";
import { PositionsPrefetch } from "@/components/positions-prefetch";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Paystream",
  description: "Paystream, Smarter lending Easier borrowing",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const darkerGrotesque = Darker_Grotesque({
  subsets: ["latin"],
  variable: "--font-darker-grotesque",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export default function RootLayout(props: any) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${darkerGrotesque.variable}`}
    >
      <body className="bg-bg-t3 overflow-x-hidden bg-[url('/bg-noise.svg')] bg-cover bg-fixed bg-center">
        <DisableDevTools />
        <Providers>
          <TRPCReactProvider>
            <WithdrawConfirmProvider>
              <PositionsPrefetch />
              <ResponsiveRedirect />
              <FirstVisitTnC />
              <FirstVisitCarousel />
              <Toaster position="bottom-right" />
              {props.children}
            </WithdrawConfirmProvider>
          </TRPCReactProvider>
        </Providers>
      </body>
    </html>
  );
}
