import { useState, useEffect, useRef } from "react";
import {
  usePrivy,
  useSigners,
  useDelegatedActions,
} from "@privy-io/react-auth";

type WalletLink = {
  type: string;
  address: string;
  chainType?: string;
  walletClientType?: string;
  delegated?: boolean;
};

const SIGNER_ID =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_SIGNER_ID ?? "").trim()
    : "";

function isPrivyEmbeddedSolana(a: WalletLink): boolean {
  if (a.type !== "wallet") return false;
  const wct = a.walletClientType;
  if (wct !== "privy" && wct !== "privy-v2") return false;
  if (!a.chainType) return true;
  return a.chainType.toLowerCase() === "solana";
}

function isPrivyEmbeddedEVM(a: WalletLink): boolean {
  if (a.type !== "wallet") return false;
  const wct = a.walletClientType;
  if (wct !== "privy" && wct !== "privy-v2") return false;
  if (!a.chainType) return false;
  return a.chainType.toLowerCase() === "ethereum";
}

/**
 * Ensures the embedded Solana wallet can be used for server-side signing (e.g. Pacifica deposit
 * via Paystream API). Previously we only read `delegated` and never called Privy — that matches
 * "No valid authorization keys or user signing keys" on the backend.
 *
 * - If `NEXT_PUBLIC_SIGNER_ID` is set: calls `addSigners` with that Privy signer id.
 * - Otherwise: calls `delegateWallet` once so Wallet API delegation is enabled (user may see a modal).
 */
export function useSessionSigner() {
  const { user, ready } = usePrivy();
  const { addSigners } = useSigners();
  const { delegateWallet } = useDelegatedActions();
  const [sessionSignerAdded, setSessionSignerAdded] = useState(false);
  const provisionRef = useRef<{
    userId: string | null;
    inFlight: boolean;
    solSucceeded: boolean;
    ethSucceeded: boolean;
  }>({ userId: null, inFlight: false, solSucceeded: false, ethSucceeded: false });

  useEffect(() => {
    if (!ready || !user) {
      setSessionSignerAdded(false);
      provisionRef.current = { userId: null, inFlight: false, solSucceeded: false, ethSucceeded: false };
      return;
    }

    const uid = user.id;
    if (provisionRef.current.userId !== uid) {
      provisionRef.current = {
        userId: uid,
        inFlight: false,
        solSucceeded: false,
        ethSucceeded: false,
      };
    }

    const linked = ((user as { linkedAccounts?: WalletLink[] }).linkedAccounts ??
      []) as WalletLink[];

    const privySol = linked.find(isPrivyEmbeddedSolana);
    const privyEth = linked.find(isPrivyEmbeddedEVM);
    const privyEmbedded = linked.filter(
      (a) =>
        a.type === "wallet" &&
        (a.walletClientType === "privy" || a.walletClientType === "privy-v2"),
    );
    const allDelegated =
      privyEmbedded.length > 0 &&
      privyEmbedded.every((w) => w.delegated === true);

    const solReady = !privySol || privySol.delegated || provisionRef.current.solSucceeded;
    const ethReady = !privyEth || privyEth.delegated || provisionRef.current.ethSucceeded;
    setSessionSignerAdded(allDelegated || (solReady && ethReady));

    const needsSol = privySol?.address && !privySol.delegated && !provisionRef.current.solSucceeded;
    const needsEth = privyEth?.address && !privyEth.delegated && !provisionRef.current.ethSucceeded;

    if ((!needsSol && !needsEth) || provisionRef.current.inFlight) return;

    provisionRef.current.inFlight = true;

    void (async () => {
      try {
        if (needsSol) {
          if (SIGNER_ID) {
            await addSigners({
              address: privySol!.address,
              signers: [{ signerId: SIGNER_ID }],
            });
          } else {
            await delegateWallet({
              address: privySol!.address,
              chainType: "solana",
            });
          }
          provisionRef.current.solSucceeded = true;
        }

        if (needsEth) {
          if (SIGNER_ID) {
            await addSigners({
              address: privyEth!.address,
              signers: [{ signerId: SIGNER_ID }],
            });
          } else {
            await delegateWallet({
              address: privyEth!.address,
              chainType: "ethereum",
            });
          }
          provisionRef.current.ethSucceeded = true;
        }

        setSessionSignerAdded(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/already|exist|duplicate|added|delegated/i.test(msg)) {
          provisionRef.current.solSucceeded = true;
          provisionRef.current.ethSucceeded = true;
          setSessionSignerAdded(true);
        } else {
          console.warn("[useSessionSigner] Provisioning failed:", e);
        }
      } finally {
        provisionRef.current.inFlight = false;
      }
    })();
  }, [ready, user, addSigners, delegateWallet]);

  return { sessionSignerAdded };
}
