"use client";

import React from "react";

import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import Link from "next/link";

interface TnCModalProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

// Carousel images to prefetch (now served locally for instant loading)
const CAROUSEL_IMAGES = [
  "/discover/carousel/1.svg",
  "/discover/carousel/2.svg",
  "/discover/carousel/3.svg",
  "/discover/carousel/4.svg",
  "/discover/carousel/5.svg",
];

const TnCModal: React.FC<TnCModalProps> = ({ open, onAccept, onCancel }) => {
  const [isChecked, setIsChecked] = React.useState(false);
  const [imagesPreloaded, setImagesPreloaded] = React.useState(false);

  // Aggressively prefetch carousel images when TNC modal opens
  React.useEffect(() => {
    if (open && typeof window !== "undefined" && !imagesPreloaded) {
      const preloadLinks: HTMLLinkElement[] = [];
      CAROUSEL_IMAGES.forEach((src) => {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = src;
        document.head.appendChild(link);
        preloadLinks.push(link);
      });

      const imagePromises = CAROUSEL_IMAGES.map((src) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        });
      });

      Promise.all(imagePromises).then(() => {
        setImagesPreloaded(true);
      });

      return () => {
        preloadLinks.forEach((link) => {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
        });
      };
    }
  }, [open, imagesPreloaded]);

  const handleAccept = () => {
    if (isChecked) {
      onAccept();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-[541px] flex-col bg-[#031B37] p-0 outline-none sm:w-full"
        closeIcon={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Terms &amp; Conditions</DialogTitle>

        <div className="shrink-0 border-b border-[#35455D] px-4 pt-3 pb-4 text-xl text-white sm:px-5 sm:pb-5 sm:text-2xl">
          Terms &amp; Conditions
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6">
          <div className="h-full max-h-[40dvh] overflow-y-auto rounded-lg bg-[#041223] px-3 py-3 text-sm leading-relaxed text-[#C5D4DE] sm:max-h-[336px] sm:px-4">
            <p className="mb-3 text-xs text-[#7192A5]">Effective: October 29, 2025 &middot; Last updated: November 13, 2025</p>

            <h3 className="mb-1 text-sm font-medium text-white">1. Legal Entity &amp; Scope</h3>
            <p className="mb-3">
              Paystream is operated by Paystream DAO LLC, a limited liability company and decentralized autonomous organization incorporated under the laws of the Republic of the Marshall Islands pursuant to the Limited Liability Company Act of 1996 and the Decentralized Autonomous Organization Act, 2022 (the &ldquo;Company&rdquo;). By accessing or using Paystream, you accept these terms in full. Access may be revoked at any time by the Company or its governance mechanism.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">2. DAO Governance</h3>
            <p className="mb-3">
              The Company is governed algorithmically through a Futarchic Mechanism &mdash; market-based smart contracts that approve or disapprove proposals relating to the Company. Ordinary business decisions, member admissions, asset management, and protocol changes are determined by this mechanism. Users acknowledge that governance outcomes are binding and executed on-chain on the Solana blockchain.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">3. Nature of Business</h3>
            <p className="mb-3">
              The Company&rsquo;s business is liquidity optimization through a suite of tools on Solana, including but not limited to: cross-protocol arbitrage, perpetual futures trading, copy-trading, liquidity position management, and portfolio analytics. The Company may not conduct any business outside this scope without governance approval.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">4. Protocol Status</h3>
            <p className="mb-3">
              The Paystream protocol is not audited. No external security review, formal verification, or third-party validation has been completed. Interacting with unaudited smart contracts and cross-protocol trading systems can result in irreversible loss of funds, failed transactions, or unexpected behavior.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">5. Services &amp; Risks</h3>
            <p className="mb-3">
              Paystream connects to third-party protocols including but not limited to Drift, Hyperliquid, Pacifica, Aster, and Lighter for arbitrage and perpetual trading. Liquidity positions interact with Meteora, Raydium, and other Solana AMMs. You acknowledge that:
            </p>
            <ul className="mb-3 list-inside list-disc space-y-1 pl-2">
              <li>Cross-protocol deposits and withdrawals carry bridge and custody risk.</li>
              <li>Arbitrage positions may be auto-closed or liquidated due to funding rate flips, margin thresholds, or delta drift.</li>
              <li>LP positions are subject to impermanent loss, pool migration, and smart-contract risk.</li>
              <li>Price feeds, oracle data, and funding rates are sourced from third parties and may be delayed or inaccurate.</li>
              <li>All assets held in Company Accounts or smart contracts are deemed property of the Company per the Operating Agreement.</li>
            </ul>

            <h3 className="mb-1 text-sm font-medium text-white">6. PAYS Token</h3>
            <p className="mb-3">
              The PAYS token exists and was raised through MetaDAO prior to the Company&rsquo;s formation. Token existence and prior distribution do not imply audit, stability, or security of the protocol. Nothing on Paystream constitutes valuation guidance or investment direction. No profits, losses, or assets of the Company shall be distributed to members except as expressly approved by the Futarchic Mechanism.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">7. Wallet &amp; Funds</h3>
            <p className="mb-3">
              Paystream uses Privy for wallet management. Deposits fund positions on third-party protocols and are subject to the custody and smart-contract risks of those protocols. You are solely responsible for your wallet credentials, deposit amounts, and position management. Never enter seed phrases or private keys into any Paystream interface.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">8. Risk Acknowledgment</h3>
            <p className="mb-3">
              You accept all operational, smart-contract, and financial risks, including but not limited to: loss of funds, data corruption, transaction failure, incorrect outputs, liquidation, and unintended protocol execution. You hold Paystream DAO LLC and its members harmless for all outcomes resulting from your use of the platform.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">9. Limitation of Liability</h3>
            <p className="mb-3">
              No member of the Company shall be liable for the liabilities of the Company. Paystream DAO LLC is not liable for direct, indirect, consequential, or incidental damages arising from use of the platform. Maximum aggregate liability is capped at the lesser of USD 100 or the total amount you deposited through Paystream, if any.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">10. No Warranty</h3>
            <p className="mb-3">
              Paystream is provided as-is. No warranty is given regarding accuracy, uptime, functionality, or safety. No implied warranties apply.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">11. No Financial Advice</h3>
            <p className="mb-3">
              Nothing on Paystream constitutes financial, legal, or investment advice. Funding rates, PnL estimates, and yield projections are informational only. All trading and investment decisions are your own.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">12. Intellectual Property</h3>
            <p className="mb-3">
              All materials, code, interfaces, the Paystream brand, and associated assets (including the paystream.finance domain, documentation, and codebase) remain the property of Paystream DAO LLC. No rights are granted beyond limited use of the platform.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">13. Restricted Persons</h3>
            <p className="mb-3">
              You represent that you are not a citizen of, ordinarily resident in, or accessing this platform from the United States. You are not, and are not affiliated with or acting on behalf of, any person or entity subject to sanctions under applicable legal requirements.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">14. Termination</h3>
            <p className="mb-3">
              Paystream DAO LLC may suspend or terminate access at any time without prior notice, in accordance with its governance mechanism.
            </p>

            <h3 className="mb-1 text-sm font-medium text-white">15. Governing Law</h3>
            <p>
              This agreement is governed by and shall be construed in accordance with the laws of the Republic of the Marshall Islands, without regard to conflict of laws principles thereof.
            </p>
          </div>

          <div className="mt-3 flex items-start gap-2 text-sm text-white sm:mt-4 sm:items-center">
            <Checkbox
              checked={isChecked}
              onCheckedChange={(checked) => setIsChecked(checked === true)}
              className="mt-0.5 shrink-0 rounded-sm border-[#BCEAFF] sm:mt-0"
            />
            <span>
              To proceed, please accept our{" "}
              <Link href="#" className="text-[#9CE0FF] underline">
                Terms and Conditions.
              </Link>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 gap-2.5 border-t border-[#35455D]/50 px-4 py-3 sm:px-6 sm:py-4">
          <Button
            onClick={onCancel}
            disabled
            className="group h-10! w-full cursor-not-allowed border border-[#142234] bg-[#041223] text-[#BCEAFF]! opacity-50 transition-all"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!isChecked}
            className="group h-10! w-full cursor-pointer border-0 bg-[#BCEAFF] text-[#041223] transition-all hover:bg-[#BCEAFF80] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agree and Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TnCModal;
