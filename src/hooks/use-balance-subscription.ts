import { useEffect, useRef } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getConnection } from "@/lib/solana-connection";
import { triggerBalanceRefresh } from "@/lib/balance-refresh";
import { useWallets } from "@privy-io/react-auth/solana";

/**
 * Subscribes to the wallet's SOL account and all SPL token accounts via
 * Solana WebSocket (`onAccountChange` / `onProgramAccountChange`).
 *
 * When any account changes on-chain the existing BALANCE_REFRESH_EVENT is
 * fired so every consumer (useTokenBalance, useAllTokenBalances, wallet-sheet,
 * mobile home, etc.) re-fetches automatically — no polling required.
 */
export function useBalanceSubscription() {
  const { wallets } = useWallets();
  const embeddedWalletAddress = wallets[0]?.standardWallet.accounts[0]?.address;
  const subsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!embeddedWalletAddress) return;

    const connection = getConnection();
    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(embeddedWalletAddress);
    } catch {
      return;
    }

    const ids: number[] = [];

    // 1. Subscribe to native SOL account
    const solSub = connection.onAccountChange(
      walletPubkey,
      () => {
        triggerBalanceRefresh({ reason: "ws-sol-change", retriesMs: [] });
      },
      "confirmed",
    );
    ids.push(solSub);

    // 2. Subscribe to Token Program accounts owned by this wallet
    const tokenSub = connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      () => {
        triggerBalanceRefresh({ reason: "ws-token-change", retriesMs: [] });
      },
      "confirmed",
      [
        { dataSize: 165 }, // SPL Token account size
        { memcmp: { offset: 32, bytes: walletPubkey.toBase58() } }, // owner
      ],
    );
    ids.push(tokenSub);

    // 3. Subscribe to Token-2022 accounts owned by this wallet
    const token2022Sub = connection.onProgramAccountChange(
      TOKEN_2022_PROGRAM_ID,
      () => {
        triggerBalanceRefresh({ reason: "ws-token2022-change", retriesMs: [] });
      },
      "confirmed",
      [
        { memcmp: { offset: 32, bytes: walletPubkey.toBase58() } },
      ],
    );
    ids.push(token2022Sub);

    subsRef.current = ids;

    return () => {
      for (const id of ids) {
        connection.removeAccountChangeListener(id).catch(() => {});
      }
      subsRef.current = [];
    };
  }, [embeddedWalletAddress]);
}
