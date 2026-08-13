"use client";

import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

/** Public endpoints so `next build` / prerender does not crash when env is unset. */
const SOL_MAINNET_HTTP =
  process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET ?? "https://api.mainnet-beta.solana.com";
const SOL_MAINNET_WSS =
  process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET_WSS ?? "wss://api.mainnet-beta.solana.com";
const SOL_DEVNET_HTTP =
  process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET ?? "https://api.devnet.solana.com";
const SOL_DEVNET_WSS =
  process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET_WSS ?? "wss://api.devnet.solana.com";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
          showWalletUIs: false,
        },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(SOL_MAINNET_HTTP),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOL_MAINNET_WSS),
            },
            "solana:devnet": {
              rpc: createSolanaRpc(SOL_DEVNET_HTTP),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOL_DEVNET_WSS),
            },
          },
        },
        appearance: {
          showWalletLoginFirst: true,
          walletChainType: "solana-only",
        },
        loginMethods: ["wallet", "email"],
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }}
    >
      <NuqsAdapter>{children}</NuqsAdapter>
    </PrivyProvider>
  );
}
